const avaliacaoService = require('../services/avaliacaoService');
const asyncHandler = require('../utils/asyncHandler');

const criar = asyncHandler(async (req, res) => {
    const { id } = await avaliacaoService.criarAvaliacao(req.user, req.body);
    res.status(201).json({
        sucesso: true,
        mensagem: 'Avaliação enviada com sucesso! Obrigado pelo feedback.',
        id,
    });
});

const listarPorMontador = asyncHandler(async (req, res) => {
    const mid = req.params.montadorId || req.query.montador_id;
    const avaliacoes = await avaliacaoService.listarAvaliacoesPorMontador(mid);
    res.status(200).json({
        sucesso: true,
        avaliacoes,
    });
});

const buscarPorAgendamento = asyncHandler(async (req, res) => {
    const aid = req.params.agendamentoId || req.query.agendamento_id;
    const resultado = await avaliacaoService.buscarAvaliacaoPorAgendamento(aid);
    res.status(200).json({
        sucesso: true,
        ...resultado,
    });
});

module.exports = {
    criar,
    listarPorMontador,
    buscarPorAgendamento,
};
