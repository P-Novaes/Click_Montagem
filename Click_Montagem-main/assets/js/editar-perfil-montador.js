// ================================================================
//  editar-perfil-montador.js — Edição de Perfil Profissional conectada ao MongoDB
// ================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await Sessao.sincronizar();
    if (!Sessao.logado()) {
        window.location.href = '/pages/login.html';
        return;
    }

    const mid = Sessao.getId();
    await preencherPerfilMontador(mid);
});

async function preencherPerfilMontador(mid) {
    try {
        const res = await API.usuarios.perfil(mid);
        const u = res.usuario;
        if (!u) return;

        const setVal = (sel, val) => {
            const el = document.querySelector(sel);
            if (el && val !== undefined && val !== null) el.value = val;
        };

        setVal('input[name="nome"]', u.nome || '');
        setVal('input[name="email"]', u.email || '');
        setVal('input[name="telefone"]', u.telefone || '');
        setVal('input[name="cidade"]', u.cidade || '');
        setVal('input[name="preco_base"]', u.preco_base ?? 100);
        setVal('input[name="area_atuacao"]', u.regiao_atendimento || '');
        setVal('textarea[name="descricao"]', u.descricao_profissional || '');

        if (u.especialidades) {
            const espArray = u.especialidades
                .toLowerCase()
                .split(/[,;]/)
                .map((s) => s.trim())
                .filter(Boolean);
            document.querySelectorAll('.esp-tag').forEach((tag) => {
                const val = (tag.dataset.val || tag.textContent).toLowerCase();
                const matched = espArray.some((e) => val.includes(e) || e.includes(val));
                tag.classList.toggle('ativo', matched);
            });
        }
    } catch (err) {
        console.error('Erro ao carregar dados do montador:', err);
    }
}

async function salvarPerfil(e) {
    e.preventDefault();

    const mid = Sessao.getId();
    const nome = document.querySelector('input[name="nome"]')?.value.trim() || '';
    const email = document.querySelector('input[name="email"]')?.value.trim() || '';
    const telefone = document.querySelector('input[name="telefone"]')?.value.trim() || '';
    const cidade = document.querySelector('input[name="cidade"]')?.value.trim() || '';
    const precoBase = parseFloat(document.querySelector('input[name="preco_base"]')?.value || '100') || 100;
    const areaAtuacao = document.querySelector('input[name="area_atuacao"]')?.value.trim() || '';
    const descricao = document.querySelector('textarea[name="descricao"]')?.value.trim() || '';

    const especialidades = Array.from(document.querySelectorAll('.esp-tag.ativo'))
        .map((tag) => tag.textContent.trim())
        .join(', ');

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
        const res = await API.montadores.atualizar(mid, {
            nome,
            email,
            telefone,
            cidade,
            preco_base: precoBase,
            descricao_profissional: descricao,
            especialidades,
            regiao_atendimento: areaAtuacao,
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
            await API.usuarios.alterarSenha(mid, {
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

        alert('Perfil profissional atualizado com sucesso!');
        window.location.href = '/pages/painel-montador.html';
    } catch (err) {
        alert('Erro ao salvar alterações: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = textoOriginal;
        }
    }
}
