// ================================================================
//  editar_perfil.js — Edição de Perfil do Cliente conectada ao banco
//  Caminho: htdocs/click_montagem/assets/js/editar_perfil.js
// ================================================================

document.addEventListener('DOMContentLoaded', async () => {
    if (!Sessao.logado()) {
        window.location.href = '/click_montagem/pages/login.html';
        return;
    }

    const uid = Sessao.getId();
    await preencherFormulario(uid);

    const form = document.querySelector('.perfil-form');
    if (form) {
        form.addEventListener('submit', salvarAlteracoesPerfil);
    }
});

async function preencherFormulario(uid) {
    try {
        const res = await API.usuarios.perfil(uid);
        const u   = res.usuario;
        if (!u) return;

        const setVal = (sel, val) => {
            const el = document.querySelector(sel);
            if (el && val) el.value = val;
        };

        setVal('input[name="nome"]',     u.nome);
        setVal('input[name="email"]',    u.email);
        setVal('input[name="telefone"]', u.telefone);

    } catch (err) {
        console.error('Erro ao carregar perfil:', err);
    }
}

async function salvarAlteracoesPerfil(e) {
    e.preventDefault();

    const uid      = Sessao.getId();
    const nome     = document.querySelector('input[name="nome"]')?.value.trim() || '';
    const email    = document.querySelector('input[name="email"]')?.value.trim() || '';
    const telefone = document.querySelector('input[name="telefone"]')?.value.trim() || '';

    const senhaAtual  = document.getElementById('senhaAtual')?.value || '';
    const novaSenha   = document.getElementById('novaSenha')?.value || '';
    const confirmacao = document.getElementById('confirmarSenha')?.value || '';

    if (!nome || !telefone) {
        alert('Nome e telefone são obrigatórios.');
        return;
    }

    const btn = document.querySelector('.perfil-form button[type="submit"]');
    const textoOriginal = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando…';
    }

    try {
        // 1. Atualiza dados cadastrais
        const res = await API.usuarios.atualizar(uid, { nome, email, telefone });

        // 2. Se informou nova senha, atualiza
        if (novaSenha) {
            if (!senhaAtual) {
                alert('Para alterar a senha, informe sua senha atual.');
                return;
            }
            if (novaSenha !== confirmacao) {
                alert('A confirmação da nova senha não confere.');
                return;
            }
            await API.usuarios.alterarSenha(uid, {
                senha_atual:     senhaAtual,
                nova_senha:      novaSenha,
                confirmar_senha: confirmacao
            });
        }

        // Atualiza sessão
        Sessao.salvar({
            id: uid,
            nome,
            email,
            telefone,
            tipo: Sessao.getTipo()
        });

        alert('Perfil atualizado com sucesso!');
        window.location.href = 'painel-cliente.html';

    } catch (err) {
        alert('Erro ao atualizar perfil: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = textoOriginal;
        }
    }
}

