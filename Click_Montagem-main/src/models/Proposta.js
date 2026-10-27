const mongoose = require('mongoose');

const propostaSchema = new mongoose.Schema(
    {
        orcamento_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Orcamento',
            required: [true, 'orcamento_id é obrigatório.'],
            index: true,
        },
        montador_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'montador_id é obrigatório.'],
            index: true,
        },
        valor: {
            type: Number,
            required: [true, 'O valor da proposta é obrigatório.'],
            min: [0.01, 'O valor da proposta deve ser maior que zero.'],
        },
        disponibilidade: {
            type: String,
            required: [true, 'A data de disponibilidade é obrigatória.'],
            match: [/^\d{4}-\d{2}-\d{2}$/, 'Formato de data inválido. Use AAAA-MM-DD.'],
        },
        horario: {
            type: String,
            enum: ['manha', 'tarde', 'qualquer'],
            default: 'qualquer',
        },
        mensagem: {
            type: String,
            trim: true,
            default: '',
        },
        status: {
            type: String,
            enum: ['pendente', 'aceita', 'recusada', 'concluida'],
            default: 'pendente',
            index: true,
        },
    },
    {
        collection: 'propostas',
        timestamps: { createdAt: 'criado_em', updatedAt: 'atualizado_em' },
    }
);

// Impede que o mesmo montador envie mais de uma proposta para o mesmo orçamento
propostaSchema.index({ orcamento_id: 1, montador_id: 1 }, { unique: true });

module.exports = mongoose.model('Proposta', propostaSchema);
