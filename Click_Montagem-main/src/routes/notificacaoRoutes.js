const express = require('express');
const notificacaoController = require('../controllers/notificacaoController');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

router.get('/', requireAuth, notificacaoController.listar);
router.get('/contar', requireAuth, notificacaoController.contar);
router.patch('/ler-todas', requireAuth, notificacaoController.marcarTodas);
router.post('/ler-todas', requireAuth, notificacaoController.marcarTodas);
router.patch('/:id/lida', requireAuth, notificacaoController.marcarLida);
router.post('/:id/lida', requireAuth, notificacaoController.marcarLida);

module.exports = router;
