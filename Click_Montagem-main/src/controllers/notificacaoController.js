const notificacaoService = require('../services/notificacaoService');
const asyncHandler = require('../utils/asyncHandler');

const listar = asyncHandler(async (req, res) => {
    const notificacoes = await notificacaoService.listarNotificacoes(req.user, req.query.uid);
    res.status(200).json({
        sucesso: true,
        notificacoes,
    });
});

const contar = asyncHandler(async (req, res) => {
    const nao_lidas = await notificacaoService.contarNaoLidas(req.user, req.query.uid);
    res.status(200).json({
        sucesso: true,
        nao_lidas,
    });
});

const marcarLida = asyncHandler(async (req, res) => {
    const id = req.params.id || req.query.id;
    await notificacaoService.marcarComoLida(id, req.user);
    res.status(200).json({
        sucesso: true,
        mensagem: 'Notificação marcada como lida.',
    });
});

const marcarTodas = asyncHandler(async (req, res) => {
    await notificacaoService.marcarTodasComoLidas(req.user, req.query.uid);
    res.status(200).json({
        sucesso: true,
        mensagem: 'Todas as notificações foram marcadas como lidas.',
    });
});

module.exports = {
    listar,
    contar,
    marcarLida,
    marcarTodas,
};
