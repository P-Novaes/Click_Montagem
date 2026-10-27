const userService = require('../services/userService');
const asyncHandler = require('../utils/asyncHandler');
const { ensureCsrfToken } = require('../middlewares/security');
const env = require('../config/env');

function regenerateSessionAsync(req, usuario) {
    return new Promise((resolve, reject) => {
        if (!req.session) return resolve();
        req.session.regenerate((err) => {
            if (err) return reject(err);
            req.session.userId = usuario.id;
            req.session.userType = usuario.tipo;
            req.session.save((saveErr) => {
                if (saveErr) return reject(saveErr);
                resolve();
            });
        });
    });
}

function destroySessionAsync(req) {
    return new Promise((resolve) => {
        if (!req.session) return resolve();
        req.session.destroy(() => resolve());
    });
}

const cadastrar = asyncHandler(async (req, res) => {
    const usuario = await userService.cadastrarUsuario(req.body);
    await regenerateSessionAsync(req, usuario);
    const csrfToken = ensureCsrfToken(req, res);

    res.status(201).json({
        sucesso: true,
        mensagem: 'Conta criada com sucesso!',
        usuario,
        csrfToken,
    });
});

const login = asyncHandler(async (req, res) => {
    const usuario = await userService.autenticarUsuario(req.body);
    await regenerateSessionAsync(req, usuario);
    const csrfToken = ensureCsrfToken(req, res);

    res.status(200).json({
        sucesso: true,
        mensagem: 'Login realizado com sucesso!',
        usuario,
        csrfToken,
    });
});

const logout = asyncHandler(async (req, res) => {
    await destroySessionAsync(req);
    res.clearCookie(env.sessionName, { path: '/' });
    res.clearCookie('XSRF-TOKEN', { path: '/' });

    res.status(200).json({
        sucesso: true,
        mensagem: 'Sessão encerrada com sucesso.',
    });
});

const me = asyncHandler(async (req, res) => {
    const csrfToken = ensureCsrfToken(req, res);
    if (!req.user) {
        return res.status(200).json({
            sucesso: true,
            autenticado: false,
            usuario: null,
            csrfToken,
        });
    }

    const usuario = await userService.obterPerfil(req.user._id);
    return res.status(200).json({
        sucesso: true,
        autenticado: true,
        usuario,
        csrfToken,
    });
});

const csrf = asyncHandler(async (req, res) => {
    const csrfToken = ensureCsrfToken(req, res);
    res.status(200).json({
        sucesso: true,
        csrfToken,
    });
});

const perfil = asyncHandler(async (req, res) => {
    const targetId = req.params.id || req.query.id || req.user?._id;
    const usuario = await userService.obterPerfil(targetId, req.user);
    res.status(200).json({
        sucesso: true,
        usuario,
    });
});

const atualizar = asyncHandler(async (req, res) => {
    const targetId = req.params.id || req.query.id || req.user?._id;
    const usuario = await userService.atualizarPerfil(targetId, req.user, req.body);
    res.status(200).json({
        sucesso: true,
        mensagem: 'Perfil atualizado com sucesso!',
        usuario,
    });
});

const alterarSenha = asyncHandler(async (req, res) => {
    const targetId = req.params.id || req.query.id || req.user?._id;
    await userService.alterarSenha(targetId, req.user, req.body);
    res.status(200).json({
        sucesso: true,
        mensagem: 'Senha alterada com sucesso!',
    });
});

const recuperarSenha = asyncHandler(async (req, res) => {
    const { token, email } = await userService.iniciarRecuperacaoSenha(req.body.email);
    res.status(200).json({
        sucesso: true,
        mensagem: `Instruções para redefinição enviadas para ${email}`,
        token,
        email,
    });
});

const redefinirSenha = asyncHandler(async (req, res) => {
    await userService.redefinirSenha(req.body);
    res.status(200).json({
        sucesso: true,
        mensagem: 'Senha redefinida com sucesso! Faça login com a nova senha.',
    });
});

const deletar = asyncHandler(async (req, res) => {
    const targetId = req.params.id || req.query.id || req.user?._id;
    await userService.deletarConta(targetId, req.user);
    await destroySessionAsync(req);
    res.clearCookie(env.sessionName, { path: '/' });
    res.clearCookie('XSRF-TOKEN', { path: '/' });

    res.status(200).json({
        sucesso: true,
        mensagem: 'Conta removida com sucesso.',
    });
});

module.exports = {
    cadastrar,
    login,
    logout,
    me,
    csrf,
    perfil,
    atualizar,
    alterarSenha,
    recuperarSenha,
    redefinirSenha,
    deletar,
};
