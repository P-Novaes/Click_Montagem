const { Agendamento, Proposta, Orcamento, Avaliacao, Notificacao } = require('../models');
const AppError = require('../utils/AppError');
const { withTransaction } = require('../utils/dbTransaction');
const { assertObjectId, validarEnum } = require('../validators/validators');

async function formatarAgendamentoDetalhado(ag) {
    const cliente = ag.cliente_id && typeof ag.cliente_id === 'object' ? ag.cliente_id : {};
    const montador = ag.montador_id && typeof ag.montador_id === 'object' ? ag.montador_id : {};
    const orcamento = ag.orcamento_id && typeof ag.orcamento_id === 'object' ? ag.orcamento_id : {};

    const avaliacao = await Avaliacao.findOne({ agendamento_id: ag._id })
        .select('_id nota comentario')
        .lean();

    return {
        id: ag._id.toString(),
        proposta_id: ag.proposta_id?._id ? ag.proposta_id._id.toString() : String(ag.proposta_id),
        orcamento_id: orcamento._id ? orcamento._id.toString() : String(ag.orcamento_id),
        cliente_id: cliente._id ? cliente._id.toString() : String(ag.cliente_id),
        montador_id: montador._id ? montador._id.toString() : String(ag.montador_id),
        data_servico: ag.data_servico,
        horario: ag.horario,
        endereco: ag.endereco,
        status: ag.status,
        valor: Number(ag.valor || 0),
        criado_em: ag.criado_em
            ? new Date(ag.criado_em).toISOString().replace('T', ' ').slice(0, 19)
            : '',
        atualizado_em: ag.atualizado_em
            ? new Date(ag.atualizado_em).toISOString().replace('T', ' ').slice(0, 19)
            : '',
        cliente_nome: cliente.nome || 'Cliente',
        cliente_telefone: cliente.telefone || '',
        cliente_email: cliente.email || '',
        montador_nome: montador.nome || 'Montador',
        montador_telefone: montador.telefone || '',
        montador_email: montador.email || '',
        tipo_movel: orcamento.tipo_movel || 'Serviço de montagem',
        categoria: orcamento.categoria || 'padrao',
        orcamento_descricao: orcamento.descricao || '',
        bairro: orcamento.bairro || '',
        cep: orcamento.cep || '',
        avaliacao_id: avaliacao ? avaliacao._id.toString() : null,
        avaliacao_nota: avaliacao ? Number(avaliacao.nota) : null,
        avaliacao_comentario: avaliacao ? avaliacao.comentario : null,
    };
}

async function listarAgendamentos(actorUser, query = {}) {
    if (!actorUser) {
        throw new AppError('Autenticação necessária.', 401);
    }

    const clienteIdParam = query.cliente_id ? assertObjectId(query.cliente_id, 'cliente_id') : null;
    const montadorIdParam = query.montador_id ? assertObjectId(query.montador_id, 'montador_id') : null;

    if (clienteIdParam && String(actorUser._id) !== clienteIdParam) {
        throw new AppError('Você não tem permissão para listar agendamentos de outro cliente.', 403);
    }
    if (montadorIdParam && String(actorUser._id) !== montadorIdParam) {
        throw new AppError('Você não tem permissão para listar agendamentos de outro montador.', 403);
    }

    const filtro = {};
    if (actorUser.tipo === 'montador') {
        filtro.montador_id = actorUser._id;
    } else {
        filtro.cliente_id = actorUser._id;
    }

    if (query.status && String(query.status).trim() !== '') {
        filtro.status = validarEnum(query.status, ['agendado', 'em_andamento', 'concluido', 'cancelado']);
    }

    const docs = await Agendamento.find(filtro)
        .sort({ data_servico: 1, criado_em: -1 })
        .populate('cliente_id', 'nome telefone email')
        .populate('montador_id', 'nome telefone email')
        .populate('orcamento_id', 'tipo_movel categoria descricao bairro cep')
        .lean();

    return Promise.all(docs.map((ag) => formatarAgendamentoDetalhado(ag)));
}

async function buscarAgendamento(agendamentoIdParam, actorUser) {
    if (!actorUser) {
        throw new AppError('Autenticação necessária.', 401);
    }
    const id = assertObjectId(agendamentoIdParam, 'ID do agendamento');

    const ag = await Agendamento.findById(id)
        .populate('cliente_id', 'nome telefone email')
        .populate('montador_id', 'nome telefone email')
        .populate('orcamento_id', 'tipo_movel categoria descricao bairro cep')
        .lean();

    if (!ag) {
        throw new AppError('Agendamento não encontrado.', 404);
    }

    const cid = ag.cliente_id?._id ? String(ag.cliente_id._id) : String(ag.cliente_id);
    const mid = ag.montador_id?._id ? String(ag.montador_id._id) : String(ag.montador_id);

    if (String(actorUser._id) !== cid && String(actorUser._id) !== mid) {
        throw new AppError('Você não tem permissão para visualizar este agendamento.', 403);
    }

    return formatarAgendamentoDetalhado(ag);
}

async function atualizarStatusAgendamento(agendamentoIdParam, body = {}, actorUser) {
    if (!actorUser) {
        throw new AppError('Autenticação necessária.', 401);
    }
    const id = assertObjectId(agendamentoIdParam, 'ID do agendamento');
    const novoStatus = validarEnum(
        body.status,
        ['agendado', 'em_andamento', 'concluido', 'cancelado']
    );

    const ag = await Agendamento.findById(id)
        .populate('montador_id', 'nome')
        .populate('orcamento_id', 'tipo_movel');

    if (!ag) {
        throw new AppError('Agendamento não encontrado.', 404);
    }

    const cid = String(ag.cliente_id);
    const mid = ag.montador_id?._id ? String(ag.montador_id._id) : String(ag.montador_id);

    if (String(actorUser._id) !== cid && String(actorUser._id) !== mid) {
        throw new AppError('Você não tem permissão para alterar este agendamento.', 403);
    }

    if (ag.status === 'concluido' || ag.status === 'cancelado') {
        throw new AppError(`Não é possível alterar um agendamento já ${ag.status}.`, 409);
    }

    const tipoMovel = ag.orcamento_id?.tipo_movel || 'montagem';
    const montadorNome = ag.montador_id?.nome || 'montador';
    const orcId = ag.orcamento_id?._id || ag.orcamento_id;

    await withTransaction(async (session) => {
        const opts = session ? { session } : {};

        await Agendamento.updateOne({ _id: ag._id }, { $set: { status: novoStatus } }, opts);

        if (novoStatus === 'concluido') {
            await Proposta.updateOne(
                { _id: ag.proposta_id },
                { $set: { status: 'concluida' } },
                opts
            );
            await Orcamento.updateOne(
                { _id: orcId },
                { $set: { status: 'concluido' } },
                opts
            );
            await Notificacao.create(
                [
                    {
                        usuario_id: ag.cliente_id,
                        mensagem: `O serviço "${tipoMovel}" foi concluído! Por favor, avalie o profissional ${montadorNome}.`,
                        lida: false,
                    },
                ],
                opts
            );
        } else if (novoStatus === 'cancelado') {
            await Proposta.updateOne(
                { _id: ag.proposta_id },
                { $set: { status: 'recusada' } },
                opts
            );
            await Orcamento.updateOne(
                { _id: orcId },
                { $set: { status: 'aberto' } },
                opts
            );
            await Notificacao.create(
                [
                    {
                        usuario_id: mid,
                        mensagem: `O agendamento do serviço "${tipoMovel}" foi cancelado.`,
                        lida: false,
                    },
                    {
                        usuario_id: cid,
                        mensagem: `O agendamento do serviço "${tipoMovel}" foi cancelado e seu orçamento voltou a ficar aberto.`,
                        lida: false,
                    },
                ],
                opts
            );
        }
    });

    return { status: novoStatus };
}

module.exports = {
    listarAgendamentos,
    buscarAgendamento,
    atualizarStatusAgendamento,
};
