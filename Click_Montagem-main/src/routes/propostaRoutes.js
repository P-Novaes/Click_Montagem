const express = require('express');
const propostaController = require('../controllers/propostaController');
const { requireAuth, requireRole } = require('../middlewares/auth');

const router = express.Router();

router.get('/orcamento/:orcId', requireAuth, propostaController.listarPorOrcamento);
router.get('/minhas', requireAuth, requireRole('montador'), propostaController.listarPorMontador);
router.get('/montador/:mid', requireAuth, requireRole('montador'), propostaController.listarPorMontador);
router.post('/', requireAuth, requireRole('montador'), propostaController.criar);
router.post('/criar', requireAuth, requireRole('montador'), propostaController.criar);
router.post('/:id/aceitar', requireAuth, requireRole('cliente'), propostaController.aceitar);
router.post('/:id/recusar', requireAuth, requireRole('cliente'), propostaController.recusar);
router.delete('/:id', requireAuth, requireRole('montador'), propostaController.deletar);
router.post('/:id/deletar', requireAuth, requireRole('montador'), propostaController.deletar);
router.get('/', requireAuth, propostaController.listarPorOrcamento);

module.exports = router;
