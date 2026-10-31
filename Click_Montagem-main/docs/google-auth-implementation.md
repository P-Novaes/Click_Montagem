# Relatório — Autenticação Google

Implementado em 31/10/2026 sobre o código presente no workspace. Não há repositório Git nesta cópia, portanto este inventário documenta os arquivos alterados sem depender de um diff Git.

## Arquitetura encontrada

Express/CommonJS, Mongoose e MongoDB; `express-session` com `connect-mongo` na coleção `sessoes`. A identidade é `req.session.userId`, carregada pelo middleware `hydrateUser`. `requireAuth` e `requireRole` protegem a API e o servidor protege as páginas HTML. O frontend consulta `/api/auth/me`; o cache em memória do navegador não autoriza operações. Login e cadastro estão em duas abas de `pages/login.html`. Perfil profissional é um subdocumento de `usuarios`.

O cadastro tradicional existente exige nome, e-mail, telefone e senha. CPF/CNPJ profissional é opcional e possui índice único parcial quando preenchido. O cadastro Google compartilha o validador, exige escolha explícita de perfil e aceite dos termos; não inventa exigências de CPF ou certificação profissional inexistentes no código original.

## Implementação

- Biblioteca oficial `google-auth-library` 10.9.1: Authorization Code Flow, PKCE S256, assinatura do ID token, issuer, audience, expiração e validação adicional de `nonce`, `azp`, `sub` e e-mail verificado. Escopos: `openid email profile`. Sem guardar access tokens, refresh tokens ou ID tokens.
- Tentativas em `oauth_tentativas`: hash do `state`, hash da sessão, nonce, verificador PKCE, ID de destino da vinculação e expiração em dez minutos. Consumo atômico com `findOneAndDelete`, índice único e TTL. Cancelamento/logout invalidam as provas correspondentes.
- Sessão regenerada e persistida após login tradicional, Google, prova de senha para vinculação e conclusão de cadastro. Cookies HttpOnly/SameSite=Lax; Secure e HTTPS obrigatórios em produção. Confiança no proxy somente quando configurada.
- `usuarios`: `googleSub` com índice único parcial, `googleEmail`, `googleEmailVerified`, `authProvider`, `cadastroCompleto` e `termosAceitosEm`. Google usa `tipo: null` durante cadastro pendente; telefone é exigido ao concluir. Senha continua obrigatória para contas locais. Contas anteriores recebem os defaults compatíveis pelo Mongoose, sem migração destrutiva.
- Foto não é armazenada: a interface atual usa iniciais, sem necessidade de importar imagens externas.
- Conta vinculada é procurada por `sub`, inclusive se o e-mail do Google mudar. Coincidência de e-mail nunca vincula automaticamente. O usuário deve informar a senha local, solicitar a vinculação e selecionar uma conta Google verificada com o mesmo e-mail. O ID e os dados associados são preservados.
- Novos usuários permanecem restritos à conclusão de cadastro e logout até escolher cliente/montador, informar nome/telefone e aceitar termos. A proteção é aplicada no backend.
- Botão Google nas duas abas, estados de carregamento/indisponibilidade/erro, opção de vinculação e conclusão de cadastro. HTML/CSS/JS puro, mantendo o cartão, a paleta e os estilos existentes.

## Rotas canônicas

| Método | Caminho | Função |
|---|---|---|
| GET | `/api/auth/google/status` | Disponibilidade pública, sem credenciais |
| POST | `/api/auth/google` | Gera URL de autorização, exige CSRF |
| POST | `/api/auth/google/link` | Confirma e-mail/senha e inicia vinculação, exige CSRF |
| GET | `/api/auth/google/callback` | Consome state, troca código, valida identidade, cria sessão |
| POST | `/api/auth/google/complete` | Conclui cadastro pendente, exige sessão e CSRF |
| GET | `/api/auth/me` | Mesmo contrato anterior, com `cadastroPendente` quando autenticado |
| POST | `/api/auth/logout` | Encerra sessão e invalida tentativa OAuth |

Os aliases históricos `/api/usuarios` e `/click_montagem/api` permanecem disponíveis. O callback configurável aceita somente o caminho canônico `/api/auth/google/callback` para evitar ambiguidade no console Google.

## Correção necessária na recuperação de senha

O código original devolvia o token de recuperação para qualquer pessoa que informasse um e-mail e mostrava um link imediato de redefinição. Isso permitia assumir uma conta tradicional e contornar a confirmação de senha para vincular Google.

Foi adicionado `nodemailer` para enviar o link por SMTP com TLS. A resposta da API não contém token, mesmo em testes, e não revela se o e-mail existe. Sem SMTP/APP_URL, o endpoint retorna indisponibilidade explícita (503). Cadastro, login e alteração de senha mediante senha atual continuam funcionando. Contas exclusivamente Google não ganham senha pelo endpoint de recuperação. Os testes interceptam apenas a entrega do e-mail, sem enviar mensagens reais.

## Arquivos criados

- `src/controllers/googleAuthController.js`
- `src/services/googleOAuthService.js`
- `src/services/passwordResetMailer.js`
- `src/models/OAuthAttempt.js`
- `src/utils/authSession.js`
- `assets/js/google-auth.js`
- `scripts/run-tests.js`
- `tests/google-auth.test.js`
- `tests/helpers/googleProvider.js`
- `tests/e2e-browser.js`
- `tests/password-reset-mailer.test.js`
- `docs/google-auth-implementation.md`

## Arquivos modificados

- `src/app.js`, `src/server.js`, `src/config/env.js`
- `src/controllers/authController.js`, `src/routes/authRoutes.js`
- `src/services/userService.js`, `src/models/User.js`
- `src/middlewares/auth.js`, `src/validators/validators.js`
- `pages/login.html`, `assets/css/login.css`, `assets/js/login.js`
- `pages/redefinir_senha.html`, `assets/js/recuperar_senha.js`, `assets/js/redefinir_senha.js`
- `tests/api.test.js`
- `.env.example`, `.gitignore`, `package.json`, `package-lock.json`, `README.md`

Nenhuma página de painel/CRUD foi modificada. Nenhum seed ou migração foi executado sobre dados da aplicação.

## Validação e pendências

`npm test`: 26 testes aprovados, cobrindo a suíte tradicional e integração Google com MongoDB real isolado. A fronteira HTTP do Google é simulada; tokens de teste são assinados com RSA e passam pela verificação real de assinatura da biblioteca. São exercitados assinatura adulterada, issuer/audience/nonce inválidos, expiração, ausência de e-mail verificado, state de outra sessão/expirado/reutilizado, callbacks concorrentes, erros/cancelamento, colisões, vínculos indevidos, perfis, CSRF, cookies, HTTPS, limite de tentativas, logout, sessão expirada e preservação dos quatro tipos de dados associados.

`npm run test:e2e`: aprovado em Edge headless, nas larguras 1280px e 390px. Verificados login/cadastro, cadastro Google simulado como cliente e montador, bloqueio de páginas antes da conclusão, logout, mensagem de cancelamento, Google indisponível e cadastro tradicional no navegador. Capturas geradas e inspecionadas em `.test-artifacts/`.

O teste externo com Google **não foi executado**: faltam Client ID/Secret válidos, configuração do consentimento e callback. Entrega SMTP real também depende das credenciais do operador. Consulte o passo a passo e o roteiro manual no README. Não interpretar testes locais com provedor simulado como aprovação do OAuth em produção.

