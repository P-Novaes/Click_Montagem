const nodemailer = require('nodemailer');
const env = require('../config/env');
const AppError = require('../utils/AppError');

function assertConfigured() {
    let origin;
    try { origin = new URL(env.appUrl); } catch { /* Fail closed below. */ }
    const local = origin && !env.isProd && origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
    if (!env.smtpHost || !env.smtpFrom || !origin || (!local && origin.protocol !== 'https:') ||
        origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
        throw new AppError('Recuperação de senha indisponível até configurar o envio seguro por e-mail.', 503);
    }
}

async function sendResetLink(email, token) {
    assertConfigured();
    const link = new URL('/pages/redefinir_senha.html', env.appUrl);
    link.searchParams.set('token', token);
    link.searchParams.set('email', email);
    const transporter = nodemailer.createTransport({
        host: env.smtpHost, port: env.smtpPort, secure: env.smtpPort === 465,
        requireTLS: true,
        auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPassword } : undefined,
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
        logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
    });
    try {
        await transporter.sendMail({
            from: env.smtpFrom, to: { address: email }, subject: 'Redefinir senha — Click Montagem',
            text: `Para redefinir sua senha, acesse o link abaixo em até uma hora:\n\n${link.href}\n\nSe não solicitou a alteração, ignore esta mensagem.`,
        });
    } catch {
        // SMTP errors can carry sensitive data; never forward them to the logger.
        throw new AppError('Não foi possível enviar o e-mail de recuperação. Tente novamente mais tarde.', 503);
    } finally { transporter.close(); }
}

module.exports = { assertConfigured, sendResetLink };
