const orcamentoService = require('../services/orcamentoService');
const asyncHandler = require('../utils/asyncHandler');

const criar = asyncHandler(async (req, res) => {
    const orcamento = await orcamentoService.criarOrcamento(req.user, req.body);
    res.status(201).json({
        sucesso: true,
        mensagem: 'Orçamento enviado! Aguarde propostas dos montadores.',
        id: orcamento.id,
        orcamento,
    });
});

const listarPorCliente = asyncHandler(async (req, res) => {
    const uid = req.params.uid || req.query.uid || req.user?._id;
    const orcamentos = await orcamentoService.listarOrcamentosPorCliente(uid, req.user);
    res.status(200).json({
        sucesso: true,
        orcamentos,
    });
});

const listarAbertos = asyncHandler(async (req, res) => {
    const pedidos = await orcamentoService.listarOrcamentosAbertos(req.user);
    res.status(200).json({
        sucesso: true,
        pedidos,
    });
});

const buscar = asyncHandler(async (req, res) => {
    const id = req.params.id || req.query.id;
    const orcamento = await orcamentoService.buscarOrcamento(id, req.user);
    res.status(200).json({
        sucesso: true,
        orcamento,
    });
});

const atualizarStatus = asyncHandler(async (req, res) => {
    const id = req.params.id || req.query.id;
    const orcamento = await orcamentoService.atualizarStatusOrcamento(id, req.body, req.user);
    res.status(200).json({
        sucesso: true,
        mensagem: `Status atualizado para: ${orcamento.status}`,
        orcamento,
    });
});

const deletar = asyncHandler(async (req, res) => {
    const id = req.params.id || req.query.id;
    await orcamentoService.deletarOrcamento(id, req.user);
    res.status(200).json({
        sucesso: true,
        mensagem: 'Orçamento removido com sucesso.',
    });
});

module.exports = {
    criar,
    listarPorCliente,
    listarAbertos,
    buscar,
    atualizarStatus,
    deletar,
};
