const mongoose = require('mongoose');

const montadorSubSchema = new mongoose.Schema(
    {
        cpf_cnpj: { type: String, trim: true, default: '' },
        descricao_profissional: {
            type: String,
            trim: true,
            default: 'Profissional parceiro Click Montagem.',
        },
        especialidades: {
            type: String,
            trim: true,
            default: 'Móveis convencionais e planejados',
        },
        regiao_atendimento: {
            type: String,
            trim: true,
            default: 'São Paulo e Região',
        },
        disponibilidade_geral: {
            type: String,
            trim: true,
            default: 'Segunda a Sábado',
        },
        preco_base: {
            type: Number,
            min: 0,
            default: 100,
        },
    },
    { _id: false }
);

const userSchema = new mongoose.Schema(
    {
        nome: {
            type: String,
            required: [true, 'O nome é obrigatório.'],
            trim: true,
            maxlength: 120,
        },
        email: {
            type: String,
            required: [true, 'O e-mail é obrigatório.'],
            unique: true,
            lowercase: true,
            trim: true,
            maxlength: 160,
        },
        telefone: {
            type: String,
            required: function () { return this.cadastroCompleto !== false; },
            trim: true,
            maxlength: 30,
        },
        senha: {
            type: String,
            required: function () { return !this.googleSub; },
            select: false,
        },
        tipo: {
            type: String,
            enum: ['cliente', 'montador', null],
            default: 'cliente',
            index: true,
        },
        googleSub: { type: String, minlength: 1, maxlength: 255 },
        googleEmail: { type: String, maxlength: 160 },
        googleEmailVerified: { type: Boolean, default: false },
        authProvider: { type: String, enum: ['local', 'google', 'local+google'], default: 'local' },
        cadastroCompleto: { type: Boolean, default: true },
        termosAceitosEm: Date,
        cpf: { type: String, trim: true, default: '' },
        cidade: { type: String, trim: true, default: '' },
        cep: { type: String, trim: true, default: '' },
        endereco: { type: String, trim: true, default: '' },
        montador: {
            type: montadorSubSchema,
            default: () => ({}),
        },
        resetPasswordToken: {
            type: String,
            select: false,
            default: null,
        },
        resetPasswordExpires: {
            type: Date,
            select: false,
            default: null,
        },
    },
    {
        collection: 'usuarios',
        timestamps: { createdAt: 'criado_em', updatedAt: 'atualizado_em' },
    }
);

userSchema.index(
    { googleSub: 1 },
    { unique: true, partialFilterExpression: { googleSub: { $type: 'string' } } }
);

userSchema.index(
    { 'montador.cpf_cnpj': 1 },
    {
        unique: true,
        partialFilterExpression: {
            tipo: 'montador',
            'montador.cpf_cnpj': { $gt: '' },
        },
    }
);

userSchema.methods.toPublicObject = function toPublicObject(extra = {}) {
    const obj = {
        id: this._id.toString(),
        nome: this.nome,
        email: this.email,
        telefone: this.telefone,
        tipo: this.tipo,
        cadastroCompleto: this.cadastroCompleto !== false,
        googleVinculado: Boolean(this.googleSub),
        cpf: this.cpf || '',
        cidade: this.cidade || '',
        cep: this.cep || '',
        endereco: this.endereco || '',
        criado_em: this.criado_em
            ? new Date(this.criado_em).toISOString().replace('T', ' ').slice(0, 19)
            : undefined,
    };

    if (this.tipo === 'montador') {
        const m = this.montador || {};
        obj.cpf_cnpj = m.cpf_cnpj || '';
        obj.descricao_profissional = m.descricao_profissional || '';
        obj.especialidades = m.especialidades || '';
        obj.regiao_atendimento = m.regiao_atendimento || '';
        obj.disponibilidade_geral = m.disponibilidade_geral || '';
        obj.preco_base = m.preco_base ?? 100;
        obj.montador = {
            cpf_cnpj: obj.cpf_cnpj,
            descricao_profissional: obj.descricao_profissional,
            especialidades: obj.especialidades,
            regiao_atendimento: obj.regiao_atendimento,
            disponibilidade_geral: obj.disponibilidade_geral,
            preco_base: obj.preco_base,
        };
    }

    return { ...obj, ...extra };
};

module.exports = mongoose.model('User', userSchema);
