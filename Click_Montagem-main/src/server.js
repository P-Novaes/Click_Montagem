const env = require('./config/env');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const { ensureLocalMongoRunning } = require('./config/localMongoRunner');
const { createApp } = require('./app');
const { User } = require('./models');
const OAuthAttempt = require('./models/OAuthAttempt');
const google = require('./services/googleOAuthService');

async function startServer() {
    try {
        await ensureLocalMongoRunning(env.mongoUri);
        await connectDatabase(env.mongoUri);
        await Promise.all([User.init(), OAuthAttempt.init()]);
        if (env.googleClientId || env.googleClientSecret || env.googleCallbackUrl) google.validateConfig();
        console.log('[ClickMontagem] Conectado ao MongoDB.');

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
