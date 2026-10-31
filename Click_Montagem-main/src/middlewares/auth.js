const { User } = require('../models');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Carrega o usuário autenticado a partir da sessão do servidor (se existir).
 */
const hydrateUser = asyncHandler(async (req, _res, next) => {
    if (req.session && req.session.userId) {
        const user = await User.findById(req.session.userId);
        if (user) {
            req.user = user;
        } else {
            // Usuário não existe mais no banco: limpa sessão órfã
            delete req.session.userId;
            delete req.session.userType;
        }
    }
    next();
});

/**
 * Exige que o usuário esteja autenticado na sessão do servidor.
 */
const requireAuth = asyncHandler(async (req, _res, next) => {
    if (!req.session || !req.session.userId) {
        throw new AppError('Autenticação necessária. Faça login para continuar.', 401);
    }

    if (!req.user) {
        const user = await User.findById(req.session.userId);
        if (!user) {
            req.session.destroy(() => {});
            throw new AppError('Sessão inválida ou usuário não encontrado. Faça login novamente.', 401);
        }
        req.user = user;
    }

    if (req.user.cadastroCompleto === false || !req.user.tipo) {
        throw new AppError('Conclua seu cadastro antes de acessar esta funcionalidade.', 403);
    }
    next();
});

/**
 * Exige que o usuário autenticado possua um dos perfis permitidos ('cliente' ou 'montador').
 */
function requireRole(...allowedRoles) {
    return (req, _res, next) => {
        if (!req.user) {
            return next(new AppError('Autenticação necessária.', 401));
        }
        if (!allowedRoles.includes(req.user.tipo)) {
            return next(
                new AppError(
                    `Acesso negado. Esta operação é exclusiva para perfil: ${allowedRoles.join(' ou ')}.`,
                    403
                )
            );
        }
        return next();
    };
}

module.exports = {
    hydrateUser,
    requireAuth,
    requireRole,
};
