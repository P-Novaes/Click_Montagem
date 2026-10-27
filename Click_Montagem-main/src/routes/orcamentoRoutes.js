const express = require('express');
const orcamentoController = require('../controllers/orcamentoController');
const { requireAuth, requireRole } = require('../middlewares/auth');

const router = express.Router();

router.post('/', requireAuth, requireRole('cliente'), orcamentoController.criar);
router.post('/criar', requireAuth, requireRole('cliente'), orcamentoController.criar);
router.get('/meus', requireAuth, requireRole('cliente'), orcamentoController.listarPorCliente);
router.get('/cliente/:uid', requireAuth, requireRole('cliente'), orcamentoController.listarPorCliente);
router.get('/abertos', requireAuth, orcamentoController.listarAbertos);
router.get('/listar-abertos', requireAuth, orcamentoController.listarAbertos);
router.get('/:id', requireAuth, orcamentoController.buscar);
router.patch('/:id/status', requireAuth, requireRole('cliente'), orcamentoController.atualizarStatus);
router.post('/:id/status', requireAuth, requireRole('cliente'), orcamentoController.atualizarStatus);
router.delete('/:id', requireAuth, requireRole('cliente'), orcamentoController.deletar);
router.post('/:id/deletar', requireAuth, requireRole('cliente'), orcamentoController.deletar);
router.get('/', requireAuth, orcamentoController.listarPorCliente);

module.exports = router;
