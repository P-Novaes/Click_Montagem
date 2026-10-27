# Click Montagem — Plataforma de Montagem de Móveis (Node.js + Express + MongoDB)

Plataforma web que conecta clientes que precisam montar móveis (planejados ou padrões) a profissionais montadores verificados.

Esta versão consolida a **migração completa do backend legado (PHP/MySQL) para Node.js (LTS), Express e MongoDB**, mantendo integralmente o design visual em HTML5, CSS3 e JavaScript puro (Vanilla JS), corrigindo falhas críticas de identidade/sessão, autorização (IDOR), validação e persistência.

---

## 1. Arquitetura do Sistema

- **Frontend:** HTML5, CSS3 e JavaScript puro (`assets/js/*.js`, `index.html`, `pages/*.html`).
- **Backend:** Node.js + Express (`src/`), organizado de forma modular em:
  - `src/config/`: variáveis de ambiente (`env.js`), conexão Mongoose (`database.js`) e inicializador automático de instância local do MongoDB (`localMongoRunner.js`).
  - `src/models/`: esquemas Mongoose, índices compostos e validações (`User.js`, `Orcamento.js`, `Proposta.js`, `Agendamento.js`, `Avaliacao.js`, `Notificacao.js`).
  - `src/validators/`: validação rigorosa de payloads, ObjectIds e enums (`validators.js`).
  - `src/middlewares/`: autenticação de sessão (`auth.js`), proteção CSRF e sanitização contra NoSQL Injection (`security.js`) e tratamento centralizado de erros (`errorHandler.js`).
  - `src/services/`: regras de negócio, controle de propriedade de registros e transações com fallback seguro (`userService.js`, `montadorService.js`, `orcamentoService.js`, `propostaService.js`, `agendamentoService.js`, `avaliacaoService.js`, `notificacaoService.js`).
  - `src/controllers/`: controladores HTTP REST (`authController.js`, `montadorController.js`, `orcamentoController.js`, `propostaController.js`, `agendamentoController.js`, `avaliacaoController.js`, `notificacaoController.js`).
  - `src/routes/`: definição das rotas sob `/api` (`authRoutes.js`, `montadorRoutes.js`, `orcamentoRoutes.js`, `propostaRoutes.js`, `agendamentoRoutes.js`, `avaliacaoRoutes.js`, `notificacaoRoutes.js`, `index.js`).
- **Banco de Dados:** MongoDB com sessões persistidas na coleção `sessoes` via `connect-mongo`.

---

## 2. Requisitos e Instalação

### Pré-requisitos
- **Node.js** >= 18.x (recomendado LTS 20/22/24)
- **MongoDB** >= 6.0 / 8.0 instalado localmente (ou URI do MongoDB Atlas)
  - *Nota:* Em ambiente Windows com MongoDB instalado em `C:\Program Files\MongoDB\Server\*\bin\mongod.exe`, o servidor inicia automaticamente o processo `mongod` local apontando para `.mongodb-data/` caso a porta `27017` não esteja ativa.

### Passo a passo

1. Acesse a pasta do projeto e instale as dependências:
   ```bash
   cd Click_Montagem-main
   npm install
   ```

2. Configure o arquivo `.env` (baseado no `.env.example`):
   ```env
   PORT=3000
   NODE_ENV=development
   MONGODB_URI=mongodb://127.0.0.1:27017/click_montagem
   MONGODB_TEST_URI=mongodb://127.0.0.1:27017/click_montagem_test
   SESSION_SECRET=troque_este_segredo_em_producao_por_uma_chave_longa_e_aleatoria
   SESSION_NAME=cm.sid
   SESSION_MAX_AGE_MS=604800000
   ```

3. Popule o banco de dados com a carga inicial não-destrutiva (caso esteja vazio):
   ```bash
   npm run seed
   ```

4. Inicie o servidor:
   ```bash
   npm start
   ```
   Ou em modo de desenvolvimento (com `node --watch`):
   ```bash
   npm run dev
   ```

5. Acesse no navegador:
   - `http://localhost:3000`

---

## 3. Contas de Demonstração (Criadas pelo `npm run seed`)

Todas as contas iniciais utilizam a senha **`senha123`**:

| Perfil | Nome | E-mail | Senha |
| :--- | :--- | :--- | :--- |
| **Cliente** | João Silva | `joao@clickmontagem.com` | `senha123` |
| **Montador** | Marcos Oliveira | `marcos@clickmontagem.com` | `senha123` |
| **Montador** | Roberto Lima | `roberto@clickmontagem.com` | `senha123` |
| **Montador** | Ana Santos | `ana@clickmontagem.com` | `senha123` |

---

## 4. Execução dos Testes Automatizados

O projeto conta com suíte de testes de integração automatizados (`tests/api.test.js`) utilizando `node:test` e `supertest` sobre um banco isolado (`click_montagem_test`):

```bash
npm test
```

Os testes validam:
1. Cadastro de clientes e montadores + bloqueio de duplicidade de e-mail e CPF/CNPJ.
2. Isolamento estrito de sessão e identidade entre múltiplas contas (prevenindo vazamento de dados de outra conta).
3. Login, logout e recuperação/redefinição de senha com token criptográfico de uso único.
4. Autorização por perfil (`cliente` vs `montador`), propriedade de recursos (anti-IDOR), proteção de páginas HTML e validação CSRF.
5. Criação e consulta isolada de orçamentos.
6. Criação de propostas e bloqueio de propostas duplicadas pelo mesmo montador no mesmo orçamento.
7. Aceite de proposta, criação automática de agendamento e atualização consistente de estados.
8. Ciclo de vida do agendamento, bloqueio de avaliação antes da conclusão, avaliação de serviço concluído e recálculo de nota média do montador.
9. Edição de perfis (cliente e montador) e leitura/marcação de notificações reais.
10. Regras de exclusão e cancelamento preservando o histórico de serviços em andamento ou concluídos.

---

## 5. Principais Endpoints da API REST (`/api`)

- **Autenticação e Sessão:**
  - `GET /api/auth/me` — Retorna a sessão autenticada atual e token CSRF.
  - `GET /api/auth/csrf` — Emite/renova token CSRF.
  - `POST /api/usuarios/cadastrar` (ou `/api/auth/register`) — Cria conta e inicia sessão.
  - `POST /api/usuarios/login` (ou `/api/auth/login`) — Autentica e regenera sessão.
  - `POST /api/usuarios/logout` (ou `/api/auth/logout`) — Destrói sessão e limpa cookies.
  - `POST /api/usuarios/recuperar-senha` — Gera token temporário de recuperação.
  - `POST /api/usuarios/redefinir-senha` — Valida token e redefine senha.
- **Usuários e Montadores:**
  - `GET /api/usuarios/perfil/:id` — Dados privados do próprio usuário logado.
  - `PUT /api/usuarios/perfil/:id` — Atualiza perfil do próprio usuário.
  - `PUT /api/usuarios/senha/:id` — Altera senha mediante confirmação da senha atual.
  - `DELETE /api/usuarios/perfil/:id` — Remove conta (se não houver agendamentos ativos).
  - `GET /api/montadores` e `GET /api/montadores/:id` — Lista e consulta perfil público de montadores.
  - `PUT /api/montadores/:id` — Atualiza dados profissionais do próprio montador.
- **Orçamentos, Propostas, Agendamentos, Avaliações e Notificações:**
  - `POST /api/orcamentos`, `GET /api/orcamentos/meus`, `GET /api/orcamentos/abertos`, `GET /api/orcamentos/:id`, `PATCH /api/orcamentos/:id/status`, `DELETE /api/orcamentos/:id`
  - `POST /api/propostas`, `GET /api/propostas/orcamento/:orcId`, `GET /api/propostas/minhas`, `POST /api/propostas/:id/aceitar`, `POST /api/propostas/:id/recusar`, `DELETE /api/propostas/:id`
  - `GET /api/agendamentos`, `GET /api/agendamentos/:id`, `PATCH /api/agendamentos/:id/status`
  - `POST /api/avaliacoes`, `GET /api/avaliacoes/montador/:montadorId`, `GET /api/avaliacoes/agendamento/:agendamentoId`
  - `GET /api/notificacoes`, `GET /api/notificacoes/contar`, `PATCH /api/notificacoes/:id/lida`, `PATCH /api/notificacoes/ler-todas`
