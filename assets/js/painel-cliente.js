// ================================================================
//  painel-cliente.js — Lógica dinâmica do Painel do Cliente
//  Caminho: htdocs/click_montagem/assets/js/painel-cliente.js
//  Integração direta com: usuarios, orcamentos, propostas, agendamentos, avaliacoes.
// ================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Se não estiver logado, redireciona para login
    if (!Sessao.logado()) {
        window.location.href = '/click_montagem/pages/login.html';
        return;
    }

    const uid = Sessao.getId();
    await carregarDadosPainelCliente(uid);
});

async function carregarDadosPainelCliente(uid) {
    try {
        // Busca perfil, orçamentos e agendamentos simultaneamente
        const [perfilRes, orcRes, agendRes] = await Promise.all([
            API.usuarios.perfil(uid).catch(() => ({ usuario: { nome: Sessao.getNome() } })),
            API.orcamentos.listarPorCliente(uid).catch(() => ({ orcamentos: [] })),
            API.agendamentos.listarPorCliente(uid).catch(() => ({ agendamentos: [] })),
        ]);

        const usuario      = perfilRes.usuario || {};
        const orcamentos   = orcRes.orcamentos || [];
        const agendamentos = agendRes.agendamentos || [];

        // 1. Atualiza saudação
        const nomeCurto = (usuario.nome || Sessao.getNome()).split(' ')[0];
        const elWelcome = document.querySelector('.welcome-text');
        if (elWelcome) {
            elWelcome.innerHTML = `Olá, <em>${escapar(nomeCurto)}!</em>`;
        }

        // Calcula total de propostas pendentes de resposta
        let totalPropostasNovas = 0;
        orcamentos.forEach(o => {
            totalPropostasNovas += (o.propostas_novas || 0);
        });

        const agendadosFuturos = agendamentos.filter(a => a.status === 'agendado' || a.status === 'em_andamento');
        const concluidos       = agendamentos.filter(a => a.status === 'concluido');

        const elSub = document.querySelector('.welcome-sub');
        if (elSub) {
            elSub.textContent = `Você tem ${totalPropostasNovas} proposta(s) aguardando e ${agendadosFuturos.length} agendamento(s) ativo(s).`;
        }

        // 2. Atualiza contador no Quick Card de propostas
        const elPropSub = document.querySelector('.quick-card:nth-child(2) .qc-sub');
        if (elPropSub) {
            elPropSub.textContent = totalPropostasNovas > 0
                ? `${totalPropostasNovas} aguardando ação`
                : 'Nenhuma pendente';
        }

        // 3. Prompt de Avaliação Pendente
        const avalPendente = concluidos.find(a => !a.avaliacao_id);
        const rpCard = document.querySelector('.review-prompt');
        if (rpCard) {
            if (avalPendente) {
                rpCard.style.display = 'flex';
                const avatar = rpCard.querySelector('.avatar');
                if (avatar) avatar.textContent = extrairIniciais(avalPendente.montador_nome);
                const txt = rpCard.querySelector('.rp-text');
                if (txt) txt.textContent = `Avalie ${avalPendente.montador_nome}`;
                const sub = rpCard.querySelector('.rp-sub');
                if (sub) sub.textContent = `Serviço concluído · ${avalPendente.tipo_movel}`;
                const link = rpCard.querySelector('a');
                if (link) link.href = `avaliacao.html?agendamento_id=${avalPendente.id}`;
            } else {
                rpCard.style.display = 'none';
            }
        }

        // 4. Renderiza Próximos Agendamentos
        const containerAgend = document.getElementById('agendamentos');
        if (containerAgend) {
            const header = containerAgend.querySelector('.section-header');
            if (agendadosFuturos.length === 0) {
                containerAgend.innerHTML = '';
                if (header) containerAgend.appendChild(header);
                const vazio = document.createElement('div');
                vazio.className = 'card';
                vazio.style.padding = '30px';
                vazio.style.textAlign = 'center';
                vazio.style.color = 'var(--texto-claro)';
                vazio.innerHTML = '<p>Você não possui agendamentos no momento.</p><a href="orcamento.html" class="btn btn-primary" style="margin-top:12px; display:inline-block;">Solicitar Orçamento</a>';
                containerAgend.appendChild(vazio);
            } else {
                let html = header ? header.outerHTML : '<div class="section-header"><h2 class="section-h2">Próximos agendamentos</h2></div>';
                agendadosFuturos.forEach((ag, idx) => {
                    const dataObj = parseDataSql(ag.data_servico);
                    const tagClass = ag.status === 'em_andamento' ? 'tag-warn' : 'tag-ok';
                    html += `
                        <div class="agend-card fade-up-${(idx % 3) + 1}">
                            <div class="agend-left">
                                <div class="agend-date">
                                    <div class="agend-date-d">${dataObj.dia}</div>
                                    <div class="agend-date-m">${dataObj.mes}</div>
                                </div>
                                <div class="agend-info">
                                    <p class="agend-title">${escapar(ag.tipo_movel)}</p>
                                    <p class="agend-meta">${escapar(ag.montador_nome)} · ${labelHorario(ag.horario)} · ${escapar(ag.endereco)}</p>
                                </div>
                            </div>
                            <div class="agend-right">
                                <div class="agend-price">
                                    <span class="currency">R$</span><span class="amount">${Number(ag.valor).toFixed(0)}</span>
                                </div>
                                <span class="tag ${tagClass}">${labelStatus(ag.status)}</span>
                            </div>
                        </div>
                    `;
                });
                containerAgend.innerHTML = html;
            }
        }

        // 5. Renderiza Histórico de Serviços
        const histContainer = document.querySelector('.card:has(.hist-item)') || document.querySelector('.hist-item')?.parentElement;
        if (histContainer) {
            if (concluidos.length === 0) {
                histContainer.innerHTML = '<p style="padding:24px; text-align:center; color:var(--texto-claro);">Nenhum serviço concluído até o momento.</p>';
            } else {
                histContainer.innerHTML = concluidos.map(ag => {
                    const dataObj = parseDataSql(ag.data_servico);
                    const avalTag = ag.avaliacao_nota
                        ? `<span class="stars-sm">★ ${Number(ag.avaliacao_nota).toFixed(1)}</span>`
                        : `<a href="avaliacao.html?agendamento_id=${ag.id}" class="btn btn-ghost" style="font-size:11px; padding:4px 8px;">Avaliar</a>`;

                    return `
                        <div class="hist-item">
                            <div class="hist-left">
                                <div class="avatar av-sm">${extrairIniciais(ag.montador_nome)}</div>
                                <div class="hist-info">
                                    <p class="hist-title">${escapar(ag.tipo_movel)}</p>
                                    <p class="hist-meta">${escapar(ag.montador_nome)} · ${dataObj.dia}/${dataObj.numMes}</p>
                                </div>
                            </div>
                            <div class="hist-right">
                                <div class="hist-price">R$ ${Number(ag.valor).toFixed(0)}</div>
                                <span class="tag tag-done">Concluído</span>
                                ${avalTag}
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

    } catch (err) {
        console.error('Erro ao carregar dados do painel do cliente:', err);
    }
}

function parseDataSql(dt) {
    if (!dt) return { dia: '--', mes: '---', numMes: '--' };
    const meses = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
    const partes = dt.split('-');
    const dia = partes[2] || '01';
    const mesIndex = parseInt(partes[1] || '1', 10) - 1;
    return {
        dia,
        mes: meses[mesIndex] || '---',
        numMes: partes[1] || '01'
    };
}

function escapar(str = '') {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

