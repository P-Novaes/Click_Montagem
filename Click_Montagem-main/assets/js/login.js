// ================================================================
//  login.js — Autenticação e Cadastro com sessão segura no servidor
// ================================================================

function switchTab(tab) {
    document.querySelectorAll('.login-tab').forEach((t) => t.classList.remove('active'));
    document.querySelector(`.login-tab[data-tab="${tab}"]`)?.classList.add('active');
    document.querySelectorAll('.login-form, .cadastro-form').forEach((f) => f.classList.remove('active'));
    document.querySelector(`.${tab}-form`)?.classList.add('active');
    hideFeedback();
}

function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        icon?.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        icon?.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

function selectRole(_role) {
    // O perfil selecionado é lido diretamente do input[name="role"]:checked no envio
}

function showFeedback(msg, type = 'error') {
    const fb = document.getElementById('formFeedback');
    const txt = document.getElementById('feedbackText');
    if (!fb || !txt) return;
    txt.textContent = msg;
    fb.className = `form-feedback show ${type}`;
    const icon = fb.querySelector('i');
    if (icon) {
        icon.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
    }
    if (type === 'success') setTimeout(hideFeedback, 4000);
}

function hideFeedback() {
    document.getElementById('formFeedback')?.classList.remove('show');
}

function setLoading(btnEl, loading, textoOriginal) {
    if (!btnEl) return;
    btnEl.disabled = loading;
    btnEl.innerHTML = loading ? '<i class="fas fa-spinner fa-spin"></i> Aguarde…' : textoOriginal;
}

// ── Cadastro integrado ao Node.js/Express/MongoDB ────────────────
async function handleCadastro() {
    hideFeedback();
    const nome = document.getElementById('cadNome')?.value.trim() ?? '';
    const email = document.getElementById('cadEmail')?.value.trim() ?? '';
    const telefone = document.getElementById('cadTelefone')?.value.trim() ?? '';
    const senha = document.getElementById('cadSenha')?.value ?? '';
    const confirmar = document.getElementById('cadConfirmarSenha')?.value ?? '';
    const termos = document.getElementById('cadTermos')?.checked ?? false;
    const tipo = document.querySelector('input[name="role"]:checked')?.value ?? 'cliente';

    if (!nome) return showFeedback('O nome é obrigatório.');
    if (!email || !email.includes('@')) return showFeedback('Digite um e-mail válido.');
    if (!telefone) return showFeedback('O telefone é obrigatório.');
    if (senha.length < 6) return showFeedback('A senha deve ter no mínimo 6 caracteres.');
    if (senha !== confirmar) return showFeedback('As senhas não coincidem.');
    if (!termos) return showFeedback('Aceite os Termos de Uso para continuar.');

    const btn = document.querySelector('#formCadastro .btn-submit');
    const textoOriginal = '<i class="fas fa-user-plus"></i> Criar Conta';
    setLoading(btn, true, textoOriginal);

    try {
        Sessao.limpar();
        const data = await API.usuarios.cadastrar({
            nome,
            email,
            telefone,
            senha,
            tipo,
        });

        Sessao.salvar(data.usuario);
        showFeedback('Conta criada com sucesso! Redirecionando…', 'success');
        setTimeout(() => redirecionar(data.usuario.tipo), 600);
    } catch (err) {
        showFeedback(err.message || 'Erro ao criar conta.');
    } finally {
        setLoading(btn, false, textoOriginal);
    }
}

// ── Login integrado ao Node.js/Express/MongoDB ───────────────────
async function handleLogin() {
    hideFeedback();
    const email = document.getElementById('loginEmail')?.value.trim() ?? '';
    const senha = document.getElementById('loginSenha')?.value ?? '';

    if (!email || !senha) return showFeedback('Preencha e-mail e senha.');

    const btn = document.querySelector('#formLogin .btn-submit');
    const textoOriginal = '<i class="fas fa-sign-in-alt"></i> Entrar';
    setLoading(btn, true, textoOriginal);

    try {
        Sessao.limpar();
        if (document.getElementById('googleLink')?.checked) {
            await API.auth.csrf();
            const result = await apiFetch('auth/google/link', { method: 'POST', body: { email, senha } });
            window.location.assign(result.url);
            return;
        }
        const data = await API.usuarios.login({ email, senha });
        Sessao.salvar(data.usuario);
        showFeedback('Login realizado! Redirecionando…', 'success');
        setTimeout(() => redirecionar(data.usuario.tipo), 500);
    } catch (err) {
        showFeedback(err.message || 'E-mail ou senha incorretos.');
    } finally {
        setLoading(btn, false, textoOriginal);
    }
}

function redirecionar(tipo) {
    window.location.href =
        tipo === 'montador' ? '/pages/painel-montador.html' : '/pages/painel-cliente.html';
}

document.addEventListener('DOMContentLoaded', async () => {
    // Máscara de telefone
    const tel = document.getElementById('cadTelefone');
    if (tel) {
        tel.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '').slice(0, 11);
            if (v.length > 7) v = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
            else if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
            e.target.value = v;
        });
    }

    // Submissão por tecla Enter nos formulários
    document.getElementById('formLogin')?.addEventListener('submit', (e) => {
        e.preventDefault();
        handleLogin();
    });
    document.getElementById('formCadastro')?.addEventListener('submit', (e) => {
        e.preventDefault();
        handleCadastro();
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'cadastro') {
        switchTab('cadastro');
    }

    if (params.get('logout')) {
        await API.auth.logout().catch(() => {});
        Sessao.limpar();
        history.replaceState(null, '', window.location.pathname);
    }

    const user = await Sessao.sincronizar(true);
    await initializeGoogleAuth(user, params);
});
