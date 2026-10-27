const env = require('./config/env');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const { ensureLocalMongoRunning } = require('./config/localMongoRunner');
const { createApp } = require('./app');

async function startServer() {
    try {
        await ensureLocalMongoRunning(env.mongoUri);
        await connectDatabase(env.mongoUri);
        console.log(`[ClickMontagem] Conectado ao MongoDB: ${env.mongoUri}`);

        const app = createApp();
        const server = app.listen(env.port, () => {
            console.log(`[ClickMontagem] Servidor rodando em http://localhost:${env.port}`);
        });

        const shutdown = async (signal) => {
            console.log(`\n[ClickMontagem] Recebido ${signal}. Encerrando servidor...`);
            server.close(async () => {
                await disconnectDatabase();
                process.exit(0);
            });
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
    } catch (err) {
        console.error('[ClickMontagem] Falha ao iniciar o servidor:', err.message);
        process.exit(1);
    }
}

if (require.main === module) {
    startServer();
}

module.exports = { startServer };
