// ================================================================
//  propostas.js — Gestão dinâmica de Propostas integrada ao MongoDB
// ================================================================

let propostaSelecionadaId = null;
let propostasCarregadas = [];
let orcamentoAtual = null;
let meusOrcamentos = [];

document.addEventListener('DOMContentLoaded', async () => {
    await Sessao.sincronizar();
    if (!Sessao.logado()) {
        window.location.href = '/pages/login.html';
        return;
    }

    inicializarFiltros();
    await carregarPropostasContexto();
});

function inicializarFiltros() {
    document.querySelectorAll('.filt-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filt-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            filtrarListaPropostas(btn.textContent.trim());
        });
    });

    document.querySelectorAll('.date-btn:not(.past)').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.date-btn').forEach((b) => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });

    const modal = document.getElementById('scheduleModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'scheduleModal') closeModal();
        });
    }
}

function openModal(propostaId) {
    propostaSelecionadaId = propostaId;
    const modal = document.getElementById('scheduleModal');
    if (modal) modal.classList.add('open');
}

function closeModal() {
    document.getElementById('scheduleModal')?.classList.remove('open');
    propostaSelecionadaId = null;
}

// ── Aceitar proposta e criar agendamento ─────────────────────────
async function aceitarProposta(id) {
    const propId = id || propostaSelecionadaId;
    if (!propId) return;

    if (!confirm('Deseja aceitar esta proposta e confirmar o agendamento?')) return;

    try {
        const data = await API.propostas.aceitar(propId);
        closeModal();
        alert(data.mensagem || 'Proposta aceita com sucesso!');
        window.location.href = '/pages/painel-cliente.html';
    } catch (err) {
        alert('Erro ao aceitar proposta: ' + err.message);
    }
}

// ── Recusar proposta ─────────────────────────────────────────────
async function recusarProposta(id) {
    if (!confirm('Deseja recusar esta proposta?')) return;

    try {
        const data = await API.propostas.recusar(id);
        alert(data.mensagem || 'Proposta recusada.');
        await carregarPropostasContexto();
    } catch (err) {
        alert('Erro ao recusar proposta: ' + err.message);
    }
}

// ── Excluir proposta (pelo montador autor) ───────────────────────
async function excluirProposta(id) {
    if (!confirm('Deseja remover esta proposta enviada?')) return;

    try {
        const data = await API.propostas.deletar(id);
        alert(data.mensagem || 'Proposta removida.');
        await carregarPropostasDoMontador(Sessao.getId());
    } catch (err) {
        alert('Erro ao remover proposta: ' + err.message);
    }
}

// ── Cancelar ou Excluir Orçamento (pelo cliente autor) ───────────
async function cancelarOrcamentoAtual(orcId) {
    if (!confirm('Deseja cancelar este orçamento? Propostas pendentes serão recusadas.')) return;
    try {
        await API.orcamentos.status(orcId, 'cancelado');
        alert('Orçamento cancelado com sucesso.');
        await carregarPropostasContexto();
    } catch (err) {
        alert('Erro ao cancelar orçamento: ' + err.message);
    }
}

async function deletarOrcamentoAtual(orcId) {
    if (!confirm('Deseja excluir permanentemente este orçamento?')) return;
    try {
        await API.orcamentos.deletar(orcId);
        alert('Orçamento excluído com sucesso.');
        window.location.href = '/pages/propostas.html';
    } catch (err) {
        alert('Erro ao excluir orçamento: ' + err.message);
    }
}

// ── Carrega propostas baseado na URL e na sessão autenticada ─────
async function carregarPropostasContexto() {
    if (Sessao.isMontador()) {
        await carregarPropostasDoMontador(Sessao.getId());
        return;
    }

    const params = new URLSearchParams(window.location.search);
    let orcId = params.get('orc_id');

    try {
        const resOrc = await API.orcamentos.listarPorCliente(Sessao.getId());
        meusOrcamentos = resOrc.orcamentos || [];
    } catch (_) {
        meusOrcamentos = [];
    }

    if (!orcId && meusOrcamentos.length > 0) {
        orcId = meusOrcamentos[0].id;
    }

    if (!orcId) {
        renderizarEstadoSemOrcamento();
        return;
    }

    await carregarPropostasDoOrcamento(orcId);
}

function renderizarEstadoSemOrcamento() {
    const lista = document.querySelector('.prop-layout > div:first-child');
    const sub = document.querySelector('.page-sub');
    const badge = document.querySelector('.tag.tag-pend');

    if (sub) sub.textContent = 'Você ainda não possui orçamentos cadastrados.';
    if (badge) badge.textContent = '0 propostas';

    atualizarResumoSidebar(null);

    if (lista) {
        lista.innerHTML = `
            <div class="card" style="text-align:center;padding:50px;color:var(--texto-claro)">
                <i class="fas fa-clipboard-list" style="font-size:2.5rem;margin-bottom:14px;color:var(--dourado);display:block"></i>
                <h3 style="color:var(--marrom-escuro);margin-bottom:8px;">Nenhum orçamento encontrado</h3>
                <p>Solicite seu primeiro orçamento para receber propostas de montadores verificados.</p>
                <a href="/pages/orcamento.html" class="btn btn-primary" style="margin-top:16px;display:inline-block;">+ Solicitar orçamento</a>
            </div>`;
    }
}

function atualizarResumoSidebar(orc) {
    const cardResumo = document.querySelector('.sidebar-sticky .card:first-child');
    if (!cardResumo) return;

    if (!orc) {
        cardResumo.innerHTML = `
            <p class="title">Resumo do pedido</p>
            <p style="font-size:13px;color:var(--texto-claro);padding:12px 0;">Nenhum orçamento selecionado.</p>
        `;
        return;
    }

    const local = orc.bairro || (orc.cep ? `CEP ${orc.cep}` : 'A combinar');
    const pecas = `${orc.quantidade_pecas} ${orc.quantidade_pecas === 1 ? 'unidade' : 'unidades'}`;
    const botoesOrc =
        orc.status === 'aberto'
            ? `
            <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" class="btn btn-ghost" style="font-size:11px;padding:6px 10px;flex:1;" onclick="cancelarOrcamentoAtual('${orc.id}')">Cancelar pedido</button>
                <button type="button" class="btn btn-ghost" style="font-size:11px;padding:6px 10px;color:#c0392b;" onclick="deletarOrcamentoAtual('${orc.id}')">Excluir</button>
            </div>
        `
            : orc.status === 'cancelado'
            ? `
            <div style="margin-top:14px;">
                <button type="button" class="btn btn-ghost btn-full" style="font-size:11px;padding:6px 10px;color:#c0392b;" onclick="deletarOrcamentoAtual('${orc.id}')">Excluir orçamento cancelado</button>
            </div>
        `
            : '';

    let seletorHtml = '';
    if (meusOrcamentos.length > 1) {
        seletorHtml = `
            <div style="margin-bottom:12px;">
                <label style="font-size:11px;color:var(--texto-claro);display:block;margin-bottom:4px;">Alternar orçamento:</label>
                <select class="form-select" style="font-size:12px;padding:6px 8px;" onchange="window.location.href='/pages/propostas.html?orc_id=' + this.value">
                    ${meusOrcamentos
                        .map(
                            (o) =>
                                `<option value="${o.id}" ${o.id === orc.id ? 'selected' : ''}>${escapar(o.tipo_movel)} (${labelStatus(o.status)})</option>`
                        )
                        .join('')}
                </select>
            </div>
        `;
    }

    cardResumo.innerHTML = `
        <p class="title">Resumo do pedido</p>
        ${seletorHtml}
        <div class="sum-row">
            <span>Tipo</span>
            <span>${escapar(orc.tipo_movel)}</span>
        </div>
        <div class="sum-row">
            <span>Peças</span>
            <span>${escapar(pecas)}</span>
        </div>
        <div class="sum-row">
            <span>Local</span>
            <span>${escapar(local)}</span>
        </div>
        <div class="sum-row">
            <span>Preferência</span>
            <span>${escapar(labelHorario(orc.horario))}</span>
        </div>
        <div class="sum-row">
            <span>Status</span>
            <span><strong>${escapar(labelStatus(orc.status))}</strong></span>
        </div>
        <div class="price-range">${escapar(orc.preco_estimado || 'A combinar')}</div>
        ${botoesOrc}
    `;
}

// ── Carrega propostas de um orçamento para o cliente ─────────────
async function carregarPropostasDoOrcamento(orcId) {
    const lista = document.querySelector('.prop-layout > div:first-child');
    if (!lista) return;

    lista.innerHTML =
        '<p style="text-align:center;padding:40px;color:var(--texto-claro)"><i class="fas fa-spinner fa-spin"></i> Carregando propostas…</p>';

    try {
        const [dadosOrc, dadosProp] = await Promise.all([
            API.orcamentos.buscar(orcId),
            API.propostas.listarPorOrcamento(orcId),
        ]);

        const orc = dadosOrc.orcamento;
        const props = dadosProp.propostas || [];
        orcamentoAtual = orc;
        propostasCarregadas = props;

        atualizarResumoSidebar(orc);

        const sub = document.querySelector('.page-sub');
        if (sub && orc) {
            const local = orc.bairro || (orc.cep ? `CEP ${orc.cep}` : 'São Paulo, SP');
            sub.textContent = `${orc.tipo_movel} · ${local} · ${props.length} montador(es) responderam`;
        }

        const badge = document.querySelector('.tag.tag-pend');
        if (badge) {
            badge.innerHTML = `<i class="fas fa-check-circle"></i> ${props.length} proposta(s) recebida(s)`;
        }

        if (props.length === 0) {
            lista.innerHTML = `
                <div class="card" style="text-align:center;padding:50px;color:var(--texto-claro)">
                    <i class="fas fa-clock" style="font-size:2.5rem;margin-bottom:14px;color:var(--dourado);display:block"></i>
                    <h3 style="color:var(--marrom-escuro);margin-bottom:8px;">Aguardando propostas</h3>
                    <p>Seu orçamento está ${labelStatus(orc.status).toLowerCase()}. Assim que montadores qualificados responderem, as propostas aparecerão aqui.</p>
                </div>`;
            return;
        }

        renderizarCardsPropostas(props, lista);
    } catch (err) {
        lista.innerHTML = `
            <div class="card" style="text-align:center;padding:40px;color:#c0392b">
                <i class="fas fa-exclamation-circle" style="font-size:2rem;margin-bottom:12px;display:block"></i>
                ${escapar(err.message)}
            </div>`;
    }
}

// ── Carrega propostas que o próprio montador enviou ──────────────
async function carregarPropostasDoMontador(mid) {
    const lista = document.querySelector('.prop-layout > div:first-child');
    if (!lista) return;

    const titulo = document.querySelector('.page-title');
    if (titulo) titulo.textContent = 'Minhas Propostas Enviadas';

    const sub = document.querySelector('.page-sub');
    if (sub) sub.textContent = 'Acompanhe as propostas enviadas aos clientes e o status de cada solicitação';

    try {
        const res = await API.propostas.listarPorMontador(mid);
        const props = res.propostas || [];

        const badge = document.querySelector('.tag.tag-pend');
        if (badge) badge.textContent = `${props.length} proposta(s) enviada(s)`;

        if (props.length === 0) {
            lista.innerHTML = `
                <div class="card" style="text-align:center;padding:40px;color:var(--texto-claro)">
                    <p>Você ainda não enviou propostas para orçamentos.</p>
                    <a href="/pages/painel-montador.html#solicitacoes" class="btn btn-primary" style="margin-top:14px; display:inline-block;">Ver Pedidos Abertos</a>
                </div>
            `;
            return;
        }

        lista.innerHTML = props
            .map(
                (p) => `
            <div class="prop-card">
                <div class="prop-top">
                    <div>
                        <p class="name">${escapar(p.tipo_movel)}</p>
                        <div class="prof-meta">
                            <span>Cliente: ${escapar(p.cliente_nome)} · ${escapar(p.bairro || p.cep || 'SP')}</span>
                        </div>
                    </div>
                    <div class="prop-price">
                        <span class="currency">R$</span>
                        <span class="amount">${Number(p.valor).toFixed(0)}</span>
                    </div>
                </div>
                <div class="prop-chips">
                    <span class="chip">Data proposta: ${formatarDataBR(p.disponibilidade)}</span>
                    <span class="chip">${labelHorario(p.horario)}</span>
                    <span class="chip">Status: <strong>${labelStatus(p.status)}</strong></span>
                </div>
                ${p.mensagem ? `<p style="margin-top:10px;font-size:13px;color:var(--texto-claro);">"${escapar(p.mensagem)}"</p>` : ''}
                ${
                    p.status === 'pendente' || p.status === 'recusada'
                        ? `<div class="prop-btns" style="margin-top:12px;">
                            <button type="button" class="btn btn-ghost" style="color:#c0392b;" onclick="excluirProposta('${p.id}')">Remover proposta</button>
                           </div>`
                        : ''
                }
            </div>
        `
            )
            .join('');
    } catch (err) {
        lista.innerHTML = `<p style="color:#c0392b;padding:20px;">Erro: ${escapar(err.message)}</p>`;
    }
}

// ── Renderiza cards de propostas para clientes ───────────────────
function renderizarCardsPropostas(props, container) {
    const orcAberto = !orcamentoAtual || orcamentoAtual.status === 'aberto';

    container.innerHTML = props
        .map((p, i) => {
            const isRecomendado = i === 0 && p.status === 'pendente';
            const cardClass = isRecomendado ? 'prop-card featured' : 'prop-card';
            const tagRec = isRecomendado ? '<div class="prop-rec-tag">Recomendado</div>' : '';

            let botoesAcao = '';
            if (p.status === 'pendente' && orcAberto) {
                botoesAcao = `
                    <div class="prop-btns">
                        <button type="button" class="btn btn-primary" onclick="aceitarProposta('${p.id}')">
                            Agendar agora ↗
                        </button>
                        <a href="/pages/perfil-montador.html?id=${encodeURIComponent(p.montador_id)}" class="btn btn-ghost">
                            Ver perfil
                        </a>
                        <button type="button" class="btn btn-ghost" onclick="recusarProposta('${p.id}')">
                            Recusar
                        </button>
                    </div>
                `;
            } else if (p.status === 'aceita' || p.status === 'concluida') {
                botoesAcao = `
                    <div style="margin-top:14px;padding:10px 14px;background:#e8f8f0;border-radius:8px;color:#27ae60;font-weight:600;">
                        ✓ Proposta ${labelStatus(p.status).toLowerCase()}! Serviço agendado para ${formatarDataBR(p.disponibilidade)}.
                    </div>
                `;
            } else {
                botoesAcao = `
                    <div style="margin-top:14px;padding:10px 14px;background:var(--bege-fundo);border-radius:8px;color:var(--texto-claro);">
                        Status: <strong>${labelStatus(p.status)}</strong>
                    </div>
                `;
            }

            return `
                <div class="${cardClass}">
                    ${tagRec}
                    <div class="prop-top">
                        <div class="prof-info">
                            <div class="avatar av-md">${extrairIniciais(p.montador_nome)}</div>
                            <div>
                                <p class="name">${escapar(p.montador_nome)}</p>
                                <div class="prof-meta">
                                    <span class="stars-sm">★ ${Number(p.montador_nota || 5.0).toFixed(1)}</span>
                                    <span>· ${p.servicos_concluidos} serviços</span>
                                    <span class="verified">Verificado</span>
                                </div>
                            </div>
                        </div>

                        <div class="prop-price">
                            <span class="currency">R$</span>
                            <span class="amount">${Number(p.valor).toFixed(0)}</span>
                            <div class="prop-price-lbl">por serviço</div>
                        </div>
                    </div>

                    <div class="prop-chips">
                        <span class="chip">Disponível em ${formatarDataBR(p.disponibilidade)}</span>
                        <span class="chip">${labelHorario(p.horario)}</span>
                        ${p.regiao_atendimento ? `<span class="chip">${escapar(p.regiao_atendimento)}</span>` : ''}
                    </div>

                    ${p.mensagem ? `<p style="margin-top:10px;font-size:13px;color:var(--marrom-escuro);font-style:italic;">"${escapar(p.mensagem)}"</p>` : ''}

                    ${botoesAcao}
                </div>
            `;
        })
        .join('');
}

function filtrarListaPropostas(criterio) {
    const filtradas = [...propostasCarregadas];
    const c = criterio.toLowerCase();

    if (c.includes('avaliad')) {
        filtradas.sort((a, b) => (b.montador_nota || 0) - (a.montador_nota || 0));
    } else if (c.includes('menor')) {
        filtradas.sort((a, b) => a.valor - b.valor);
    } else if (c.includes('cedo')) {
        filtradas.sort((a, b) => a.disponibilidade.localeCompare(b.disponibilidade));
    }

    const lista = document.querySelector('.prop-layout > div:first-child');
    if (lista) renderizarCardsPropostas(filtradas, lista);
}

function escapar(str = '') {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
