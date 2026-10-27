const mongoose = require('mongoose');

const agendamentoSchema = new mongoose.Schema(
    {
        proposta_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Proposta',
            required: true,
            unique: true,
        },
        orcamento_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Orcamento',
            required: true,
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
        data_servico: {
            type: String,
            required: true,
            match: [/^\d{4}-\d{2}-\d{2}$/, 'Formato de data inválido. Use AAAA-MM-DD.'],
        },
        horario: {
            type: String,
            enum: ['manha', 'tarde', 'qualquer'],
            default: 'qualquer',
        },
        endereco: {
            type: String,
            required: true,
            trim: true,
        },
        valor: {
            type: Number,
            required: true,
            min: 0,
        },
        status: {
            type: String,
            enum: ['agendado', 'em_andamento', 'concluido', 'cancelado'],
            default: 'agendado',
            index: true,
        },
    },
    {
        collection: 'agendamentos',
        timestamps: { createdAt: 'criado_em', updatedAt: 'atualizado_em' },
    }
);

// Impede múltiplos agendamentos ativos/concluídos para o mesmo orçamento
agendamentoSchema.index(
    { orcamento_id: 1 },
    {
        unique: true,
        partialFilterExpression: {
            status: { $in: ['agendado', 'em_andamento', 'concluido'] },
        },
    }
);

module.exports = mongoose.model('Agendamento', agendamentoSchema);
