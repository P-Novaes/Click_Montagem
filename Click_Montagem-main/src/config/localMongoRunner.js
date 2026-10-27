const net = require('net');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let spawnedMongod = null;

function checkPortOpen(port = 27017, host = '127.0.0.1', timeoutMs = 1000) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let settled = false;

        const done = (isOpen) => {
            if (!settled) {
                settled = true;
                socket.destroy();
                resolve(isOpen);
            }
        };

        socket.setTimeout(timeoutMs);
        socket.once('connect', () => done(true));
        socket.once('timeout', () => done(false));
        socket.once('error', () => done(false));
        socket.connect(port, host);
    });
}

function findMongodBinary() {
    if (process.env.MONGOD_PATH && fs.existsSync(process.env.MONGOD_PATH)) {
        return process.env.MONGOD_PATH;
    }

    const baseDir = 'C:\\Program Files\\MongoDB\\Server';
    if (fs.existsSync(baseDir)) {
        try {
            const versions = fs.readdirSync(baseDir).sort().reverse();
            for (const v of versions) {
                const candidate = path.join(baseDir, v, 'bin', 'mongod.exe');
                if (fs.existsSync(candidate)) {
                    return candidate;
                }
            }
        } catch (_) {}
    }

    return null;
}

async function ensureLocalMongoRunning(mongoUri = 'mongodb://127.0.0.1:27017/click_montagem') {
    // Só tenta iniciar automaticamente para conexões locais em 127.0.0.1 / localhost
    if (!mongoUri.includes('127.0.0.1:27017') && !mongoUri.includes('localhost:27017')) {
        return false;
    }

    const alreadyOpen = await checkPortOpen(27017, '127.0.0.1');
    if (alreadyOpen) {
        return true;
    }

    const mongodBin = findMongodBinary();
    if (!mongodBin) {
        return false;
    }

    const dataDir = path.resolve(__dirname, '../../.mongodb-data');
    const logDir = path.resolve(__dirname, '../../.mongodb-data/logs');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(logDir, { recursive: true });

    const logPath = path.join(logDir, 'mongod.log');

    spawnedMongod = spawn(
        mongodBin,
        ['--dbpath', dataDir, '--bind_ip', '127.0.0.1', '--port', '27017', '--logpath', logPath],
        {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
        }
    );
    spawnedMongod.unref();

    // Aguarda até 10s para a porta 27017 responder
    for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 250));
        if (await checkPortOpen(27017, '127.0.0.1')) {
            return true;
        }
    }

    return false;
}

module.exports = {
    checkPortOpen,
    ensureLocalMongoRunning,
};
