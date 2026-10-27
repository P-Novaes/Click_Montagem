const express = require('express');
const montadorController = require('../controllers/montadorController');
const { requireAuth, requireRole } = require('../middlewares/auth');

const router = express.Router();

router.get('/', montadorController.listar);
router.get('/listar', montadorController.listar);
router.get('/:id', montadorController.buscar);
router.put('/perfil', requireAuth, requireRole('montador'), montadorController.atualizar);
router.put('/:id', requireAuth, requireRole('montador'), montadorController.atualizar);
router.post('/atualizar/:id?', requireAuth, requireRole('montador'), montadorController.atualizar);

module.exports = router;
