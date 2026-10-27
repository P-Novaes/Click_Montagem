const mongoose = require('mongoose');
const AppError = require('../utils/AppError');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidObjectId(id) {
    if (!id || typeof id !== 'string') return false;
    return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
}

function assertObjectId(id, nomeCampo = 'ID') {
    const strId = String(id || '').trim();
    if (!isValidObjectId(strId)) {
        throw new AppError(`${nomeCampo} inválido.`, 400);
    }
    return strId;
}

function validarEnum(valor, opcoes, padrao = null) {
    const v = typeof valor === 'string' ? valor.trim().toLowerCase() : '';
    if (opcoes.includes(v)) return v;
    if (padrao !== null) return padrao;
    throw new AppError(`Valor inválido. Opções permitidas: ${opcoes.join(', ')}.`, 400);
}

function normalizarComplexidade(valor) {
    const v = String(valor || '').trim().toLowerCase();
    if (v.startsWith('simp')) return 'simples';
    if (v.startsWith('mod') || v.startsWith('med') || v.startsWith('méd')) return 'moderado';
    if (v.startsWith('comp') || v.startsWith('alt')) return 'complexo';
    return 'simples';
}

function normalizarHorario(valor) {
    const v = String(valor || '').trim().toLowerCase();
    if (v.startsWith('manh')) return 'manha';
    if (v.startsWith('tard')) return 'tarde';
    if (v.startsWith('qualq')) return 'qualquer';
    return 'qualquer';
}

function validarCadastroInput(body = {}) {
    const nome = String(body.nome || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const telefone = String(body.telefone || '').trim();
    const senha = String(body.senha || '');
    const tipo = validarEnum(body.tipo || 'cliente', ['cliente', 'montador'], 'cliente');

    if (!nome || nome.length < 2) {
        throw new AppError('O nome é obrigatório.', 400);
    }
    if (!email || !EMAIL_REGEX.test(email)) {
        throw new AppError('E-mail inválido.', 400);
    }
    if (!telefone) {
        throw new AppError('O telefone é obrigatório.', 400);
    }
    if (senha.length < 6) {
        throw new AppError('A senha deve ter no mínimo 6 caracteres.', 400);
    }

    return {
        nome,
        email,
        telefone,
        senha,
        tipo,
        cpf: String(body.cpf || '').trim(),
        cidade: String(body.cidade || '').trim(),
        cep: String(body.cep || '').trim(),
        endereco: String(body.endereco || '').trim(),
        cpf_cnpj: String(body.cpf_cnpj || body.cpf || '').trim(),
        descricao_profissional: String(body.descricao_profissional || body.descricao || '').trim(),
        especialidades: String(body.especialidades || '').trim(),
        regiao_atendimento: String(body.regiao_atendimento || body.area_atuacao || body.cidade || '').trim(),
        disponibilidade_geral: String(body.disponibilidade_geral || 'Segunda a Sábado').trim(),
        preco_base: body.preco_base !== undefined ? Math.max(0, Number(body.preco_base) || 100) : 100,
    };
}

function validarLoginInput(body = {}) {
    const email = String(body.email || '').trim().toLowerCase();
    const senha = String(body.senha || '');

    if (!email || !senha) {
        throw new AppError('E-mail e senha são obrigatórios.', 400);
    }
    return { email, senha };
}

function validarOrcamentoInput(body = {}) {
    const categoria = validarEnum(body.categoria || 'padrao', ['padrao', 'planejado'], 'padrao');
    const tipoMovel = String(body.tipo_movel || '').trim();
    const qtdParsed = parseInt(String(body.quantidade_pecas ?? '1').replace(/\D/g, '') || '1', 10);
    const quantidadePecas = Math.max(1, Math.min(100, qtdParsed || 1));
    const complexidade = normalizarComplexidade(body.complexidade);
    const descricao = String(body.descricao || '').trim();
    const cep = String(body.cep || '').trim();
    const rua = String(body.rua || '').trim();
    const numero = String(body.numero || '').trim();
    const complemento = String(body.complemento || '').trim();
    const bairro = String(body.bairro || '').trim();
    const horario = normalizarHorario(body.horario);
    const precoEstimado = String(body.preco_estimado || '').trim();

    if (!tipoMovel) {
        throw new AppError('O tipo de móvel é obrigatório.', 400);
    }

    return {
        categoria,
        tipo_movel: tipoMovel,
        quantidade_pecas: quantidadePecas,
        complexidade,
        descricao,
        cep,
        rua,
        numero,
        complemento,
        bairro,
        horario,
        preco_estimado: precoEstimado,
    };
}

function validarPropostaInput(body = {}) {
    const orcamentoId = assertObjectId(body.orcamento_id, 'orcamento_id');
    const valor = Number(body.valor);
    const disponibilidade = String(body.disponibilidade || '').trim();
    const horario = normalizarHorario(body.horario);
    const mensagem = String(body.mensagem || '').trim();

    if (!Number.isFinite(valor) || valor <= 0) {
        throw new AppError('O valor da proposta deve ser maior que zero.', 400);
    }
    if (!disponibilidade) {
        throw new AppError('A data de disponibilidade é obrigatória.', 400);
    }
    if (!DATE_REGEX.test(disponibilidade)) {
        throw new AppError('Formato de data inválido. Use AAAA-MM-DD.', 400);
    }

    return {
        orcamento_id: orcamentoId,
        valor: Math.round(valor * 100) / 100,
        disponibilidade,
        horario,
        mensagem,
    };
}

function validarAvaliacaoInput(body = {}) {
    const agendamentoId = assertObjectId(body.agendamento_id, 'agendamento_id');
    const nota = Number(body.nota);
    const comentario = String(body.comentario || '').trim();
    const recomenda = body.recomenda !== undefined ? Boolean(body.recomenda) : true;

    if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
        throw new AppError('A nota deve ser entre 1 e 5 estrelas.', 400);
    }

    const criteriosRaw = body.criterios && typeof body.criterios === 'object' ? body.criterios : {};
    const clampStar = (v) => {
        const n = parseInt(v, 10);
        return Number.isInteger(n) && n >= 1 && n <= 5 ? n : nota;
    };

    return {
        agendamento_id: agendamentoId,
        nota,
        comentario,
        recomenda,
        criterios: {
            pontualidade: clampStar(criteriosRaw.pontualidade),
            qualidade: clampStar(criteriosRaw.qualidade),
            comunicacao: clampStar(criteriosRaw.comunicacao),
            limpeza: clampStar(criteriosRaw.limpeza),
        },
    };
}

module.exports = {
    EMAIL_REGEX,
    DATE_REGEX,
    isValidObjectId,
    assertObjectId,
    validarEnum,
    normalizarComplexidade,
    normalizarHorario,
    validarCadastroInput,
    validarLoginInput,
    validarOrcamentoInput,
    validarPropostaInput,
    validarAvaliacaoInput,
};
