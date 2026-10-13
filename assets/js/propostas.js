// ================================================================
//  propostas.js — Gestão dinâmica de Propostas integrada ao MySQL
//  Caminho: htdocs/click_montagem/assets/js/propostas.js
//  Alinhado com as tabelas propostas, orcamentos, agendamentos e usuarios
// ================================================================

let propostaSelecionadaId = null;
let propostasCarregadas = [];

document.addEventListener('DOMContentLoaded', async () => {
    inicializarFiltros();
    await carregarPropostasContexto();
});

function inicializarFiltros() {
    document.querySelectorAll('.filt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filt-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filtrarListaPropostas(btn.textContent.trim());
        });
    });

    // Seleção de data no modal
    document.querySelectorAll('.date-btn:not(.past)').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });

    // Fecha modal clicando fora
    const modal = document.getElementById('scheduleModal');
    if (modal) {
        modal.addEventListener('click', e => {
            if (e.target.id === 'scheduleModal') closeModal();
        });
    }
}

// ── Modal de Confirmação de Agendamento
function openModal(propostaId) {
    propostaSelecionadaId = propostaId;
    const modal = document.getElementById('scheduleModal');
    if (modal) modal.classList.add('open');
}

function closeModal() {
    document.getElementById('scheduleModal')?.classList.remove('open');
    propostaSelecionadaId = null;
}

// ── Aceitar proposta e criar agendamento no MySQL
async function aceitarProposta(id) {
    const propId = id || propostaSelecionadaId;
    if (!propId) return;

    if (!confirm('Deseja aceitar esta proposta e confirmar o agendamento?')) return;

    try {
        const data = await API.propostas.aceitar(propId);
        closeModal();
        alert(data.mensagem || 'Proposta aceita com sucesso!');

        // Redireciona para o painel com o agendamento gerado
        window.location.href = 'painel-cliente.html';

    } catch (err) {
        alert('Erro ao aceitar proposta: ' + err.message);
    }
}

// ── Recusar proposta
async function recusarProposta(id) {
    if (!confirm('Deseja recusar esta proposta?')) return;

    try {
        const data = await API.propostas.recusar(id);
        alert(data.mensagem || 'Proposta recusada.');
        location.reload();
    } catch (err) {
        alert('Erro ao recusar proposta: ' + err.message);
    }
}

// ── Carrega propostas baseado na URL ou na sessão do usuário
async function carregarPropostasContexto() {
    const params = new URLSearchParams(window.location.search);
    let orcId = params.get('orc_id');

    // Se não tiver orc_id na URL mas o cliente estiver logado, busca o orçamento mais recente
    if (!orcId && Sessao.logado() && Sessao.isCliente()) {
        try {
            const resOrc = await API.orcamentos.listarPorCliente(Sessao.getId());
            if (resOrc.orcamentos && resOrc.orcamentos.length > 0) {
                orcId = resOrc.orcamentos[0].id;
            }
        } catch (_) {}
    }

    // Se for montador vendo a tela
    if (Sessao.isMontador()) {
        await carregarPropostasDoMontador(Sessao.getId());
        return;
    }

    if (!orcId) {
        // Fallback para o orçamento exemplo (ID 1)
        orcId = 1;
    }

    await carregarPropostasDoOrcamento(orcId);
}

// ── Carrega propostas de um orçamento para o cliente
async function carregarPropostasDoOrcamento(orcId) {
    const lista = document.querySelector('.prop-layout > div:first-child');
    if (!lista) return;

    lista.innerHTML = '<p style="text-align:center;padding:40px;color:var(--texto-claro)"><i class="fas fa-spinner fa-spin"></i> Carregando propostas…</p>';

    try {
        const [dadosOrc, dadosProp] = await Promise.all([
            API.orcamentos.buscar(orcId).catch(() => ({ orcamento: null })),
            API.propostas.listarPorOrcamento(orcId).catch(() => ({ propostas: [] })),
        ]);

        const orc   = dadosOrc.orcamento;
        const props = dadosProp.propostas || [];
        propostasCarregadas = props;

        // Atualiza cabeçalho da página
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
                    <p>Seu orçamento está aberto. Assim que montadores qualificados responderem, as propostas aparecerão aqui.</p>
                </div>`;
            return;
        }

        renderizarCardsPropostas(props, lista);

    } catch (err) {
        lista.innerHTML = `
            <div style="text-align:center;padding:40px;color:#c0392b">
                <i class="fas fa-exclamation-circle" style="font-size:2rem;margin-bottom:12px;display:block"></i>
                ${escapar(err.message)}
            </div>`;
    }
}

// ── Carrega propostas que o próprio montador enviou
async function carregarPropostasDoMontador(mid) {
    const lista = document.querySelector('.prop-layout > div:first-child');
    if (!lista) return;

    const titulo = document.querySelector('.page-title');
    if (titulo) titulo.textContent = 'Minhas Propostas Enviadas';

    const sub = document.querySelector('.page-sub');
    if (sub) sub.textContent = 'Acompanhe as propostas enviadas aos clientes e o status de cada agendamento';

    try {
        const res = await API.propostas.listarPorMontador(mid);
        const props = res.propostas || [];

        const badge = document.querySelector('.tag.tag-pend');
        if (badge) badge.textContent = `${props.length} propostas enviadas`;

        if (props.length === 0) {
            lista.innerHTML = `
                <div class="card" style="text-align:center;padding:40px;color:var(--texto-claro)">
                    <p>Você ainda não enviou propostas para orçamentos.</p>
                    <a href="painel-montador.html#solicitacoes" class="btn btn-primary" style="margin-top:14px; display:inline-block;">Ver Pedidos Abertos</a>
                </div>
            `;
            return;
        }

        lista.innerHTML = props.map(p => `
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
            </div>
        `).join('');

    } catch (err) {
        lista.innerHTML = `<p style="color:#c0392b;padding:20px;">Erro: ${escapar(err.message)}</p>`;
    }
}

// ── Renderiza cards de propostas para clientes
function renderizarCardsPropostas(props, container) {
    container.innerHTML = props.map((p, i) => {
        const isRecomendado = (i === 0 && p.status === 'pendente');
        const cardClass = isRecomendado ? 'prop-card featured' : 'prop-card';
        const tagRec = isRecomendado ? '<div class="prop-rec-tag">Recomendado</div>' : '';

        let botoesAcao = '';
        if (p.status === 'pendente') {
            botoesAcao = `
                <div class="prop-btns">
                    <button class="btn btn-primary" onclick="aceitarProposta(${p.id})">
                        Agendar agora ↗
                    </button>
                    <a href="perfil-montador.html?id=${p.montador_id}" class="btn btn-ghost">
                        Ver perfil
                    </a>
                    <button class="btn btn-ghost" onclick="recusarProposta(${p.id})">
                        Recusar
                    </button>
                </div>
            `;
        } else if (p.status === 'aceita') {
            botoesAcao = `
                <div style="margin-top:14px;padding:10px 14px;background:#e8f8f0;border-radius:8px;color:#27ae60;font-weight:600;">
                    ✓ Proposta aceita! Serviço agendado para ${formatarDataBR(p.disponibilidade)}.
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
    }).join('');
}

// ── Filtragem em memória
function filtrarListaPropostas(criterio) {
    let filtradas = [...propostasCarregadas];
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