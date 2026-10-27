// ================================================================
//  agenda.js — Gestão dinâmica da Agenda integrada ao MongoDB
// ================================================================

let todosAgendamentos = [];
let filtroAtual = 'todos';

document.addEventListener('DOMContentLoaded', async () => {
    await Sessao.sincronizar();
    if (!Sessao.logado()) {
        window.location.href = '/pages/login.html';
        return;
    }

    inicializarFiltros();
    await carregarAgenda();
});

function inicializarFiltros() {
    document.querySelectorAll('.filter-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            filtroAtual = btn.textContent.trim().toLowerCase();
            aplicarFiltro();
        });
    });

    document.querySelectorAll('.cal-day:not(.empty):not(.past)').forEach((d) => {
        d.addEventListener('click', () => {
            document.querySelectorAll('.cal-day').forEach((x) => x.classList.remove('selected'));
            d.classList.add('selected');
        });
    });
}

async function carregarAgenda() {
    const uid = Sessao.getId();
    const isMont = Sessao.isMontador();

    try {
        const res = isMont
            ? await API.agendamentos.listarPorMontador(uid)
            : await API.agendamentos.listarPorCliente(uid);

        todosAgendamentos = res.agendamentos || [];

        atualizarMetricasAgenda(todosAgendamentos);
        atualizarSidebarAgenda(todosAgendamentos);
        renderizarEventosAgenda(todosAgendamentos);
    } catch (err) {
        console.error('Erro ao carregar agenda:', err);
    }
}

function atualizarMetricasAgenda(agends) {
    const ativos = agends.filter((a) => a.status === 'agendado' || a.status === 'em_andamento');
    const pendentes = agends.filter((a) => a.status === 'agendado');
    const concluidos = agends.filter((a) => a.status === 'concluido');

    const pageSub = document.querySelector('.page-sub');
    if (pageSub) {
        pageSub.textContent = `${agends.length} agendamento(s) registrado(s) · ${ativos.length} ativo(s)`;
    }

    const m1 = document.querySelector('.metric-card:nth-child(1) .amount');
    if (m1) m1.textContent = ativos.length;

    const m2 = document.querySelector('.metric-card:nth-child(2) .amount');
    if (m2) m2.textContent = pendentes.length;

    const m3 = document.querySelector('.metric-card:nth-child(3) .amount');
    if (m3) m3.textContent = concluidos.length;

    const proximo = ativos[0];
    const m4 = document.querySelector('.metric-card:nth-child(4) .amount');
    const m4Sub = document.querySelector('.metric-card:nth-child(4) .metric-sub');
    if (proximo && m4 && m4Sub) {
        const [, mes, dia] = proximo.data_servico.split('-');
        m4.textContent = `${dia}/${mes}`;
        const contato = Sessao.isMontador() ? proximo.cliente_nome : proximo.montador_nome;
        m4Sub.textContent = `${labelHorario(proximo.horario)} · ${contato.split(' ')[0]}`;
    } else if (m4 && m4Sub) {
        m4.textContent = '—';
        m4Sub.textContent = 'Nenhum próximo agendamento';
    }
}

function atualizarSidebarAgenda(agends) {
    const ativos = agends.filter((a) => a.status === 'agendado' || a.status === 'em_andamento');
    const mesesAbrev = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

    // Atualiza lista "Próximos agendamentos" na sidebar
    const sidebarCards = document.querySelectorAll('.sidebar-sticky .card');
    if (sidebarCards.length >= 2) {
        const cardProx = sidebarCards[1];
        if (ativos.length === 0) {
            cardProx.innerHTML = `
                <p class="card-title">Próximos agendamentos</p>
                <p style="font-size:13px;color:var(--texto-claro);padding:12px 0;text-align:center;">Nenhum agendamento pendente.</p>
            `;
        } else {
            cardProx.innerHTML =
                `<p class="card-title">Próximos agendamentos</p>` +
                ativos
                    .slice(0, 5)
                    .map((ag) => {
                        const partes = String(ag.data_servico).split('-');
                        const dia = partes[2] || '01';
                        const mesIdx = parseInt(partes[1] || '1', 10) - 1;
                        const mesStr = mesesAbrev[mesIdx] || 'MÊS';
                        const outroNome = Sessao.isMontador() ? ag.cliente_nome : ag.montador_nome;
                        return `
                            <div class="ev-mini">
                                <div class="ev-dc">
                                    <div class="ev-d">${dia}</div>
                                    <div class="ev-m">${mesStr}</div>
                                </div>
                                <div class="ev-info">
                                    <div class="ev-n">${escapar(ag.tipo_movel)}</div>
                                    <div class="ev-mt">${escapar(outroNome)} · ${labelHorario(ag.horario)}</div>
                                </div>
                                <span class="tag tag-ok">${labelStatus(ag.status)}</span>
                            </div>
                        `;
                    })
                    .join('');
        }
    }

    // Atualiza box de "Ganhos previstos" na sidebar
    const earnAmount = document.querySelector('.earn-box .earn-val .amount');
    if (earnAmount) {
        const somaPrevista = ativos.reduce((acc, a) => acc + (Number(a.valor) || 0), 0);
        earnAmount.textContent = somaPrevista.toLocaleString('pt-BR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        });
    }
}

function renderizarEventosAgenda(agends) {
    const calCard = document.querySelector('.cal-card');
    const container = calCard ? calCard.parentElement : document.querySelector('.prop-layout > div:first-child');
    if (!container) return;

    container.querySelectorAll('.week-row, .section-label, .agenda-empty-card').forEach((el) => el.remove());

    if (agends.length === 0) {
        const divVazio = document.createElement('div');
        divVazio.className = 'card agenda-empty-card';
        divVazio.style.padding = '40px';
        divVazio.style.textAlign = 'center';
        divVazio.style.color = 'var(--texto-claro)';
        divVazio.innerHTML =
            '<i class="fas fa-calendar-check" style="font-size:2rem;margin-bottom:12px;display:block"></i>Nenhum agendamento encontrado para este filtro.';
        container.appendChild(divVazio);
        return;
    }

    const diasSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    const agendPorData = {};
    agends.forEach((a) => {
        if (!agendPorData[a.data_servico]) agendPorData[a.data_servico] = [];
        agendPorData[a.data_servico].push(a);
    });

    Object.keys(agendPorData)
        .sort()
        .forEach((dt) => {
            const d = new Date(dt + 'T12:00:00');
            const diaSem = diasSemana[d.getDay()] || 'DIA';
            const diaNum = dt.split('-')[2] || '01';

            const row = document.createElement('div');
            row.className = 'week-row';

            let eventosHtml = '';
            agendPorData[dt].forEach((ag) => {
                const outroNome = Sessao.isMontador() ? ag.cliente_nome : ag.montador_nome;
                const tagClass =
                    ag.status === 'concluido'
                        ? 'tag-done'
                        : ag.status === 'em_andamento'
                        ? 'tag-warn'
                        : 'tag-ok';

                let acoes = '';
                if (ag.status !== 'concluido' && ag.status !== 'cancelado') {
                    if (Sessao.isMontador()) {
                        acoes = `
                            <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
                                <button type="button" class="btn btn-primary" style="font-size:11px; padding:4px 10px;" onclick="atualizarStatusAgendamento('${ag.id}', 'concluido')">
                                    ✓ Marcar como Concluído
                                </button>
                                <button type="button" class="btn btn-ghost" style="font-size:11px; padding:4px 10px;" onclick="atualizarStatusAgendamento('${ag.id}', 'cancelado')">
                                    Cancelar
                                </button>
                            </div>
                        `;
                    } else {
                        acoes = `
                            <div style="margin-top:8px; display:flex; gap:6px;">
                                <button type="button" class="btn btn-ghost" style="font-size:11px; padding:4px 10px;" onclick="atualizarStatusAgendamento('${ag.id}', 'cancelado')">
                                    Cancelar agendamento
                                </button>
                            </div>
                        `;
                    }
                }

                eventosHtml += `
                    <div class="wev active" style="margin-bottom:8px;" data-status="${ag.status}">
                        <div>
                            <div class="wev-title">${escapar(ag.tipo_movel)} — ${escapar(outroNome)}</div>
                            <div class="wev-meta"><i class="fas fa-map-marker-alt"></i> ${escapar(ag.endereco || 'Endereço a combinar')}</div>
                            ${acoes}
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
        filtrados = todosAgendamentos.filter((a) => a.status === 'agendado');
    } else if (filtroAtual.includes('conclu')) {
        filtrados = todosAgendamentos.filter((a) => a.status === 'concluido');
    } else if (filtroAtual.includes('pendent')) {
        filtrados = todosAgendamentos.filter(
            (a) => a.status === 'agendado' || a.status === 'em_andamento'
        );
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

async function adicionarDisponibilidade() {
    const usuario = Sessao.getUsuario();
    const dispAtual = usuario.disponibilidade_geral || 'Segunda a Sábado - Manhã e Tarde';
    const novaDisp = prompt('Informe sua disponibilidade geral de atendimento:', dispAtual);
    if (!novaDisp || !novaDisp.trim()) return;

    try {
        await API.montadores.atualizar(Sessao.getId(), {
            nome: Sessao.getNome(),
            telefone: Sessao.getTelefone(),
            disponibilidade_geral: novaDisp.trim(),
        });

        const toast = document.getElementById('toastDisp');
        const txt = document.getElementById('toastDispText');
        if (txt) txt.textContent = `Disponibilidade atualizada: ${novaDisp.trim()}`;
        if (toast) {
            toast.style.display = 'block';
            setTimeout(() => {
                toast.style.display = 'none';
            }, 3000);
        }
    } catch (err) {
        alert('Erro ao salvar disponibilidade: ' + err.message);
    }
}

function escapar(str = '') {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
