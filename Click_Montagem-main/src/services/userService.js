const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User, Avaliacao, Agendamento, Notificacao, Orcamento, Proposta } = require('../models');
const AppError = require('../utils/AppError');
const {
    assertObjectId,
    EMAIL_REGEX,
    validarCadastroInput,
    validarLoginInput,
} = require('../validators/validators');

const DUMMY_BCRYPT_HASH = '$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';

function normalizarHashBcrypt(hash = '') {
    if (hash.startsWith('$2y$')) {
        return '$2a$' + hash.slice(4);
    }
    return hash;
}

async function calcularMetricasMontador(montadorId) {
    const [avaliacoes, servicosConcluidos] = await Promise.all([
        Avaliacao.find({ montador_id: montadorId }).select('nota').lean(),
        Agendamento.countDocuments({ montador_id: montadorId, status: 'concluido' }),
    ]);

    const totalAvaliacoes = avaliacoes.length;
    let notaMedia = 5.0;
    let avaliacoesPositivas = 0;

    if (totalAvaliacoes > 0) {
        const soma = avaliacoes.reduce((acc, a) => {
            if (a.nota >= 4) avaliacoesPositivas++;
            return acc + Number(a.nota || 5);
        }, 0);
        notaMedia = Math.round((soma / totalAvaliacoes) * 10) / 10;
    }

    const satisfacao = totalAvaliacoes > 0
        ? Math.round((avaliacoesPositivas / totalAvaliacoes) * 100)
        : 100;

    return {
        nota_media: notaMedia,
        total_avaliacoes: totalAvaliacoes,
        servicos_concluidos: servicosConcluidos,
        total_servicos: servicosConcluidos,
        avaliacoes_positivas: avaliacoesPositivas,
        satisfacao,
    };
}

async function cadastrarUsuario(body) {
    const dados = validarCadastroInput(body);

    const emailExistente = await User.findOne({ email: dados.email }).lean();
    if (emailExistente) {
        throw new AppError('Este e-mail ou CPF/CNPJ já está cadastrado no sistema.', 409);
    }

    if (dados.tipo === 'montador' && dados.cpf_cnpj) {
        const cpfExistente = await User.findOne({
            tipo: 'montador',
            'montador.cpf_cnpj': dados.cpf_cnpj,
        }).lean();
        if (cpfExistente) {
            throw new AppError('Este e-mail ou CPF/CNPJ já está cadastrado no sistema.', 409);
        }
    }

    const senhaHash = await bcrypt.hash(dados.senha, 12);

    const docData = {
        nome: dados.nome,
        email: dados.email,
        telefone: dados.telefone,
        senha: senhaHash,
        tipo: dados.tipo,
        cpf: dados.cpf,
        cidade: dados.cidade,
        cep: dados.cep,
        endereco: dados.endereco,
    };

    if (dados.tipo === 'montador') {
        docData.montador = {
            cpf_cnpj: dados.cpf_cnpj || `PEND-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            descricao_profissional: dados.descricao_profissional || 'Profissional parceiro Click Montagem.',
            especialidades: dados.especialidades || 'Móveis convencionais e planejados',
            regiao_atendimento: dados.regiao_atendimento || 'São Paulo e Região',
            disponibilidade_geral: dados.disponibilidade_geral || 'Segunda a Sábado',
            preco_base: dados.preco_base || 100,
        };
    }

    const user = await User.create(docData);

    await Notificacao.create({
        usuario_id: user._id,
        mensagem: `Bem-vindo à plataforma Click Montagem, ${user.nome}!`,
        lida: false,
    });

    const stats = user.tipo === 'montador' ? await calcularMetricasMontador(user._id) : {};
    return user.toPublicObject(stats);
}

async function autenticarUsuario(body) {
    const { email, senha } = validarLoginInput(body);

    const user = await User.findOne({ email }).select('+senha');
    const hashParaVerificar = user ? normalizarHashBcrypt(user.senha) : DUMMY_BCRYPT_HASH;
    const senhaValida = await bcrypt.compare(senha, hashParaVerificar);

    if (!user || !senhaValida) {
        throw new AppError('E-mail ou senha incorretos.', 401);
    }

    const stats = user.tipo === 'montador' ? await calcularMetricasMontador(user._id) : {};
    return user.toPublicObject(stats);
}

async function obterPerfil(userId, actorUser = null) {
    const id = assertObjectId(userId, 'ID do usuário');
    if (actorUser && String(actorUser._id) !== id) {
        throw new AppError('Você não tem permissão para acessar os dados privados de outro usuário.', 403);
    }
    const user = await User.findById(id);
    if (!user) {
        throw new AppError('Usuário não encontrado.', 404);
    }

    const stats = user.tipo === 'montador' ? await calcularMetricasMontador(user._id) : {};
    return user.toPublicObject(stats);
}

async function atualizarPerfil(targetId, actorUser, body = {}) {
    const id = assertObjectId(targetId || actorUser?._id, 'ID do usuário');

    if (!actorUser || String(actorUser._id) !== id) {
        throw new AppError('Você não tem permissão para alterar dados de outro usuário.', 403);
    }

    const user = await User.findById(id);
    if (!user) {
        throw new AppError('Usuário não encontrado.', 404);
    }

    const nome = body.nome !== undefined ? String(body.nome).trim() : user.nome;
    const telefone = body.telefone !== undefined ? String(body.telefone).trim() : user.telefone;
    const email = body.email !== undefined ? String(body.email).trim().toLowerCase() : user.email;

    if (!nome || !telefone) {
        throw new AppError('Nome e telefone são obrigatórios.', 400);
    }
    if (email && !EMAIL_REGEX.test(email)) {
        throw new AppError('E-mail inválido.', 400);
    }

    if (email && email !== user.email) {
        const conflito = await User.findOne({ email, _id: { $ne: user._id } }).lean();
        if (conflito) {
            throw new AppError('E-mail já utilizado por outro usuário.', 409);
        }
        user.email = email;
    }

    user.nome = nome;
    user.telefone = telefone;

    if (body.cpf !== undefined) user.cpf = String(body.cpf).trim();
    if (body.cidade !== undefined) user.cidade = String(body.cidade).trim();
    if (body.cep !== undefined) user.cep = String(body.cep).trim();
    if (body.endereco !== undefined) user.endereco = String(body.endereco).trim();

    if (user.tipo === 'montador') {
        const m = user.montador || {};
        const novoCpfCnpj = String(body.cpf_cnpj ?? body.cpf ?? '').trim();
        if (novoCpfCnpj && novoCpfCnpj !== m.cpf_cnpj) {
            const conflitoDoc = await User.findOne({
                tipo: 'montador',
                'montador.cpf_cnpj': novoCpfCnpj,
                _id: { $ne: user._id },
            }).lean();
            if (conflitoDoc) {
                throw new AppError('CPF/CNPJ já utilizado por outro profissional.', 409);
            }
            m.cpf_cnpj = novoCpfCnpj;
        }

        if (body.descricao_profissional !== undefined || body.descricao !== undefined) {
            m.descricao_profissional = String(body.descricao_profissional ?? body.descricao ?? '').trim();
        }
        if (body.especialidades !== undefined) {
            m.especialidades = String(body.especialidades).trim();
        }
        if (body.regiao_atendimento !== undefined || body.area_atuacao !== undefined) {
            m.regiao_atendimento = String(body.regiao_atendimento ?? body.area_atuacao ?? '').trim();
        }
        if (body.disponibilidade_geral !== undefined && String(body.disponibilidade_geral).trim() !== '') {
            m.disponibilidade_geral = String(body.disponibilidade_geral).trim();
        }
        if (body.preco_base !== undefined) {
            const pb = Number(body.preco_base);
            if (Number.isFinite(pb) && pb >= 0) m.preco_base = pb;
        }
        user.montador = m;
    }

    await user.save();

    const stats = user.tipo === 'montador' ? await calcularMetricasMontador(user._id) : {};
    return user.toPublicObject(stats);
}

async function alterarSenha(targetId, actorUser, body = {}) {
    const id = assertObjectId(targetId || actorUser?._id, 'ID do usuário');

    if (!actorUser || String(actorUser._id) !== id) {
        throw new AppError('Você não tem permissão para alterar a senha de outro usuário.', 403);
    }

    const senhaAtual = String(body.senha_atual || '');
    const novaSenha = String(body.nova_senha || '');
    const confirmar = body.confirmar_senha !== undefined ? String(body.confirmar_senha) : novaSenha;

    if (!senhaAtual || !novaSenha) {
        throw new AppError('Preencha a senha atual e a nova senha.', 400);
    }
    if (novaSenha.length < 6) {
        throw new AppError('A nova senha deve ter no mínimo 6 caracteres.', 400);
    }
    if (novaSenha !== confirmar) {
        throw new AppError('A confirmação da senha não confere.', 400);
    }

    const user = await User.findById(id).select('+senha');
    if (!user) {
        throw new AppError('Usuário não encontrado.', 404);
    }

    const atualValida = await bcrypt.compare(senhaAtual, normalizarHashBcrypt(user.senha));
    if (!atualValida) {
        throw new AppError('A senha atual está incorreta.', 401);
    }

    user.senha = await bcrypt.hash(novaSenha, 12);
    await user.save();
}

async function iniciarRecuperacaoSenha(emailRaw) {
    const email = String(emailRaw || '').trim().toLowerCase();
    if (!email || !EMAIL_REGEX.test(email)) {
        throw new AppError('Informe um e-mail válido.', 400);
    }

    const user = await User.findOne({ email }).select('+resetPasswordToken +resetPasswordExpires');
    if (!user) {
        throw new AppError('E-mail não encontrado em nossa base de usuários.', 404);
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    user.resetPasswordToken = tokenHash;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
    await user.save();

    return {
        token: rawToken,
        email: user.email,
    };
}

async function redefinirSenha(body = {}) {
    const email = String(body.email || '').trim().toLowerCase();
    const novaSenha = String(body.nova_senha || body.senha || '');
    const token = String(body.token || '').trim();

    if (!email || !EMAIL_REGEX.test(email)) {
        throw new AppError('E-mail inválido.', 400);
    }
    if (novaSenha.length < 6) {
        throw new AppError('A nova senha deve ter no mínimo 6 caracteres.', 400);
    }
    if (!token) {
        throw new AppError('Token de recuperação é obrigatório.', 400);
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
        email,
        resetPasswordToken: tokenHash,
        resetPasswordExpires: { $gt: new Date() },
    }).select('+senha +resetPasswordToken +resetPasswordExpires');

    if (!user) {
        throw new AppError('Token de recuperação inválido ou expirado.', 400);
    }

    user.senha = await bcrypt.hash(novaSenha, 12);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();
}

async function deletarConta(targetId, actorUser) {
    const id = assertObjectId(targetId || actorUser?._id, 'ID do usuário');

    if (!actorUser || String(actorUser._id) !== id) {
        throw new AppError('Você não tem permissão para excluir a conta de outro usuário.', 403);
    }

    const agendamentosAtivos = await Agendamento.countDocuments({
        $or: [{ cliente_id: id }, { montador_id: id }],
        status: { $in: ['agendado', 'em_andamento'] },
    });

    if (agendamentosAtivos > 0) {
        throw new AppError('Não é possível remover a conta enquanto houver agendamentos ativos.', 409);
    }

    const user = await User.findByIdAndDelete(id);
    if (!user) {
        throw new AppError('Usuário não encontrado.', 404);
    }

    await Promise.all([
        Orcamento.deleteMany({ usuario_id: id, status: { $in: ['aberto', 'cancelado'] } }),
        Proposta.deleteMany({ montador_id: id, status: { $in: ['pendente', 'recusada'] } }),
        Notificacao.deleteMany({ usuario_id: id }),
    ]);
}

module.exports = {
    calcularMetricasMontador,
    cadastrarUsuario,
    autenticarUsuario,
    obterPerfil,
    atualizarPerfil,
    alterarSenha,
    iniciarRecuperacaoSenha,
    redefinirSenha,
    deletarConta,
};
