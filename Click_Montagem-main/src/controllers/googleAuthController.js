const google = require('../services/googleOAuthService');
const users = require('../services/userService');
const asyncHandler = require('../utils/asyncHandler');
const { establishSession, saveSession } = require('../utils/authSession');

function destination(user) {
    if (user.cadastroCompleto === false || !user.tipo) return '/pages/login.html?google=complete';
    return user.tipo === 'montador' ? '/pages/painel-montador.html' : '/pages/painel-cliente.html';
}

const status = (_req, res) => {
    let enabled = false;
    try { google.validateConfig(); enabled = true; } catch { /* No secret/configuration disclosure. */ }
    res.json({ sucesso: true, habilitado: enabled });
};

const start = asyncHandler(async (req, res) => {
    try {
        const url = await google.start(req.sessionID);
        await saveSession(req);
        res.json({ sucesso: true, url });
    } catch {
        res.status(503).json({ sucesso: false, erro: 'Login Google indisponível. Use e-mail e senha ou tente mais tarde.' });
    }
});

const link = asyncHandler(async (req, res) => {
    google.validateConfig();
    const user = await users.autenticarUsuario(req.body);
    if (user.googleVinculado) {
        return res.status(409).json({ sucesso: false, erro: 'Esta conta já possui Google vinculado.' });
    }
    await google.cancel(req.sessionID);
    const csrfToken = await establishSession(req, user, res);
    const url = await google.start(req.sessionID, user.id);
    res.json({ sucesso: true, url, csrfToken });
});

const callback = asyncHandler(async (req, res) => {
    // Never pass upstream errors to the generic logger: they may contain credentials/tokens.
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
        const attempt = await google.consume(req.sessionID, req.query.state);
        if (req.query.error) {
            return res.redirect('/pages/login.html?google_error=' + (req.query.error === 'access_denied' ? 'cancelled' : 'failed'));
        }
        if (typeof req.query.code !== 'string' || !req.query.code || req.query.code.length > 4096) {
            return res.redirect('/pages/login.html?google_error=callback');
        }
        if (attempt.linkUserId && (!req.user || String(req.user._id) !== String(attempt.linkUserId))) {
            return res.redirect('/pages/login.html?google_error=link_denied');
        }
        const payload = await google.exchangeCode(req.query.code, attempt);
        const identity = google.validateIdentity(payload, attempt.nonce);
        const user = await google.resolveUser(identity, attempt.linkUserId);
        await establishSession(req, user, res);
        res.redirect(destination(user));
    } catch (err) {
        const allowed = ['unavailable', 'state', 'identity', 'link_denied', 'already_linked', 'account_exists'];
        const code = allowed.includes(err.oauthCode) ? err.oauthCode : 'failed';
        res.redirect('/pages/login.html?google_error=' + code);
    }
});

const complete = asyncHandler(async (req, res) => {
    const user = await google.completeRegistration(req.user, req.body);
    const csrfToken = await establishSession(req, user, res);
    res.json({ sucesso: true, usuario: user.toPublicObject(), csrfToken, redirect: destination(user) });
});

module.exports = { status, start, link, callback, complete };
