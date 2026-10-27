// ================================================================
//  perfil-montador.js — Carregamento dinâmico do perfil público do montador
// ================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await Sessao.sincronizar();

    const params = new URLSearchParams(window.location.search);
    let montadorId = params.get('id') || '';

    if (!montadorId) {
        if (Sessao.isMontador()) {
            montadorId = Sessao.getId();
        } else {
            try {
                const resLista = await API.montadores.listar();
                if (resLista.montadores && resLista.montadores.length > 0) {
                    montadorId = resLista.montadores[0].id;
                }
            } catch (_) {}
        }
    }

    if (montadorId) {
        await carregarPerfilMontador(montadorId);
    }
});

async function carregarPerfilMontador(id) {
    try {
        const res = await API.montadores.buscar(id);
        const m = res.montador;
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
            const espPrincipal = m.especialidades
                ? m.especialidades.split(',')[0]
                : 'Profissional de Montagem';
            elSpec.textContent = `${espPrincipal} · ${m.regiao_atendimento || 'São Paulo, SP'}`;
        }

        // Preço Base
        const elPrecoVal = document.querySelector('.price-box .price-val .amount');
        if (elPrecoVal && m.preco_base) {
            elPrecoVal.textContent = Number(m.preco_base).toFixed(0);
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
            const listaEsp = m.especialidades
                .split(/[,;\n]/)
                .map((s) => s.trim())
                .filter(Boolean);
            if (listaEsp.length > 0) {
                elSpecGrid.innerHTML = listaEsp
                    .map(
                        (item) => `
                    <div class="spec-item"><div class="spec-dot"></div>${escapar(item)}</div>
                `
                    )
                    .join('');
            }
        }

        // Área de Atendimento e Disponibilidade
        const cardsDireita = document.querySelectorAll('.prop-layout > div:last-child .card');
        if (cardsDireita.length >= 2) {
            if (m.disponibilidade_geral) {
                cardsDireita[0].innerHTML = `
                    <p class="card-title">Disponibilidade geral</p>
                    <p class="card-text" style="color:var(--verde); font-weight:600;"><i class="fas fa-calendar-alt"></i> ${escapar(m.disponibilidade_geral)}</p>
                `;
            }
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
        if (elRatingCount) elRatingCount.textContent = `${m.total_avaliacoes} avaliação(ões)`;

        const tabAval = document.getElementById('tab-avaliacoes');
        if (tabAval && m.avaliacoes) {
            const cardAval = tabAval.querySelector('.card');
            if (cardAval) {
                const summary = cardAval.querySelector('.rating-summary');
                const summaryHtml = summary ? summary.outerHTML : '';

                if (m.avaliacoes.length === 0) {
                    cardAval.innerHTML =
                        summaryHtml +
                        '<p style="padding:20px;text-align:center;color:var(--texto-claro);">Este montador ainda não possui avaliações registradas.</p>';
                } else {
                    const itensHtml = m.avaliacoes
                        .map((av) => {
                            const estrelas = '★'.repeat(av.nota) + '☆'.repeat(5 - av.nota);
                            return `
                            <div class="review-item">
                                <div class="review-header">
                                    <div class="reviewer">
                                        <div class="avatar av-sm">${extrairIniciais(av.cliente_nome)}</div>
                                        <div>
                                            <div class="reviewer-name">${escapar(av.cliente_nome)}</div>
                                            <div class="reviewer-date">${formatarDataBR(av.criado_em)}</div>
                                        </div>
                                    </div>
                                    <span class="stars-sm">${estrelas}</span>
                                </div>
                                <p class="review-text">"${escapar(av.comentario || 'Serviço realizado com sucesso.')}"</p>
                                <p class="review-service">${escapar(av.tipo_movel || 'Montagem de móvel')}</p>
                            </div>
                        `;
                        })
                        .join('');
                    cardAval.innerHTML = summaryHtml + itensHtml;
                }
            }
        }

        const btnOrc = document.querySelector('.price-box a');
        if (btnOrc) {
            btnOrc.href = `/pages/orcamento.html?montador_id=${encodeURIComponent(m.id)}`;
        }
    } catch (err) {
        console.error('Erro ao carregar perfil do montador:', err);
    }
}

function calcularTempoPlataforma(dataCadastro) {
    if (!dataCadastro) return 'Recente';
    const anoCad = parseInt(String(dataCadastro).split('-')[0], 10);
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
