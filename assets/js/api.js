// ================================================================
//  api.js — Módulo central de integração com o backend PHP
//  Caminho: htdocs/click_montagem/assets/js/api.js
//  Alinhado 100% com as 7 tabelas do banco de dados MySQL:
//  usuarios, montadores, orcamentos, propostas, agendamentos, avaliacoes, notificacoes.
// ================================================================

const API_BASE = '/click_montagem/api';

// ── Requisição Genérica ──────────────────────────────────────────
async function apiFetch(endpoint, { method = 'GET', body = null } = {}) {
    const opcoes = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) opcoes.body = JSON.stringify(body);

    try {
        const res = await fetch(`${API_BASE}/${endpoint}`, opcoes);
        const data = await res.json().catch(() => ({
            sucesso: false,
            erro: 'Resposta inválida do servidor.',
        }));

        if (!res.ok) throw new Error(data.erro || `Erro HTTP ${res.status}`);
        return data;

    } catch (err) {
        if (err.name === 'TypeError') {
            throw new Error('Não foi possível conectar ao servidor. Verifique se o Apache e MySQL do XAMPP estão ativos.');
        }
        throw err;
    }
}

// ── Objeto Principal API ─────────────────────────────────────────
const API = {
    // ── 1. USUÁRIOS
    usuarios: {
        cadastrar:      (dados) => apiFetch('usuarios.php?action=cadastrar', { method: 'POST', body: dados }),
        login:          (dados) => apiFetch('usuarios.php?action=login', { method: 'POST', body: dados }),
        perfil:         (id) => apiFetch(`usuarios.php?action=perfil&id=${id}`),
        atualizar:      (id, dados) => apiFetch(`usuarios.php?action=atualizar&id=${id}`, { method: 'POST', body: dados }),
        alterarSenha:   (id, dados) => apiFetch(`usuarios.php?action=alterar_senha&id=${id}`, { method: 'POST', body: dados }),
        recuperarSenha: (email) => apiFetch('usuarios.php?action=recuperar_senha', { method: 'POST', body: { email } }),
        redefinirSenha: (email, novaSenha) => apiFetch('usuarios.php?action=redefinir_senha', { method: 'POST', body: { email, nova_senha: novaSenha } }),
        deletar:        (id) => apiFetch(`usuarios.php?action=deletar&id=${id}`, { method: 'POST' }),
    },

    // ── 2. MONTADORES
    montadores: {
        listar:    (busca = '') => apiFetch(`montadores.php?action=listar${busca ? '&busca=' + encodeURIComponent(busca) : ''}`),
        buscar:    (id) => apiFetch(`montadores.php?action=buscar&id=${id}`),
        atualizar: (id, dados) => apiFetch(`montadores.php?action=atualizar&id=${id}`, { method: 'POST', body: dados }),
    },

    // ── 3. ORÇAMENTOS
    orcamentos: {
        criar:            (dados) => apiFetch('orcamentos.php?action=criar', { method: 'POST', body: dados }),
        listarPorCliente: (uid) => apiFetch(`orcamentos.php?action=listar&uid=${uid}`),
        listarAbertos:    () => apiFetch('orcamentos.php?action=listar_abertos'),
        buscar:           (id) => apiFetch(`orcamentos.php?action=buscar&id=${id}`),
        status:           (id, s) => apiFetch(`orcamentos.php?action=status&id=${id}`, { method: 'POST', body: { status: s } }),
        deletar:          (id) => apiFetch(`orcamentos.php?action=deletar&id=${id}`, { method: 'POST' }),
    },

    // ── 4. PROPOSTAS
    propostas: {
        listarPorOrcamento: (orcId) => apiFetch(`propostas.php?action=listar&orc_id=${orcId}`),
        listarPorMontador:  (mid) => apiFetch(`propostas.php?action=listar_montador&mid=${mid}`),
        criar:              (dados) => apiFetch('propostas.php?action=criar', { method: 'POST', body: dados }),
        aceitar:            (id, endereco = '') => apiFetch(`propostas.php?action=aceitar&id=${id}`, { method: 'POST', body: { endereco } }),
        recusar:            (id) => apiFetch(`propostas.php?action=recusar&id=${id}`, { method: 'POST' }),
        deletar:            (id) => apiFetch(`propostas.php?action=deletar&id=${id}`, { method: 'POST' }),
    },

    // ── 5. AGENDAMENTOS
    agendamentos: {
        listarPorCliente:  (cid, status = '') => apiFetch(`agendamentos.php?action=listar&cliente_id=${cid}${status ? '&status=' + status : ''}`),
        listarPorMontador: (mid, status = '') => apiFetch(`agendamentos.php?action=listar&montador_id=${mid}${status ? '&status=' + status : ''}`),
        buscar:            (id) => apiFetch(`agendamentos.php?action=buscar&id=${id}`),
        status:            (id, s) => apiFetch(`agendamentos.php?action=status&id=${id}`, { method: 'POST', body: { status: s } }),
    },

    // ── 6. AVALIAÇÕES
    avaliacoes: {
        criar:                 (dados) => apiFetch('avaliacoes.php?action=criar', { method: 'POST', body: dados }),
        listarPorMontador:     (mid) => apiFetch(`avaliacoes.php?action=listar&montador_id=${mid}`),
        buscarPorAgendamento:  (aid) => apiFetch(`avaliacoes.php?action=buscar&agendamento_id=${aid}`),
    },

    // ── 7. NOTIFICAÇÕES
    notificacoes: {
        listar:      (uid) => apiFetch(`notificacoes.php?action=listar&uid=${uid}`),
        contar:      (uid) => apiFetch(`notificacoes.php?action=contar&uid=${uid}`),
        marcarLida:  (id) => apiFetch(`notificacoes.php?action=marcar_lida&id=${id}`, { method: 'POST' }),
        marcarTodas: (uid) => apiFetch(`notificacoes.php?action=marcar_todas&uid=${uid}`, { method: 'POST' }),
    },

    // ── Aliases legados (retrocompatibilidade)
    cadastrar:   (d) => API.usuarios.cadastrar(d),
    login:       (d) => API.usuarios.login(d),
    perfil:      (id) => API.usuarios.perfil(id),
    atualizar:   (id, d) => API.usuarios.atualizar(id, d),
    deletarUsr:  (id) => API.usuarios.deletar(id),
    criarOrc:    (d) => API.orcamentos.criar(d),
    listarOrc:   (uid) => API.orcamentos.listarPorCliente(uid),
    buscarOrc:   (id) => API.orcamentos.buscar(id),
    statusOrc:   (id, s) => API.orcamentos.status(id, s),
    deletarOrc:  (id) => API.orcamentos.deletar(id),
    listarProp:  (orcId) => API.propostas.listarPorOrcamento(orcId),
    criarProp:   (d) => API.propostas.criar(d),
    aceitarProp: (id) => API.propostas.aceitar(id),
    recusarProp: (id) => API.propostas.recusar(id),
    deletarProp: (id) => API.propostas.deletar(id),
};

// ── Gestão de Sessão Local ──────────────────────────────────────
const Sessao = {
    salvar(usuario) {
        if (!usuario) return;
        localStorage.setItem('cm_userId',    String(usuario.id));
        localStorage.setItem('cm_userName',  usuario.nome || '');
        localStorage.setItem('cm_userEmail', usuario.email || '');
        localStorage.setItem('cm_userType',  usuario.tipo || 'cliente');
        localStorage.setItem('cm_userTel',   usuario.telefone || '');
        localStorage.setItem('cm_userData',  JSON.stringify(usuario));
    },
    getId()       { return parseInt(localStorage.getItem('cm_userId') || '0', 10); },
    getNome()     { return localStorage.getItem('cm_userName') || 'Usuário'; },
    getEmail()    { return localStorage.getItem('cm_userEmail') || ''; },
    getTipo()     { return localStorage.getItem('cm_userType') || 'cliente'; },
    getTelefone() { return localStorage.getItem('cm_userTel') || ''; },
    getUsuario()  {
        try {
            return JSON.parse(localStorage.getItem('cm_userData') || '{}');
        } catch (_) {
            return {};
        }
    },
    limpar() {
        ['cm_userId','cm_userName','cm_userEmail','cm_userType','cm_userTel','cm_userData','userRole'].forEach(k => localStorage.removeItem(k));
    },
    logado()     { return this.getId() > 0; },
    isMontador() { return this.getTipo() === 'montador'; },
    isCliente()  { return this.getTipo() === 'cliente'; },
    logout() {
        this.limpar();
        window.location.href = '/click_montagem/pages/login.html';
    }
};

// ── Helpers Globais de Interface ─────────────────────────────────
function extrairIniciais(nome = '') {
    if (!nome) return 'CM';
    return nome.trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

function formatarDataBR(dataSql) {
    if (!dataSql) return '—';
    const [a, m, d] = dataSql.split('-');
    return `${d}/${m}/${a}`;
}

function labelHorario(h) {
    return { manha: 'Manhã', tarde: 'Tarde', qualquer: 'Qualquer horário' }[h] || h;
}

function labelStatus(s) {
    const mapa = {
        aberto:       'Aberto',
        pendente:     'Pendente',
        aceita:       'Aceita',
        recusada:     'Recusada',
        agendado:     'Agendado',
        em_andamento: 'Em andamento',
        concluido:    'Concluído',
        cancelado:    'Cancelado'
    };
    return mapa[s] || s;
}

// ── Atualização Automática de Navbar e Menus ────────────────────
function atualizarNavGlobal() {
    const logado   = Sessao.logado();
    const nome     = Sessao.getNome();
    const tipo     = Sessao.getTipo();
    const iniciais = extrairIniciais(nome);

    // Atualiza elementos de avatar e nome
    document.querySelectorAll('.nav-avatar').forEach(el => {
        el.textContent = iniciais;
        el.title = `${nome} (${tipo})`;
        if (el.tagName === 'A') {
            el.href = tipo === 'montador' ? 'editar-perfil-montador.html' : 'editar_perfil.html';
        }
    });

    document.querySelectorAll('.nav-username').forEach(el => {
        el.textContent = nome;
    });

    // Botão de Sair se logado (ou adiciona no nav-right se não houver)
    const navRight = document.querySelector('.nav-right');
    if (navRight && logado && !document.getElementById('btnNavLogout')) {
        const btnSair = document.createElement('button');
        btnSair.id = 'btnNavLogout';
        btnSair.className = 'btn btn-ghost';
        btnSair.style.fontSize = '12px';
        btnSair.style.padding = '6px 12px';
        btnSair.style.marginLeft = '10px';
        btnSair.innerHTML = '<i class="fas fa-sign-out-alt"></i> Sair';
        btnSair.title = 'Encerrar sessão';
        btnSair.onclick = (e) => {
            e.preventDefault();
            Sessao.logout();
        };
        navRight.appendChild(btnSair);
    }
}

document.addEventListener('DOMContentLoaded', atualizarNavGlobal);