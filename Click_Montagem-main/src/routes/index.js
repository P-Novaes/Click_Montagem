const express = require('express');
const authRoutes = require('./authRoutes');
const montadorRoutes = require('./montadorRoutes');
const orcamentoRoutes = require('./orcamentoRoutes');
const propostaRoutes = require('./propostaRoutes');
const agendamentoRoutes = require('./agendamentoRoutes');
const avaliacaoRoutes = require('./avaliacaoRoutes');
const notificacaoRoutes = require('./notificacaoRoutes');
const AppError = require('../utils/AppError');

const router = express.Router();

router.get('/health', (_req, res) => {
    res.status(200).json({
        sucesso: true,
        status: 'ok',
        servico: 'Click Montagem API (Node.js + Express + MongoDB)',
    });
});

router.use('/auth', authRoutes);
router.use('/usuarios', authRoutes);
router.use('/montadores', montadorRoutes);
router.use('/orcamentos', orcamentoRoutes);
router.use('/propostas', propostaRoutes);
router.use('/agendamentos', agendamentoRoutes);
router.use('/avaliacoes', avaliacaoRoutes);
router.use('/notificacoes', notificacaoRoutes);

// Fallback para rotas de API inexistentes
router.use((_req, _res, next) => {
    next(new AppError('Endpoint da API não encontrado.', 404));
});

module.exports = router;
