const propostaService = require('../services/propostaService');
const asyncHandler = require('../utils/asyncHandler');

const listarPorOrcamento = asyncHandler(async (req, res) => {
    const orcId = req.params.orcId || req.query.orc_id;
    const propostas = await propostaService.listarPropostasPorOrcamento(orcId, req.user);
    res.status(200).json({
        sucesso: true,
        propostas,
    });
});

const listarPorMontador = asyncHandler(async (req, res) => {
    const mid = req.params.mid || req.query.mid || req.user?._id;
    const propostas = await propostaService.listarPropostasPorMontador(mid, req.user);
    res.status(200).json({
        sucesso: true,
        propostas,
    });
});

const criar = asyncHandler(async (req, res) => {
    const { id } = await propostaService.criarProposta(req.user, req.body);
    res.status(201).json({
        sucesso: true,
        mensagem: 'Proposta enviada com sucesso!',
        id,
    });
});

const aceitar = asyncHandler(async (req, res) => {
    const id = req.params.id || req.query.id;
    const { agendamento_id } = await propostaService.aceitarProposta(id, req.user, req.body);
    res.status(200).json({
        sucesso: true,
        mensagem: 'Proposta aceita com sucesso! Agendamento criado.',
        agendamento_id,
    });
});

const recusar = asyncHandler(async (req, res) => {
    const id = req.params.id || req.query.id;
    await propostaService.recusarProposta(id, req.user);
    res.status(200).json({
        sucesso: true,
        mensagem: 'Proposta recusada.',
    });
});

const deletar = asyncHandler(async (req, res) => {
    const id = req.params.id || req.query.id;
    await propostaService.deletarProposta(id, req.user);
    res.status(200).json({
        sucesso: true,
        mensagem: 'Proposta removida.',
    });
});

module.exports = {
    listarPorOrcamento,
    listarPorMontador,
    criar,
    aceitar,
    recusar,
    deletar,
};
