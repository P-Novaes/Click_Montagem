// ================================================================
//  editar_perfil.js — Edição de Perfil do Cliente conectada ao MongoDB
// ================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await Sessao.sincronizar();
    if (!Sessao.logado()) {
        window.location.href = '/pages/login.html';
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
        const u = res.usuario;
        if (!u) return;

        const setVal = (sel, val) => {
            const el = document.querySelector(sel);
            if (el) el.value = val || '';
        };

        setVal('input[name="nome"]', u.nome);
        setVal('input[name="email"]', u.email);
        setVal('input[name="telefone"]', u.telefone);
        setVal('input[name="cpf"]', u.cpf);
        setVal('input[name="cidade"]', u.cidade);
        setVal('input[name="cep"]', u.cep);
        setVal('input[name="endereco"]', u.endereco);
    } catch (err) {
        console.error('Erro ao carregar perfil:', err);
    }
}

async function salvarAlteracoesPerfil(e) {
    e.preventDefault();

    const uid = Sessao.getId();
    const nome = document.querySelector('input[name="nome"]')?.value.trim() || '';
    const email = document.querySelector('input[name="email"]')?.value.trim() || '';
    const telefone = document.querySelector('input[name="telefone"]')?.value.trim() || '';
    const cpf = document.querySelector('input[name="cpf"]')?.value.trim() || '';
    const cidade = document.querySelector('input[name="cidade"]')?.value.trim() || '';
    const cep = document.querySelector('input[name="cep"]')?.value.trim() || '';
    const endereco = document.querySelector('input[name="endereco"]')?.value.trim() || '';

    const senhaAtual = document.getElementById('senhaAtual')?.value || '';
    const novaSenha = document.getElementById('novaSenha')?.value || '';
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
        const res = await API.usuarios.atualizar(uid, {
            nome,
            email,
            telefone,
            cpf,
            cidade,
            cep,
            endereco,
        });

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
                senha_atual: senhaAtual,
                nova_senha: novaSenha,
                confirmar_senha: confirmacao,
            });
        }

        if (res.usuario) {
            Sessao.salvar(res.usuario);
        } else {
            await Sessao.sincronizar(true);
        }

        alert('Perfil atualizado com sucesso!');
        window.location.href = '/pages/painel-cliente.html';
    } catch (err) {
        alert('Erro ao atualizar perfil: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = textoOriginal;
        }
    }
}

async function excluirMinhaConta() {
    if (!confirm('Tem certeza de que deseja excluir permanentemente sua conta? Esta ação não pode ser desfeita.')) {
        return;
    }
    try {
        await API.usuarios.deletar(Sessao.getId());
        Sessao.limpar();
        alert('Sua conta foi excluída com sucesso.');
        window.location.href = '/index.html';
    } catch (err) {
        alert('Não foi possível excluir a conta: ' + err.message);
    }
}
