// Real, isolated MongoDB process. Never connects to the application's database.
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
process.env.MONGOMS_DOWNLOAD_DIR ||= path.resolve(__dirname, '../.test-artifacts/mongodb-binaries');
const { MongoMemoryServer } = require('mongodb-memory-server');

async function main() {
    const mongo = await MongoMemoryServer.create();
    try {
        const browser = process.argv.includes('--browser');
        const requested = process.argv.slice(2).filter(arg => arg !== '--browser');
        const files = requested.length ? requested : fs.readdirSync(path.resolve(__dirname, '../tests'))
            .filter(name => name.endsWith('.test.js')).map(name => `tests/${name}`);
        const args = browser ? ['tests/e2e-browser.js'] : ['--test', ...files];
        const exitCode = await new Promise((resolve, reject) => {
            const child = spawn(process.execPath, args, {
                cwd: path.resolve(__dirname, '..'), stdio: 'inherit', windowsHide: true,
                env: { ...process.env, NODE_ENV: 'test', MONGODB_TEST_URI: mongo.getUri('click_montagem_test') },
            });
            child.once('error', reject);
            child.once('exit', code => resolve(code ?? 1));
        });
        process.exitCode = exitCode;
    } finally { await mongo.stop(); }
}

main().catch(error => { console.error('Falha no ambiente de testes:', error.message); process.exitCode = 1; });
