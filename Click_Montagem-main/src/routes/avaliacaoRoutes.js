const express = require('express');
const avaliacaoController = require('../controllers/avaliacaoController');
const { requireAuth, requireRole } = require('../middlewares/auth');

const router = express.Router();

router.post('/', requireAuth, requireRole('cliente'), avaliacaoController.criar);
router.post('/criar', requireAuth, requireRole('cliente'), avaliacaoController.criar);
router.get('/montador/:montadorId', avaliacaoController.listarPorMontador);
router.get('/agendamento/:agendamentoId', requireAuth, avaliacaoController.buscarPorAgendamento);
router.get('/', avaliacaoController.listarPorMontador);

module.exports = router;
