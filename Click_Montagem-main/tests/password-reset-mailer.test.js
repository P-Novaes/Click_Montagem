process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const env = require('../src/config/env');
const mailer = require('../src/services/passwordResetMailer');

test('SMTP entrega link somente ao destinatário, com TLS e logs desabilitados', async t => {
    Object.assign(env, { smtpHost: 'smtp.example.test', smtpFrom: 'noreply@example.test', smtpUser: 'smtp-user', smtpPassword: 'test-only', appUrl: 'http://localhost:3000' });
    const messages = [], configs = [];
    let closed = 0;
    t.mock.method(nodemailer, 'createTransport', config => {
        configs.push(config);
        return { sendMail: async message => messages.push(message), close: () => closed++ };
    });
    for (const port of [587, 465]) {
        env.smtpPort = port;
        await mailer.sendResetLink('pessoa@example.test', 'secret-test-token');
    }
    assert.equal(closed, 2);
    assert.equal(configs[0].secure, false);
    assert.equal(configs[1].secure, true);
    for (const config of configs) {
        assert.equal(config.requireTLS, true);
        assert.equal(config.logger, false);
        assert.equal(config.debug, false);
    }
    assert.deepEqual(messages[0].to, { address: 'pessoa@example.test' });
    const url = new URL(messages[0].text.match(/http[^\s]+/)[0]);
    assert.equal(url.origin, 'http://localhost:3000');
    assert.equal(url.pathname, '/pages/redefinir_senha.html');
    assert.equal(url.searchParams.get('token'), 'secret-test-token');
    assert.equal(url.searchParams.get('email'), 'pessoa@example.test');
});

test('SMTP falha sem expor erro do provedor nem token', async t => {
    t.mock.method(nodemailer, 'createTransport', () => ({
        sendMail: async () => { throw new Error('provider-secret-password'); }, close() {},
    }));
    await assert.rejects(mailer.sendResetLink('pessoa@example.test', 'secret-test-token'), error => {
        assert.equal(error.statusCode, 503);
        assert.equal(error.message.includes('provider-secret-password'), false);
        assert.equal(error.message.includes('secret-test-token'), false);
        return true;
    });
});

test('recuperação exige origem HTTPS em produção e configuração explícita', () => {
    env.isProd = true;
    assert.throws(mailer.assertConfigured);
    env.appUrl = 'https://click.example.test';
    assert.doesNotThrow(mailer.assertConfigured);
    env.appUrl = 'https://click.example.test/?redirect=evil';
    assert.throws(mailer.assertConfigured);
    env.smtpHost = '';
    assert.throws(mailer.assertConfigured);
    env.isProd = false;
});
