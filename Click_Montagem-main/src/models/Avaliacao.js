const mongoose = require('mongoose');

const avaliacaoSchema = new mongoose.Schema(
    {
        agendamento_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Agendamento',
            required: [true, 'agendamento_id é obrigatório.'],
            unique: true,
        },
        cliente_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        montador_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        nota: {
            type: Number,
            required: [true, 'A nota é obrigatória.'],
            min: [1, 'A nota deve ser entre 1 e 5 estrelas.'],
            max: [5, 'A nota deve ser entre 1 e 5 estrelas.'],
        },
        criterios: {
            pontualidade: { type: Number, min: 1, max: 5, default: 5 },
            qualidade: { type: Number, min: 1, max: 5, default: 5 },
            comunicacao: { type: Number, min: 1, max: 5, default: 5 },
            limpeza: { type: Number, min: 1, max: 5, default: 5 },
        },
        recomenda: {
            type: Boolean,
            default: true,
        },
        comentario: {
            type: String,
            trim: true,
            default: '',
        },
    },
    {
        collection: 'avaliacoes',
        timestamps: { createdAt: 'criado_em', updatedAt: 'atualizado_em' },
    }
);

module.exports = mongoose.model('Avaliacao', avaliacaoSchema);
