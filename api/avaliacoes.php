<?php
// ================================================================
//  avaliacoes.php — Gestão de Avaliações dos Montadores
//  Caminho: htdocs/click_montagem/api/avaliacoes.php
//
//  ROTAS:
//    POST ?action=criar                    → salva nova avaliação
//    GET  ?action=listar&montador_id=X     → lista avaliações de um montador
//    GET  ?action=buscar&agendamento_id=X  → busca avaliação de um agendamento
// ================================================================

require_once __DIR__ . '/config/conexao.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

match (true) {
    $method === 'POST' && $action === 'criar'  => criar(),
    $method === 'GET'  && $action === 'listar' => listarPorMontador((int)($_GET['montador_id'] ?? 0)),
    $method === 'GET'  && $action === 'buscar' => buscarPorAgendamento((int)($_GET['agendamento_id'] ?? 0)),
    default                                    => erroJson('Rota inválida em avaliacoes.php.', 404),
};

// ================================================================
// CRIAR AVALIAÇÃO (INSERT)
// ================================================================
function criar(): void
{
    $d = lerJson();

    $agendamentoId = (int)($d['agendamento_id'] ?? 0);
    $nota          = (int)($d['nota'] ?? 5);
    $comentario    = trim($d['comentario'] ?? '');

    if ($agendamentoId <= 0) {
        erroJson('agendamento_id é obrigatório.');
    }
    if ($nota < 1 || $nota > 5) {
        erroJson('A nota deve ser entre 1 e 5 estrelas.');
    }

    $pdo = conectar();

    // Busca dados do agendamento para garantir integridade e FKs
    $stmtAgend = $pdo->prepare('
        SELECT ag.id, ag.cliente_id, ag.montador_id, ag.status, uClie.nome AS cliente_nome
        FROM agendamentos ag
        JOIN usuarios uClie ON uClie.id = ag.cliente_id
        WHERE ag.id = :id
        LIMIT 1
    ');
    $stmtAgend->execute(['id' => $agendamentoId]);
    $agend = $stmtAgend->fetch();

    if (!$agend) {
        erroJson('Agendamento não encontrado.', 404);
    }

    $clienteId  = (int)$agend['cliente_id'];
    $montadorId = (int)$agend['montador_id'];

    // Verifica se já foi avaliado
    $chk = $pdo->prepare('SELECT id FROM avaliacoes WHERE agendamento_id = :aid LIMIT 1');
    $chk->execute(['aid' => $agendamentoId]);
    if ($chk->fetch()) {
        erroJson('Este serviço já foi avaliado anteriormente.');
    }

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare('
            INSERT INTO avaliacoes (agendamento_id, cliente_id, montador_id, nota, comentario)
            VALUES (:agend, :clie, :mont, :nota, :coment)
        ');
        $stmt->execute([
            'agend'  => $agendamentoId,
            'clie'   => $clienteId,
            'mont'   => $montadorId,
            'nota'   => $nota,
            'coment' => $comentario,
        ]);
        $avalId = (int)$pdo->lastInsertId();

        // Se o agendamento ainda não constava como concluído, conclui
        if ($agend['status'] !== 'concluido') {
            $pdo->prepare('UPDATE agendamentos SET status = "concluido" WHERE id = :id')
                ->execute(['id' => $agendamentoId]);
        }

        // Notificação para o montador
        $pdo->prepare('
            INSERT INTO notificacoes (usuario_id, mensagem, lida)
            VALUES (:uid, :msg, 0)
        ')->execute([
            'uid' => $montadorId,
            'msg' => "Você recebeu uma nova avaliação de $nota estrela(s) de {$agend['cliente_nome']}!",
        ]);

        $pdo->commit();

        responder([
            'sucesso'  => true,
            'mensagem' => 'Avaliação enviada com sucesso! Obrigado pelo feedback.',
            'id'       => $avalId,
        ], 201);

    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if ((string)$e->getCode() === '23000') {
            erroJson('Este serviço já foi avaliado.');
        }
        erroJson('Erro ao salvar avaliação: ' . $e->getMessage(), 500);
    }
}

// ================================================================
// LISTAR POR MONTADOR
// ================================================================
function listarPorMontador(int $montadorId): void
{
    if ($montadorId <= 0) erroJson('montador_id é obrigatório.');

    $pdo  = conectar();
    $stmt = $pdo->prepare('
        SELECT
            av.id,
            av.agendamento_id,
            av.nota,
            av.comentario,
            av.criado_em,
            u.nome AS cliente_nome,
            o.tipo_movel
        FROM avaliacoes av
        JOIN usuarios u      ON u.id = av.cliente_id
        JOIN agendamentos ag ON ag.id = av.agendamento_id
        JOIN propostas p     ON p.id = ag.proposta_id
        JOIN orcamentos o    ON o.id = p.orcamento_id
        WHERE av.montador_id = :mid
        ORDER BY av.criado_em DESC
    ');
    $stmt->execute(['mid' => $montadorId]);
    $lista = $stmt->fetchAll();

    foreach ($lista as &$row) {
        $row['id']             = (int)$row['id'];
        $row['agendamento_id'] = (int)$row['agendamento_id'];
        $row['nota']           = (int)$row['nota'];
    }

    responder(['sucesso' => true, 'avaliacoes' => $lista]);
}

// ================================================================
// BUSCAR POR AGENDAMENTO
// ================================================================
function buscarPorAgendamento(int $agendamentoId): void
{
    if ($agendamentoId <= 0) erroJson('agendamento_id é obrigatório.');

    $pdo  = conectar();
    $stmt = $pdo->prepare('
        SELECT av.*, u.nome AS cliente_nome
        FROM avaliacoes av
        JOIN usuarios u ON u.id = av.cliente_id
        WHERE av.agendamento_id = :aid
        LIMIT 1
    ');
    $stmt->execute(['aid' => $agendamentoId]);
    $aval = $stmt->fetch();

    if (!$aval) {
        responder(['sucesso' => true, 'avaliado' => false, 'avaliacao' => null]);
    }

    $aval['id']             = (int)$aval['id'];
    $aval['agendamento_id'] = (int)$aval['agendamento_id'];
    $aval['nota']           = (int)$aval['nota'];

    responder(['sucesso' => true, 'avaliado' => true, 'avaliacao' => $aval]);
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

