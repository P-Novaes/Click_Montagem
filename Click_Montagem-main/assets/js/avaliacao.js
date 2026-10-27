// ================================================================
//  avaliacao.js — Avaliação de Serviço integrada ao MongoDB
// ================================================================

const labels = ['', 'Ruim', 'Regular', 'Bom', 'Muito bom', 'Excelente!'];
let mainRating = 5;
let recomValue = true;
let agendamentoAtualId = '';

const criteriosState = {
    pont: 5,
    qual: 5,
    com: 5,
    limp: 5,
};

document.addEventListener('DOMContentLoaded', async () => {
    await Sessao.sincronizar();
    if (!Sessao.logado()) {
        window.location.href = '/pages/login.html';
        return;
    }

    configurarEstrelas();

    const params = new URLSearchParams(window.location.search);
    agendamentoAtualId = params.get('agendamento_id') || '';

    if (!agendamentoAtualId) {
        try {
            const res = await API.agendamentos.listarPorCliente(Sessao.getId(), 'concluido');
            const pendenteAval = (res.agendamentos || []).find((a) => !a.avaliacao_id);
            if (pendenteAval) {
                agendamentoAtualId = pendenteAval.id;
            }
        } catch (_) {}
    }

    if (!agendamentoAtualId) {
        exibirSemAgendamentoParaAvaliar();
        return;
    }

    await carregarDadosAgendamento(agendamentoAtualId);
});

function exibirSemAgendamentoParaAvaliar() {
    const serviceCard = document.getElementById('serviceCard');
    const formSection = document.getElementById('formSection');
    if (serviceCard) serviceCard.style.display = 'none';
    if (formSection) {
        formSection.innerHTML = `
            <p class="rating-title">Nenhum serviço concluído pendente de avaliação</p>
            <p class="rating-sub" style="margin-bottom:20px;">Você poderá avaliar um montador assim que um serviço agendado for concluído.</p>
            <a href="/pages/painel-cliente.html"><button type="button" class="btn btn-primary">Voltar ao painel</button></a>
        `;
    }
}

function configurarEstrelas() {
    document.querySelectorAll('.star-btn').forEach((star) => {
        star.style.color = 'var(--dourado)';
        star.addEventListener('mouseover', () => {
            const v = +star.dataset.v;
            document
                .querySelectorAll('.star-btn')
                .forEach((s, i) => (s.style.color = i < v ? 'var(--dourado)' : 'var(--bege-fundo)'));
            const lbl = document.getElementById('starLabel');
            if (lbl) lbl.textContent = labels[v];
        });
        star.addEventListener('mouseout', () => {
            document
                .querySelectorAll('.star-btn')
                .forEach((s, i) => (s.style.color = i < mainRating ? 'var(--dourado)' : 'var(--bege-fundo)'));
            const lbl = document.getElementById('starLabel');
            if (lbl) lbl.textContent = labels[mainRating];
        });
        star.addEventListener('click', () => {
            mainRating = +star.dataset.v;
            const lbl = document.getElementById('starLabel');
            if (lbl) lbl.textContent = labels[mainRating];
        });
    });

    const starLbl = document.getElementById('starLabel');
    if (starLbl) starLbl.textContent = labels[5];

    document.querySelectorAll('.crit-stars').forEach((group) => {
        const critKey = group.dataset.crit;
        group.querySelectorAll('.crit-star').forEach((star) => {
            star.addEventListener('click', () => {
                const val = +star.dataset.v;
                if (critKey) criteriosState[critKey] = val;
                group.querySelectorAll('.crit-star').forEach((s, i) => s.classList.toggle('on', i < val));
            });
        });
    });
}

function setRecom(yes) {
    recomValue = Boolean(yes);
    const yesBtn = document.getElementById('yesBtn');
    const noBtn = document.getElementById('noBtn');
    if (yes) {
        yesBtn.className = 'btn btn-secondary';
        noBtn.className = 'btn btn-ghost';
    } else {
        yesBtn.className = 'btn btn-ghost';
        noBtn.className = 'btn btn-secondary';
    }
}

async function carregarDadosAgendamento(aid) {
    if (!aid) return;

    try {
        const res = await API.agendamentos.buscar(aid);
        const ag = res.agendamento;
        if (!ag) {
            exibirSemAgendamentoParaAvaliar();
            return;
        }

        const sc = document.getElementById('serviceCard');
        if (sc) {
            const av = sc.querySelector('.avatar');
            if (av) av.textContent = extrairIniciais(ag.montador_nome);

            const sName = sc.querySelector('.service-name');
            if (sName) sName.textContent = ag.tipo_movel;

            const sMeta = sc.querySelector('.service-meta');
            if (sMeta) {
                const dataFormatada = formatarDataBR(ag.data_servico);
                sMeta.textContent = `${ag.montador_nome} · ${dataFormatada} · R$ ${Number(ag.valor).toFixed(0)}`;
            }
        }

        if (ag.avaliacao_id) {
            const formSection = document.getElementById('formSection');
            const successCard = document.getElementById('successCard');
            if (formSection) formSection.style.display = 'none';
            if (successCard) {
                successCard.style.display = 'block';
                const title = successCard.querySelector('.success-title');
                if (title) title.textContent = 'Serviço já avaliado!';
                const sub = successCard.querySelector('.success-sub');
                if (sub) {
                    sub.textContent = `Você avaliou com ${ag.avaliacao_nota} estrela(s). Obrigado pela colaboração!`;
                }
            }
        }
    } catch (err) {
        exibirSemAgendamentoParaAvaliar();
    }
}

async function submitReview() {
    if (!agendamentoAtualId) {
        alert('Nenhum agendamento válido selecionado para avaliação.');
        return;
    }

    const comentarioEl = document.querySelector('.form-textarea');
    const comentario = comentarioEl?.value?.trim() || '';

    const btnSubmit = document.querySelector('#formSection .action-btns .btn-primary');
    const textoOriginal = btnSubmit?.innerHTML;
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando…';
    }

    try {
        await API.avaliacoes.criar({
            agendamento_id: agendamentoAtualId,
            nota: mainRating,
            comentario,
            recomenda: recomValue,
            criterios: {
                pontualidade: criteriosState.pont,
                qualidade: criteriosState.qual,
                comunicacao: criteriosState.com,
                limpeza: criteriosState.limp,
            },
        });

        const serviceCard = document.getElementById('serviceCard');
        const formSection = document.getElementById('formSection');
        const successCard = document.getElementById('successCard');

        if (serviceCard) serviceCard.style.display = 'none';
        if (formSection) formSection.style.display = 'none';
        if (successCard) successCard.style.display = 'block';
    } catch (err) {
        alert('Erro ao enviar avaliação: ' + err.message);
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = textoOriginal;
        }
    }
}
