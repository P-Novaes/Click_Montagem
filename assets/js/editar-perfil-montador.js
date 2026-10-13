// ================================================================
//  editar-perfil-montador.js — Edição de Perfil Profissional conectada ao banco
//  Caminho: htdocs/click_montagem/assets/js/editar-perfil-montador.js
//  Alinhado com as tabelas montadores e usuarios
// ================================================================

document.addEventListener('DOMContentLoaded', async () => {
    if (!Sessao.logado()) {
        window.location.href = '/click_montagem/pages/login.html';
        return;
    }

    const mid = Sessao.getId();
    await preencherPerfilMontador(mid);
});

async function preencherPerfilMontador(mid) {
    try {
        const res = await API.usuarios.perfil(mid);
        const u   = res.usuario;
        if (!u) return;

        const setVal = (sel, val) => {
            const el = document.querySelector(sel);
            if (el && val) el.value = val;
        };

        setVal('input[name="nome"]',          u.nome);
        setVal('input[name="email"]',         u.email);
        setVal('input[name="telefone"]',      u.telefone);
        setVal('input[name="area_atuacao"]',   u.regiao_atendimento);
        setVal('textarea[name="descricao"]',  u.descricao_profissional);

        // Preenche especialidades
        if (u.especialidades) {
            const espArray = u.especialidades.toLowerCase().split(/[,;]/).map(s => s.trim());
            document.querySelectorAll('.esp-tag').forEach(tag => {
                const val = (tag.dataset.val || tag.textContent).toLowerCase();
                const matched = espArray.some(e => val.includes(e) || e.includes(val));
                tag.classList.toggle('ativo', matched);
            });
        }

    } catch (err) {
        console.error('Erro ao carregar dados do montador:', err);
    }
}

async function salvarPerfil(e) {
    e.preventDefault();

    const mid         = Sessao.getId();
    const nome        = document.querySelector('input[name="nome"]')?.value.trim() || '';
    const email       = document.querySelector('input[name="email"]')?.value.trim() || '';
    const telefone    = document.querySelector('input[name="telefone"]')?.value.trim() || '';
    const areaAtuacao = document.querySelector('input[name="area_atuacao"]')?.value.trim() || '';
    const descricao   = document.querySelector('textarea[name="descricao"]')?.value.trim() || '';

    // Coleta especialidades selecionadas
    const especialidades = Array.from(document.querySelectorAll('.esp-tag.ativo'))
        .map(tag => tag.textContent.trim())
        .join(', ');

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
        // 1. Atualiza dados no banco via API
        await API.montadores.atualizar(mid, {
            nome,
            telefone,
            descricao_profissional: descricao,
            especialidades,
            regiao_atendimento:     areaAtuacao,
        });

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
            await API.usuarios.alterarSenha(mid, {
                senha_atual:     senhaAtual,
                nova_senha:      novaSenha,
                confirmar_senha: confirmacao
            });
        }

        // Atualiza dados na sessão local
        Sessao.salvar({
            id: mid,
            nome,
            email,
            telefone,
            tipo: 'montador'
        });

        alert('Perfil profissional atualizado com sucesso no banco de dados!');
        window.location.href = 'painel-montador.html';

    } catch (err) {
        alert('Erro ao salvar alterações: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = textoOriginal;
        }
    }
}

