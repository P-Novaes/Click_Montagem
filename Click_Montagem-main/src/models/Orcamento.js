const mongoose = require('mongoose');

const orcamentoSchema = new mongoose.Schema(
    {
        usuario_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'usuario_id é obrigatório.'],
            index: true,
        },
        categoria: {
            type: String,
            enum: ['padrao', 'planejado'],
            default: 'padrao',
        },
        tipo_movel: {
            type: String,
            required: [true, 'O tipo de móvel é obrigatório.'],
            trim: true,
            maxlength: 120,
        },
        quantidade_pecas: {
            type: Number,
            required: true,
            min: 1,
            default: 1,
        },
        complexidade: {
            type: String,
            enum: ['simples', 'moderado', 'complexo'],
            default: 'simples',
        },
        descricao: {
            type: String,
            trim: true,
            default: '',
        },
        cep: {
            type: String,
            trim: true,
            default: '',
        },
        rua: {
            type: String,
            trim: true,
            default: '',
        },
        numero: {
            type: String,
            trim: true,
            default: '',
        },
        complemento: {
            type: String,
            trim: true,
            default: '',
        },
        bairro: {
            type: String,
            trim: true,
            default: '',
        },
        horario: {
            type: String,
            enum: ['manha', 'tarde', 'qualquer'],
            default: 'qualquer',
        },
        preco_estimado: {
            type: String,
            trim: true,
            default: '',
        },
        status: {
            type: String,
            enum: ['aberto', 'em_andamento', 'concluido', 'cancelado'],
            default: 'aberto',
            index: true,
        },
    },
    {
        collection: 'orcamentos',
        timestamps: { createdAt: 'criado_em', updatedAt: 'atualizado_em' },
    }
);

orcamentoSchema.index({ usuario_id: 1, criado_em: -1 });
orcamentoSchema.index({ status: 1, criado_em: -1 });

module.exports = mongoose.model('Orcamento', orcamentoSchema);
