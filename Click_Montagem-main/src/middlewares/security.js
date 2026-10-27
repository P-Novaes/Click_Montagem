const crypto = require('crypto');
const AppError = require('../utils/AppError');
const env = require('../config/env');

/**
 * Remove operadores do MongoDB ($ ou chaves com ponto) de objetos de entrada
 * para prevenir ataques de NoSQL Injection.
 */
function sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            obj[i] = sanitizeObject(obj[i]);
        }
        return obj;
    }

    for (const key of Object.keys(obj)) {
        if (key.startsWith('$') || key.includes('.')) {
            delete obj[key];
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            sanitizeObject(obj[key]);
        }
    }
    return obj;
}

function sanitizeRequest(req, _res, next) {
    if (req.body) sanitizeObject(req.body);
    if (req.query) sanitizeObject(req.query);
    if (req.params) sanitizeObject(req.params);
    next();
}

/**
 * Garante que a sessão possui um token CSRF criptográfico e expõe no cookie XSRF-TOKEN.
 */
function ensureCsrfToken(req, res) {
    if (!req.session) return null;
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    }
    res.cookie('XSRF-TOKEN', req.session.csrfToken, {
        httpOnly: false,
        sameSite: 'lax',
        secure: env.isProd,
        path: '/',
    });
    res.setHeader('X-CSRF-Token', req.session.csrfToken);
    return req.session.csrfToken;
}

/**
 * Proteção CSRF para operações mutáveis autenticadas por cookie de sessão.
 */
function csrfProtection(req, res, next) {
    ensureCsrfToken(req, res);

    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method)) {
        return next();
    }

    // Endpoints de autenticação por credenciais explícitas regeneram a sessão do zero
    // e não devem ser bloqueados caso o navegador ainda possua uma sessão anterior ativa
    const publicAuthPaths = [
        '/login',
        '/cadastrar',
        '/register',
        '/recuperar-senha',
        '/redefinir-senha',
    ];
    if (publicAuthPaths.some((p) => req.path.endsWith(p))) {
        return next();
    }

    // Se a requisição possui sessão autenticada, exige o token CSRF correspondente
    if (req.session && req.session.userId) {
        const clientToken =
            req.headers['x-csrf-token'] ||
            req.headers['x-xsrf-token'] ||
            (req.body && req.body._csrf);

        if (!clientToken || clientToken !== req.session.csrfToken) {
            return next(new AppError('Token de segurança (CSRF) ausente ou inválido. Atualize a página e tente novamente.', 403));
        }
    }

    return next();
}

module.exports = {
    sanitizeRequest,
    ensureCsrfToken,
    csrfProtection,
};
