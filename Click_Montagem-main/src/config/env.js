const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const env = {
    nodeEnv: process.env.NODE_ENV || 'development',
    isProd: process.env.NODE_ENV === 'production',
    isTest: process.env.NODE_ENV === 'test',
    port: parseInt(process.env.PORT || '3000', 10),
    mongoUri: process.env.NODE_ENV === 'test'
        ? (process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/click_montagem_test')
        : (process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/click_montagem'),
    sessionSecret: process.env.SESSION_SECRET || 'click_montagem_dev_secret_key_9f8e7d6c5b4a3210',
    sessionName: process.env.SESSION_NAME || 'cm.sid',
    sessionMaxAgeMs: parseInt(process.env.SESSION_MAX_AGE_MS || String(24 * 60 * 60 * 1000), 10),
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || '',
    trustProxy: process.env.TRUST_PROXY || '',
    appUrl: process.env.APP_URL || '',
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: Number(process.env.SMTP_PORT || 587),
    smtpUser: process.env.SMTP_USER || '',
    smtpPassword: process.env.SMTP_PASSWORD || '',
    smtpFrom: process.env.SMTP_FROM || '',
};

if (env.isProd && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || /troque|dev_secret/i.test(process.env.SESSION_SECRET))) {
    throw new Error('Defina SESSION_SECRET aleatório com pelo menos 32 caracteres em produção.');
}

module.exports = env;
