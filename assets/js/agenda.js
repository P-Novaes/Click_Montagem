// ================================================================
//  agenda.js — Gestão dinâmica da Agenda integrada ao banco de dados
//  Caminho: htdocs/click_montagem/assets/js/agenda.js
//  Alinhado com a tabela agendamentos, usuarios, orcamentos e propostas
// ================================================================

let todosAgendamentos = [];
let filtroAtual = 'todos';

document.addEventListener('DOMContentLoaded', async () => {
    if (!Sessao.logado()) {
        window.location.href = '/click_montagem/pages/login.html';
        return;
    }

    inicializarFiltros();
    await carregarAgenda();
});

function inicializarFiltros() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filtroAtual = btn.textContent.trim().toLowerCase();
            aplicarFiltro();
        });
    });

    document.querySelectorAll('.cal-day:not(.empty):not(.past)').forEach(d => {
        d.addEventListener('click', () => {
            document.querySelectorAll('.cal-day').forEach(x => x.classList.remove('selected'));
            d.classList.add('selected');
        });
    });
}

async function carregarAgenda() {
    const uid    = Sessao.getId();
    const isMont = Sessao.isMontador();

    try {
        const res = isMont
            ? await API.agendamentos.listarPorMontador(uid)
            : await API.agendamentos.listarPorCliente(uid);

        todosAgendamentos = res.agendamentos || [];

        atualizarMetricasAgenda(todosAgendamentos);
        renderizarEventosAgenda(todosAgendamentos);

    } catch (err) {
        console.error('Erro ao carregar agenda:', err);
    }
}

// ── Atualiza Cards de Métricas da Agenda
function atualizarMetricasAgenda(agends) {
    const ativos     = agends.filter(a => a.status === 'agendado' || a.status === 'em_andamento');
    const pendentes  = agends.filter(a => a.status === 'agendado');
    const concluidos = agends.filter(a => a.status === 'concluido');

    // Esta semana
    const m1 = document.querySelector('.metric-card:nth-child(1) .amount');
    if (m1) m1.textContent = ativos.length;

    // Pendentes
    const m2 = document.querySelector('.metric-card:nth-child(2) .amount');
    if (m2) m2.textContent = pendentes.length;

    // Concluídos
    const m3 = document.querySelector('.metric-card:nth-child(3) .amount');
    if (m3) m3.textContent = concluidos.length;

    // Próximo
    const proximo = ativos[0];
    const m4 = document.querySelector('.metric-card:nth-child(4) .amount');
    const m4Sub = document.querySelector('.metric-card:nth-child(4) .metric-sub');
    if (proximo && m4 && m4Sub) {
        const [ano, mes, dia] = proximo.data_servico.split('-');
        m4.textContent = `${dia}/${mes}`;
        const contato = Sessao.isMontador() ? proximo.cliente_nome : proximo.montador_nome;
        m4Sub.textContent = `${labelHorario(proximo.horario)} · ${contato.split(' ')[0]}`;
    } else if (m4 && m4Sub) {
        m4.textContent = '—';
        m4Sub.textContent = 'Nenhum próximo agendamento';
    }
}

// ── Renderiza lista de agendamentos na semana
function renderizarEventosAgenda(agends) {
    const container = document.querySelector('.week-row')?.parentElement;
    if (!container) return;

    // Remove linhas de exemplo estáticas
    document.querySelectorAll('.week-row, .section-label').forEach(el => el.remove());

    if (agends.length === 0) {
        const divVazio = document.createElement('div');
        divVazio.className = 'card';
        divVazio.style.padding = '40px';
        divVazio.style.textAlign = 'center';
        divVazio.style.color = 'var(--texto-claro)';
        divVazio.innerHTML = '<i class="fas fa-calendar-check" style="font-size:2rem;margin-bottom:12px;display:block"></i>Nenhum agendamento encontrado para este período.';
        container.appendChild(divVazio);
        return;
    }

    const diasSemana = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];

    // Agrupa por data
    const agendPorData = {};
    agends.forEach(a => {
        if (!agendPorData[a.data_servico]) agendPorData[a.data_servico] = [];
        agendPorData[a.data_servico].push(a);
    });

    Object.keys(agendPorData).sort().forEach(dt => {
        const d = new Date(dt + 'T12:00:00');
        const diaSem = diasSemana[d.getDay()] || 'DIA';
        const diaNum = dt.split('-')[2] || '01';

        const row = document.createElement('div');
        row.className = 'week-row';

        let eventosHtml = '';
        agendPorData[dt].forEach(ag => {
            const outroNome = Sessao.isMontador() ? ag.cliente_nome : ag.montador_nome;
            const tagClass = ag.status === 'concluido' ? 'tag-done' : (ag.status === 'em_andamento' ? 'tag-warn' : 'tag-ok');

            let acoesMontador = '';
            if (Sessao.isMontador() && ag.status !== 'concluido' && ag.status !== 'cancelado') {
                acoesMontador = `
                    <div style="margin-top:8px; display:flex; gap:6px;">
                        <button class="btn btn-primary" style="font-size:11px; padding:4px 10px;" onclick="atualizarStatusAgendamento(${ag.id}, 'concluido')">
                            ✓ Marcar como Concluído
                        </button>
                        <button class="btn btn-ghost" style="font-size:11px; padding:4px 10px;" onclick="atualizarStatusAgendamento(${ag.id}, 'cancelado')">
                            Cancelar
                        </button>
                    </div>
                `;
            }

            eventosHtml += `
                <div class="wev active" style="margin-bottom:8px;" data-status="${ag.status}">
                    <div>
                        <div class="wev-title">${escapar(ag.tipo_movel)} — ${escapar(outroNome)}</div>
                        <div class="wev-meta"><i class="fas fa-map-marker-alt"></i> ${escapar(ag.endereco || 'Endereço a combinar')}</div>
                        ${acoesMontador}
                    </div>
                    <div class="wev-right">
                        <div class="wev-time">${labelHorario(ag.horario)}</div>
                        <div class="wev-price">
                            <span class="currency">R$</span><span class="amount">${Number(ag.valor).toFixed(0)}</span>
                        </div>
                        <span class="tag ${tagClass}">${labelStatus(ag.status)}</span>
                    </div>
                </div>
            `;
        });

        row.innerHTML = `
            <div class="wday-col">
                <div class="wday-name on">${diaSem}</div>
                <div class="wday-num on">${diaNum}</div>
            </div>
            <div class="wevents">
                ${eventosHtml}
            </div>
        `;

        container.appendChild(row);
    });
}

function aplicarFiltro() {
    let filtrados = todosAgendamentos;
    if (filtroAtual.includes('confirm')) {
        filtrados = todosAgendamentos.filter(a => a.status === 'agendado');
    } else if (filtroAtual.includes('conclu')) {
        filtrados = todosAgendamentos.filter(a => a.status === 'concluido');
    } else if (filtroAtual.includes('pendent')) {
        filtrados = todosAgendamentos.filter(a => a.status === 'agendado' || a.status === 'em_andamento');
    }
    renderizarEventosAgenda(filtrados);
}

async function atualizarStatusAgendamento(id, novoStatus) {
    const acaoLabel = novoStatus === 'concluido' ? 'marcar como concluído' : 'cancelar';
    if (!confirm(`Deseja realmente ${acaoLabel} este serviço?`)) return;

    try {
        const res = await API.agendamentos.status(id, novoStatus);
        alert(res.mensagem || 'Status atualizado com sucesso!');
        await carregarAgenda();
    } catch (err) {
        alert('Erro ao atualizar status: ' + err.message);
    }
}

function escapar(str = '') {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}