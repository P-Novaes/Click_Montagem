const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middlewares/auth');
const env = require('../config/env');

const router = express.Router();

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: env.isTest ? 1000 : 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        sucesso: false,
        erro: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.',
    },
});

// Rotas REST de Autenticação e Sessão
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
