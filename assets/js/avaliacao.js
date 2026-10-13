// ================================================================
//  avaliacao.js — Avaliação de Serviço integrada ao MySQL
//  Caminho: htdocs/click_montagem/assets/js/avaliacao.js
//  Alinhado com as tabelas avaliacoes, agendamentos e notificacoes
// ================================================================

const labels = ['', 'Ruim', 'Regular', 'Bom', 'Muito bom', 'Excelente!'];
let mainRating = 5;
let agendamentoAtualId = 1;

document.addEventListener('DOMContentLoaded', async () => {
    configurarEstrelas();

    const params = new URLSearchParams(window.location.search);
    agendamentoAtualId = parseInt(params.get('agendamento_id') || '1', 10);

    await carregarDadosAgendamento(agendamentoAtualId);
});

function configurarEstrelas() {
    document.querySelectorAll('.star-btn').forEach(star => {
        star.style.color = 'var(--dourado)';
        star.addEventListener('mouseover', () => {
            const v = +star.dataset.v;
            document.querySelectorAll('.star-btn').forEach((s, i) => s.style.color = i < v ? 'var(--dourado)' : 'var(--bege-fundo)');
            const lbl = document.getElementById('starLabel');
            if (lbl) lbl.textContent = labels[v];
        });
        star.addEventListener('mouseout', () => {
            document.querySelectorAll('.star-btn').forEach((s, i) => s.style.color = i < mainRating ? 'var(--dourado)' : 'var(--bege-fundo)');
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

    document.querySelectorAll('.crit-stars').forEach(group => {
        let val = 5;
        group.querySelectorAll('.crit-star').forEach(star => {
            star.addEventListener('click', () => {
                val = +star.dataset.v;
                group.querySelectorAll('.crit-star').forEach((s, i) => s.classList.toggle('on', i < val));
            });
        });
    });
}

function setRecom(yes) {
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

// ── Carrega informações reais do agendamento
async function carregarDadosAgendamento(aid) {
    if (aid <= 0) return;

    try {
        const res = await API.agendamentos.buscar(aid);
        const ag  = res.agendamento;
        if (!ag) return;

        // Atualiza Card do serviço
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

        // Se já tiver avaliação cadastrada
        if (ag.avaliacao_id) {
            const formSection = document.getElementById('formSection');
            const successCard = document.getElementById('successCard');
            if (formSection) formSection.style.display = 'none';
            if (successCard) {
                successCard.style.display = 'block';
                const title = successCard.querySelector('.success-title');
                if (title) title.textContent = 'Serviço já avaliado!';
                const sub = successCard.querySelector('.success-sub');
                if (sub) sub.textContent = `Você avaliou com ${ag.avaliacao_nota} estrela(s). Obrigado pela colaboração!`;
            }
        }

    } catch (err) {
        console.warn('Não foi possível carregar agendamento dinâmico:', err);
    }
}

// ── Envia avaliação real para o backend MySQL
async function submitReview() {
    const comentarioEl = document.querySelector('.form-textarea');
    const comentario   = comentarioEl?.value?.trim() || '';

    const btnSubmit = document.querySelector('#formSection .action-btns .btn-primary');
    const textoOriginal = btnSubmit?.innerHTML;
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando…';
    }

    try {
        await API.avaliacoes.criar({
            agendamento_id: agendamentoAtualId,
            nota:           mainRating,
            comentario:     comentario,
            cliente_id:     Sessao.getId() || 1
        });

        // Sucesso
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