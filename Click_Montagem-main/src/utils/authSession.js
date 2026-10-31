const { ensureCsrfToken } = require('../middlewares/security');

function saveSession(req) {
    return new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
}

async function establishSession(req, user, res) {
    await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.userId = String(user.id || user._id);
    req.session.userType = user.tipo;
    const csrfToken = ensureCsrfToken(req, res);
    await saveSession(req);
    return csrfToken;
}

module.exports = { establishSession, saveSession };
