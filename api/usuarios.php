<?php
// ================================================================
//  usuarios.php — Gestão de Usuários e Autenticação
//  Caminho: htdocs/click_montagem/api/usuarios.php
//
//  ROTAS:
//    POST ?action=cadastrar        → cadastra novo usuário (cliente ou montador)
//    POST ?action=login            → autentica usuário
//    GET  ?action=perfil&id=X      → retorna dados completos do perfil
//    POST ?action=atualizar&id=X   → atualiza dados cadastrais
//    POST ?action=alterar_senha&id=X → altera senha com validação da atual
//    POST ?action=recuperar_senha  → inicia recuperação de senha
//    POST ?action=redefinir_senha  → define nova senha
//    POST ?action=deletar&id=X     → remove conta
// ================================================================

require_once __DIR__ . '/config/conexao.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

match (true) {
    $method === 'POST' && $action === 'cadastrar'        => cadastrar(),
    $method === 'POST' && $action === 'login'            => login(),
    $method === 'GET'  && $action === 'perfil'           => perfil((int)($_GET['id'] ?? 0)),
    $method === 'POST' && $action === 'atualizar'        => atualizar((int)($_GET['id'] ?? 0)),
    $method === 'POST' && $action === 'alterar_senha'    => alterarSenha((int)($_GET['id'] ?? 0)),
    $method === 'POST' && $action === 'recuperar_senha'  => recuperarSenha(),
    $method === 'POST' && $action === 'redefinir_senha'  => redefinirSenha(),
    $method === 'POST' && $action === 'deletar'          => deletar((int)($_GET['id'] ?? 0)),
    default                                              => erroJson('Rota inválida em usuarios.php.', 404),
};

// ================================================================
// CADASTRAR (INSERT usuarios e opcional montadores)
// ================================================================
function cadastrar(): void
{
    $d = lerJson();

    $nome     = trim($d['nome']     ?? '');
    $email    = strtolower(trim($d['email']    ?? ''));
    $telefone = trim($d['telefone'] ?? '');
    $senha    = $d['senha']    ?? '';
    $tipo     = validarEnum($d['tipo'] ?? 'cliente', ['cliente', 'montador'], 'cliente');

    // Campos adicionais caso seja montador
    $cpfCnpj      = trim($d['cpf_cnpj'] ?? $d['cpf'] ?? '');
    $descricao    = trim($d['descricao_profissional'] ?? $d['descricao'] ?? '');
    $especialidades = trim($d['especialidades'] ?? '');
    $regiao       = trim($d['regiao_atendimento'] ?? $d['cidade'] ?? '');
    $dispGeral    = trim($d['disponibilidade_geral'] ?? 'Segunda a Sábado');

    // Validações básicas
    if (!$nome)                                      erroJson('O nome é obrigatório.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL))  erroJson('E-mail inválido.');
    if (!$telefone)                                  erroJson('O telefone é obrigatório.');
    if (strlen($senha) < 6)                          erroJson('A senha deve ter no mínimo 6 caracteres.');

    $pdo  = conectar();
    $hash = password_hash($senha, PASSWORD_BCRYPT, ['cost' => 12]);

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare('
            INSERT INTO usuarios (nome, email, telefone, senha, tipo)
            VALUES (:nome, :email, :telefone, :senha, :tipo)
        ');
        $stmt->execute([
            'nome'     => $nome,
            'email'    => $email,
            'telefone' => $telefone,
            'senha'    => $hash,
            'tipo'     => $tipo,
        ]);
        $id = (int) $pdo->lastInsertId();

        // Se for montador, cria registro na tabela montadores
        if ($tipo === 'montador') {
            if (!$cpfCnpj) {
                // Gera identificador provisório se não fornecido no primeiro cadastro
                $cpfCnpj = 'PEND-' . str_pad((string)$id, 6, '0', STR_PAD_LEFT);
            }
            $stmtM = $pdo->prepare('
                INSERT INTO montadores (usuario_id, cpf_cnpj, descricao_profissional, especialidades, regiao_atendimento, disponibilidade_geral)
                VALUES (:uid, :cpf, :desc, :esp, :regiao, :disp)
            ');
            $stmtM->execute([
                'uid'    => $id,
                'cpf'    => $cpfCnpj,
                'desc'   => $descricao ?: 'Profissional parceiro Click Montagem.',
                'esp'    => $especialidades ?: 'Móveis convencionais e planejados',
                'regiao' => $regiao ?: 'São Paulo e Região',
                'disp'   => $dispGeral,
            ]);
        }

        // Notificação de boas-vindas
        $stmtNotif = $pdo->prepare('
            INSERT INTO notificacoes (usuario_id, mensagem, lida)
            VALUES (:uid, :msg, 0)
        ');
        $stmtNotif->execute([
            'uid' => $id,
            'msg' => "Bem-vindo à plataforma Click Montagem, $nome!",
        ]);

        $pdo->commit();

        responder([
            'sucesso'  => true,
            'mensagem' => 'Conta criada com sucesso!',
            'usuario'  => [
                'id'       => $id,
                'nome'     => $nome,
                'email'    => $email,
                'telefone' => $telefone,
                'tipo'     => $tipo,
            ],
        ], 201);

    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if ((string)$e->getCode() === '23000') {
            erroJson('Este e-mail ou CPF/CNPJ já está cadastrado no sistema.');
        }
        erroJson('Erro ao cadastrar usuário: ' . $e->getMessage(), 500);
    }
}

// ================================================================
// LOGIN (Verifica hash e retorna dados completos)
// ================================================================
function login(): void
{
    $d     = lerJson();
    $email = strtolower(trim($d['email'] ?? ''));
    $senha = $d['senha'] ?? '';

    if (!$email || !$senha) erroJson('E-mail e senha são obrigatórios.');

    $pdo  = conectar();
    $stmt = $pdo->prepare('
        SELECT u.id, u.nome, u.email, u.telefone, u.tipo, u.senha,
               m.cpf_cnpj, m.descricao_profissional, m.especialidades, m.regiao_atendimento, m.disponibilidade_geral
        FROM usuarios u
        LEFT JOIN montadores m ON m.usuario_id = u.id
        WHERE u.email = :email
        LIMIT 1
    ');
    $stmt->execute(['email' => $email]);
    $u = $stmt->fetch();

    $hashFalso = '$2y$12$invalido.hash.para.evitar.timing.attack.XXXXX';
    if (!$u || !password_verify($senha, $u['senha'] ?? $hashFalso)) {
        erroJson('E-mail ou senha incorretos.', 401);
    }

    // Monta resposta sem expor senha
    $dadosUsuario = [
        'id'       => (int)$u['id'],
        'nome'     => $u['nome'],
        'email'    => $u['email'],
        'telefone' => $u['telefone'],
        'tipo'     => $u['tipo'],
    ];

    if ($u['tipo'] === 'montador') {
        $dadosUsuario['montador'] = [
            'cpf_cnpj'               => $u['cpf_cnpj'],
            'descricao_profissional' => $u['descricao_profissional'],
            'especialidades'         => $u['especialidades'],
            'regiao_atendimento'     => $u['regiao_atendimento'],
            'disponibilidade_geral'  => $u['disponibilidade_geral'],
        ];
    }

    responder([
        'sucesso'  => true,
        'mensagem' => 'Login realizado com sucesso!',
        'usuario'  => $dadosUsuario,
    ]);
}

// ================================================================
// PERFIL (READ - Usuário + Montador se aplicável + Estatísticas)
// ================================================================
function perfil(int $id): void
{
    if ($id <= 0) erroJson('ID inválido.');

    $pdo  = conectar();
    $stmt = $pdo->prepare('
        SELECT u.id, u.nome, u.email, u.telefone, u.tipo, u.criado_em,
               m.cpf_cnpj, m.descricao_profissional, m.especialidades, m.regiao_atendimento, m.disponibilidade_geral
        FROM usuarios u
        LEFT JOIN montadores m ON m.usuario_id = u.id
        WHERE u.id = :id
        LIMIT 1
    ');
    $stmt->execute(['id' => $id]);
    $u = $stmt->fetch();

    if (!$u) erroJson('Usuário não encontrado.', 404);

    $u['id'] = (int)$u['id'];

    // Se for montador, inclui estatísticas de notas e serviços concluídos
    if ($u['tipo'] === 'montador') {
        $stmtStats = $pdo->prepare('
            SELECT
                COALESCE(AVG(a.nota), 5.0) AS nota_media,
                COUNT(a.id) AS total_avaliacoes,
                (SELECT COUNT(*) FROM agendamentos ag WHERE ag.montador_id = :id AND ag.status = "concluido") AS servicos_concluidos
            FROM avaliacoes a
            WHERE a.montador_id = :id
        ');
        $stmtStats->execute(['id' => $id]);
        $stats = $stmtStats->fetch();

        $u['nota_media']           = round((float)($stats['nota_media'] ?? 5.0), 1);
        $u['total_avaliacoes']      = (int)($stats['total_avaliacoes'] ?? 0);
        $u['servicos_concluidos']  = (int)($stats['servicos_concluidos'] ?? 0);
    }

    responder(['sucesso' => true, 'usuario' => $u]);
}

// ================================================================
// ATUALIZAR (UPDATE dados pessoais e profissionais)
// ================================================================
function atualizar(int $id): void
{
    if ($id <= 0) erroJson('ID inválido.');

    $d        = lerJson();
    $nome     = trim($d['nome']     ?? '');
    $telefone = trim($d['telefone'] ?? '');
    $email    = strtolower(trim($d['email'] ?? ''));

    if (!$nome || !$telefone) erroJson('Nome e telefone são obrigatórios.');

    $pdo = conectar();

    try {
        $pdo->beginTransaction();

        // Atualiza tabela usuarios
        $sqlUsr = 'UPDATE usuarios SET nome = :nome, telefone = :telefone';
        $paramsUsr = ['nome' => $nome, 'telefone' => $telefone, 'id' => $id];

        if ($email && filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $sqlUsr .= ', email = :email';
            $paramsUsr['email'] = $email;
        }
        $sqlUsr .= ' WHERE id = :id';

        $stmt = $pdo->prepare($sqlUsr);
        $stmt->execute($paramsUsr);

        // Verifica tipo do usuário
        $stmtTipo = $pdo->prepare('SELECT tipo FROM usuarios WHERE id = :id');
        $stmtTipo->execute(['id' => $id]);
        $tipo = $stmtTipo->fetchColumn();

        // Se montador, atualiza dados na tabela montadores
        if ($tipo === 'montador') {
            $cpfCnpj      = trim($d['cpf_cnpj'] ?? $d['cpf'] ?? '');
            $descricao    = trim($d['descricao_profissional'] ?? $d['descricao'] ?? '');
            $especialidades = trim($d['especialidades'] ?? '');
            $regiao       = trim($d['regiao_atendimento'] ?? $d['area_atuacao'] ?? $d['cidade'] ?? '');
            $dispGeral    = trim($d['disponibilidade_geral'] ?? '');

            $stmtM = $pdo->prepare('
                INSERT INTO montadores (usuario_id, cpf_cnpj, descricao_profissional, especialidades, regiao_atendimento, disponibilidade_geral)
                VALUES (:uid, :cpf, :desc, :esp, :regiao, :disp)
                ON DUPLICATE KEY UPDATE
                    cpf_cnpj = IF(:cpf != "", :cpf, cpf_cnpj),
                    descricao_profissional = :desc,
                    especialidades = :esp,
                    regiao_atendimento = :regiao,
                    disponibilidade_geral = IF(:disp != "", :disp, disponibilidade_geral)
            ');
            $stmtM->execute([
                'uid'    => $id,
                'cpf'    => $cpfCnpj,
                'desc'   => $descricao,
                'esp'    => $especialidades,
                'regiao' => $regiao,
                'disp'   => $dispGeral,
            ]);
        }

        $pdo->commit();
        responder(['sucesso' => true, 'mensagem' => 'Perfil atualizado com sucesso!']);

    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if ((string)$e->getCode() === '23000') {
            erroJson('E-mail ou CPF/CNPJ já utilizado por outro usuário.');
        }
        erroJson('Erro ao atualizar: ' . $e->getMessage(), 500);
    }
}

// ================================================================
// ALTERAR SENHA
// ================================================================
function alterarSenha(int $id): void
{
    if ($id <= 0) erroJson('ID inválido.');

    $d           = lerJson();
    $senhaAtual  = $d['senha_atual']  ?? '';
    $novaSenha   = $d['nova_senha']   ?? '';
    $confirmar   = $d['confirmar_senha'] ?? $novaSenha;

    if (!$senhaAtual || !$novaSenha) erroJson('Preencha a senha atual e a nova senha.');
    if (strlen($novaSenha) < 6)      erroJson('A nova senha deve ter no mínimo 6 caracteres.');
    if ($novaSenha !== $confirmar)   erroJson('A confirmação da senha não confere.');

    $pdo  = conectar();
    $stmt = $pdo->prepare('SELECT senha FROM usuarios WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $id]);
    $hashAtual = $stmt->fetchColumn();

    if (!$hashAtual || !password_verify($senhaAtual, $hashAtual)) {
        erroJson('A senha atual está incorreta.', 401);
    }

    $novoHash = password_hash($novaSenha, PASSWORD_BCRYPT, ['cost' => 12]);
    $stmtUp = $pdo->prepare('UPDATE usuarios SET senha = :s WHERE id = :id');
    $stmtUp->execute(['s' => $novoHash, 'id' => $id]);

    responder(['sucesso' => true, 'mensagem' => 'Senha alterada com sucesso!']);
}

// ================================================================
// RECUPERAR SENHA (Valida e-mail existente)
// ================================================================
function recuperarSenha(): void
{
    $d     = lerJson();
    $email = strtolower(trim($d['email'] ?? ''));

    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        erroJson('Informe um e-mail válido.');
    }

    $pdo  = conectar();
    $stmt = $pdo->prepare('SELECT id, nome FROM usuarios WHERE email = :email LIMIT 1');
    $stmt->execute(['email' => $email]);
    $u = $stmt->fetch();

    if (!$u) {
        erroJson('E-mail não encontrado em nossa base de usuários.', 404);
    }

    // Gera token de redefinição simples baseado no hash do ID e timestamp
    $token = hash('sha256', $u['id'] . $email . 'click_secret_' . date('YmdH'));

    responder([
        'sucesso'  => true,
        'mensagem' => 'Instruções para redefinição enviadas para ' . $email,
        'token'    => $token,
        'email'    => $email,
    ]);
}

// ================================================================
// REDEFINIR SENHA
// ================================================================
function redefinirSenha(): void
{
    $d         = lerJson();
    $email     = strtolower(trim($d['email'] ?? ''));
    $novaSenha = $d['nova_senha'] ?? $d['senha'] ?? '';

    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        erroJson('E-mail inválido.');
    }
    if (strlen($novaSenha) < 6) {
        erroJson('A nova senha deve ter no mínimo 6 caracteres.');
    }

    $pdo  = conectar();
    $stmt = $pdo->prepare('SELECT id FROM usuarios WHERE email = :email LIMIT 1');
    $stmt->execute(['email' => $email]);
    $id = $stmt->fetchColumn();

    if (!$id) {
        erroJson('Usuário não encontrado.', 404);
    }

    $novoHash = password_hash($novaSenha, PASSWORD_BCRYPT, ['cost' => 12]);
    $stmtUp = $pdo->prepare('UPDATE usuarios SET senha = :s WHERE id = :id');
    $stmtUp->execute(['s' => $novoHash, 'id' => $id]);

    responder(['sucesso' => true, 'mensagem' => 'Senha redefinida com sucesso! Faça login com a nova senha.']);
}

// ================================================================
// DELETAR (DELETE)
// ================================================================
function deletar(int $id): void
{
    if ($id <= 0) erroJson('ID inválido.');

    $pdo  = conectar();
    $stmt = $pdo->prepare('DELETE FROM usuarios WHERE id = :id');
    $stmt->execute(['id' => $id]);

    if ($stmt->rowCount() === 0) erroJson('Usuário não encontrado.', 404);

    responder(['sucesso' => true, 'mensagem' => 'Conta removida com sucesso.']);
}

// ================================================================
// HELPERS
// ================================================================
function lerJson(): array
{
    $raw = file_get_contents('php://input');
    if ($raw) {
        $json = json_decode($raw, true);
        if (is_array($json)) return $json;
    }
    return $_POST;
}

function validarEnum(string $valor, array $opcoes, string $padrao): string
{
    return in_array($valor, $opcoes, true) ? $valor : $padrao;
}