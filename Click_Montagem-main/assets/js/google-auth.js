// Only session cookies identify users. No Google tokens are sent to or stored by this script.
async function initializeGoogleAuth(user, params) {
    const button = document.getElementById('googleContinue');
    const note = document.getElementById('googleAvailability');
    const form = document.getElementById('formGoogleCadastro');
    const messages = {
        cancelled: 'Autenticação cancelada. Você pode tentar novamente ou usar e-mail e senha.',
        state: 'A tentativa expirou ou pertence a outra sessão. Inicie novamente.',
        callback: 'Retorno do Google inválido. Inicie novamente.',
        identity: 'Não foi possível validar sua conta Google. Use uma conta com e-mail verificado.',
        unavailable: 'Login Google ainda não está disponível. Use e-mail e senha.',
        failed: 'Não foi possível comunicar com o Google ou concluir o login. Tente novamente.',
        account_exists: 'Já existe uma conta com esse e-mail. Para vincular, informe o e-mail e a senha dessa conta e marque a opção de vinculação abaixo.',
        link_denied: 'Vinculação não autorizada. Confirme a senha local e selecione a conta Google com o mesmo e-mail.',
        already_linked: 'Essa conta já possui um vínculo Google. Entre com a conta vinculada.',
    };
    const error = params.get('google_error');
    if (error) {
        switchTab('login');
        showFeedback(messages[error] || messages.failed);
        // Remove callback outcome from history; all rendered messages are fixed text.
        history.replaceState(null, '', window.location.pathname);
    }

    if (user && user.cadastroCompleto === false) {
        document.querySelector('.login-tabs').hidden = true;
        document.getElementById('googleActions').hidden = true;
        document.querySelectorAll('.login-form, .cadastro-form').forEach(el => el.classList.remove('active'));
        form.hidden = false;
        document.getElementById('googleEmail').textContent = user.email;
        document.getElementById('googleNome').value = user.nome;
        form.addEventListener('change', () => {
            document.getElementById('googleProfessional').hidden = form.querySelector('[name="googleRole"]:checked')?.value !== 'montador';
        });
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const submit = form.querySelector('[type="submit"]');
            setLoading(submit, true, 'Concluir cadastro');
            hideFeedback();
            try {
                const result = await apiFetch('auth/google/complete', { method: 'POST', body: {
                    nome: document.getElementById('googleNome').value.trim(),
                    telefone: document.getElementById('googleTelefone').value.trim(),
                    tipo: form.querySelector('[name="googleRole"]:checked')?.value,
                    termos: document.getElementById('googleTermos').checked,
                    cpf_cnpj: document.getElementById('googleDocumento').value.trim(),
                    regiao_atendimento: document.getElementById('googleRegiao').value.trim(),
                } });
                Sessao.salvar(result.usuario);
                window.location.assign(result.redirect);
            } catch (err) { showFeedback(err.message); }
            finally { setLoading(submit, false, 'Concluir cadastro'); }
        });
        document.getElementById('googleCancel').addEventListener('click', async () => {
            try {
                await API.auth.logout();
                Sessao.limpar();
                window.location.assign('/pages/login.html');
            } catch (err) { showFeedback(err.message); }
        });
        return;
    }

    if (params.get('google') === 'complete' && !user) showFeedback('Sua sessão expirou. Entre novamente com Google.');
    try {
        const status = await apiFetch('auth/google/status');
        button.disabled = !status.habilitado;
        note.textContent = status.habilitado ? '' : 'Login Google indisponível no momento. Use e-mail e senha.';
        document.getElementById('googleLinkOption').hidden = !status.habilitado;
    } catch { note.textContent = 'Não foi possível verificar o login Google. Atualize a página para tentar novamente.'; }

    button.addEventListener('click', async () => {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.querySelector('span').textContent = 'Aguarde…';
        hideFeedback();
        try {
            await API.auth.csrf();
            const result = await apiFetch('auth/google', { method: 'POST' });
            window.location.assign(result.url);
        } catch (err) {
            showFeedback(err.message);
            button.disabled = false;
            button.removeAttribute('aria-busy');
            button.querySelector('span').textContent = 'Continuar com Google';
        }
    });
}

window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
