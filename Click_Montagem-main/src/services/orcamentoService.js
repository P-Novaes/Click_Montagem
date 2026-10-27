const { Orcamento, Proposta, Agendamento, Notificacao } = require('../models');
const AppError = require('../utils/AppError');
const { assertObjectId, validarEnum, validarOrcamentoInput } = require('../validators/validators');

function formatarOrcamentoDoc(orc, extras = {}) {
    const obj = typeof orc.toObject === 'function' ? orc.toObject() : orc;
    const usuarioPopulado = obj.usuario_id && typeof obj.usuario_id === 'object' && obj.usuario_id._id;

    return {
        id: obj._id.toString(),
        usuario_id: usuarioPopulado ? obj.usuario_id._id.toString() : String(obj.usuario_id),
        cliente_id: usuarioPopulado ? obj.usuario_id._id.toString() : String(obj.usuario_id),
        cliente_nome: usuarioPopulado ? obj.usuario_id.nome : extras.cliente_nome,
        cliente_telefone: usuarioPopulado ? obj.usuario_id.telefone : extras.cliente_telefone,
        cliente_email: usuarioPopulado ? obj.usuario_id.email : extras.cliente_email,
        categoria: obj.categoria,
        tipo_movel: obj.tipo_movel,
        quantidade_pecas: Number(obj.quantidade_pecas || 1),
        complexidade: obj.complexidade,
        descricao: obj.descricao || '',
        cep: obj.cep || '',
        rua: obj.rua || '',
        numero: obj.numero || '',
        complemento: obj.complemento || '',
        bairro: obj.bairro || '',
        horario: obj.horario,
        preco_estimado: obj.preco_estimado || '',
        status: obj.status,
        criado_em: obj.criado_em
            ? new Date(obj.criado_em).toISOString().replace('T', ' ').slice(0, 19)
            : '',
        ...extras,
    };
}

async function criarOrcamento(actorUser, body = {}) {
    if (!actorUser) {
        throw new AppError('Autenticação necessária.', 401);
    }
    if (actorUser.tipo !== 'cliente') {
        throw new AppError('Apenas contas de cliente podem solicitar orçamentos.', 403);
    }
    if (body.usuario_id && String(body.usuario_id) !== String(actorUser._id)) {
        throw new AppError('Não é permitido criar orçamento em nome de outro usuário.', 403);
    }

    const dados = validarOrcamentoInput(body);

    const orcamento = await Orcamento.create({
        usuario_id: actorUser._id,
        ...dados,
        status: 'aberto',
    });

    await Notificacao.create({
        usuario_id: actorUser._id,
        mensagem: `Seu pedido de orçamento para "${orcamento.tipo_movel}" foi publicado com sucesso!`,
        lida: false,
    });

    return formatarOrcamentoDoc(orcamento, {
        cliente_nome: actorUser.nome,
        total_propostas: 0,
        propostas_novas: 0,
    });
}

async function listarOrcamentosPorCliente(uidParam, actorUser) {
    if (!actorUser) {
        throw new AppError('Autenticação necessária.', 401);
    }
    const uid = uidParam ? assertObjectId(uidParam, 'uid') : String(actorUser._id);

    if (String(actorUser._id) !== uid) {
        throw new AppError('Você não tem permissão para consultar orçamentos de outro cliente.', 403);
    }

    const orcamentos = await Orcamento.find({ usuario_id: uid }).sort({ criado_em: -1 }).lean();

    const resultado = await Promise.all(
        orcamentos.map(async (o) => {
            const [totalPropostas, propostasNovas] = await Promise.all([
                Proposta.countDocuments({ orcamento_id: o._id }),
                Proposta.countDocuments({ orcamento_id: o._id, status: 'pendente' }),
            ]);
            return formatarOrcamentoDoc(o, {
                total_propostas: totalPropostas,
                propostas_novas: propostasNovas,
            });
        })
    );

    return resultado;
}

async function listarOrcamentosAbertos(actorUser) {
    if (!actorUser) {
        throw new AppError('Autenticação necessária.', 401);
    }

    const pedidos = await Orcamento.find({ status: 'aberto' })
        .sort({ criado_em: -1 })
        .limit(30)
        .populate('usuario_id', 'nome')
        .lean();

    const resultado = await Promise.all(
        pedidos.map(async (p) => {
            const [totalPropostas, minhaProposta] = await Promise.all([
                Proposta.countDocuments({ orcamento_id: p._id }),
                actorUser.tipo === 'montador'
                    ? Proposta.findOne({ orcamento_id: p._id, montador_id: actorUser._id }).select('_id status').lean()
                    : null,
            ]);

            return formatarOrcamentoDoc(p, {
                total_propostas: totalPropostas,
                ja_enviou_proposta: Boolean(minhaProposta),
                minha_proposta_status: minhaProposta?.status || null,
            });
        })
    );

    return resultado;
}

async function buscarOrcamento(orcId, actorUser) {
    const id = assertObjectId(orcId, 'ID do orçamento');
    const orc = await Orcamento.findById(id).populate('usuario_id', 'nome telefone email').lean();
    if (!orc) {
        throw new AppError('Orçamento não encontrado.', 404);
    }

    const donoId = orc.usuario_id?._id ? String(orc.usuario_id._id) : String(orc.usuario_id);

    if (actorUser) {
        // Cliente só pode visualizar seus próprios orçamentos
        if (actorUser.tipo === 'cliente' && String(actorUser._id) !== donoId) {
            throw new AppError('Você não tem permissão para acessar este orçamento.', 403);
        }
    }

    const totalPropostas = await Proposta.countDocuments({ orcamento_id: orc._id });
    return formatarOrcamentoDoc(orc, { total_propostas: totalPropostas });
}

async function atualizarStatusOrcamento(orcId, body = {}, actorUser) {
    const id = assertObjectId(orcId, 'ID do orçamento');
    const novoStatus = validarEnum(body.status, ['aberto', 'em_andamento', 'concluido', 'cancelado']);

    const orc = await Orcamento.findById(id);
    if (!orc) {
        throw new AppError('Orçamento não encontrado.', 404);
    }

    if (!actorUser || String(orc.usuario_id) !== String(actorUser._id)) {
        throw new AppError('Você não tem permissão para alterar este orçamento.', 403);
    }

    if (orc.status === 'concluido' && novoStatus !== 'concluido') {
        throw new AppError('Não é possível alterar o status de um orçamento já concluído.', 409);
    }

    if (novoStatus === 'cancelado') {
        const agendamentoAtivo = await Agendamento.findOne({
            orcamento_id: orc._id,
            status: 'concluido',
        }).lean();
        if (agendamentoAtivo) {
            throw new AppError('Não é possível cancelar um orçamento cujo serviço já foi concluído.', 409);
        }
        await Proposta.updateMany(
            { orcamento_id: orc._id, status: 'pendente' },
            { $set: { status: 'recusada' } }
        );
        await Agendamento.updateMany(
            { orcamento_id: orc._id, status: { $in: ['agendado', 'em_andamento'] } },
            { $set: { status: 'cancelado' } }
        );
    }

    orc.status = novoStatus;
    await orc.save();

    return formatarOrcamentoDoc(orc);
}

async function deletarOrcamento(orcId, actorUser) {
    const id = assertObjectId(orcId, 'ID do orçamento');
    const orc = await Orcamento.findById(id);
    if (!orc) {
        throw new AppError('Orçamento não encontrado.', 404);
    }

    if (!actorUser || String(orc.usuario_id) !== String(actorUser._id)) {
        throw new AppError('Você não tem permissão para excluir este orçamento.', 403);
    }

    if (orc.status === 'em_andamento' || orc.status === 'concluido') {
        throw new AppError(
            'Não é permitido excluir um orçamento em andamento ou concluído para preservar o histórico. Utilize o cancelamento caso aplicável.',
            409
        );
    }

    const possuiAgendamento = await Agendamento.countDocuments({ orcamento_id: orc._id });
    if (possuiAgendamento > 0) {
        throw new AppError('Este orçamento possui histórico de agendamento vinculado e não pode ser excluído.', 409);
    }

    await Proposta.deleteMany({ orcamento_id: orc._id });
    await Orcamento.findByIdAndDelete(orc._id);
}

module.exports = {
    criarOrcamento,
    listarOrcamentosPorCliente,
    listarOrcamentosAbertos,
    buscarOrcamento,
    atualizarStatusOrcamento,
    deletarOrcamento,
};
