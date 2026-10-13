// ================================================================
//  painel-montador.js — Lógica dinâmica do Painel do Montador
//  Caminho: htdocs/click_montagem/assets/js/painel-montador.js
//  Alinhado com: usuarios, montadores, orcamentos, propostas, agendamentos, avaliacoes.
// ================================================================

document.addEventListener('DOMContentLoaded', async () => {
    if (!Sessao.logado()) {
        window.location.href = '/click_montagem/pages/login.html';
        return;
    }

    // Se for cliente, redireciona para o painel de cliente
    if (Sessao.isCliente()) {
        window.location.href = '/click_montagem/pages/painel-cliente.html';
        return;
    }

    const mid = Sessao.getId();
    await carregarDadosPainelMontador(mid);
});

async function carregarDadosPainelMontador(mid) {
    try {
        const [perfilRes, agendRes, abertosRes] = await Promise.all([
            API.usuarios.perfil(mid).catch(() => ({ usuario: {} })),
            API.agendamentos.listarPorMontador(mid).catch(() => ({ agendamentos: [] })),
            API.orcamentos.listarAbertos().catch(() => ({ pedidos: [] })),
        ]);

        const montador     = perfilRes.usuario || {};
        const agendamentos = agendRes.agendamentos || [];
        const pedidos      = abertosRes.pedidos || [];

        // 1. Saudação personalizada
        const nomeCurto = (montador.nome || Sessao.getNome()).split(' ')[0];
        const elTitle   = document.querySelector('.welcome-title');
        if (elTitle) {
            elTitle.innerHTML = `Bom dia, <em>${escapar(nomeCurto)}</em>`;
        }

        const agendAtivos = agendamentos.filter(a => a.status === 'agendado' || a.status === 'em_andamento');
        const elSub = document.querySelector('.welcome-sub');
        if (elSub) {
            elSub.textContent = `${pedidos.length} novos pedidos abertos · ${agendAtivos.length} agendamentos ativos`;
        }

        // 2. Cálculos financeiros reais a partir dos agendamentos
        let totalRecebido = 0;
        let totalAReceber = 0;
        let concluidosCount = 0;

        agendamentos.forEach(ag => {
            const v = Number(ag.valor) || 0;
            if (ag.status === 'concluido') {
                totalRecebido += v;
                concluidosCount++;
            } else if (ag.status === 'agendado' || ag.status === 'em_andamento') {
                totalAReceber += v;
            }
        });
        const totalGanhos = totalRecebido + totalAReceber;

        // Atualiza Cards de Métricas
        // Ganhos este mês
        const elGanhos = document.querySelector('.metric-card:nth-child(1) .amount');
        if (elGanhos) elGanhos.textContent = totalGanhos.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

        // Serviços concluídos
        const elServicos = document.querySelector('.metric-card:nth-child(2) .amount');
        if (elServicos) elServicos.textContent = concluidosCount || (montador.servicos_concluidos ?? 0);

        // Avaliação média
        const notaMedia = montador.nota_media || 5.0;
        const totalAval = montador.total_avaliacoes || 0;
        const elNota = document.querySelector('.metric-card:nth-child(3) .amount');
        if (elNota) elNota.textContent = Number(notaMedia).toFixed(1);
        const elNotaSub = document.querySelector('.metric-card:nth-child(3) .metric-sub');
        if (elNotaSub) elNotaSub.textContent = `★ ${totalAval} avaliações`;

        // 3. Card de Detalhes de Ganhos
        const elValRecebido = document.querySelector('.earn-cell:nth-child(1) .amount');
        if (elValRecebido) elValRecebido.textContent = totalRecebido.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

        const elValAReceber = document.querySelector('.earn-cell:nth-child(2) .amount');
        if (elValAReceber) elValAReceber.textContent = totalAReceber.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

        const elValTotal = document.querySelector('.earn-cell:nth-child(3) .amount');
        if (elValTotal) elValTotal.textContent = totalGanhos.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

        const pctRecebido = totalGanhos > 0 ? Math.round((totalRecebido / totalGanhos) * 100) : 100;
        const elProgressFill = document.querySelector('.progress-fill');
        if (elProgressFill) elProgressFill.style.width = `${pctRecebido}%`;
        const elProgressText = document.querySelector('.progress-text');
        if (elProgressText) elProgressText.textContent = `${pctRecebido}% do valor já liberado`;

        // 4. Novos Pedidos Abertos (Orçamentos disponíveis no banco)
        renderizarNovosPedidos(pedidos, mid);

        // 5. Agenda da Semana (Sidebar)
        renderizarAgendaSidebar(agendAtivos);

        // 6. Atualizar Mini Card do Perfil na Sidebar
        const profileMiniName = document.querySelector('.profile-name');
        if (profileMiniName) profileMiniName.textContent = montador.nome || Sessao.getNome();
        const profileMiniMeta = document.querySelector('.profile-meta');
        if (profileMiniMeta) profileMiniMeta.textContent = `★ ${Number(notaMedia).toFixed(1)} · ${concluidosCount || (montador.servicos_concluidos ?? 0)} serviços`;
        const profileMiniAv = document.querySelector('.profile-mini .avatar');
        if (profileMiniAv) profileMiniAv.textContent = extrairIniciais(montador.nome || Sessao.getNome());

        // Link para o perfil público com o ID correto
        const btnPerfilPub = document.querySelector('.profile-mini + a');
        if (btnPerfilPub) btnPerfilPub.href = `perfil-montador.html?id=${mid}`;

    } catch (err) {
        console.error('Erro ao carregar dados do painel do montador:', err);
    }
}

// ── Renderiza lista de solicitações abertas
function renderizarNovosPedidos(pedidos, mid) {
    const container = document.getElementById('solicitacoes');
    if (!container) return;

    const header = container.querySelector('.section-header');
    const badge = header?.querySelector('.tag');
    if (badge) badge.textContent = `${pedidos.length} disponível(is)`;

    if (pedidos.length === 0) {
        container.innerHTML = (header ? header.outerHTML : '') + `
            <div class="card" style="padding:32px; text-align:center; color:var(--texto-claro)">
                <i class="fas fa-check-circle" style="font-size:2rem; margin-bottom:12px; color:var(--verde);"></i>
                <p>Nenhuma nova solicitação aberta no momento. Volte em breve!</p>
            </div>
        `;
        return;
    }

    let html = header ? header.outerHTML : '<div class="section-header"><h2 class="section-h2">Novos pedidos</h2></div>';

    pedidos.forEach((p, idx) => {
        const local = p.bairro ? `${p.bairro}` : (p.cep ? `CEP ${p.cep}` : 'Local a combinar');
        const horarioStr = labelHorario(p.horario);
        const precoDisplay = p.preco_estimado ? p.preco_estimado.replace('R$', '').trim() : 'A combinar';

        html += `
            <div class="req-card fade-up-${(idx % 3) + 1}" id="pedido-${p.id}">
                <div class="req-top">
                    <div>
                        <p class="req-title">${escapar(p.tipo_movel)}</p>
                        <p class="req-meta">${escapar(p.cliente_nome)} · ${escapar(local)} · ${horarioStr}</p>
                    </div>
                    <div class="req-price">
                        <span class="currency">R$</span><span class="amount">${escapar(precoDisplay)}</span>
                    </div>
                </div>
                <div class="req-btns">
                    <button class="btn btn-primary" onclick="abrirModalProposta(${p.id}, '${escapar(p.tipo_movel)}')">
                        <i class="fas fa-paper-plane"></i> Enviar Proposta
                    </button>
                    <button class="btn btn-ghost" onclick="ignorarPedido(${p.id})">Ignorar</button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// ── Modal de Envio de Proposta pelo Montador
async function abrirModalProposta(orcId, tipoMovel) {
    const valorStr = prompt(`Digite o valor (R$) da sua proposta para "${tipoMovel}":`, '150');
    if (!valorStr) return;

    const valor = parseFloat(valorStr.replace(',', '.'));
    if (isNaN(valor) || valor <= 0) {
        alert('Por favor, informe um valor numérico válido.');
        return;
    }

    // Pede a data
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);
    const dataPadrao = amanha.toISOString().split('T')[0];

    const dataDisp = prompt('Informe a data de disponibilidade (AAAA-MM-DD):', dataPadrao);
    if (!dataDisp) return;

    const mensagem = prompt('Mensagem ou diferencial (opcional):', 'Tenho disponibilidade e ferramentas inclusas.');

    try {
        const res = await API.propostas.criar({
            orcamento_id:   orcId,
            montador_id:    Sessao.getId(),
            valor:          valor,
            disponibilidade: dataDisp,
            horario:        'manha',
            mensagem:       mensagem || ''
        });

        alert(res.mensagem || 'Proposta enviada com sucesso!');

        // Atualiza card do pedido
        const card = document.getElementById(`pedido-${orcId}`);
        if (card) {
            const btns = card.querySelector('.req-btns');
            if (btns) btns.innerHTML = '<span class="tag tag-ok" style="padding:8px 16px;">✓ Proposta enviada</span>';
        }

    } catch (err) {
        alert('Erro ao enviar proposta: ' + err.message);
    }
}

function ignorarPedido(id) {
    const card = document.getElementById(`pedido-${id}`);
    if (card) card.style.display = 'none';
}

// ── Renderiza Agenda na Sidebar
function renderizarAgendaSidebar(agendamentos) {
    const cardAgenda = document.querySelector('.sidebar-sticky .card:first-child');
    if (!cardAgenda) return;

    const diasSemana = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];

    if (agendamentos.length === 0) {
        cardAgenda.innerHTML = `
            <p class="card-title">Agenda da semana</p>
            <p style="padding:20px 0; font-size:13px; color:var(--texto-claro); text-align:center;">
                Nenhum agendamento ativo esta semana.
            </p>
            <a href="agenda.html"><button class="btn btn-ghost btn-full" style="margin-top:8px;">Ver agenda completa ↗</button></a>
        `;
        return;
    }

    let itemsHtml = '';
    agendamentos.slice(0, 4).forEach((ag) => {
        const d = new Date(ag.data_servico + 'T12:00:00');
        const diaSem = diasSemana[d.getDay()] || 'DIA';
        const diaNum = d.getDate();

        itemsHtml += `
            <div class="slot-item">
                <div class="slot-day">
                    <div class="slot-wk">${diaSem}</div>
                    <div class="slot-num">${diaNum}</div>
                </div>
                <div class="slot-body">
                    <p class="slot-title">${escapar(ag.tipo_movel)} — ${escapar(ag.cliente_nome)}</p>
                    <p class="slot-meta">${labelHorario(ag.horario)} · ${escapar(ag.endereco || 'A combinar')}</p>
                </div>
                <span class="tag tag-ok">${labelStatus(ag.status)}</span>
            </div>
        `;
    });

    cardAgenda.innerHTML = `
        <p class="card-title">Agenda da semana</p>
        ${itemsHtml}
        <a href="agenda.html"><button class="btn btn-ghost btn-full" style="margin-top:8px;">Ver agenda completa ↗</button></a>
    `;
}

function escapar(str = '') {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

