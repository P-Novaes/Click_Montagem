const { Avaliacao, Agendamento, Notificacao } = require('../models');
const AppError = require('../utils/AppError');
const { assertObjectId, validarAvaliacaoInput } = require('../validators/validators');

async function criarAvaliacao(actorUser, body = {}) {
    if (!actorUser) {
        throw new AppError('Autenticação necessária.', 401);
    }
    if (actorUser.tipo !== 'cliente') {
        throw new AppError('Apenas clientes podem avaliar serviços.', 403);
    }

    const dados = validarAvaliacaoInput(body);

    const agendamento = await Agendamento.findById(dados.agendamento_id).lean();
    if (!agendamento) {
        throw new AppError('Agendamento não encontrado.', 404);
    }

    // Garante que apenas o cliente dono do agendamento pode avaliá-lo
    if (String(agendamento.cliente_id) !== String(actorUser._id)) {
        throw new AppError('Você não tem permissão para avaliar o agendamento de outro cliente.', 403);
    }

    // Garante que o serviço foi efetivamente concluído
    if (agendamento.status !== 'concluido') {
        throw new AppError('Somente serviços efetivamente concluídos podem ser avaliados.', 409);
    }

    const existente = await Avaliacao.findOne({ agendamento_id: agendamento._id }).lean();
    if (existente) {
        throw new AppError('Este serviço já foi avaliado anteriormente.', 409);
    }

    const avaliacao = await Avaliacao.create({
        agendamento_id: agendamento._id,
        cliente_id: actorUser._id,
        montador_id: agendamento.montador_id,
        nota: dados.nota,
        criterios: dados.criterios,
        recomenda: dados.recomenda,
        comentario: dados.comentario,
    });

    await Notificacao.create({
        usuario_id: agendamento.montador_id,
        mensagem: `Você recebeu uma nova avaliação de ${dados.nota} estrela(s) de ${actorUser.nome}!`,
        lida: false,
    });

    return {
        id: avaliacao._id.toString(),
        avaliacao,
    };
}

async function listarAvaliacoesPorMontador(montadorIdParam) {
    const mid = assertObjectId(montadorIdParam, 'montador_id');

    const docs = await Avaliacao.find({ montador_id: mid })
        .sort({ criado_em: -1 })
        .populate('cliente_id', 'nome')
        .populate({
            path: 'agendamento_id',
            populate: { path: 'orcamento_id', select: 'tipo_movel' },
        })
        .lean();

    return docs.map((av) => ({
        id: av._id.toString(),
        agendamento_id: av.agendamento_id?._id
            ? av.agendamento_id._id.toString()
            : String(av.agendamento_id),
        nota: Number(av.nota),
        criterios: av.criterios || null,
        recomenda: av.recomenda ?? true,
        comentario: av.comentario || '',
        criado_em: av.criado_em
            ? new Date(av.criado_em).toISOString().replace('T', ' ').slice(0, 19)
            : '',
        cliente_nome: av.cliente_id?.nome || 'Cliente',
        tipo_movel: av.agendamento_id?.orcamento_id?.tipo_movel || 'Serviço de montagem',
    }));
}

async function buscarAvaliacaoPorAgendamento(agendamentoIdParam) {
    const aid = assertObjectId(agendamentoIdParam, 'agendamento_id');

    const av = await Avaliacao.findOne({ agendamento_id: aid })
        .populate('cliente_id', 'nome')
        .lean();

    if (!av) {
        return { avaliado: false, avaliacao: null };
    }

    return {
        avaliado: true,
        avaliacao: {
            id: av._id.toString(),
            agendamento_id: av.agendamento_id.toString(),
            cliente_id: av.cliente_id?._id ? av.cliente_id._id.toString() : String(av.cliente_id),
            montador_id: av.montador_id.toString(),
            nota: Number(av.nota),
            criterios: av.criterios || null,
            recomenda: av.recomenda ?? true,
            comentario: av.comentario || '',
            criado_em: av.criado_em
                ? new Date(av.criado_em).toISOString().replace('T', ' ').slice(0, 19)
                : '',
            cliente_nome: av.cliente_id?.nome || 'Cliente',
        },
    };
}

module.exports = {
    criarAvaliacao,
    listarAvaliacoesPorMontador,
    buscarAvaliacaoPorAgendamento,
};
