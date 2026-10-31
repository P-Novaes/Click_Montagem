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
- **Node.js** >= 20.19 (Node 24 usado na validação desta implementação)
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

O projeto conta com testes de integração usando `node:test` e `supertest`. `npm test` inicia um processo MongoDB real e temporário via `mongodb-memory-server`, com bancos isolados para cada suíte, e o encerra ao terminar. Nenhum dado da aplicação é utilizado. Na primeira execução pode ser necessário acesso à internet para baixar o binário MongoDB; o cache fica em `.test-artifacts/`.

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
  - `POST /api/usuarios/recuperar-senha` — Envia link temporário por SMTP, sem retornar o token pela API.
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

## Autenticação com Google

A autenticação usa a biblioteca oficial `google-auth-library`, integrada às mesmas sessões Express/MongoDB do login tradicional. Implementação baseada no [fluxo OpenID Connect do Google](https://developers.google.com/identity/openid-connect/openid-connect) e no [Authorization Code Flow para servidores](https://developers.google.com/identity/protocols/oauth2/web-server). O botão segue a [identidade visual oficial](https://developers.google.com/identity/branding-guidelines).

### 1. Criar e configurar o projeto Google

1. Abra o [Google Cloud Console](https://console.cloud.google.com/) e crie ou selecione o projeto do Click Montagem.
2. Em **Google Auth Platform**, configure a marca/tela de consentimento: nome da aplicação, e-mail de suporte, contatos e, para publicação, domínio, homepage, política de privacidade e termos reais.
3. Configure o público apropriado. Para usuários fora da sua organização Google Workspace, use público externo. Enquanto estiver em modo de teste, inclua os e-mails das pessoas que executarão os testes em **Test users**.
4. Em **Data Access**, mantenha somente `openid`, `email` e `profile`. Esta integração não solicita Drive, Calendar nem acesso offline.
5. Em **Clients**, crie um **OAuth Client ID** do tipo **Web application**. Não use chave de API nem conta de serviço.
6. Para a execução local padrão do projeto (`PORT=3000`), cadastre exatamente:
   - **Authorized redirect URI:** `http://localhost:3000/api/auth/google/callback`
   - **Authorized JavaScript origin**, se preenchido no console: `http://localhost:3000`
   O fluxo é feito pelo servidor e não depende de SDK JavaScript Google; a origem JavaScript não substitui a URI de redirecionamento.
7. Copie Client ID e Client Secret para o `.env` do backend. Nunca coloque o secret em HTML, JavaScript público, commits ou logs.

### 2. Configurar e executar localmente

Na pasta `Click_Montagem-main`, copie `.env.example` para `.env` caso ainda não exista e preencha:

```dotenv
PORT=3000
NODE_ENV=development
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
```

As duas primeiras variáveis Google devem receber os valores reais do console, não os exemplos vazios acima. Mantenha `MONGODB_URI` e `SESSION_SECRET` configurados. Gere um segredo de sessão com `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` e salve-o somente no ambiente.

Execute `npm ci` e `npm start`. Abra [a página de login local](http://localhost:3000/pages/login.html) e clique em **Continuar com Google**. Use sempre `localhost` durante esse teste: iniciar em `127.0.0.1` e retornar a `localhost` perde o cookie e invalida o state. Se mudar a porta, atualize `PORT`, a origem e o callback no console e no `.env` para a mesma porta.

Sem credenciais, deixe **as três variáveis Google vazias**: o botão informa indisponibilidade e login/cadastro tradicionais continuam disponíveis. Configuração Google parcial ou callback inseguro impede a inicialização para evitar implantação incorreta. Não é necessário expor o servidor local à internet para o redirecionamento normal no navegador.

### 3. Fluxos de usuário

- **Conta com Google vinculado:** consulta pelo identificador estável `sub`, cria a mesma sessão e direciona ao painel do perfil salvo.
- **Nova conta:** cria registro pendente sem perfil padrão. Solicita cliente/montador, nome, telefone e termos. As APIs e páginas privadas permanecem bloqueadas até a conclusão. CPF/CNPJ e região profissional continuam opcionais, conforme o cadastro existente; documento preenchido respeita a unicidade.
- **Conta tradicional com o mesmo e-mail:** informa o conflito sem vincular. Na aba Entrar, informe as credenciais locais, marque **Vincular Google à minha conta após confirmar minha senha** e clique em Entrar. Selecione a conta Google verificada com o mesmo e-mail. O vínculo preserva ID, senha e dados da conta existente.
- **Cancelamento/erro/expiração:** apresenta mensagem na página de login e permite reiniciar. Uma tentativa dura dez minutos e não pode ser reutilizada. Iniciar outra tentativa no mesmo navegador invalida a anterior.
- **Logout:** usa a rota existente e encerra sessão local/tentativa OAuth; não desconecta a pessoa de outros serviços Google.

### 4. Produção

Defina `NODE_ENV=production` e um `SESSION_SECRET` forte, com pelo menos 32 caracteres. MongoDB deve estar conectado antes de criar a aplicação. O servidor cria os índices aditivos de usuários e tentativas antes de atender requisições; não exclui nem reescreve documentos existentes.

Use a origem HTTPS real do seu domínio. No Google Console, registre essa origem e a URI formada por **essa mesma origem + `/api/auth/google/callback`**; copie exatamente essa URI para `GOOGLE_CALLBACK_URL`. O domínio de produção não está definido nesta cópia, portanto não há um hostname de produção presumido. Cadastre domínio/URLs reais de privacidade e termos na tela de consentimento e conclua os requisitos de publicação/verificação indicados pelo Google.

Termine TLS em um proxy reverso e configure `TRUST_PROXY` somente com os IPs/sub-redes de proxies confiáveis. Por exemplo, `TRUST_PROXY=loopback` é apropriado apenas quando o proxy está na mesma máquina e encaminha `X-Forwarded-Proto: https`. Bloqueie acesso público direto à porta interna do Node. Sem HTTPS reconhecido, a aplicação recusa a requisição. Cookies de sessão são HttpOnly, Secure em produção e SameSite=Lax.

Não registre query strings do callback em logs do proxy (elas contêm o código temporário). Preserve credenciais somente no ambiente/gerenciador de segredos. `state`, nonce e verificador PKCE ficam apenas no servidor por dez minutos; tokens Google não são persistidos. O certificado público de verificação é reutilizado pela biblioteca.

### 5. Recuperação de senha segura

Foi corrigida uma falha anterior que retornava o token de redefinição ao solicitante. Isso comprometia a prova de senha exigida na vinculação. Agora o link é enviado somente por SMTP com TLS, usando [Nodemailer](https://nodemailer.com/smtp):

```dotenv
APP_URL=http://localhost:3000
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
```

Preencha host, remetente e credenciais do seu provedor. Porta 587 exige STARTTLS; porta 465 usa TLS desde a conexão. Em produção, `APP_URL` deve ser a origem pública HTTPS real. Não use `GOOGLE_CLIENT_SECRET` como senha SMTP. Sem SMTP configurado, a recuperação retorna 503 com mensagem explícita; login/cadastro tradicionais e Google não dependem de SMTP. Contas que usam apenas Google devem recuperar o acesso junto ao próprio Google.

### 6. Testes e validação externa

```bash
npm test
npm run test:google
npm run test:e2e
```

Os testes executam MongoDB real temporário e não usam a base da aplicação. `test:e2e` usa Playwright em modo headless, detectando Edge/Chrome no Windows. Em outros ambientes, instale Chromium com `npx playwright install chromium` ou informe `BROWSER_PATH`. Capturas de desktop/mobile ficam em `.test-artifacts/`. A suíte de API original também pode ser executada com `npm run test:api`.

Os testes locais simulam as respostas externas do Google com tokens RSA de teste e verificam sua assinatura pela biblioteca real. Isso **não comprova comunicação real com o Google**, consentimento ou credenciais de produção. A entrega SMTP também é simulada nos testes; nenhum e-mail real é enviado.

Após configurar credenciais, execute manualmente:

1. Entre com uma conta Google nova, confirme que o cadastro pede perfil e que não é possível abrir painel privado antes de concluí-lo.
2. Conclua como cliente, encerre a sessão e entre novamente; confirme o mesmo usuário e painel. Repita com outra conta como montador.
3. Cadastre uma conta tradicional com o mesmo e-mail de outra conta Google. Confirme que o login Google pede vinculação; tente senha errada, depois senha correta e seleção da conta Google correspondente.
4. Confirme que o ID e os dados antigos continuam acessíveis e que a senha tradicional continua funcionando.
5. Cancele o consentimento, tente reutilizar um callback e tente concluí-lo em outro navegador; confirme os erros. Teste duas contas em perfis de navegador diferentes e logout.
6. Repita no domínio HTTPS de produção, verificando cookie Secure, callback, proxy e permissões. Teste separadamente a entrega do e-mail de recuperação quando SMTP estiver configurado.

**Situação desta implementação:** testes locais executados; OAuth externo ainda não validado, pois não foram fornecidas credenciais Google válidas. O inventário de arquivos, rotas, alterações no modelo e detalhes da validação estão em [Relatório da implementação](docs/google-auth-implementation.md).
