const mongoose = require('mongoose');

// Ephemeral server-side proof. Atomic consumption prevents concurrent callback replay.
const schema = new mongoose.Schema({
    stateHash: { type: String, required: true, unique: true },
    sessionHash: { type: String, required: true },
    nonce: { type: String, required: true },
    verifier: { type: String, required: true },
    linkUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
    expiresAt: { type: Date, required: true, expires: 0 },
}, { collection: 'oauth_tentativas' });

module.exports = mongoose.model('OAuthAttempt', schema);
