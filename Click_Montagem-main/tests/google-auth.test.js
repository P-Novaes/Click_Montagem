process.env.NODE_ENV = 'test';
const { describe, test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const request = require('supertest');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { createApp } = require('../src/app');
const { User, Orcamento, Proposta, Agendamento, Avaliacao } = require('../src/models');
const OAuthAttempt = require('../src/models/OAuthAttempt');
const google = require('../src/services/googleOAuthService');
const { mockGoogleProvider } = require('./helpers/googleProvider');

env.googleClientId = 'test-client.apps.googleusercontent.com';
env.googleClientSecret = 'test-placeholder-not-a-real-secret';
env.googleCallbackUrl = 'http://localhost:3000/api/auth/google/callback';
let app, issue;
const csrf = async agent => (await agent.get('/api/auth/csrf')).body.csrfToken;
async function post(agent, path, body) {
    const token = await csrf(agent);
    return agent.post(path).set('X-CSRF-Token', token).send(body);
}
async function start(agent) {
    const response = await post(agent, '/api/auth/google');
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return new URL(response.body.url);
}
async function authenticate(agent, claims = {}, options = {}) {
    const url = await start(agent);
    const state = url.searchParams.get('state');
    const code = await issue(state, claims, options);
    return agent.get('/api/auth/google/callback').query({ state, code });
}
const completion = { nome: 'Pessoa Completa', telefone: '(11) 99999-9999', tipo: 'cliente', termos: true };
const localAccount = (suffix, tipo = 'cliente') => ({ nome: 'Pessoa Local', email: `${suffix}@example.test`, telefone: '11999999999', senha: 'Password123', tipo });

describe('Google OAuth: integração local com MongoDB real e provedor simulado', () => {
    before(async () => {
        const uri = env.mongoUri.replace(/\/[^/?]+(\?.*)?$/, '/click_montagem_google_test$1');
        await connectDatabase(uri);
        assert.equal(mongoose.connection.name, 'click_montagem_google_test');
        await mongoose.connection.dropDatabase();
        await Promise.all([User.init(), OAuthAttempt.init()]);
        issue = mockGoogleProvider(mock);
        app = createApp().listen(0, '127.0.0.1');
        await new Promise(resolve => app.once('listening', resolve));
    });
    after(async () => {
        mock.restoreAll();
        if (app) await new Promise(resolve => app.close(resolve));
        await disconnectDatabase();
    });

    test('configuração opcional, HTTPS e início protegido por CSRF/PKCE', async () => {
        const saved = env.googleClientSecret;
        env.googleClientSecret = '';
        assert.equal((await request(app).get('/api/auth/google/status')).body.habilitado, false);
        assert.equal((await post(request.agent(app), '/api/auth/google')).status, 503);
        env.googleClientSecret = saved;
        assert.equal((await request(app).post('/api/auth/google')).status, 403);
        const url = await start(request.agent(app));
        assert.equal(url.origin, 'https://accounts.google.com');
        assert.equal(url.searchParams.get('response_type'), 'code');
        assert.equal(url.searchParams.get('scope'), 'openid email profile');
        assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
        assert.equal(url.searchParams.get('redirect_uri'), env.googleCallbackUrl);
        assert.equal(url.searchParams.get('access_type'), 'online');
        assert.equal(url.searchParams.has('client_secret'), false);
        env.isProd = true;
        assert.throws(google.validateConfig);
        env.isProd = false;
    });

    test('novo usuário pendente, cookies seguros, identidade persistida e rotas bloqueadas', async () => {
        const agent = request.agent(app);
        const before = await agent.get('/api/auth/me');
        const result = await authenticate(agent);
        assert.equal(result.headers.location, '/pages/login.html?google=complete');
        const cookie = result.headers['set-cookie'].find(c => c.startsWith('cm.sid='));
        assert.match(cookie, /HttpOnly/);
        assert.match(cookie, /SameSite=Lax/);
        assert.notEqual(cookie.split(';')[0], before.headers['set-cookie'].find(c => c.startsWith('cm.sid=')).split(';')[0]);
        const me = await agent.get('/api/auth/me');
        assert.equal(me.body.cadastroPendente, true);
        assert.equal(me.body.usuario.tipo, null);
        assert.equal(me.headers['cache-control'], 'no-store');
        assert.equal((await agent.get('/api/orcamentos/meus')).status, 403);
        assert.equal((await agent.get('/api/notificacoes')).status, 403);
        assert.match((await agent.get('/pages/painel-cliente.html')).headers.location, /google=complete/);
        const stored = await User.findById(me.body.usuario.id).select('+senha').lean();
        assert.equal(stored.googleSub, 'google-test-user');
        assert.equal(stored.googleEmailVerified, true);
        assert.equal(stored.senha, undefined);
        assert.equal(JSON.stringify(stored).includes('NOT-TO-BE-STORED'), false);
        assert.equal(me.body.usuario.googleSub, undefined);
        assert.equal((await request(app).post('/api/auth/login').send({ email: stored.email, senha: 'anything' })).status, 401);

        for (const invalid of [ {}, { ...completion, tipo: 'admin' }, { ...completion, telefone: '' }, { ...completion, termos: false } ]) {
            assert.equal((await post(agent, '/api/auth/google/complete', invalid)).status, 400);
        }
        assert.equal((await agent.post('/api/auth/google/complete').send(completion)).status, 403);
        const completed = await post(agent, '/api/auth/google/complete', { ...completion, googleSub: 'attacker', email: 'attacker@example.test', senha: 'injected-password' });
        assert.equal(completed.status, 200, JSON.stringify(completed.body));
        assert.equal(completed.body.redirect, '/pages/painel-cliente.html');
        assert.equal(completed.body.usuario.email, stored.email);
        assert.equal((await agent.get('/api/orcamentos/meus')).status, 200);
        assert.equal((await post(agent, '/api/auth/google/complete', completion)).status, 409);
        assert.equal((await User.findById(stored._id).select('+senha')).senha, undefined);
    });

    test('montador escolhe perfil, preserva validações/documento único e vai ao painel correto', async () => {
        const agent = request.agent(app);
        await authenticate(agent, { sub: 'montador-google', email: 'montador-google@example.test' });
        const res = await post(agent, '/api/auth/google/complete', { ...completion, tipo: 'montador', cpf_cnpj: '12345678900', regiao_atendimento: 'Campinas' });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body.usuario.tipo, 'montador');
        assert.equal(res.body.usuario.cpf_cnpj, '12345678900');
        assert.equal(res.body.redirect, '/pages/painel-montador.html');
        assert.equal((await post(agent, '/api/orcamentos', { tipo_movel: 'Mesa' })).status, 403);
        const duplicate = request.agent(app);
        await authenticate(duplicate, { sub: 'other-montador', email: 'other-montador@example.test' });
        assert.equal((await post(duplicate, '/api/auth/google/complete', { ...completion, tipo: 'montador', cpf_cnpj: '12345678900' })).status, 409);
        assert.equal((await duplicate.get('/api/auth/me')).body.cadastroPendente, true);
        const login = await authenticate(request.agent(app), { sub: 'montador-google', email: 'changed-at-google@example.test' });
        assert.equal(login.headers.location, '/pages/painel-montador.html');
        assert.equal(await User.countDocuments({ googleSub: 'montador-google' }), 1);
    });

    test('colisão de e-mail exige senha e consentimento de vinculação; preserva ID e dados associados', async () => {
        const agent = request.agent(app);
        const account = localAccount('link');
        const registration = await agent.post('/api/auth/register').send(account);
        const id = registration.body.usuario.id;
        const quote = await post(agent, '/api/orcamentos', { tipo_movel: 'Mesa', cep: '01001000' });
        assert.equal(quote.status, 201);
        const before = await Orcamento.findById(quote.body.id).lean();
        const professional = await User.findOne({ googleSub: 'montador-google' });
        const proposal = await Proposta.create({ orcamento_id: before._id, montador_id: professional._id, valor: 150, disponibilidade: '2026-10-31' });
        const appointment = await Agendamento.create({ proposta_id: proposal._id, orcamento_id: before._id, cliente_id: id,
            montador_id: professional._id, data_servico: '2026-10-31', endereco: 'Rua de Testes, 1', valor: 150, status: 'concluido' });
        const review = await Avaliacao.create({ agendamento_id: appointment._id, cliente_id: id, montador_id: professional._id, nota: 5 });
        const associatedBefore = await Promise.all([Proposta.findById(proposal._id).lean(), Agendamento.findById(appointment._id).lean(), Avaliacao.findById(review._id).lean()]);
        const collision = await authenticate(request.agent(app), { sub: 'link-google', email: account.email });
        assert.match(collision.headers.location, /account_exists/);
        assert.equal((await User.findById(id)).googleSub, undefined);
        assert.equal((await post(agent, '/api/auth/google/link', { ...account, senha: 'wrong' })).status, 401);
        assert.equal((await agent.post('/api/auth/google/link').send(account)).status, 403);
        const link = await post(agent, '/api/auth/google/link', account);
        assert.equal(link.status, 200);
        const state = new URL(link.body.url).searchParams.get('state');
        const code = await issue(state, { sub: 'link-google', email: account.email });
        const result = await agent.get('/api/auth/google/callback').query({ state, code });
        assert.equal(result.headers.location, '/pages/painel-cliente.html');
        assert.equal((await agent.get('/api/auth/me')).body.usuario.id, id);
        assert.deepEqual(await Orcamento.findById(quote.body.id).lean(), before);
        assert.deepEqual(await Promise.all([Proposta.findById(proposal._id).lean(), Agendamento.findById(appointment._id).lean(), Avaliacao.findById(review._id).lean()]), associatedBefore);
        assert.equal((await request(app).post('/api/auth/login').send(account)).status, 200);
        assert.equal((await User.findById(id)).authProvider, 'local+google');
        assert.equal((await post(agent, '/api/auth/google/link', account)).status, 409);
    });

    test('nega vinculação com outra conta Google e vínculo já pertencente a outra pessoa', async () => {
        const agent = request.agent(app);
        const account = localAccount('link-denied');
        await agent.post('/api/auth/register').send(account);
        const startLink = await post(agent, '/api/auth/google/link', account);
        const state = new URL(startLink.body.url).searchParams.get('state');
        const code = await issue(state, { sub: 'wrong-google', email: 'different@example.test' });
        assert.match((await agent.get('/api/auth/google/callback').query({ state, code })).headers.location, /link_denied/);
        assert.equal((await User.findOne({ email: account.email })).googleSub, undefined);
        const second = await post(agent, '/api/auth/google/link', account);
        const state2 = new URL(second.body.url).searchParams.get('state');
        const code2 = await issue(state2, { sub: 'google-test-user', email: account.email });
        assert.match((await agent.get('/api/auth/google/callback').query({ state: state2, code: code2 })).headers.location, /already_linked/);
    });

    test('state ausente, de outra sessão, expirado, replay e callbacks concorrentes', async () => {
        const agent = request.agent(app);
        assert.match((await agent.get('/api/auth/google/callback?code=x')).headers.location, /state/);
        const state = (await start(agent)).searchParams.get('state');
        const code = await issue(state, { sub: 'state-test', email: 'state@example.test' });
        assert.match((await request(app).get('/api/auth/google/callback').query({ state, code })).headers.location, /state/);
        const results = await Promise.all([1, 2].map(() => agent.get('/api/auth/google/callback').query({ state, code })));
        assert.equal(results.filter(r => r.headers.location.includes('google=complete')).length, 1);
        assert.equal(results.filter(r => r.headers.location.includes('google_error=state')).length, 1);
        assert.equal(await User.countDocuments({ googleSub: 'state-test' }), 1);
        const expired = (await start(agent)).searchParams.get('state');
        await OAuthAttempt.updateOne({ stateHash: crypto.createHash('sha256').update(expired).digest('hex') }, { expiresAt: new Date(0) });
        assert.match((await agent.get('/api/auth/google/callback').query({ state: expired, code: 'x' })).headers.location, /state/);
    });

    test('cancelamento, código ausente e falha de comunicação não autenticam', async () => {
        for (const [query, expected] of [[{ error: 'access_denied' }, 'cancelled'], [{}, 'callback']]) {
            const agent = request.agent(app);
            const state = (await start(agent)).searchParams.get('state');
            assert.match((await agent.get('/api/auth/google/callback').query({ state, ...query })).headers.location, new RegExp(expected));
            assert.equal((await agent.get('/api/auth/me')).body.autenticado, false);
        }
        const agent = request.agent(app);
        assert.match((await authenticate(agent, {}, { fail: true })).headers.location, /failed/);
        assert.equal((await agent.get('/api/auth/me')).body.autenticado, false);
    });

    test('assinatura real, issuer, audience, expiração, nonce e e-mail verificado são obrigatórios', async () => {
        const cases = [ { iss: 'https://evil.test' }, { aud: 'wrong-client' }, { azp: 'wrong-client' },
            { exp: Math.floor(Date.now() / 1000) - 600 }, { nonce: 'wrong' }, { email_verified: false }, { sub: '' } ];
        for (const claims of cases) {
            const agent = request.agent(app);
            assert.match((await authenticate(agent, claims)).headers.location, /google_error=(identity|failed)/);
            assert.equal((await agent.get('/api/auth/me')).body.autenticado, false);
        }
        const agent = request.agent(app);
        assert.match((await authenticate(agent, {}, { tamper: true })).headers.location, /failed/);
    });

    test('índices impedem duplicidade sob cadastros concorrentes', async () => {
        const identity = { sub: 'concurrent-google', email: 'concurrent@example.test', nome: 'Concorrente' };
        const results = await Promise.all(Array.from({ length: 5 }, () => google.resolveUser(identity)));
        assert.equal(new Set(results.map(user => String(user._id))).size, 1);
        assert.equal(await User.countDocuments({ googleSub: identity.sub }), 1);
        await assert.rejects(User.create({ ...identity, nome: 'Duplicado', email: 'unique@example.test', googleSub: identity.sub, tipo: null, cadastroCompleto: false }), error => error.code === 11000);
    });

    test('sessões independentes, logout revoga cookie e tentativas; sessão removida expira', async () => {
        const a = request.agent(app), b = request.agent(app);
        await authenticate(a);
        await authenticate(b, { sub: 'montador-google', email: 'montador-google@example.test' });
        const meA = await a.get('/api/auth/me'), meB = await b.get('/api/auth/me');
        assert.notEqual(meA.body.usuario.id, meB.body.usuario.id);
        const oldCookie = meA.headers['set-cookie'].find(c => c.startsWith('cm.sid=')).split(';')[0];
        const state = (await start(a)).searchParams.get('state');
        const code = await issue(state);
        assert.equal((await post(a, '/api/auth/logout')).status, 200);
        assert.equal((await a.get('/api/auth/me')).body.autenticado, false);
        assert.equal((await request(app).get('/api/auth/me').set('Cookie', oldCookie)).body.autenticado, false);
        assert.match((await a.get('/api/auth/google/callback').query({ state, code })).headers.location, /state/);
        assert.equal((await b.get('/api/auth/me')).body.usuario.id, meB.body.usuario.id);
        // Simulate expired persisted session; connect-mongo must reject it immediately, before TTL cleanup.
        await mongoose.connection.collection('sessoes').updateMany({}, { $set: { expires: new Date(0) } });
        assert.equal((await b.get('/api/auth/me')).body.autenticado, false);
        assert.equal((await b.get('/api/orcamentos/meus')).status, 401);
    });

    test('produção exige HTTPS, confia apenas no proxy configurado e emite cookie Secure', async () => {
        env.isProd = true;
        try {
            const noProxy = createApp();
            assert.equal((await request(noProxy).get('/api/auth/me').set('X-Forwarded-Proto', 'https')).status, 400);
            env.trustProxy = 'loopback';
            const secured = await request(createApp()).get('/api/auth/me').set('X-Forwarded-Proto', 'https');
            assert.equal(secured.status, 200);
            assert.match(secured.headers['set-cookie'].find(c => c.startsWith('cm.sid=')), /; Secure/);
        } finally { env.isProd = false; env.trustProxy = ''; }
    });

    test('recuperação não expõe token e contas Google não recebem senha por recuperação', async () => {
        const mailer = require('../src/services/passwordResetMailer');
        const users = require('../src/services/userService');
        const originalHost = env.smtpHost;
        env.smtpHost = '';
        assert.equal((await request(app).post('/api/auth/recuperar-senha').send({ email: 'link@example.test' })).status, 503);
        env.smtpHost = originalHost;
        const configured = mock.method(mailer, 'assertConfigured', () => {});
        const delivery = mock.method(mailer, 'sendResetLink', async () => {});
        try {
            const response = await request(app).post('/api/auth/recuperar-senha').send({ email: 'google@example.test' });
            assert.equal(response.status, 200);
            assert.equal(response.body.token, undefined);
            assert.equal(delivery.mock.callCount(), 0);
            const user = await User.findOne({ googleSub: 'google-test-user' });
            await User.updateOne({ _id: user._id }, { resetPasswordToken: crypto.createHash('sha256').update('forged').digest('hex'), resetPasswordExpires: new Date(Date.now() + 60000) });
            await assert.rejects(users.redefinirSenha({ email: user.email, token: 'forged', nova_senha: 'Password123' }), error => error.statusCode === 400);
        } finally { configured.mock.restore(); delivery.mock.restore(); }
    });

    test('limita múltiplas tentativas com resposta 429 sem revelar segredos', async () => {
        env.isTest = false;
        try {
            const response = await request(app).post('/api/auth/google/link').send({});
            // Previous requests from this same IP exceed the production window (40/15 min).
            assert.equal(response.status, 429);
            assert.match(response.body.erro, /Muitas tentativas/);
            assert.ok(response.headers['retry-after']);
        } finally { env.isTest = true; }
    });
});
