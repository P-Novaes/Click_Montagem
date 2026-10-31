const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const helmet = require('helmet');
const mongoose = require('mongoose');

const env = require('./config/env');
const apiRoutes = require('./routes');
const { sanitizeRequest, csrfProtection } = require('./middlewares/security');
const { hydrateUser } = require('./middlewares/auth');
const errorHandler = require('./middlewares/errorHandler');

const PUBLIC_PAGES = new Set([
    'login.html',
    'recuperar_senha.html',
    'redefinir_senha.html',
    'perfil-montador.html',
    'termos.html',
    'privacidade.html',
    'guia.html',
]);

const CLIENT_ONLY_PAGES = new Set([
    'painel-cliente.html',
    'orcamento.html',
    'confirmacao-orcamento.html',
    'avaliacao.html',
    'editar_perfil.html',
]);

const MONTADOR_ONLY_PAGES = new Set([
    'painel-montador.html',
    'editar-perfil-montador.html',
]);

function createApp() {
    const app = express();
    const rootDir = path.resolve(__dirname, '..');

    app.disable('x-powered-by');
    if (env.trustProxy) app.set('trust proxy', env.trustProxy.split(',').map(value => value.trim()));
    if (env.isProd && mongoose.connection.readyState !== 1) {
        throw new Error('MongoDB é obrigatório para armazenar sessões em produção.');
    }
    app.use((req, res, next) => {
        if (env.isProd && !req.secure) return res.status(400).json({ sucesso: false, erro: 'HTTPS obrigatório.' });
        next();
    });

    // Cabeçalhos de segurança HTTP preservando compatibilidade com FontAwesome e scripts inline do frontend
    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrcAttr: ["'unsafe-inline'"],
                    styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com'],
                    fontSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://fonts.gstatic.com', 'data:'],
                    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
                    connectSrc: ["'self'"],
                },
            },
            crossOriginEmbedderPolicy: false,
        })
    );

    app.use(express.json({ limit: '2mb' }));
    app.use(express.urlencoded({ extended: true, limit: '2mb' }));
    app.use(sanitizeRequest);

    // Configuração de sessão segura no servidor
    const sessionConfig = {
        name: env.sessionName,
        secret: env.sessionSecret,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: env.isProd,
            maxAge: env.sessionMaxAgeMs,
            path: '/',
        },
    };

    if (mongoose.connection.readyState === 1) {
        sessionConfig.store = MongoStore.create({
            client: mongoose.connection.getClient(),
            collectionName: 'sessoes',
            ttl: Math.floor(env.sessionMaxAgeMs / 1000),
        });
    }

    app.use(session(sessionConfig));
    app.use(hydrateUser);
    app.use(csrfProtection);

    // Rotas da API (suporta tanto /api quanto /click_montagem/api por retrocompatibilidade)
    app.use('/api', apiRoutes);
    app.use('/click_montagem/api', apiRoutes);

    // Proteção no servidor para páginas HTML privadas
    const protectPagesMiddleware = (req, res, next) => {
        const pageName = path.basename(req.path);
        if (!pageName.endsWith('.html')) return next();

        if (PUBLIC_PAGES.has(pageName)) {
            return next();
        }

        // Páginas privadas exigem usuário autenticado na sessão do servidor
        if (!req.user) {
            return res.redirect('/pages/login.html');
        }
        if (req.user.cadastroCompleto === false || !req.user.tipo) {
            return res.redirect('/pages/login.html?google=complete');
        }

        // Controle de acesso por perfil nas páginas
        if (CLIENT_ONLY_PAGES.has(pageName) && req.user.tipo !== 'cliente') {
            return res.redirect('/pages/painel-montador.html');
        }

        if (MONTADOR_ONLY_PAGES.has(pageName) && req.user.tipo !== 'montador') {
            return res.redirect('/pages/painel-cliente.html');
        }

        // Impede cache de páginas autenticadas no navegador para evitar exibição de conta anterior ao voltar página
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        return next();
    };

    // Arquivos estáticos públicos e páginas (sem expor código-fonte do backend)
    app.use('/assets', express.static(path.join(rootDir, 'assets')));
    app.use('/click_montagem/assets', express.static(path.join(rootDir, 'assets')));

    app.use('/pages', protectPagesMiddleware, express.static(path.join(rootDir, 'pages')));
    app.use('/click_montagem/pages', protectPagesMiddleware, express.static(path.join(rootDir, 'pages')));

    app.get(['/', '/index.html', '/click_montagem', '/click_montagem/index.html'], (_req, res) => {
        res.sendFile(path.join(rootDir, 'index.html'));
    });

    // Tratamento centralizado de erros
    app.use(errorHandler);

    return app;
}

module.exports = { createApp };
