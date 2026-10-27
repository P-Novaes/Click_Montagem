const montadorService = require('../services/montadorService');
const asyncHandler = require('../utils/asyncHandler');

const listar = asyncHandler(async (req, res) => {
    const busca = req.query.busca || '';
    const montadores = await montadorService.listarMontadores(busca);
    res.status(200).json({
        sucesso: true,
        montadores,
    });
});

const buscar = asyncHandler(async (req, res) => {
    const id = req.params.id || req.query.id;
    const montador = await montadorService.buscarMontadorPublico(id);
    res.status(200).json({
        sucesso: true,
        montador,
    });
});

const atualizar = asyncHandler(async (req, res) => {
    const id = req.params.id || req.query.id || req.user?._id;
    const usuario = await montadorService.atualizarDadosMontador(id, req.user, req.body);
    res.status(200).json({
        sucesso: true,
        mensagem: 'Perfil profissional atualizado com sucesso!',
        usuario,
    });
});

module.exports = {
    listar,
    buscar,
    atualizar,
};
