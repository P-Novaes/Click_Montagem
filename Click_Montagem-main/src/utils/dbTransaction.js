const mongoose = require('mongoose');
const { isReplicaSet } = require('../config/database');

/**
 * Executa operações com transação ACID quando conectado a um Replica Set.
 * Em instâncias standalone de desenvolvimento, executa de forma direta
 * preservando as travas atômicas de filtro (findOneAndUpdate) e índices únicos.
 */
async function withTransaction(workFn) {
    if (isReplicaSet()) {
        const session = await mongoose.startSession();
        try {
            let result;
            await session.withTransaction(async () => {
                result = await workFn(session);
            });
            return result;
        } finally {
            await session.endSession();
        }
    }

    return workFn(null);
}

module.exports = { withTransaction };
