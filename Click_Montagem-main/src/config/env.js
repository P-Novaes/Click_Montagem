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
};

module.exports = env;
