// ================================================================
//  orcamento.js — Formulário de Orçamento com integração PHP
//  Caminho: htdocs/click_montagem/js/orcamento.js
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
    atualizarPrecoOrcamento();
    verificarOutro();
    atualizarResumo();

    document.querySelectorAll('input[name="tipo"]').forEach(r =>
        r.addEventListener('change', () => {
            atualizarPrecoOrcamento();
            verificarOutro();
            atualizarResumo();
        })
    );

    ['qtdPecas','complexidade','cep'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', atualizarResumo);
        document.getElementById(id)?.addEventListener('change', atualizarResumo);
    });
});

// ── Toggle categoria ──────────────────────────────────────────
function selecionarTipoOrcamento(btn) {
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const tipo = btn.getAttribute('data-tipo');
    document.querySelectorAll('.tipo-card').forEach(card => {
        card.classList.toggle('hidden', card.getAttribute('data-grupo') !== tipo);
    });

    const primeiro = document.querySelector(`.tipo-card[data-grupo="${tipo}"]:not(.hidden) input`);
    if (primeiro) {
        primeiro.checked = true;
        atualizarPrecoOrcamento();
        verificarOutro();
        atualizarResumo();
    }
}

// ── Preço estimado ────────────────────────────────────────────
function atualizarPrecoOrcamento() {
    const radio     = document.querySelector('input[name="tipo"]:checked');
    const precoEl   = document.getElementById('precoValor');
    const rangeEl   = document.getElementById('priceRange');
    if (!radio || !precoEl) return;

    const faixa = radio.getAttribute('data-preco') || '0';
    const texto = faixa === '0' ? 'A combinar' : 'R$ ' + faixa.replace('-', ' – ');
    precoEl.textContent = texto;
    if (rangeEl) rangeEl.textContent = texto;
}

// ── Campo "Outro" ─────────────────────────────────────────────
function verificarOutro() {
    const radio = document.querySelector('input[name="tipo"]:checked');
    const cont  = document.getElementById('outroContainer');
    if (!cont) return;
    cont.style.display = radio?.value?.includes('outro') ? 'block' : 'none';
}

// ── Radio horário ─────────────────────────────────────────────
function selectRadio(el) {
    document.querySelectorAll('.radio-item').forEach(r => r.classList.remove('selected'));
    el.classList.add('selected');
    atualizarResumo();
}

// ── Atualiza resumo lateral ───────────────────────────────────
function atualizarResumo() {
    const toggle = document.querySelector('.toggle-btn.active');
    setText('sumCategoria', toggle?.getAttribute('data-tipo') === 'planejado' ? 'Planejados' : 'Padrões');

    const radio = document.querySelector('input[name="tipo"]:checked');
    const label = radio?.closest('.tipo-card')?.querySelector('span')?.textContent?.trim();
    setText('sumTipo', label || '—');

    setText('sumPecas',       document.getElementById('qtdPecas')?.value || '1');
    setText('sumComplexidade', document.getElementById('complexidade')?.options[
        document.getElementById('complexidade')?.selectedIndex
    ]?.text?.split(' ')[0] || '—');
    setText('sumLocal', document.getElementById('cep')?.value?.trim() || '—');

    const horarioEl = document.querySelector('.radio-item.selected .radio-text');
    setText('sumHorario', horarioEl?.textContent?.trim() || '—');
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ================================================================
// ENVIO DO ORÇAMENTO PARA O BACKEND
// ================================================================
async function enviarOrcamento() {
    // Garante que o usuário está logado
    if (!Sessao.logado()) {
        alert('Você precisa estar logado para enviar um orçamento.');
        window.location.href = '/click_montagem/pages/login.html';
        return;
    }

    const radio       = document.querySelector('input[name="tipo"]:checked');
    const tipoMovel   = radio?.closest('.tipo-card')?.querySelector('span')?.textContent?.trim() || '';
    const categoria   = document.querySelector('.toggle-btn.active')?.getAttribute('data-tipo') || 'padrao';
    const qtd         = parseInt(document.getElementById('qtdPecas')?.value || '1');
    const complexidade= document.getElementById('complexidade')?.value || 'simples';
    const cep         = document.getElementById('cep')?.value?.trim() || '';
    const bairro      = document.getElementById('bairro')?.value?.trim() || '';
    const descricao   = document.getElementById('descricao')?.value?.trim() || '';
    const horarioEl   = document.querySelector('.radio-item.selected');
    const horario     = horarioEl?.getAttribute('data-horario') || 'qualquer';
    const preco       = document.getElementById('precoValor')?.textContent || '';

    if (!tipoMovel) {
        mostrarErroOrc('Selecione o tipo de móvel.');
        return;
    }
    if (!cep) {
        mostrarErroOrc('Informe o CEP.');
        return;
    }

    const btn = document.getElementById('btnEnviarOrcamento');
    const textoOriginal = btn?.innerHTML;
    if (btn) {
        btn.disabled  = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando…';
    }

    try {
        const data = await API.criarOrc({
            usuario_id:       Sessao.getId(),
            categoria,
            tipo_movel:       tipoMovel,
            quantidade_pecas: qtd,
            complexidade,
            descricao,
            cep,
            bairro,
            horario,
            preco_estimado:   preco,
        });

        // Redireciona para a tela de propostas com o ID do orçamento
        window.location.href =
            `/click_montagem/pages/propostas.html?orc_id=${data.id}`;

    } catch (err) {
        mostrarErroOrc(err.message || 'Erro ao enviar orçamento.');
    } finally {
        if (btn) {
            btn.disabled  = false;
            btn.innerHTML = textoOriginal;
        }
    }
}

function mostrarErroOrc(msg) {
    const el = document.getElementById('orcamentoErro');
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
        setTimeout(() => (el.style.display = 'none'), 4000);
    } else {
        alert(msg);
    }
}