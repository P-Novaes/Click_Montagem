<?php
// ================================================================
//  montadores.php — Consulta e Gestão de Profissionais Montadores
//  Caminho: htdocs/click_montagem/api/montadores.php
//
//  ROTAS:
//    GET  ?action=listar       → lista todos os montadores com notas e serviços
//    GET  ?action=buscar&id=X  → detalha perfil público completo e avaliações
//    POST ?action=atualizar&id=X → atualiza dados profissionais do montador
// ================================================================

require_once __DIR__ . '/config/conexao.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

match (true) {
    $method === 'GET'  && $action === 'listar'    => listar(),
    $method === 'GET'  && $action === 'buscar'    => buscar((int)($_GET['id'] ?? 0)),
    $method === 'POST' && $action === 'atualizar' => atualizar((int)($_GET['id'] ?? 0)),
    default                                       => erroJson('Rota inválida em montadores.php.', 404),
};

// ================================================================
// LISTAR MONTADORES (Com métricas consolidadas)
// ================================================================
function listar(): void
{
    $pdo = conectar();
    $busca = trim($_GET['busca'] ?? '');

    $sql = '
        SELECT
            u.id,
            u.nome,
            u.email,
            u.telefone,
            u.criado_em,
            m.cpf_cnpj,
            m.descricao_profissional,
            m.especialidades,
            m.regiao_atendimento,
            m.disponibilidade_geral,
            ROUND(COALESCE((SELECT AVG(av.nota) FROM avaliacoes av WHERE av.montador_id = u.id), 5.0), 1) AS nota_media,
            (SELECT COUNT(*) FROM avaliacoes av WHERE av.montador_id = u.id) AS total_avaliacoes,
            (SELECT COUNT(*) FROM agendamentos ag WHERE ag.montador_id = u.id AND ag.status = "concluido") AS total_servicos
        FROM usuarios u
        JOIN montadores m ON m.usuario_id = u.id
        WHERE u.tipo = "montador"
    ';

    $params = [];
    if ($busca !== '') {
        $sql .= ' AND (u.nome LIKE :q1 OR m.especialidades LIKE :q2 OR m.regiao_atendimento LIKE :q3)';
        $params['q1'] = "%$busca%";
        $params['q2'] = "%$busca%";
        $params['q3'] = "%$busca%";
    }

    $sql .= ' ORDER BY nota_media DESC, total_servicos DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $montadores = $stmt->fetchAll();

    foreach ($montadores as &$m) {
        $m['id']               = (int)$m['id'];
        $m['nota_media']       = (float)$m['nota_media'];
        $m['total_avaliacoes'] = (int)$m['total_avaliacoes'];
        $m['total_servicos']   = (int)$m['total_servicos'];
    }

    responder(['sucesso' => true, 'montadores' => $montadores]);
}

// ================================================================
// BUSCAR PERFIL COMPLETO (Com avaliações)
// ================================================================
function buscar(int $id): void
{
    if ($id <= 0) erroJson('ID do montador é obrigatório.');

    $pdo = conectar();

    $stmt = $pdo->prepare('
        SELECT
            u.id,
            u.nome,
            u.email,
            u.telefone,
            u.criado_em,
            m.cpf_cnpj,
            m.descricao_profissional,
            m.especialidades,
            m.regiao_atendimento,
            m.disponibilidade_geral,
            ROUND(COALESCE((SELECT AVG(av.nota) FROM avaliacoes av WHERE av.montador_id = u.id), 5.0), 1) AS nota_media,
            (SELECT COUNT(*) FROM avaliacoes av WHERE av.montador_id = u.id) AS total_avaliacoes,
            (SELECT COUNT(*) FROM agendamentos ag WHERE ag.montador_id = u.id AND ag.status = "concluido") AS total_servicos,
            (SELECT COUNT(*) FROM avaliacoes av WHERE av.montador_id = u.id AND av.nota >= 4) AS avaliacoes_positivas
        FROM usuarios u
        JOIN montadores m ON m.usuario_id = u.id
        WHERE u.id = :id AND u.tipo = "montador"
        LIMIT 1
    ');
    $stmt->execute(['id' => $id]);
    $perfil = $stmt->fetch();

    if (!$perfil) erroJson('Montador não encontrado.', 404);

    $perfil['id']               = (int)$perfil['id'];
    $perfil['nota_media']       = (float)$perfil['nota_media'];
    $perfil['total_avaliacoes'] = (int)$perfil['total_avaliacoes'];
    $perfil['total_servicos']   = (int)$perfil['total_servicos'];

    // Cálculo da taxa de satisfação
    $positivas = (int)($perfil['avaliacoes_positivas'] ?? 0);
    $totalAval = $perfil['total_avaliacoes'];
    $perfil['satisfacao'] = $totalAval > 0 ? round(($positivas / $totalAval) * 100) : 100;

    // Buscar avaliações detalhadas deste montador
    $stmtAval = $pdo->prepare('
        SELECT
            a.id,
            a.nota,
            a.comentario,
            a.criado_em,
            c.nome AS cliente_nome
        FROM avaliacoes a
        JOIN usuarios c ON c.id = a.cliente_id
        WHERE a.montador_id = :id
        ORDER BY a.criado_em DESC
        LIMIT 20
    ');
    $stmtAval->execute(['id' => $id]);
    $perfil['avaliacoes'] = $stmtAval->fetchAll();

    responder(['sucesso' => true, 'montador' => $perfil]);
}

// ================================================================
// ATUALIZAR DADOS DO MONTADOR
// ================================================================
function atualizar(int $id): void
{
    if ($id <= 0) erroJson('ID inválido.');

    $d = lerJson();

    $nome        = trim($d['nome'] ?? '');
    $telefone    = trim($d['telefone'] ?? '');
    $cpfCnpj     = trim($d['cpf_cnpj'] ?? $d['cpf'] ?? '');
    $descricao   = trim($d['descricao_profissional'] ?? $d['descricao'] ?? '');
    $espec       = trim($d['especialidades'] ?? '');
    $regiao      = trim($d['regiao_atendimento'] ?? $d['area_atuacao'] ?? '');
    $disp        = trim($d['disponibilidade_geral'] ?? '');

    $pdo = conectar();

    try {
        $pdo->beginTransaction();

        if ($nome || $telefone) {
            $sqlU = 'UPDATE usuarios SET ';
            $updates = [];
            $paramsU = ['id' => $id];
            if ($nome) { $updates[] = 'nome = :nome'; $paramsU['nome'] = $nome; }
            if ($telefone) { $updates[] = 'telefone = :tel'; $paramsU['tel'] = $telefone; }
            $sqlU .= implode(', ', $updates) . ' WHERE id = :id';
            $pdo->prepare($sqlU)->execute($paramsU);
        }

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
            'cpf'    => $cpfCnpj ?: '000.000.000-00',
            'desc'   => $descricao,
            'esp'    => $espec,
            'regiao' => $regiao,
            'disp'   => $disp,
        ]);

        $pdo->commit();
        responder(['sucesso' => true, 'mensagem' => 'Perfil profissional atualizado com sucesso!']);

    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        erroJson('Erro ao atualizar perfil do montador: ' . $e->getMessage(), 500);
    }
}

// ── Helpers ─────────────────────────────────────────────────────
function lerJson(): array
{
    $raw = file_get_contents('php://input');
    if ($raw) {
        $json = json_decode($raw, true);
        if (is_array($json)) return $json;
    }
    return $_POST;
}

