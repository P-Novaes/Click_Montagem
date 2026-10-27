const AppError = require('../utils/AppError');
const env = require('../config/env');

function errorHandler(err, _req, res, _next) {
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            sucesso: false,
            erro: err.message,
        });
    }

    // Erro de sintaxe no JSON enviado pelo cliente
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            sucesso: false,
            erro: 'JSON inválido no corpo da requisição.',
        });
    }

    // Erro de validação do Mongoose
    if (err.name === 'ValidationError') {
        const msgs = Object.values(err.errors).map((e) => e.message);
        return res.status(400).json({
            sucesso: false,
            erro: msgs[0] || 'Dados inválidos.',
        });
    }

    // Erro de Cast (ObjectId inválido no Mongoose)
    if (err.name === 'CastError') {
        return res.status(400).json({
            sucesso: false,
            erro: 'Identificador de registro inválido.',
        });
    }

    // Erro de chave duplicada no MongoDB (E11000)
    if (err.code === 11000) {
        const keyPattern = err.keyPattern || {};
        if (keyPattern.email || keyPattern['montador.cpf_cnpj']) {
            return res.status(409).json({
                sucesso: false,
                erro: 'Este e-mail ou CPF/CNPJ já está cadastrado no sistema.',
            });
        }
        if (keyPattern.orcamento_id && keyPattern.montador_id) {
            return res.status(409).json({
                sucesso: false,
                erro: 'Você já enviou uma proposta para este orçamento.',
            });
        }
        if (keyPattern.agendamento_id) {
            return res.status(409).json({
                sucesso: false,
                erro: 'Este serviço já foi avaliado anteriormente.',
            });
        }
        if (keyPattern.proposta_id || keyPattern.orcamento_id) {
            return res.status(409).json({
                sucesso: false,
                erro: 'Já existe um agendamento ativo para esta solicitação.',
            });
        }
        return res.status(409).json({
            sucesso: false,
            erro: 'Registro duplicado detectado no banco de dados.',
        });
    }

    if (!env.isTest) {
        console.error('[ClickMontagem Error]:', err);
    }

    return res.status(500).json({
        sucesso: false,
        erro: 'Erro interno no servidor.',
    });
}

module.exports = errorHandler;
