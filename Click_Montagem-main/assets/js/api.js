// ================================================================
//  api.js — Módulo central de integração com a API REST (Node.js/Express/MongoDB)
//  Autenticação baseada em sessão segura no servidor (cookies HttpOnly + CSRF)
// ================================================================

const API_BASE = '/api';

// Estado em memória da sessão autenticada no servidor (NÃO usa localStorage como fonte de autenticação)
let _usuarioAtual = null;
let _csrfToken = null;
let _sessaoCarregada = false;
let _promessaSincronizacao = null;

function lerCookie(nome) {
    const match = document.cookie.match(new RegExp('(^|;\\s*)' + nome + '=([^;]*)'));
    return match ? decodeURIComponent(match[2]) : null;
}

function limparCacheLegadoLocalStorage() {
    [
        'cm_userId',
        'cm_userName',
        'cm_userEmail',
        'cm_userType',
        'cm_userTel',
        'cm_userData',
        'userRole',
    ].forEach((k) => {
        try {
            localStorage.removeItem(k);
        } catch (_) {}
    });
}

// ── Requisição HTTP Genérica com Sessão e CSRF ───────────────────
async function apiFetch(endpoint, { method = 'GET', body = null } = {}) {
    const upperMethod = method.toUpperCase();
    const headers = { 'Content-Type': 'application/json' };

    const tokenCsrf = _csrfToken || lerCookie('XSRF-TOKEN');
    if (tokenCsrf && !['GET', 'HEAD', 'OPTIONS'].includes(upperMethod)) {
        headers['X-CSRF-Token'] = tokenCsrf;
    }

    const opcoes = {
        method: upperMethod,
        headers,
        credentials: 'same-origin',
    };

    if (body !== null && body !== undefined) {
        opcoes.body = JSON.stringify(body);
    }

    try {
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
        const res = await fetch(`${API_BASE}/${cleanEndpoint}`, opcoes);

        const headerCsrf = res.headers.get('X-CSRF-Token');
        if (headerCsrf) {
            _csrfToken = headerCsrf;
        }

        const data = await res.json().catch(() => ({
            sucesso: false,
            erro: 'Resposta inválida do servidor.',
        }));

        if (data && data.csrfToken) {
            _csrfToken = data.csrfToken;
        }

        if (!res.ok) {
            throw new Error(data.erro || `Erro HTTP ${res.status}`);
        }
        return data;
    } catch (err) {
        if (err.name === 'TypeError') {
            throw new Error('Não foi possível conectar ao servidor da aplicação.');
        }
        throw err;
    }
}

// ── Objeto Principal API ─────────────────────────────────────────
const API = {
    // ── 0. AUTENTICAÇÃO E SESSÃO
    auth: {
        me: () => apiFetch('auth/me'),
        csrf: () => apiFetch('auth/csrf'),
        login: (dados) => apiFetch('auth/login', { method: 'POST', body: dados }),
        cadastrar: (dados) => apiFetch('auth/register', { method: 'POST', body: dados }),
        logout: () => apiFetch('auth/logout', { method: 'POST' }),
    },

    // ── 1. USUÁRIOS
    usuarios: {
        cadastrar: (dados) => apiFetch('usuarios/cadastrar', { method: 'POST', body: dados }),
        login: (dados) => apiFetch('usuarios/login', { method: 'POST', body: dados }),
        logout: () => apiFetch('usuarios/logout', { method: 'POST' }),
        me: () => apiFetch('usuarios/me'),
        perfil: (id = '') => apiFetch(id ? `usuarios/perfil/${encodeURIComponent(id)}` : 'usuarios/perfil'),
        atualizar: (id, dados) => {
            const payload = dados !== undefined ? dados : id;
            const target = dados !== undefined && id ? `usuarios/perfil/${encodeURIComponent(id)}` : 'usuarios/perfil';
            return apiFetch(target, { method: 'PUT', body: payload });
        },
        alterarSenha: (id, dados) => {
            const payload = dados !== undefined ? dados : id;
            const target = dados !== undefined && id ? `usuarios/senha/${encodeURIComponent(id)}` : 'usuarios/senha';
            return apiFetch(target, { method: 'PUT', body: payload });
        },
        recuperarSenha: (email) =>
            apiFetch('usuarios/recuperar-senha', { method: 'POST', body: { email } }),
        redefinirSenha: (email, novaSenha, token) =>
            apiFetch('usuarios/redefinir-senha', {
                method: 'POST',
                body: { email, nova_senha: novaSenha, token },
            }),
        deletar: (id = '') =>
            apiFetch(id ? `usuarios/perfil/${encodeURIComponent(id)}` : 'usuarios/perfil', {
                method: 'DELETE',
            }),
    },

    // ── 2. MONTADORES
    montadores: {
        listar: (busca = '') =>
            apiFetch(`montadores${busca ? '?busca=' + encodeURIComponent(busca) : ''}`),
        buscar: (id) => apiFetch(`montadores/${encodeURIComponent(id)}`),
        atualizar: (id, dados) => {
            const payload = dados !== undefined ? dados : id;
            const target = dados !== undefined && id ? `montadores/${encodeURIComponent(id)}` : 'montadores/perfil';
            return apiFetch(target, { method: 'PUT', body: payload });
        },
    },

    // ── 3. ORÇAMENTOS
    orcamentos: {
        criar: (dados) => apiFetch('orcamentos', { method: 'POST', body: dados }),
        listarPorCliente: (uid = '') =>
            apiFetch(uid ? `orcamentos/cliente/${encodeURIComponent(uid)}` : 'orcamentos/meus'),
        listarAbertos: () => apiFetch('orcamentos/abertos'),
        buscar: (id) => apiFetch(`orcamentos/${encodeURIComponent(id)}`),
        status: (id, s) =>
            apiFetch(`orcamentos/${encodeURIComponent(id)}/status`, {
                method: 'PATCH',
                body: { status: s },
            }),
        deletar: (id) =>
            apiFetch(`orcamentos/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    },

    // ── 4. PROPOSTAS
    propostas: {
        listarPorOrcamento: (orcId) =>
            apiFetch(`propostas/orcamento/${encodeURIComponent(orcId)}`),
        listarPorMontador: (mid = '') =>
            apiFetch(mid ? `propostas/montador/${encodeURIComponent(mid)}` : 'propostas/minhas'),
        criar: (dados) => apiFetch('propostas', { method: 'POST', body: dados }),
        aceitar: (id, endereco = '') =>
            apiFetch(`propostas/${encodeURIComponent(id)}/aceitar`, {
                method: 'POST',
                body: { endereco },
            }),
        recusar: (id) =>
            apiFetch(`propostas/${encodeURIComponent(id)}/recusar`, { method: 'POST' }),
        deletar: (id) =>
            apiFetch(`propostas/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    },

    // ── 5. AGENDAMENTOS
    agendamentos: {
        listarPorCliente: (cid = '', status = '') => {
            const params = new URLSearchParams();
            if (cid) params.set('cliente_id', cid);
            if (status) params.set('status', status);
            const qs = params.toString();
            return apiFetch(`agendamentos${qs ? '?' + qs : ''}`);
        },
        listarPorMontador: (mid = '', status = '') => {
            const params = new URLSearchParams();
            if (mid) params.set('montador_id', mid);
            if (status) params.set('status', status);
            const qs = params.toString();
            return apiFetch(`agendamentos${qs ? '?' + qs : ''}`);
        },
        buscar: (id) => apiFetch(`agendamentos/${encodeURIComponent(id)}`),
        status: (id, s) =>
            apiFetch(`agendamentos/${encodeURIComponent(id)}/status`, {
                method: 'PATCH',
                body: { status: s },
            }),
    },

    // ── 6. AVALIAÇÕES
    avaliacoes: {
        criar: (dados) => apiFetch('avaliacoes', { method: 'POST', body: dados }),
        listarPorMontador: (mid) =>
            apiFetch(`avaliacoes/montador/${encodeURIComponent(mid)}`),
        buscarPorAgendamento: (aid) =>
            apiFetch(`avaliacoes/agendamento/${encodeURIComponent(aid)}`),
    },

    // ── 7. NOTIFICAÇÕES
    notificacoes: {
        listar: () => apiFetch('notificacoes'),
        contar: () => apiFetch('notificacoes/contar'),
        marcarLida: (id) =>
            apiFetch(`notificacoes/${encodeURIComponent(id)}/lida`, { method: 'PATCH' }),
        marcarTodas: () =>
            apiFetch('notificacoes/ler-todas', { method: 'PATCH' }),
    },

    // ── Aliases de compatibilidade
    cadastrar: (d) => API.usuarios.cadastrar(d),
    login: (d) => API.usuarios.login(d),
    perfil: (id) => API.usuarios.perfil(id),
    atualizar: (id, d) => API.usuarios.atualizar(id, d),
    deletarUsr: (id) => API.usuarios.deletar(id),
    criarOrc: (d) => API.orcamentos.criar(d),
    listarOrc: (uid) => API.orcamentos.listarPorCliente(uid),
    buscarOrc: (id) => API.orcamentos.buscar(id),
    statusOrc: (id, s) => API.orcamentos.status(id, s),
    deletarOrc: (id) => API.orcamentos.deletar(id),
    listarProp: (orcId) => API.propostas.listarPorOrcamento(orcId),
    criarProp: (d) => API.propostas.criar(d),
    aceitarProp: (id, end) => API.propostas.aceitar(id, end),
    recusarProp: (id) => API.propostas.recusar(id),
    deletarProp: (id) => API.propostas.deletar(id),
};

// ── Gestão de Sessão Sincronizada com o Servidor ─────────────────
const Sessao = {
    async sincronizar(forcar = false) {
        limparCacheLegadoLocalStorage();
        if (_sessaoCarregada && !forcar) {
            return _usuarioAtual;
        }
        if (_promessaSincronizacao && !forcar) {
            return _promessaSincronizacao;
        }

        _promessaSincronizacao = API.auth
            .me()
            .then((res) => {
                _sessaoCarregada = true;
                _usuarioAtual = res.autenticado && res.usuario ? res.usuario : null;
                if (res.csrfToken) _csrfToken = res.csrfToken;
                return _usuarioAtual;
            })
            .catch(() => {
                _sessaoCarregada = true;
                _usuarioAtual = null;
                return null;
            })
            .finally(() => {
                _promessaSincronizacao = null;
            });

        return _promessaSincronizacao;
    },

    salvar(usuario) {
        limparCacheLegadoLocalStorage();
        _usuarioAtual = usuario ? { ...usuario, id: String(usuario.id) } : null;
        _sessaoCarregada = true;
    },

    getId() {
        return _usuarioAtual?.id ? String(_usuarioAtual.id) : '';
    },

    getNome() {
        return _usuarioAtual?.nome || '';
    },

    getEmail() {
        return _usuarioAtual?.email || '';
    },

    getTipo() {
        return _usuarioAtual?.tipo || '';
    },

    getTelefone() {
        return _usuarioAtual?.telefone || '';
    },

    getUsuario() {
        return _usuarioAtual ? { ..._usuarioAtual } : {};
    },

    limpar() {
        _usuarioAtual = null;
        _sessaoCarregada = false;
        limparCacheLegadoLocalStorage();
    },

    logado() {
        return Boolean(_usuarioAtual && _usuarioAtual.id);
    },

    isMontador() {
        return _usuarioAtual?.tipo === 'montador';
    },

    isCliente() {
        return _usuarioAtual?.tipo === 'cliente';
    },

    async logout() {
        try {
            await API.auth.logout();
        } catch (_) {}
        this.limpar();
        window.location.href = '/pages/login.html';
    },
};

// ── Helpers Globais de Interface ─────────────────────────────────
function extrairIniciais(nome = '') {
    if (!nome) return 'CM';
    return nome
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((n) => n[0])
        .join('')
        .toUpperCase();
}

function formatarDataBR(dataSql) {
    if (!dataSql) return '—';
    const limpo = String(dataSql).split(' ')[0].split('T')[0];
    const [a, m, d] = limpo.split('-');
    if (!a || !m || !d) return dataSql;
    return `${d}/${m}/${a}`;
}

function labelHorario(h) {
    return { manha: 'Manhã', tarde: 'Tarde', qualquer: 'Qualquer horário' }[h] || h;
}

function labelStatus(s) {
    const mapa = {
        aberto: 'Aberto',
        pendente: 'Pendente',
        aceita: 'Aceita',
        recusada: 'Recusada',
        concluida: 'Concluída',
        agendado: 'Agendado',
        em_andamento: 'Em andamento',
        concluido: 'Concluído',
        cancelado: 'Cancelado',
    };
    return mapa[s] || s;
}

// ── Atualização Automática de Navbar, Identidade e Notificações ──
async function atualizarNavGlobal() {
    await Sessao.sincronizar();

    const logado = Sessao.logado();
    const nome = Sessao.getNome();
    const tipo = Sessao.getTipo();
    const iniciais = extrairIniciais(nome);

    document.querySelectorAll('.nav-avatar').forEach((el) => {
        if (logado) {
            el.textContent = iniciais;
            el.title = `${nome} (${tipo})`;
            if (el.tagName === 'A') {
                el.href = tipo === 'montador' ? '/pages/editar-perfil-montador.html' : '/pages/editar_perfil.html';
            }
        } else {
            el.textContent = 'CM';
        }
    });

    document.querySelectorAll('.nav-username').forEach((el) => {
        el.textContent = logado ? nome : 'Visitante';
    });

    const navRight = document.querySelector('.nav-right');
    if (navRight && logado) {
        // Sininho de notificações reais do banco
        if (!document.getElementById('btnNavNotif')) {
            const notifWrap = document.createElement('div');
            notifWrap.style.position = 'relative';
            notifWrap.style.display = 'inline-block';
            notifWrap.style.marginRight = '6px';

            const btnNotif = document.createElement('button');
            btnNotif.id = 'btnNavNotif';
            btnNotif.type = 'button';
            btnNotif.className = 'btn btn-ghost';
            btnNotif.style.padding = '6px 10px';
            btnNotif.style.fontSize = '13px';
            btnNotif.title = 'Notificações';
            btnNotif.innerHTML = '<i class="fas fa-bell"></i> <span id="navNotifBadge" style="display:none;background:var(--dourado);color:#fff;border-radius:10px;padding:1px 6px;font-size:10px;margin-left:2px;">0</span>';

            const dropdown = document.createElement('div');
            dropdown.id = 'navNotifDropdown';
            dropdown.style.cssText =
                'display:none;position:absolute;right:0;top:110%;width:300px;max-height:360px;overflow-y:auto;background:#fff;border:1px solid var(--borda);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.12);z-index:999;padding:12px;';

            notifWrap.appendChild(btnNotif);
            notifWrap.appendChild(dropdown);
            navRight.insertBefore(notifWrap, navRight.firstChild);

            const atualizarBadgeNotif = async () => {
                try {
                    const res = await API.notificacoes.contar();
                    const badge = document.getElementById('navNotifBadge');
                    if (badge) {
                        if (res.nao_lidas > 0) {
                            badge.textContent = String(res.nao_lidas);
                            badge.style.display = 'inline-block';
                        } else {
                            badge.style.display = 'none';
                        }
                    }
                } catch (_) {}
            };

            atualizarBadgeNotif();

            btnNotif.addEventListener('click', async (e) => {
                e.stopPropagation();
                const aberto = dropdown.style.display === 'block';
                if (aberto) {
                    dropdown.style.display = 'none';
                    return;
                }
                dropdown.style.display = 'block';
                dropdown.innerHTML = '<p style="font-size:12px;color:var(--texto-claro);text-align:center;padding:10px;">Carregando notificações…</p>';

                try {
                    const res = await API.notificacoes.listar();
                    const lista = res.notificacoes || [];
                    if (lista.length === 0) {
                        dropdown.innerHTML = '<p style="font-size:12px;color:var(--texto-claro);text-align:center;padding:10px;">Nenhuma notificação.</p>';
                        return;
                    }

                    const temNaoLida = lista.some((n) => !n.lida);
                    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--borda);">
                        <strong style="font-size:12px;color:var(--marrom-escuro);">Notificações</strong>
                        ${temNaoLida ? '<button type="button" id="btnLerTodasNotif" style="background:none;border:none;color:var(--dourado);font-size:11px;cursor:pointer;">Marcar todas como lidas</button>' : ''}
                    </div>`;

                    html += lista
                        .slice(0, 10)
                        .map(
                            (n) => `
                        <div data-notif-id="${n.id}" style="padding:8px;border-radius:6px;margin-bottom:6px;font-size:12px;cursor:pointer;background:${n.lida ? 'transparent' : 'var(--bege-fundo)'};border-bottom:1px solid rgba(0,0,0,0.04);">
                            <div style="color:var(--marrom-escuro);font-weight:${n.lida ? '400' : '600'};">${n.mensagem}</div>
                            <div style="font-size:10px;color:var(--texto-claro);margin-top:3px;">${formatarDataBR(n.criado_em)}</div>
                        </div>
                    `
                        )
                        .join('');

                    dropdown.innerHTML = html;

                    dropdown.querySelector('#btnLerTodasNotif')?.addEventListener('click', async (ev) => {
                        ev.stopPropagation();
                        await API.notificacoes.marcarTodas();
                        await atualizarBadgeNotif();
                        dropdown.style.display = 'none';
                    });

                    dropdown.querySelectorAll('[data-notif-id]').forEach((item) => {
                        item.addEventListener('click', async () => {
                            const nid = item.getAttribute('data-notif-id');
                            if (nid) {
                                await API.notificacoes.marcarLida(nid).catch(() => {});
                                item.style.background = 'transparent';
                                item.firstElementChild.style.fontWeight = '400';
                                await atualizarBadgeNotif();
                            }
                        });
                    });
                } catch (_) {
                    dropdown.innerHTML = '<p style="font-size:12px;color:#c0392b;text-align:center;padding:10px;">Erro ao carregar notificações.</p>';
                }
            });

            document.addEventListener('click', (e) => {
                if (!notifWrap.contains(e.target)) {
                    dropdown.style.display = 'none';
                }
            });
        }

        // Botão de Sair
        if (!document.getElementById('btnNavLogout')) {
            const btnSair = document.createElement('button');
            btnSair.id = 'btnNavLogout';
            btnSair.type = 'button';
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
}

document.addEventListener('DOMContentLoaded', () => {
    atualizarNavGlobal();
});
