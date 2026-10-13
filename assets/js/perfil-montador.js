// ================================================================
//  perfil-montador.js — Carregamento dinâmico do perfil do montador
//  Caminho: htdocs/click_montagem/assets/js/perfil-montador.js
//  Integração com a tabela montadores, usuarios e avaliacoes
// ================================================================

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    let montadorId = parseInt(params.get('id') || '0', 10);

    // Se nenhum ID for passado, tenta o montador logado ou o primeiro montador da base (ID 2 Marcos Oliveira)
    if (montadorId <= 0) {
        if (Sessao.isMontador()) {
            montadorId = Sessao.getId();
        } else {
            montadorId = 2; // Marcos Oliveira no seed do banco
        }
    }

    await carregarPerfilMontador(montadorId);
});

async function carregarPerfilMontador(id) {
    try {
        const res = await API.montadores.buscar(id);
        const m   = res.montador;
        if (!m) return;

        // 1. Breadcrumb e Título
        const elBc = document.querySelector('.breadcrumb-active');
        if (elBc) elBc.textContent = m.nome;
        document.title = `${m.nome} — Click Montagem`;

        // 2. Avatar e Nome
        const elAv = document.querySelector('.profile-top .avatar');
        if (elAv) elAv.textContent = extrairIniciais(m.nome);

        const elNome = document.querySelector('.profile-name');
        if (elNome) elNome.textContent = m.nome;

        const elSpec = document.querySelector('.profile-spec');
        if (elSpec) {
            const espPrincipal = m.especialidades ? m.especialidades.split(',')[0] : 'Profissional de Montagem';
            elSpec.textContent = `${espPrincipal} · ${m.regiao_atendimento || 'São Paulo, SP'}`;
        }

        // 3. Estatísticas Hero
        const statsNodes = document.querySelectorAll('.profile-stats .pstat-n');
        if (statsNodes.length >= 4) {
            statsNodes[0].textContent = `★ ${Number(m.nota_media).toFixed(1)}`;
            statsNodes[1].textContent = m.total_servicos;
            statsNodes[2].textContent = `${m.satisfacao}%`;
            statsNodes[3].textContent = calcularTempoPlataforma(m.criado_em);
        }

        // 4. Tab Sobre
        const elDesc = document.querySelector('#tab-sobre .card:first-child .card-text');
        if (elDesc && m.descricao_profissional) {
            elDesc.textContent = m.descricao_profissional;
        }

        // Especialidades Grid
        const elSpecGrid = document.querySelector('.spec-grid');
        if (elSpecGrid && m.especialidades) {
            const listaEsp = m.especialidades.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
            if (listaEsp.length > 0) {
                elSpecGrid.innerHTML = listaEsp.map(item => `
                    <div class="spec-item"><div class="spec-dot"></div>${escapar(item)}</div>
                `).join('');
            }
        }

        // Área de Atendimento e Disponibilidade
        const cardsDireita = document.querySelectorAll('.prop-layout > div:last-child .card');
        if (cardsDireita.length >= 2) {
            // Card de Disponibilidade
            if (m.disponibilidade_geral) {
                const subDisp = cardsDireita[0].querySelector('.card-title');
                if (subDisp) {
                    cardsDireita[0].innerHTML = `
                        <p class="card-title">Disponibilidade geral</p>
                        <p class="card-text" style="color:var(--verde); font-weight:600;"><i class="fas fa-calendar-alt"></i> ${escapar(m.disponibilidade_geral)}</p>
                    `;
                }
            }
            // Card de Região de atendimento
            const cardArea = cardsDireita[1];
            if (cardArea && m.regiao_atendimento) {
                const txt = cardArea.querySelector('.card-text');
                if (txt) txt.textContent = m.regiao_atendimento;
            }
        }

        // 5. Tab Avaliações
        const elTabAval = document.querySelector('.tab-item:nth-child(2)');
        if (elTabAval) {
            elTabAval.textContent = `Avaliações (${m.total_avaliacoes})`;
        }

        const elRatingNum = document.querySelector('.rating-number');
        if (elRatingNum) elRatingNum.textContent = Number(m.nota_media).toFixed(1);

        const elRatingCount = document.querySelector('.rating-count');
        if (elRatingCount) elRatingCount.textContent = `${m.total_avaliacoes} avaliações`;

        // Renderiza avaliações reais
        const tabAval = document.getElementById('tab-avaliacoes');
        if (tabAval && m.avaliacoes) {
            const containerRev = tabAval.querySelector('.reviews-list') || tabAval.querySelector('.card:last-child');
            if (containerRev) {
                if (m.avaliacoes.length === 0) {
                    containerRev.innerHTML = '<p style="padding:20px;text-align:center;color:var(--texto-claro);">Este montador ainda não possui avaliações registradas.</p>';
                } else {
                    containerRev.innerHTML = m.avaliacoes.map(av => {
                        const estrelas = '★'.repeat(av.nota) + '☆'.repeat(5 - av.nota);
                        return `
                            <div class="review-item" style="border-bottom:1px solid var(--borda); padding:16px 0;">
                                <div class="review-top" style="display:flex; justify-content:space-between; align-items:center;">
                                    <div style="display:flex; gap:10px; align-items:center;">
                                        <div class="avatar av-sm">${extrairIniciais(av.cliente_nome)}</div>
                                        <div>
                                            <strong>${escapar(av.cliente_nome)}</strong>
                                            <div style="font-size:12px; color:var(--texto-claro);">${formatarDataBR(av.criado_em.split(' ')[0])}</div>
                                        </div>
                                    </div>
                                    <div style="color:var(--dourado); font-size:14px;">${estrelas}</div>
                                </div>
                                <p style="margin-top:8px; font-size:14px; line-height:1.5;">${escapar(av.comentario || 'Serviço realizado com sucesso.')}</p>
                            </div>
                        `;
                    }).join('');
                }
            }
        }

        // Link de solicitação com o ID do montador
        const btnOrc = document.querySelector('.price-box a');
        if (btnOrc) {
            btnOrc.href = `orcamento.html?montador_id=${m.id}`;
        }

    } catch (err) {
        console.error('Erro ao carregar perfil do montador:', err);
    }
}

function calcularTempoPlataforma(dataCadastro) {
    if (!dataCadastro) return '1 ano';
    const anoCad = parseInt(dataCadastro.split('-')[0], 10);
    const anoAtual = new Date().getFullYear();
    const dif = anoAtual - anoCad;
    if (dif <= 0) return 'Recente';
    return `${dif} ${dif === 1 ? 'ano' : 'anos'}`;
}

function escapar(str = '') {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

