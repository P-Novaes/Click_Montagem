const agendamentoService = require('../services/agendamentoService');
const asyncHandler = require('../utils/asyncHandler');

const listar = asyncHandler(async (req, res) => {
    const agendamentos = await agendamentoService.listarAgendamentos(req.user, req.query);
    res.status(200).json({
        sucesso: true,
        agendamentos,
    });
});

const buscar = asyncHandler(async (req, res) => {
    const id = req.params.id || req.query.id;
    const agendamento = await agendamentoService.buscarAgendamento(id, req.user);
    res.status(200).json({
        sucesso: true,
        agendamento,
    });
});

const atualizarStatus = asyncHandler(async (req, res) => {
    const id = req.params.id || req.query.id;
    const { status } = await agendamentoService.atualizarStatusAgendamento(id, req.body, req.user);
    res.status(200).json({
        sucesso: true,
        mensagem: `Status atualizado para: ${status}`,
    });
});

module.exports = {
    listar,
    buscar,
    atualizarStatus,
};
