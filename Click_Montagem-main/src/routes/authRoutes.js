const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const googleController = require('../controllers/googleAuthController');
const AppError = require('../utils/AppError');
const { requireAuth } = require('../middlewares/auth');
const env = require('../config/env');

const router = express.Router();
router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
});

// OAuth starts/linking require CSRF even before authentication.
const oauthCsrf = (req, _res, next) => {
    if (!req.session?.csrfToken || req.get('X-CSRF-Token') !== req.session.csrfToken) {
        return next(new AppError('Token de segurança inválido. Atualize a página.', 403));
    }
    next();
};

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: () => env.isTest ? 1000 : 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        sucesso: false,
        erro: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.',
    },
});

// Rotas REST de Autenticação e Sessão
router.get('/google/status', googleController.status);
router.post('/google', authLimiter, oauthCsrf, googleController.start);
router.post('/google/link', authLimiter, oauthCsrf, googleController.link);
router.get('/google/callback', authLimiter, googleController.callback);
router.post('/google/complete', authLimiter, oauthCsrf, googleController.complete);
router.get('/csrf', authController.csrf);
router.get('/me', authController.me);
router.post('/cadastrar', authLimiter, authController.cadastrar);
router.post('/register', authLimiter, authController.cadastrar);
router.post('/login', authLimiter, authController.login);
router.post('/logout', authController.logout);
router.post('/recuperar-senha', authLimiter, authController.recuperarSenha);
router.post('/redefinir-senha', authLimiter, authController.redefinirSenha);

// Rotas REST de Perfil do Usuário
router.get('/perfil', requireAuth, authController.perfil);
router.get('/perfil/:id', requireAuth, authController.perfil);
router.put('/perfil', requireAuth, authController.atualizar);
router.put('/perfil/:id', requireAuth, authController.atualizar);
router.post('/atualizar/:id?', requireAuth, authController.atualizar);
router.put('/senha', requireAuth, authController.alterarSenha);
router.put('/senha/:id', requireAuth, authController.alterarSenha);
router.post('/alterar-senha/:id?', requireAuth, authController.alterarSenha);
router.delete('/perfil', requireAuth, authController.deletar);
router.delete('/perfil/:id', requireAuth, authController.deletar);
router.post('/deletar/:id?', requireAuth, authController.deletar);
router.get('/:id', requireAuth, authController.perfil);

module.exports = router;
