const express = require('express');
const agendamentoController = require('../controllers/agendamentoController');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

router.get('/', requireAuth, agendamentoController.listar);
router.get('/listar', requireAuth, agendamentoController.listar);
router.get('/:id', requireAuth, agendamentoController.buscar);
router.patch('/:id/status', requireAuth, agendamentoController.atualizarStatus);
router.post('/:id/status', requireAuth, agendamentoController.atualizarStatus);

module.exports = router;
