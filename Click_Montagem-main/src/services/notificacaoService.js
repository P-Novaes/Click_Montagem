const { Notificacao } = require('../models');
const AppError = require('../utils/AppError');
const { assertObjectId } = require('../validators/validators');

async function listarNotificacoes(actorUser, uidParam) {
    if (!actorUser) {
        throw new AppError('Autenticação necessária.', 401);
    }
    if (uidParam && String(actorUser._id) !== String(uidParam)) {
        throw new AppError('Você não tem permissão para consultar notificações de outro usuário.', 403);
    }

    const docs = await Notificacao.find({ usuario_id: actorUser._id })
        .sort({ criado_em: -1 })
        .limit(50)
        .lean();

    return docs.map((n) => ({
        id: n._id.toString(),
        usuario_id: n.usuario_id.toString(),
        mensagem: n.mensagem,
        lida: Boolean(n.lida),
        criado_em: n.criado_em
            ? new Date(n.criado_em).toISOString().replace('T', ' ').slice(0, 19)
            : '',
    }));
}

async function contarNaoLidas(actorUser, uidParam) {
    if (!actorUser) {
        throw new AppError('Autenticação necessária.', 401);
    }
    if (uidParam && String(actorUser._id) !== String(uidParam)) {
        throw new AppError('Você não tem permissão para consultar notificações de outro usuário.', 403);
    }

    return Notificacao.countDocuments({
        usuario_id: actorUser._id,
        lida: false,
    });
}

async function marcarComoLida(notifIdParam, actorUser) {
    if (!actorUser) {
        throw new AppError('Autenticação necessária.', 401);
    }
    const id = assertObjectId(notifIdParam, 'ID da notificação');

    const notif = await Notificacao.findById(id);
    if (!notif) {
        throw new AppError('Notificação não encontrada.', 404);
    }
    if (String(notif.usuario_id) !== String(actorUser._id)) {
        throw new AppError('Você não tem permissão para alterar esta notificação.', 403);
    }

    notif.lida = true;
    await notif.save();
}

async function marcarTodasComoLidas(actorUser, uidParam) {
    if (!actorUser) {
        throw new AppError('Autenticação necessária.', 401);
    }
    if (uidParam && String(actorUser._id) !== String(uidParam)) {
        throw new AppError('Você não tem permissão para alterar notificações de outro usuário.', 403);
    }

    await Notificacao.updateMany(
        { usuario_id: actorUser._id, lida: false },
        { $set: { lida: true } }
    );
}

module.exports = {
    listarNotificacoes,
    contarNaoLidas,
    marcarComoLida,
    marcarTodasComoLidas,
};
