const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const OAuthAttempt = require('../../src/models/OAuthAttempt');
const env = require('../../src/config/env');

// Simulated Google HTTP boundary, with real RSA signing and real library verification.
// This is NOT an external Google end-to-end test.
function mockGoogleProvider(mock) {
    const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
    const codes = new Map();
    mock.method(OAuth2Client.prototype, 'getFederatedSignonCertsAsync', async () => ({ certs: { test: publicKey } }));
    mock.method(OAuth2Client.prototype, 'getToken', async ({ code, codeVerifier }) => {
        const entry = codes.get(code);
        codes.delete(code);
        if (!entry || entry.verifier !== codeVerifier || entry.fail) throw new Error('Simulated upstream failure with secret that must not be logged');
        return { tokens: { id_token: entry.token, access_token: 'NOT-TO-BE-STORED' } };
    });
    return async function issue(state, claims = {}, { fail = false, tamper = false } = {}) {
        const attempt = await OAuthAttempt.findOne({ stateHash: crypto.createHash('sha256').update(state).digest('hex') });
        const payload = {
            iss: 'https://accounts.google.com', aud: env.googleClientId,
            iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
            sub: 'google-test-user', email: 'google@example.test', email_verified: true,
            name: 'Pessoa Google', nonce: attempt.nonce, ...claims,
        };
        const encoded = [ { alg: 'RS256', kid: 'test', typ: 'JWT' }, payload ]
            .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
        const signature = crypto.sign('RSA-SHA256', Buffer.from(encoded), keys.privateKey);
        if (tamper) signature[0] ^= 1;
        const code = crypto.randomBytes(16).toString('hex');
        codes.set(code, { token: `${encoded}.${signature.toString('base64url')}`, verifier: attempt.verifier, fail });
        return code;
    };
}

module.exports = { mockGoogleProvider };
