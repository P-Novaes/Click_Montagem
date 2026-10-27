const { User, Avaliacao, Agendamento } = require('../models');
const AppError = require('../utils/AppError');
const { assertObjectId } = require('../validators/validators');
const { calcularMetricasMontador, atualizarPerfil } = require('./userService');

async function listarMontadores(busca = '') {
    const termo = String(busca || '').trim();
    const filtro = { tipo: 'montador' };

    if (termo) {
        const regex = new RegExp(termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filtro.$or = [
            { nome: regex },
            { 'montador.especialidades': regex },
            { 'montador.regiao_atendimento': regex },
            { cidade: regex },
        ];
    }

    const usuarios = await User.find(filtro);
    const resultado = await Promise.all(
        usuarios.map(async (u) => {
            const stats = await calcularMetricasMontador(u._id);
            return u.toPublicObject(stats);
        })
    );

    resultado.sort((a, b) => {
        if (b.nota_media !== a.nota_media) return b.nota_media - a.nota_media;
        return b.total_servicos - a.total_servicos;
    });

    return resultado;
}

async function buscarMontadorPublico(montadorId) {
    const id = assertObjectId(montadorId, 'ID do montador');
    const user = await User.findOne({ _id: id, tipo: 'montador' });
    if (!user) {
        throw new AppError('Montador não encontrado.', 404);
    }

    const stats = await calcularMetricasMontador(user._id);

    const avaliacoesDocs = await Avaliacao.find({ montador_id: user._id })
        .sort({ criado_em: -1 })
        .limit(20)
        .populate('cliente_id', 'nome')
        .populate({
            path: 'agendamento_id',
            populate: { path: 'orcamento_id', select: 'tipo_movel' },
        })
        .lean();

    const avaliacoes = avaliacoesDocs.map((av) => ({
        id: av._id.toString(),
        nota: av.nota,
        comentario: av.comentario || '',
        recomenda: av.recomenda ?? true,
        criterios: av.criterios || null,
        criado_em: av.criado_em
            ? new Date(av.criado_em).toISOString().replace('T', ' ').slice(0, 19)
            : '',
        cliente_nome: av.cliente_id?.nome || 'Cliente Click Montagem',
        tipo_movel: av.agendamento_id?.orcamento_id?.tipo_movel || 'Montagem de móvel',
    }));

    return user.toPublicObject({
        ...stats,
        avaliacoes,
    });
}

async function atualizarDadosMontador(montadorId, actorUser, body = {}) {
    if (!actorUser || actorUser.tipo !== 'montador') {
        throw new AppError('Apenas montadores podem atualizar perfil profissional.', 403);
    }
    return atualizarPerfil(montadorId, actorUser, body);
}

module.exports = {
    listarMontadores,
    buscarMontadorPublico,
    atualizarDadosMontador,
};
