// ================================================================
//  orcamento.js — Formulário de Orçamento integrado à API Express/MongoDB
// ================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await Sessao.sincronizar();
    if (!Sessao.logado()) {
        window.location.href = '/pages/login.html';
        return;
    }

    aplicarParametrosCalculadoraHome();
    atualizarPrecoOrcamento();
    verificarOutro();
    atualizarResumo();

    document.querySelectorAll('input[name="tipo"]').forEach((r) =>
        r.addEventListener('change', () => {
            atualizarPrecoOrcamento();
            verificarOutro();
            atualizarResumo();
        })
    );

    ['qtdPecas', 'complexidade', 'cep', 'bairro', 'outroTexto'].forEach((id) => {
        document.getElementById(id)?.addEventListener('input', atualizarResumo);
        document.getElementById(id)?.addEventListener('change', atualizarResumo);
    });

    document.getElementById('orcamentoForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        enviarOrcamento();
    });
});

function aplicarParametrosCalculadoraHome() {
    const params = new URLSearchParams(window.location.search);
    const tipoMovelParam = params.get('tipoMovel');
    const cepParam = params.get('cep');
    const qtdParam = params.get('qtdPecas');

    if (tipoMovelParam) {
        const isPadrao = tipoMovelParam.endsWith('-pad');
        const btnCat = document.querySelector(`.toggle-btn[data-tipo="${isPadrao ? 'padrao' : 'planejado'}"]`);
        if (btnCat) selecionarTipoOrcamento(btnCat);

        const radio = document.querySelector(`input[name="tipo"][value="${tipoMovelParam}"]`);
        if (radio) radio.checked = true;
    }

    if (cepParam) {
        const cepEl = document.getElementById('cep');
        if (cepEl) cepEl.value = cepParam;
    }

    if (qtdParam) {
        const qtdEl = document.getElementById('qtdPecas');
        if (qtdEl) {
            const num = parseInt(String(qtdParam).replace(/\D/g, '') || '1', 10);
            for (const opt of qtdEl.options) {
                if (parseInt(opt.value || opt.textContent, 10) === num) {
                    opt.selected = true;
                    break;
                }
            }
        }
    }
}

// ── Toggle categoria ──────────────────────────────────────────
function selecionarTipoOrcamento(btn) {
    document.querySelectorAll('.toggle-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    const tipo = btn.getAttribute('data-tipo');
    document.querySelectorAll('.tipo-card').forEach((card) => {
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
    const radio = document.querySelector('input[name="tipo"]:checked');
    const precoEl = document.getElementById('precoValor');
    const rangeEl = document.getElementById('priceRange');
    if (!radio || !precoEl) return;

    const faixa = radio.getAttribute('data-preco') || '0';
    const texto = faixa === '0' ? 'A combinar' : 'R$ ' + faixa.replace('-', ' – ');
    precoEl.textContent = texto;
    if (rangeEl) rangeEl.textContent = texto;
}

// ── Campo "Outro" ─────────────────────────────────────────────
function verificarOutro() {
    const radio = document.querySelector('input[name="tipo"]:checked');
    const cont = document.getElementById('outroContainer');
    if (!cont) return;
    cont.style.display = radio?.value?.includes('outro') ? 'block' : 'none';
}

// ── Radio horário ─────────────────────────────────────────────
function selectRadio(el) {
    document.querySelectorAll('.radio-item').forEach((r) => r.classList.remove('selected'));
    el.classList.add('selected');
    atualizarResumo();
}

function obterNomeMovelSelecionado() {
    const radio = document.querySelector('input[name="tipo"]:checked');
    if (radio?.value?.includes('outro')) {
        const esp = document.getElementById('outroTexto')?.value?.trim();
        if (esp) return esp;
    }
    return radio?.closest('.tipo-card')?.querySelector('span')?.textContent?.trim() || '';
}

// ── Atualiza resumo lateral ───────────────────────────────────
function atualizarResumo() {
    const toggle = document.querySelector('.toggle-btn.active');
    setText('sumCategoria', toggle?.getAttribute('data-tipo') === 'planejado' ? 'Planejados' : 'Padrões');

    const nomeMovel = obterNomeMovelSelecionado();
    setText('sumTipo', nomeMovel || '—');

    const qtdSelect = document.getElementById('qtdPecas');
    const qtdTexto = qtdSelect?.options[qtdSelect.selectedIndex]?.text || '1 peça';
    setText('sumPecas', qtdTexto);

    const compSelect = document.getElementById('complexidade');
    const compTexto = compSelect?.options[compSelect.selectedIndex]?.text?.split(' ')[0] || 'Simples';
    setText('sumComplexidade', compTexto);

    const bairro = document.getElementById('bairro')?.value?.trim() || '';
    const cep = document.getElementById('cep')?.value?.trim() || '';
    setText('sumLocal', bairro || cep || '—');

    const horarioEl = document.querySelector('.radio-item.selected .radio-text');
    setText('sumHorario', horarioEl?.textContent?.trim() || '—');
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ================================================================
// ENVIO DO ORÇAMENTO PARA O BACKEND EXPRESS / MONGODB
// ================================================================
async function enviarOrcamento() {
    if (!Sessao.logado()) {
        alert('Você precisa estar logado para enviar um orçamento.');
        window.location.href = '/pages/login.html';
        return;
    }

    const radio = document.querySelector('input[name="tipo"]:checked');
    const isOutro = Boolean(radio?.value?.includes('outro'));
    const outroTexto = document.getElementById('outroTexto')?.value?.trim() || '';

    if (isOutro && !outroTexto) {
        mostrarErroOrc('Por favor, especifique qual é o móvel no campo "Outro".');
        return;
    }

    const tipoMovel = obterNomeMovelSelecionado();
    const categoria = document.querySelector('.toggle-btn.active')?.getAttribute('data-tipo') || 'padrao';
    const qtd = parseInt(document.getElementById('qtdPecas')?.value || '1', 10) || 1;
    const complexidade = document.getElementById('complexidade')?.value || 'simples';
    const cep = document.getElementById('cep')?.value?.trim() || '';
    const rua = document.getElementById('rua')?.value?.trim() || '';
    const numero = document.getElementById('numero')?.value?.trim() || '';
    const complemento = document.getElementById('complemento')?.value?.trim() || '';
    const bairro = document.getElementById('bairro')?.value?.trim() || '';
    const descricao = document.getElementById('descricao')?.value?.trim() || '';
    const horarioEl = document.querySelector('.radio-item.selected');
    const horario = horarioEl?.getAttribute('data-horario') || 'manha';
    const preco = document.getElementById('precoValor')?.textContent?.trim() || '';

    if (!tipoMovel) {
        mostrarErroOrc('Selecione o tipo de móvel.');
        return;
    }
    if (!cep) {
        mostrarErroOrc('Informe o CEP do local de montagem.');
        return;
    }

    const btn = document.getElementById('btnEnviarOrcamento');
    const textoOriginal = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando…';
    }

    try {
        const data = await API.orcamentos.criar({
            categoria,
            tipo_movel: tipoMovel,
            quantidade_pecas: qtd,
            complexidade,
            descricao,
            cep,
            rua,
            numero,
            complemento,
            bairro,
            horario,
            preco_estimado: preco,
        });

        // Redireciona somente após confirmação real de criação no banco de dados
        window.location.href = `/pages/confirmacao-orcamento.html?id=${encodeURIComponent(data.id)}`;
    } catch (err) {
        mostrarErroOrc(err.message || 'Erro ao enviar orçamento.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = textoOriginal;
        }
    }
}

function mostrarErroOrc(msg) {
    const el = document.getElementById('orcamentoErro');
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
        setTimeout(() => (el.style.display = 'none'), 5000);
    } else {
        alert(msg);
    }
}
