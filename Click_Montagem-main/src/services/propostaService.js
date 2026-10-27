const { Proposta, Orcamento, Agendamento, Notificacao, User } = require('../models');
const AppError = require('../utils/AppError');
const { withTransaction } = require('../utils/dbTransaction');
const { assertObjectId, validarPropostaInput } = require('../validators/validators');
const { calcularMetricasMontador } = require('./userService');

function formatarMoedaBR(valor) {
    return Number(valor || 0).toFixed(2).replace('.', ',');
}

async function listarPropostasPorOrcamento(orcIdParam, actorUser) {
    const orcId = assertObjectId(orcIdParam, 'orc_id');

    const orc = await Orcamento.findById(orcId).lean();
    if (!orc) {
        throw new AppError('Orçamento não encontrado.', 404);
    }

    if (!actorUser) {
        throw new AppError('Autenticação necessária.', 401);
    }

    // Clientes só podem ver propostas de seus próprios orçamentos
    if (actorUser.tipo === 'cliente' && String(orc.usuario_id) !== String(actorUser._id)) {
        throw new AppError('Você não tem permissão para visualizar propostas deste orçamento.', 403);
    }

    const propostas = await Proposta.find({ orcamento_id: orcId })
        .populate('montador_id', 'nome telefone montador')
        .lean();

    const enriquecidas = await Promise.all(
        propostas.map(async (p) => {
            const mDoc = p.montador_id || {};
            const mid = mDoc._id ? mDoc._id.toString() : String(p.montador_id);
            const stats = mDoc._id ? await calcularMetricasMontador(mDoc._id) : {
                nota_media: 5.0,
                total_avaliacoes: 0,
                servicos_concluidos: 0,
            };

            return {
                id: p._id.toString(),
                orcamento_id: p.orcamento_id.toString(),
                montador_id: mid,
                valor: Number(p.valor),
                disponibilidade: p.disponibilidade,
                horario: p.horario,
                mensagem: p.mensagem || '',
                status: p.status,
                criado_em: p.criado_em
                    ? new Date(p.criado_em).toISOString().replace('T', ' ').slice(0, 19)
                    : '',
                montador_nome: mDoc.nome || 'Montador',
                montador_telefone: mDoc.telefone || '',
                regiao_atendimento: mDoc.montador?.regiao_atendimento || 'São Paulo e Região',
                montador_nota: stats.nota_media,
                total_avaliacoes: stats.total_avaliacoes,
                servicos_concluidos: stats.servicos_concluidos,
            };
        })
    );

    const pesoStatus = { aceita: 1, concluida: 1, pendente: 2, recusada: 3 };
    enriquecidas.sort((a, b) => {
        const pa = pesoStatus[a.status] || 3;
        const pb = pesoStatus[b.status] || 3;
        if (pa !== pb) return pa - pb;
        return a.valor - b.valor;
    });

    return enriquecidas;
}

async function listarPropostasPorMontador(midParam, actorUser) {
    if (!actorUser) {
        throw new AppError('Autenticação necessária.', 401);
    }
    const mid = midParam ? assertObjectId(midParam, 'ID do montador') : String(actorUser._id);

    if (String(actorUser._id) !== mid) {
        throw new AppError('Você não tem permissão para consultar propostas de outro montador.', 403);
    }

    const propostas = await Proposta.find({ montador_id: mid })
        .sort({ criado_em: -1 })
        .populate({
            path: 'orcamento_id',
            populate: { path: 'usuario_id', select: 'nome' },
        })
        .lean();

    return propostas.map((p) => {
        const o = p.orcamento_id || {};
        return {
            id: p._id.toString(),
            orcamento_id: o._id ? o._id.toString() : String(p.orcamento_id),
            montador_id: mid,
            valor: Number(p.valor),
            disponibilidade: p.disponibilidade,
            horario: p.horario,
            mensagem: p.mensagem || '',
            status: p.status,
            criado_em: p.criado_em
                ? new Date(p.criado_em).toISOString().replace('T', ' ').slice(0, 19)
                : '',
            tipo_movel: o.tipo_movel || 'Serviço de montagem',
            categoria: o.categoria || 'padrao',
            bairro: o.bairro || '',
            cep: o.cep || '',
            orcamento_status: o.status || 'aberto',
            cliente_nome: o.usuario_id?.nome || 'Cliente',
        };
    });
}

async function criarProposta(actorUser, body = {}) {
    if (!actorUser) {
        throw new AppError('Autenticação necessária.', 401);
    }
    if (actorUser.tipo !== 'montador') {
        throw new AppError('Apenas profissionais montadores podem enviar propostas.', 403);
    }
    if (body.montador_id && String(body.montador_id) !== String(actorUser._id)) {
        throw new AppError('Não é permitido enviar proposta em nome de outro montador.', 403);
    }

    const dados = validarPropostaInput(body);

    const orc = await Orcamento.findById(dados.orcamento_id).lean();
    if (!orc) {
        throw new AppError('Orçamento não encontrado.', 404);
    }

    if (String(orc.usuario_id) === String(actorUser._id)) {
        throw new AppError('Você não pode enviar propostas para o seu próprio orçamento.', 400);
    }

    if (orc.status !== 'aberto') {
        throw new AppError('Este orçamento não está mais aberto para novas propostas.', 409);
    }

    const duplicada = await Proposta.findOne({
        orcamento_id: orc._id,
        montador_id: actorUser._id,
    }).lean();

    if (duplicada) {
        throw new AppError('Você já enviou uma proposta para este orçamento.', 409);
    }

    const proposta = await Proposta.create({
        orcamento_id: orc._id,
        montador_id: actorUser._id,
        valor: dados.valor,
        disponibilidade: dados.disponibilidade,
        horario: dados.horario,
        mensagem: dados.mensagem,
        status: 'pendente',
    });

    await Notificacao.create({
        usuario_id: orc.usuario_id,
        mensagem: `Você recebeu uma nova proposta de R$ ${formatarMoedaBR(dados.valor)} para o serviço "${orc.tipo_movel}"!`,
        lida: false,
    });

    return {
        id: proposta._id.toString(),
        proposta,
    };
}

function montarEnderecoOrcamento(orc, enderecoCustom = '') {
    const custom = String(enderecoCustom || '').trim();
    if (custom) return custom;

    const partes = [];
    if (orc.rua) {
        partes.push(orc.numero ? `${orc.rua}, ${orc.numero}` : orc.rua);
    }
    if (orc.complemento) partes.push(orc.complemento);
    if (orc.bairro) partes.push(orc.bairro);
    if (orc.cep) partes.push(`CEP ${orc.cep}`);

    return partes.length > 0 ? partes.join(' - ') : 'Endereço a combinar';
}

async function aceitarProposta(propostaIdParam, actorUser, body = {}) {
    if (!actorUser) {
        throw new AppError('Autenticação necessária.', 401);
    }
    const id = assertObjectId(propostaIdParam, 'ID da proposta');

    const prop = await Proposta.findById(id);
    if (!prop) {
        throw new AppError('Proposta não encontrada.', 404);
    }

    const orc = await Orcamento.findById(prop.orcamento_id);
    if (!orc) {
        throw new AppError('Orçamento vinculado à proposta não encontrado.', 404);
    }

    // Somente o cliente dono do orçamento pode aceitar a proposta
    if (String(orc.usuario_id) !== String(actorUser._id)) {
        throw new AppError('Você não tem permissão para aceitar propostas deste orçamento.', 403);
    }

    if (orc.status !== 'aberto') {
        throw new AppError('Este orçamento já possui uma proposta aceita ou não está aberto.', 409);
    }

    if (prop.status !== 'pendente') {
        throw new AppError(`Esta proposta não pode ser aceita pois está com status "${prop.status}".`, 409);
    }

    const agendamentoExistente = await Agendamento.findOne({
        $or: [
            { proposta_id: prop._id },
            { orcamento_id: orc._id, status: { $in: ['agendado', 'em_andamento', 'concluido'] } },
        ],
    }).lean();

    if (agendamentoExistente) {
        throw new AppError('Já existe um agendamento ativo para este orçamento ou proposta.', 409);
    }

    const montadorUser = await User.findById(prop.montador_id).select('nome').lean();
    if (!montadorUser) {
        throw new AppError('Montador responsável pela proposta não encontrado.', 404);
    }

    const endereco = montarEnderecoOrcamento(orc, body.endereco);

    const resultado = await withTransaction(async (session) => {
        const opts = session ? { session } : {};

        // Trava atômica no orçamento garantindo que continue 'aberto' no instante da atualização
        const orcAtualizado = await Orcamento.findOneAndUpdate(
            { _id: orc._id, status: 'aberto' },
            { $set: { status: 'em_andamento' } },
            { new: true, ...opts }
        );

        if (!orcAtualizado) {
            throw new AppError('Este orçamento já foi processado ou não está mais aberto.', 409);
        }

        const propAtualizada = await Proposta.findOneAndUpdate(
            { _id: prop._id, status: 'pendente' },
            { $set: { status: 'aceita' } },
            { new: true, ...opts }
        );

        if (!propAtualizada) {
            throw new AppError('Esta proposta já foi processada.', 409);
        }

        // Recusa as demais propostas pendentes do mesmo orçamento
        await Proposta.updateMany(
            { orcamento_id: orc._id, _id: { $ne: prop._id }, status: 'pendente' },
            { $set: { status: 'recusada' } },
            opts
        );

        const [agendamento] = await Agendamento.create(
            [
                {
                    proposta_id: prop._id,
                    orcamento_id: orc._id,
                    cliente_id: orc.usuario_id,
                    montador_id: prop.montador_id,
                    data_servico: prop.disponibilidade,
                    horario: prop.horario,
                    endereco,
                    valor: prop.valor,
                    status: 'agendado',
                },
            ],
            opts
        );

        await Notificacao.create(
            [
                {
                    usuario_id: prop.montador_id,
                    mensagem: `Sua proposta de R$ ${formatarMoedaBR(prop.valor)} foi aceita por ${actorUser.nome}! Serviço agendado para ${prop.disponibilidade}.`,
                    lida: false,
                },
                {
                    usuario_id: orc.usuario_id,
                    mensagem: `Agendamento confirmado com o montador ${montadorUser.nome} para o dia ${prop.disponibilidade}!`,
                    lida: false,
                },
            ],
            opts
        );

        return {
            agendamento_id: agendamento._id.toString(),
            agendamento,
        };
    });

    return resultado;
}

async function recusarProposta(propostaIdParam, actorUser) {
    if (!actorUser) {
        throw new AppError('Autenticação necessária.', 401);
    }
    const id = assertObjectId(propostaIdParam, 'ID da proposta');

    const prop = await Proposta.findById(id);
    if (!prop) {
        throw new AppError('Proposta não encontrada.', 404);
    }

    const orc = await Orcamento.findById(prop.orcamento_id).lean();
    if (!orc) {
        throw new AppError('Orçamento não encontrado.', 404);
    }

    if (String(orc.usuario_id) !== String(actorUser._id)) {
        throw new AppError('Você não tem permissão para recusar propostas deste orçamento.', 403);
    }

    if (prop.status === 'aceita' || prop.status === 'concluida') {
        throw new AppError('Não é possível recusar uma proposta que já foi aceita ou concluída.', 409);
    }

    prop.status = 'recusada';
    await prop.save();

    await Notificacao.create({
        usuario_id: prop.montador_id,
        mensagem: `Sua proposta para o serviço "${orc.tipo_movel}" foi recusada pelo cliente.`,
        lida: false,
    });
}

async function deletarProposta(propostaIdParam, actorUser) {
    if (!actorUser) {
        throw new AppError('Autenticação necessária.', 401);
    }
    const id = assertObjectId(propostaIdParam, 'ID da proposta');

    const prop = await Proposta.findById(id);
    if (!prop) {
        throw new AppError('Proposta não encontrada.', 404);
    }

    if (String(prop.montador_id) !== String(actorUser._id)) {
        throw new AppError('Você não tem permissão para remover uma proposta de outro montador.', 403);
    }

    if (prop.status === 'aceita' || prop.status === 'concluida') {
        throw new AppError('Não é permitido excluir uma proposta aceita ou concluída.', 409);
    }

    await Proposta.findByIdAndDelete(prop._id);
}

module.exports = {
    listarPropostasPorOrcamento,
    listarPropostasPorMontador,
    criarProposta,
    aceitarProposta,
    recusarProposta,
    deletarProposta,
};
