const mongoose = require('mongoose');
const env = require('./env');

let replicaSetSupported = null;

async function connectDatabase(customUri) {
    const uri = customUri || env.mongoUri;

    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    mongoose.set('strictQuery', true);

    await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
    });

    // Detecta se o servidor MongoDB suporta transações multi-documento (Replica Set / Sharded)
    try {
        const admin = mongoose.connection.db.admin();
        const hello = await admin.command({ hello: 1 });
        replicaSetSupported = Boolean(hello.setName || hello.msg === 'isdbgrid');
    } catch (_) {
        replicaSetSupported = false;
    }

    return mongoose.connection;
}

async function disconnectDatabase() {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    replicaSetSupported = null;
}

function isReplicaSet() {
    return Boolean(replicaSetSupported);
}

module.exports = {
    connectDatabase,
    disconnectDatabase,
    isReplicaSet,
};
