process.env.NODE_ENV = 'test';

const { test, describe, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');

const { ensureLocalMongoRunning } = require('../src/config/localMongoRunner');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { createApp } = require('../src/app');
const {
  User,
  Orcamento,
  Proposta,
  Agendamento,
  Avaliacao,
  Notificacao,
} = require('../src/models');

let app;
const passwordResetMailer = require('../src/services/passwordResetMailer');
const deliveredTokens = new Map();

/**
 * Helper: obtém o token CSRF vinculado à sessão do agente
 */
async function getCsrf(agent) {
  const res = await agent.get('/api/auth/csrf');
  assert.equal(res.status, 200);
  assert.equal(res.body.sucesso, true);
  assert.ok(res.body.csrfToken);
  return res.body.csrfToken;
}

describe('Click Montagem — Suite de Testes Automatizados (Node.js + Express + MongoDB)', () => {
  before(async () => {
    // Simulate delivery only: reset tokens must never be returned to API callers.
    mock.method(passwordResetMailer, 'assertConfigured', () => {});
    mock.method(passwordResetMailer, 'sendResetLink', async (email, token) => deliveredTokens.set(email, token));
    await ensureLocalMongoRunning();
    await connectDatabase();
    // Segurança: apenas o banco isolado de testes pode ser limpo
    assert.ok(
      mongoose.connection.name.includes('test'),
      'Segurança: os testes só podem limpar o banco de testes!'
    );
    await Promise.all([
      User.deleteMany({}),
      Orcamento.deleteMany({}),
      Proposta.deleteMany({}),
      Agendamento.deleteMany({}),
      Avaliacao.deleteMany({}),
      Notificacao.deleteMany({}),
    ]);
    app = createApp();
  });

  after(async () => {
    mock.restoreAll();
    await disconnectDatabase();
  });

  // Estado compartilhado entre os testes do fluxo completo
  let agentClienteA;
  let agentClienteB;
  let agentMontador1;
  let agentMontador2;
  let clienteAId;
  let clienteBId;
  let montador1Id;
  let montador2Id;
  let orcamentoAId;
  let proposta1Id;
  let proposta2Id;
  let agendamentoId;

  test('1. Cadastro de usuários (Clientes e Montadores) e prevenção de duplicidade', async () => {
    agentClienteA = request.agent(app);
    agentClienteB = request.agent(app);
    agentMontador1 = request.agent(app);
    agentMontador2 = request.agent(app);

    // 1.1 Cadastro Cliente A
    const resClienteA = await agentClienteA.post('/api/usuarios/cadastrar').send({
      nome: 'Alice Ferreira',
      email: 'alice@teste.com',
      senha: 'Password123',
      telefone: '(11) 91111-1111',
      tipo: 'cliente',
      cidade: 'São Paulo',
    });
    assert.equal(resClienteA.status, 201);
    assert.equal(resClienteA.body.sucesso, true);
    assert.equal(resClienteA.body.usuario.nome, 'Alice Ferreira');
    assert.equal(resClienteA.body.usuario.email, 'alice@teste.com');
    assert.equal(resClienteA.body.usuario.tipo, 'cliente');
    assert.equal(resClienteA.body.usuario.senha, undefined);
    clienteAId = resClienteA.body.usuario.id;
    assert.ok(clienteAId);

    // Verifica que o cookie de sessão é HttpOnly e SameSite=Lax
    const cookiesA = resClienteA.headers['set-cookie'] || [];
    assert.ok(cookiesA.some((c) => c.includes('HttpOnly') && c.toLowerCase().includes('samesite=lax')));

    // 1.2 Cadastro Cliente B
    const resClienteB = await agentClienteB.post('/api/usuarios/cadastrar').send({
      nome: 'Bruno Cardoso',
      email: 'bruno@teste.com',
      senha: 'Password456',
      telefone: '(11) 92222-2222',
      tipo: 'cliente',
      cidade: 'Campinas',
    });
    assert.equal(resClienteB.status, 201);
    assert.equal(resClienteB.body.sucesso, true);
    assert.equal(resClienteB.body.usuario.nome, 'Bruno Cardoso');
    clienteBId = resClienteB.body.usuario.id;
    assert.notEqual(clienteAId, clienteBId);

    // 1.3 Prevenção de e-mail duplicado
    const resDupEmail = await request(app).post('/api/usuarios/cadastrar').send({
      nome: 'Alice Clone',
      email: 'ALICE@teste.com',
      telefone: '(11) 90000-0000',
      senha: 'Password123',
      tipo: 'cliente',
    });
    assert.equal(resDupEmail.status, 409);
    assert.equal(resDupEmail.body.sucesso, false);

    // 1.4 Cadastro Montador 1
    const resMontador1 = await agentMontador1.post('/api/usuarios/cadastrar').send({
      nome: 'Carlos Montador',
      email: 'carlos.montador@teste.com',
      senha: 'Password123',
      telefone: '(11) 93333-3333',
      tipo: 'montador',
      cpf_cnpj: '111.222.333-44',
      especialidades: 'Planejados, Guarda-roupas',
      regiao_atendimento: 'São Paulo e Região',
      cidade: 'São Paulo',
    });
    assert.equal(resMontador1.status, 201);
    assert.equal(resMontador1.body.sucesso, true);
    assert.equal(resMontador1.body.usuario.tipo, 'montador');
    montador1Id = resMontador1.body.usuario.id;

    // 1.5 Cadastro Montador 2
    const resMontador2 = await agentMontador2.post('/api/usuarios/cadastrar').send({
      nome: 'Daniela Montadora',
      email: 'daniela.montadora@teste.com',
      senha: 'Password123',
      telefone: '(11) 94444-4444',
      tipo: 'montador',
      cpf_cnpj: '555.666.777-88',
      especialidades: 'Móveis padrão, Berços',
      regiao_atendimento: 'São Paulo e ABC',
      cidade: 'São Paulo',
    });
    assert.equal(resMontador2.status, 201);
    montador2Id = resMontador2.body.usuario.id;

    // 1.6 Prevenção de CPF/CNPJ duplicado para montador
    const resDupCpf = await request(app).post('/api/usuarios/cadastrar').send({
      nome: 'Outro Montador',
      email: 'outro.montador@teste.com',
      telefone: '(11) 95555-5555',
      senha: 'Password123',
      tipo: 'montador',
      cpf_cnpj: '111.222.333-44',
    });
    assert.equal(resDupCpf.status, 409);
  });

  test('2. Isolamento estrito de identidade e sessão entre duas contas diferentes (Correção do Bug Crítico)', async () => {
    // Sessão A deve retornar exclusivamente Alice Ferreira
    const meA = await agentClienteA.get('/api/auth/me');
    assert.equal(meA.status, 200);
    assert.equal(meA.body.autenticado, true);
    assert.equal(meA.body.usuario.id, clienteAId);
    assert.equal(meA.body.usuario.nome, 'Alice Ferreira');
    assert.equal(meA.body.usuario.email, 'alice@teste.com');

    // Sessão B deve retornar exclusivamente Bruno Cardoso
    const meB = await agentClienteB.get('/api/auth/me');
    assert.equal(meB.status, 200);
    assert.equal(meB.body.autenticado, true);
    assert.equal(meB.body.usuario.id, clienteBId);
    assert.equal(meB.body.usuario.nome, 'Bruno Cardoso');
    assert.equal(meB.body.usuario.email, 'bruno@teste.com');

    // Sessão Montador 1 deve retornar exclusivamente Carlos Montador
    const meM1 = await agentMontador1.get('/api/auth/me');
    assert.equal(meM1.status, 200);
    assert.equal(meM1.body.autenticado, true);
    assert.equal(meM1.body.usuario.id, montador1Id);
    assert.equal(meM1.body.usuario.nome, 'Carlos Montador');
    assert.equal(meM1.body.usuario.tipo, 'montador');

    // Simula troca de conta no mesmo navegador (Agent A faz login como Cliente B)
    const loginTroca = await agentClienteA.post('/api/usuarios/login').send({
      email: 'bruno@teste.com',
      senha: 'Password456',
    });
    assert.equal(loginTroca.status, 200);
    assert.equal(loginTroca.body.usuario.id, clienteBId);
    assert.equal(loginTroca.body.usuario.nome, 'Bruno Cardoso');

    const meAposTroca = await agentClienteA.get('/api/auth/me');
    assert.equal(meAposTroca.body.usuario.id, clienteBId);
    assert.equal(meAposTroca.body.usuario.nome, 'Bruno Cardoso');

    // Volta Agent A para Alice Ferreira
    const loginVoltaA = await agentClienteA.post('/api/usuarios/login').send({
      email: 'alice@teste.com',
      senha: 'Password123',
    });
    assert.equal(loginVoltaA.status, 200);
    assert.equal(loginVoltaA.body.usuario.id, clienteAId);
    assert.equal(loginVoltaA.body.usuario.nome, 'Alice Ferreira');
  });

  test('3. Login, Logout e Recuperação/Redefinição de Senha segura com token', async () => {
    const tempAgent = request.agent(app);

    // Tentativa de login com senha incorreta
    const badLogin = await tempAgent.post('/api/usuarios/login').send({
      email: 'alice@teste.com',
      senha: 'WrongPassword',
    });
    assert.equal(badLogin.status, 401);

    // Login válido
    const okLogin = await tempAgent.post('/api/usuarios/login').send({
      email: 'alice@teste.com',
      senha: 'Password123',
    });
    assert.equal(okLogin.status, 200);
    assert.equal(okLogin.body.usuario.id, clienteAId);

    // Logout destrói a sessão no servidor
    const csrf = await getCsrf(tempAgent);
    const resLogout = await tempAgent
      .post('/api/usuarios/logout')
      .set('X-CSRF-Token', csrf);
    assert.equal(resLogout.status, 200);

    // Verificar que /api/auth/me agora retorna autenticado = false e usuario = null
    const meAfterLogout = await tempAgent.get('/api/auth/me');
    assert.equal(meAfterLogout.status, 200);
    assert.equal(meAfterLogout.body.autenticado, false);
    assert.equal(meAfterLogout.body.usuario, null);

    // E rota protegida retorna 401 após logout
    const protectedAfterLogout = await tempAgent.get('/api/orcamentos/meus');
    assert.equal(protectedAfterLogout.status, 401);

    // Recuperação e redefinição de senha com validação real de token
    const recRes = await request(app).post('/api/usuarios/recuperar-senha').send({
      email: 'bruno@teste.com',
    });
    assert.equal(recRes.status, 200);
    assert.equal(recRes.body.token, undefined);
    const resetToken = deliveredTokens.get('bruno@teste.com');
    assert.ok(resetToken);

    // Tentativa de redefinir senha com token inválido deve falhar
    const badReset = await request(app).post('/api/usuarios/redefinir-senha').send({
      email: 'bruno@teste.com',
      token: 'token-invalido-123',
      nova_senha: 'NewPassword789',
    });
    assert.equal(badReset.status, 400);

    // Redefinição com token válido funciona
    const okReset = await request(app).post('/api/usuarios/redefinir-senha').send({
      email: 'bruno@teste.com',
      token: resetToken,
      nova_senha: 'NewPassword789',
    });
    assert.equal(okReset.status, 200);

    // Reutilizar o mesmo token deve falhar (token de uso único)
    const reuseReset = await request(app).post('/api/usuarios/redefinir-senha').send({
      email: 'bruno@teste.com',
      token: resetToken,
      nova_senha: 'AnotherPassword',
    });
    assert.equal(reuseReset.status, 400);

    // Login de Bruno com a nova senha
    const reLoginB = await agentClienteB.post('/api/usuarios/login').send({
      email: 'bruno@teste.com',
      senha: 'NewPassword789',
    });
    assert.equal(reLoginB.status, 200);
    assert.equal(reLoginB.body.usuario.id, clienteBId);
  });

  test('4. Autorização por perfil, propriedade de registros e proteção CSRF', async () => {
    // 4.1 Requisição não autenticada para rota protegida é bloqueada com 401
    const unauthOrc = await request(app).get('/api/orcamentos/meus');
    assert.equal(unauthOrc.status, 401);

    // 4.2 Acesso a página HTML restrita sem sessão redireciona para login
    const unauthPage = await request(app).get('/pages/painel-cliente.html');
    assert.equal(unauthPage.status, 302);
    assert.ok(unauthPage.headers.location.includes('/pages/login.html'));

    // 4.3 Cliente autenticado tentando acessar página exclusiva de montador é redirecionado para painel-cliente
    const wrongRolePage = await agentClienteA.get('/pages/painel-montador.html');
    assert.equal(wrongRolePage.status, 302);
    assert.ok(wrongRolePage.headers.location.includes('/pages/painel-cliente.html'));

    // 4.4 Requisição mutável autenticada sem header CSRF é bloqueada com 403
    const noCsrfRes = await agentClienteA.put(`/api/usuarios/perfil/${clienteAId}`).send({
      nome: 'Tentativa sem CSRF',
      telefone: '(11) 91111-1111',
    });
    assert.equal(noCsrfRes.status, 403);

    // 4.5 Cliente A tentando editar perfil do Cliente B (IDOR) é bloqueado com 403
    const csrfA = await getCsrf(agentClienteA);
    const idorUpdate = await agentClienteA
      .put(`/api/usuarios/perfil/${clienteBId}`)
      .set('X-CSRF-Token', csrfA)
      .send({
        nome: 'Hackeado por Alice',
        telefone: '(11) 91111-1111',
      });
    assert.equal(idorUpdate.status, 403);

    // 4.6 Cliente A tentando ler dados privados do Cliente B é bloqueado com 403
    const idorGet = await agentClienteA.get(`/api/usuarios/perfil/${clienteBId}`);
    assert.equal(idorGet.status, 403);

    // 4.7 Montador tentando criar orçamento (ação exclusiva de cliente) é bloqueado com 403
    const csrfM1 = await getCsrf(agentMontador1);
    const montadorCreateOrc = await agentMontador1
      .post('/api/orcamentos')
      .set('X-CSRF-Token', csrfM1)
      .send({
        tipo_movel: 'Guarda-roupa',
        cep: '01310-100',
        rua: 'Av Paulista',
      });
    assert.equal(montadorCreateOrc.status, 403);
  });

  test('5. Criação e consulta de Orçamentos com isolamento por cliente', async () => {
    const csrfA = await getCsrf(agentClienteA);
    const resCreate = await agentClienteA
      .post('/api/orcamentos')
      .set('X-CSRF-Token', csrfA)
      .send({
        categoria: 'planejado',
        tipo_movel: 'Guarda-roupa 6 portas',
        quantidade_pecas: 2,
        complexidade: 'moderado',
        descricao: 'Com espelho central',
        cep: '01310-100',
        rua: 'Av. Paulista',
        numero: '1000',
        complemento: 'Apto 42',
        bairro: 'Bela Vista',
        horario: 'manha',
        preco_estimado: 'R$ 300 – 500',
      });

    assert.equal(resCreate.status, 201);
    assert.equal(resCreate.body.sucesso, true);
    assert.equal(resCreate.body.orcamento.usuario_id, clienteAId);
    assert.equal(resCreate.body.orcamento.status, 'aberto');
    orcamentoAId = resCreate.body.id;

    // Cliente A consulta seus orçamentos e vê o orçamento criado
    const listA = await agentClienteA.get('/api/orcamentos/meus');
    assert.equal(listA.status, 200);
    assert.equal(listA.body.orcamentos.length, 1);
    assert.equal(listA.body.orcamentos[0].id, orcamentoAId);

    // Cliente B consulta seus orçamentos e NÃO vê o orçamento de Cliente A
    const listB = await agentClienteB.get('/api/orcamentos/meus');
    assert.equal(listB.status, 200);
    assert.equal(listB.body.orcamentos.length, 0);

    // Cliente B tentando acessar diretamente o orçamento de Cliente A recebe 403
    const getByB = await agentClienteB.get(`/api/orcamentos/${orcamentoAId}`);
    assert.equal(getByB.status, 403);

    // Montador 1 lista orçamentos abertos disponíveis para enviar proposta
    const listM1 = await agentMontador1.get('/api/orcamentos/abertos');
    assert.equal(listM1.status, 200);
    assert.equal(listM1.body.pedidos.length, 1);
    assert.equal(listM1.body.pedidos[0].id, orcamentoAId);
  });

  test('6. Criação de Propostas e prevenção de duplicidade', async () => {
    const csrfM1 = await getCsrf(agentMontador1);
    const csrfM2 = await getCsrf(agentMontador2);

    // Montador 1 envia proposta para o orçamento de Alice
    const resProp1 = await agentMontador1
      .post('/api/propostas')
      .set('X-CSRF-Token', csrfM1)
      .send({
        orcamento_id: orcamentoAId,
        valor: 380,
        disponibilidade: '2026-06-15',
        horario: 'manha',
        mensagem: 'Tenho todas as ferramentas e experiência em planejados.',
      });
    assert.equal(resProp1.status, 201);
    assert.equal(resProp1.body.sucesso, true);
    proposta1Id = resProp1.body.id;

    // Prevenção de duplicidade: Montador 1 tenta enviar segunda proposta para o mesmo orçamento
    const resDupProp = await agentMontador1
      .post('/api/propostas')
      .set('X-CSRF-Token', csrfM1)
      .send({
        orcamento_id: orcamentoAId,
        valor: 350,
        disponibilidade: '2026-06-15',
      });
    assert.equal(resDupProp.status, 409);

    // Montador 2 envia proposta concorrente para o mesmo orçamento
    const resProp2 = await agentMontador2
      .post('/api/propostas')
      .set('X-CSRF-Token', csrfM2)
      .send({
        orcamento_id: orcamentoAId,
        valor: 420,
        disponibilidade: '2026-06-16',
        horario: 'tarde',
        mensagem: 'Especialista em acabamento fino.',
      });
    assert.equal(resProp2.status, 201);
    proposta2Id = resProp2.body.id;

    // Cliente A lista as propostas do seu orçamento (deve ver 2 propostas)
    const listProps = await agentClienteA.get(`/api/propostas/orcamento/${orcamentoAId}`);
    assert.equal(listProps.status, 200);
    assert.equal(listProps.body.propostas.length, 2);

    // Cliente B tenta listar as propostas do orçamento de Cliente A -> 403
    const listPropsByB = await agentClienteB.get(`/api/propostas/orcamento/${orcamentoAId}`);
    assert.equal(listPropsByB.status, 403);
  });

  test('7. Aceite de Proposta, criação automática de Agendamento e consistência de estados', async () => {
    const csrfB = await getCsrf(agentClienteB);
    // Cliente B tenta aceitar a proposta do orçamento de Cliente A -> 403
    const unauthorizedAccept = await agentClienteB
      .post(`/api/propostas/${proposta1Id}/aceitar`)
      .set('X-CSRF-Token', csrfB)
      .send({ endereco: 'Av. Paulista, 1000' });
    assert.equal(unauthorizedAccept.status, 403);

    // Cliente A aceita a Proposta 1 (de Carlos Montador)
    const csrfA = await getCsrf(agentClienteA);
    const acceptRes = await agentClienteA
      .post(`/api/propostas/${proposta1Id}/aceitar`)
      .set('X-CSRF-Token', csrfA)
      .send({ endereco: 'Av. Paulista, 1000 - Bela Vista' });
    assert.equal(acceptRes.status, 200);
    assert.equal(acceptRes.body.sucesso, true);
    agendamentoId = acceptRes.body.agendamento_id;
    assert.ok(agendamentoId);

    // Verifica consistência do Orçamento (status = em_andamento)
    const orcAfter = await agentClienteA.get(`/api/orcamentos/${orcamentoAId}`);
    assert.equal(orcAfter.body.orcamento.status, 'em_andamento');

    // Verifica consistência das Propostas (Proposta 1 = aceita, Proposta 2 = recusada automaticamente)
    const propsAfter = await agentClienteA.get(`/api/propostas/orcamento/${orcamentoAId}`);
    const p1 = propsAfter.body.propostas.find((p) => p.id === proposta1Id);
    const p2 = propsAfter.body.propostas.find((p) => p.id === proposta2Id);
    assert.equal(p1.status, 'aceita');
    assert.equal(p2.status, 'recusada');

    // Prevenção de duplicidade: tentar aceitar novamente uma proposta em orçamento já processado -> 409
    const dupAccept = await agentClienteA
      .post(`/api/propostas/${proposta2Id}/aceitar`)
      .set('X-CSRF-Token', csrfA)
      .send({});
    assert.equal(dupAccept.status, 409);

    // Verifica que o Agendamento foi criado para Cliente A e Montador 1
    const agendsCliente = await agentClienteA.get('/api/agendamentos');
    assert.equal(agendsCliente.status, 200);
    assert.equal(agendsCliente.body.agendamentos.length, 1);
    assert.equal(agendsCliente.body.agendamentos[0].id, agendamentoId);
    assert.equal(agendsCliente.body.agendamentos[0].status, 'agendado');
    assert.equal(agendsCliente.body.agendamentos[0].valor, 380);
  });

  test('8. Ciclo de vida do Agendamento, Avaliação de serviço concluído e atualização do Montador', async () => {
    const csrfA = await getCsrf(agentClienteA);
    const csrfM1 = await getCsrf(agentMontador1);

    // 8.1 Tentar avaliar agendamento ANTES de estar concluído deve falhar com 409
    const earlyReview = await agentClienteA
      .post('/api/avaliacoes')
      .set('X-CSRF-Token', csrfA)
      .send({
        agendamento_id: agendamentoId,
        nota: 5,
        comentario: 'Tentando avaliar antes de concluir',
      });
    assert.equal(earlyReview.status, 409);

    // 8.2 Tentar excluir orçamento que já possui serviço agendado deve ser bloqueado (preservação de histórico)
    const deleteActiveOrc = await agentClienteA
      .delete(`/api/orcamentos/${orcamentoAId}`)
      .set('X-CSRF-Token', csrfA);
    assert.equal(deleteActiveOrc.status, 409);

    // 8.3 Montador 1 conclui o agendamento
    const concludeRes = await agentMontador1
      .patch(`/api/agendamentos/${agendamentoId}/status`)
      .set('X-CSRF-Token', csrfM1)
      .send({ status: 'concluido' });
    assert.equal(concludeRes.status, 200);

    // Orçamento também passa para concluido
    const orcDone = await agentClienteA.get(`/api/orcamentos/${orcamentoAId}`);
    assert.equal(orcDone.body.orcamento.status, 'concluido');

    // 8.4 Cliente A avalia o serviço concluído
    const reviewRes = await agentClienteA
      .post('/api/avaliacoes')
      .set('X-CSRF-Token', csrfA)
      .send({
        agendamento_id: agendamentoId,
        nota: 5,
        criterios: { pont: 5, qual: 5, com: 5, limp: 5 },
        comentario: 'Montagem impecável e super rápida!',
        recomenda: true,
      });
    assert.equal(reviewRes.status, 201);

    // 8.5 Prevenção de avaliação duplicada para o mesmo agendamento -> 409
    const dupReview = await agentClienteA
      .post('/api/avaliacoes')
      .set('X-CSRF-Token', csrfA)
      .send({
        agendamento_id: agendamentoId,
        nota: 4,
      });
    assert.equal(dupReview.status, 409);

    // 8.6 Verifica que a nota_media e servicos_concluidos do Montador 1 foram recalculados
    const montadorProfile = await request(app).get(`/api/montadores/${montador1Id}`);
    assert.equal(montadorProfile.status, 200);
    assert.equal(montadorProfile.body.montador.nota_media, 5);
    assert.equal(montadorProfile.body.montador.total_avaliacoes, 1);
    assert.equal(montadorProfile.body.montador.servicos_concluidos, 1);
  });

  test('9. Atualização de perfis (Cliente e Montador) e Notificações', async () => {
    const csrfA = await getCsrf(agentClienteA);
    const csrfM1 = await getCsrf(agentMontador1);

    // 9.1 Atualização de perfil do Cliente A
    const updateCliente = await agentClienteA
      .put(`/api/usuarios/perfil/${clienteAId}`)
      .set('X-CSRF-Token', csrfA)
      .send({
        nome: 'Alice Ferreira Silva',
        telefone: '(11) 98888-0000',
        cidade: 'São Paulo',
        cep: '01310-100',
        endereco: 'Av. Paulista, 1000',
      });
    assert.equal(updateCliente.status, 200);

    const meA = await agentClienteA.get('/api/auth/me');
    assert.equal(meA.body.usuario.nome, 'Alice Ferreira Silva');
    assert.equal(meA.body.usuario.cep, '01310-100');

    // 9.2 Atualização de perfil profissional do Montador 1
    const updateMontador = await agentMontador1
      .put(`/api/montadores/${montador1Id}`)
      .set('X-CSRF-Token', csrfM1)
      .send({
        nome: 'Carlos Eduardo Montador',
        telefone: '(11) 93333-3333',
        preco_base: 140,
        regiao_atendimento: 'Grande São Paulo',
        especialidades: 'Planejados, Cozinhas, Closets',
        descricao_profissional: 'Mais de 5 anos montando móveis planejados de alto padrão.',
      });
    assert.equal(updateMontador.status, 200);

    const getM1 = await request(app).get(`/api/montadores/${montador1Id}`);
    assert.equal(getM1.body.montador.nome, 'Carlos Eduardo Montador');
    assert.equal(getM1.body.montador.preco_base, 140);
    assert.equal(getM1.body.montador.regiao_atendimento, 'Grande São Paulo');

    // 9.3 Notificações geradas durante o fluxo e marcação como lidas
    const notifsA = await agentClienteA.get('/api/notificacoes');
    assert.equal(notifsA.status, 200);
    assert.ok(notifsA.body.notificacoes.length >= 2);

    const countBefore = await agentClienteA.get('/api/notificacoes/contar');
    assert.ok(countBefore.body.nao_lidas >= 1);

    const markRead = await agentClienteA
      .patch('/api/notificacoes/ler-todas')
      .set('X-CSRF-Token', csrfA)
      .send({});
    assert.equal(markRead.status, 200);

    const countAfter = await agentClienteA.get('/api/notificacoes/contar');
    assert.equal(countAfter.body.nao_lidas, 0);
  });

  test('10. Operações de exclusão e cancelamento respeitando regras de histórico', async () => {
    const csrfB = await getCsrf(agentClienteB);

    // Cliente B cria um orçamento novo (sem agendamentos concluídos) e o exclui
    const resOrcB = await agentClienteB
      .post('/api/orcamentos')
      .set('X-CSRF-Token', csrfB)
      .send({
        categoria: 'padrao',
        tipo_movel: 'Mesa de escritório',
        quantidade_pecas: 1,
        cep: '13010-000',
        rua: 'Rua Barão de Jaguara',
        numero: '500',
      });
    assert.equal(resOrcB.status, 201);
    const orcBId = resOrcB.body.id;

    const delOrcB = await agentClienteB
      .delete(`/api/orcamentos/${orcBId}`)
      .set('X-CSRF-Token', csrfB);
    assert.equal(delOrcB.status, 200);

    const listB = await agentClienteB.get('/api/orcamentos/meus');
    assert.equal(listB.body.orcamentos.length, 0);
  });
});

