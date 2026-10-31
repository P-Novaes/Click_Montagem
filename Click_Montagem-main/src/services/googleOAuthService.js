const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const env = require('../config/env');
const OAuthAttempt = require('../models/OAuthAttempt');
const { User } = require('../models');
const AppError = require('../utils/AppError');
const { EMAIL_REGEX, validarCadastroInput } = require('../validators/validators');

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const random = () => crypto.randomBytes(32).toString('base64url');
const oauthError = code => Object.assign(new AppError('Não foi possível concluir a autenticação Google.', 400), { oauthCode: code });

function configured() {
    return Boolean(env.googleClientId && env.googleClientSecret && env.googleCallbackUrl);
}

function validateConfig() {
    if (!configured()) throw oauthError('unavailable');
    let callback;
    try { callback = new URL(env.googleCallbackUrl); } catch { throw oauthError('unavailable'); }
    const localHttp = !env.isProd && callback.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname);
    if ((!localHttp && callback.protocol !== 'https:') || callback.username || callback.password || callback.search || callback.hash || callback.pathname !== '/api/auth/google/callback') {
        throw oauthError('unavailable');
    }
}

let cachedClient;
let cachedConfig;
function client() {
    validateConfig();
    const config = [env.googleClientId, env.googleClientSecret, env.googleCallbackUrl];
    if (cachedClient && config.every((value, index) => value === cachedConfig[index])) return cachedClient;
    cachedConfig = config;
    cachedClient = new OAuth2Client({
        clientId: env.googleClientId,
        clientSecret: env.googleClientSecret,
        redirectUri: env.googleCallbackUrl,
        transporterOptions: { timeout: 10000, retry: false },
    });
    return cachedClient;
}

async function start(sessionId, linkUserId = null) {
    const oauth = client();
    const state = random();
    const nonce = random();
    const verifier = random();
    // One active flow per browser; never keep access, refresh or ID tokens.
    await OAuthAttempt.deleteMany({ sessionHash: hash(sessionId) });
    await OAuthAttempt.create({
        stateHash: hash(state), sessionHash: hash(sessionId), nonce, verifier, linkUserId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    return oauth.generateAuthUrl({
        response_type: 'code', scope: ['openid', 'email', 'profile'],
        access_type: 'online', prompt: 'select_account', state, nonce,
        code_challenge_method: 'S256',
        code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
    });
}

async function consume(sessionId, state) {
    if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state)) throw oauthError('state');
    const attempt = await OAuthAttempt.findOneAndDelete({
        stateHash: hash(state), sessionHash: hash(sessionId), expiresAt: { $gt: new Date() },
    });
    if (!attempt) throw oauthError('state');
    return attempt;
}

// This boundary alone is mocked by integration tests; Google remains an external validation step.
async function exchangeCode(code, attempt) {
    const oauth = client();
    const { tokens } = await oauth.getToken({ code, codeVerifier: attempt.verifier });
    if (!tokens.id_token) throw oauthError('identity');
    const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: env.googleClientId });
    return ticket.getPayload();
}

function validateIdentity(payload, nonce) {
    // verifyIdToken validates signature, issuer, audience and time; enforce application claims too.
    if (!payload || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss) ||
        payload.aud !== env.googleClientId || (payload.azp && payload.azp !== env.googleClientId) ||
        !Number.isFinite(payload.exp) || payload.exp <= Date.now() / 1000 ||
        payload.nonce !== nonce || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255 ||
        payload.email_verified !== true || typeof payload.email !== 'string' ||
        payload.email.length > 160 || !EMAIL_REGEX.test(payload.email)) {
        throw oauthError('identity');
    }
    return {
        sub: payload.sub, email: payload.email.toLowerCase().trim(),
        nome: (typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : 'Usuário Google').slice(0, 120),
    };
}

async function resolveUser(identity, linkUserId) {
    if (linkUserId) {
        // Require both fresh password proof (bound to this flow) and the verified matching Google account.
        const target = await User.findById(linkUserId).select('+senha');
        if (!target || !target.senha || target.email !== identity.email) throw oauthError('link_denied');
        if (target.googleSub) throw oauthError('already_linked');
        try {
            const linked = await User.findOneAndUpdate(
                { _id: target._id, googleSub: { $exists: false }, email: identity.email },
                { $set: { googleSub: identity.sub, googleEmail: identity.email, googleEmailVerified: true, authProvider: 'local+google' } },
                { new: true, runValidators: true }
            );
            if (!linked) throw oauthError('already_linked');
            return linked;
        } catch (err) {
            if (err.code === 11000) throw oauthError('already_linked');
            throw err;
        }
    }

    const linked = await User.findOne({ googleSub: identity.sub });
    if (linked) return linked;
    if (await User.exists({ email: identity.email })) throw oauthError('account_exists');
    try {
        return await User.create({
            nome: identity.nome, email: identity.email, googleSub: identity.sub,
            googleEmail: identity.email, googleEmailVerified: true, authProvider: 'google',
            tipo: null, cadastroCompleto: false,
        });
    } catch (err) {
        if (err.code !== 11000) throw err;
        const concurrent = await User.findOne({ googleSub: identity.sub });
        if (concurrent) return concurrent;
        throw oauthError('account_exists');
    }
}

async function completeRegistration(user, body) {
    if (!user) throw new AppError('Sessão expirada. Entre novamente com Google.', 401);
    if (!user.googleSub || user.cadastroCompleto !== false) throw new AppError('Cadastro já concluído.', 409);
    // Identity and email always come from the server; only onboarding fields are accepted.
    const data = validarCadastroInput({ ...body, email: user.email }, { google: true });
    const changes = {
        nome: data.nome, telefone: data.telefone, tipo: data.tipo, cadastroCompleto: true,
        termosAceitosEm: new Date(),
    };
    if (data.tipo === 'montador') {
        changes.montador = {
            cpf_cnpj: data.cpf_cnpj, descricao_profissional: data.descricao_profissional || undefined,
            especialidades: data.especialidades || undefined, regiao_atendimento: data.regiao_atendimento || undefined,
            disponibilidade_geral: data.disponibilidade_geral, preco_base: data.preco_base,
        };
    }
    const completed = await User.findOneAndUpdate(
        { _id: user._id, cadastroCompleto: false }, { $set: changes }, { new: true, runValidators: true }
    );
    if (!completed) throw new AppError('Cadastro já concluído.', 409);
    return completed;
}

async function cancel(sessionId) {
    await OAuthAttempt.deleteMany({ sessionHash: hash(sessionId) });
}

module.exports = { configured, validateConfig, start, consume, exchangeCode, validateIdentity, resolveUser, completeRegistration, cancel };
