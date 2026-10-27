const mongoose = require('mongoose');

const notificacaoSchema = new mongoose.Schema(
    {
        usuario_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        mensagem: {
            type: String,
            required: true,
            trim: true,
            maxlength: 500,
        },
        lida: {
            type: Boolean,
            default: false,
            index: true,
        },
    },
    {
        collection: 'notificacoes',
        timestamps: { createdAt: 'criado_em', updatedAt: 'atualizado_em' },
    }
);

notificacaoSchema.index({ usuario_id: 1, lida: 1, criado_em: -1 });

module.exports = mongoose.model('Notificacao', notificacaoSchema);
