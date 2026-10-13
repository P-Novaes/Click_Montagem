<?php
// ================================================================
//  agendamentos.php — Gestão de Agendamentos e Calendário de Serviços
//  Caminho: htdocs/click_montagem/api/agendamentos.php
//
//  ROTAS:
//    GET  ?action=listar&cliente_id=X   → lista agendamentos do cliente
//    GET  ?action=listar&montador_id=X  → lista agendamentos do montador
//    GET  ?action=buscar&id=X           → detalha um agendamento específico
//    POST ?action=status&id=X           → atualiza status (agendado, em_andamento, concluido, cancelado)
// ================================================================

require_once __DIR__ . '/config/conexao.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

match (true) {
    $method === 'GET'  && $action === 'listar' => listar(),
    $method === 'GET'  && $action === 'buscar' => buscar((int)($_GET['id'] ?? 0)),
    $method === 'POST' && $action === 'status' => atualizarStatus((int)($_GET['id'] ?? 0)),
    default                                    => erroJson('Rota inválida em agendamentos.php.', 404),
};

// ================================================================
// LISTAR AGENDAMENTOS (Por cliente ou por montador)
// ================================================================
function listar(): void
{
    $clienteId  = (int)($_GET['cliente_id']  ?? 0);
    $montadorId = (int)($_GET['montador_id'] ?? 0);
    $statusFilt = trim($_GET['status'] ?? '');

    if ($clienteId <= 0 && $montadorId <= 0) {
        erroJson('Informe cliente_id ou montador_id.');
    }

    $pdo = conectar();

    $sql = '
        SELECT
            ag.id,
            ag.proposta_id,
            ag.cliente_id,
            ag.montador_id,
            ag.data_servico,
            ag.horario,
            ag.endereco,
            ag.status,
            ag.criado_em,
            ag.atualizado_em,
            uClie.nome     AS cliente_nome,
            uClie.telefone AS cliente_telefone,
            uMont.nome     AS montador_nome,
            uMont.telefone AS montador_telefone,
            o.id           AS orcamento_id,
            o.tipo_movel,
            o.categoria,
            o.bairro,
            o.cep,
            p.valor,
            (SELECT av.id FROM avaliacoes av WHERE av.agendamento_id = ag.id LIMIT 1) AS avaliacao_id,
            (SELECT av.nota FROM avaliacoes av WHERE av.agendamento_id = ag.id LIMIT 1) AS avaliacao_nota
        FROM agendamentos ag
        JOIN propostas p     ON p.id = ag.proposta_id
        JOIN orcamentos o    ON o.id = p.orcamento_id
        JOIN usuarios uClie  ON uClie.id = ag.cliente_id
        JOIN usuarios uMont  ON uMont.id = ag.montador_id
        WHERE 1=1
    ';

    $params = [];
    if ($clienteId > 0) {
        $sql .= ' AND ag.cliente_id = :cid';
        $params['cid'] = $clienteId;
    }
    if ($montadorId > 0) {
        $sql .= ' AND ag.montador_id = :mid';
        $params['mid'] = $montadorId;
    }
    if ($statusFilt !== '') {
        $sql .= ' AND ag.status = :st';
        $params['st'] = $statusFilt;
    }

    $sql .= ' ORDER BY ag.data_servico ASC, ag.id DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $lista = $stmt->fetchAll();

    foreach ($lista as &$row) {
        $row['id']             = (int)$row['id'];
        $row['proposta_id']    = (int)$row['proposta_id'];
        $row['cliente_id']     = (int)$row['cliente_id'];
        $row['montador_id']    = (int)$row['montador_id'];
        $row['orcamento_id']   = (int)$row['orcamento_id'];
        $row['valor']          = (float)$row['valor'];
        $row['avaliacao_id']   = $row['avaliacao_id'] ? (int)$row['avaliacao_id'] : null;
        $row['avaliacao_nota'] = $row['avaliacao_nota'] ? (int)$row['avaliacao_nota'] : null;
    }

    responder(['sucesso' => true, 'agendamentos' => $lista]);
}

// ================================================================
// BUSCAR UM AGENDAMENTO
// ================================================================
function buscar(int $id): void
{
    if ($id <= 0) erroJson('ID do agendamento é obrigatório.');

    $pdo  = conectar();
    $stmt = $pdo->prepare('
        SELECT
            ag.*,
            uClie.nome     AS cliente_nome,
            uClie.telefone AS cliente_telefone,
            uClie.email    AS cliente_email,
            uMont.nome     AS montador_nome,
            uMont.telefone AS montador_telefone,
            uMont.email    AS montador_email,
            o.id           AS orcamento_id,
            o.tipo_movel,
            o.categoria,
            o.descricao    AS orcamento_descricao,
            p.valor,
            (SELECT av.id FROM avaliacoes av WHERE av.agendamento_id = ag.id LIMIT 1) AS avaliacao_id,
            (SELECT av.nota FROM avaliacoes av WHERE av.agendamento_id = ag.id LIMIT 1) AS avaliacao_nota,
            (SELECT av.comentario FROM avaliacoes av WHERE av.agendamento_id = ag.id LIMIT 1) AS avaliacao_comentario
        FROM agendamentos ag
        JOIN propostas p     ON p.id = ag.proposta_id
        JOIN orcamentos o    ON o.id = p.orcamento_id
        JOIN usuarios uClie  ON uClie.id = ag.cliente_id
        JOIN usuarios uMont  ON uMont.id = ag.montador_id
        WHERE ag.id = :id
        LIMIT 1
    ');
    $stmt->execute(['id' => $id]);
    $agend = $stmt->fetch();

    if (!$agend) erroJson('Agendamento não encontrado.', 404);

    $agend['id']          = (int)$agend['id'];
    $agend['proposta_id'] = (int)$agend['proposta_id'];
    $agend['cliente_id']  = (int)$agend['cliente_id'];
    $agend['montador_id'] = (int)$agend['montador_id'];
    $agend['valor']       = (float)$agend['valor'];

    responder(['sucesso' => true, 'agendamento' => $agend]);
}

// ================================================================
// ATUALIZAR STATUS DO AGENDAMENTO (agendado, em_andamento, concluido, cancelado)
// ================================================================
function atualizarStatus(int $id): void
{
    if ($id <= 0) erroJson('ID do agendamento é obrigatório.');

    $d      = lerJson();
    $status = validarEnum(
        $d['status'] ?? '',
        ['agendado', 'em_andamento', 'concluido', 'cancelado'],
        ''
    );

    if (!$status) {
        erroJson('Status inválido. Use: agendado, em_andamento, concluido ou cancelado.');
    }

    $pdo = conectar();

    // Busca agendamento
    $stmt = $pdo->prepare('
        SELECT ag.*, o.id AS orcamento_id, o.tipo_movel, uMont.nome AS montador_nome
        FROM agendamentos ag
        JOIN propostas p  ON p.id = ag.proposta_id
        JOIN orcamentos o ON o.id = p.orcamento_id
        JOIN usuarios uMont ON uMont.id = ag.montador_id
        WHERE ag.id = :id
        LIMIT 1
    ');
    $stmt->execute(['id' => $id]);
    $agend = $stmt->fetch();

    if (!$agend) erroJson('Agendamento não encontrado.', 404);

    try {
        $pdo->beginTransaction();

        $stmtUp = $pdo->prepare('UPDATE agendamentos SET status = :s WHERE id = :id');
        $stmtUp->execute(['s' => $status, 'id' => $id]);

        if ($status === 'concluido') {
            // Atualiza proposta e orçamento para concluído
            $pdo->prepare('UPDATE propostas SET status = "concluida" WHERE id = :pid')
                ->execute(['pid' => $agend['proposta_id']]);
            $pdo->prepare('UPDATE orcamentos SET status = "concluido" WHERE id = :oid')
                ->execute(['oid' => $agend['orcamento_id']]);

            // Notifica o cliente para avaliar o montador
            $pdo->prepare('
                INSERT INTO notificacoes (usuario_id, mensagem, lida)
                VALUES (:uid, :msg, 0)
            ')->execute([
                'uid' => $agend['cliente_id'],
                'msg' => "O serviço \"{$agend['tipo_movel']}\" foi concluído! Por favor, avalie o profissional {$agend['montador_nome']}.",
            ]);
        } elseif ($status === 'cancelado') {
            $pdo->prepare('UPDATE propostas SET status = "recusada" WHERE id = :pid')
                ->execute(['pid' => $agend['proposta_id']]);
            $pdo->prepare('UPDATE orcamentos SET status = "aberto" WHERE id = :oid')
                ->execute(['oid' => $agend['orcamento_id']]);

            // Notifica montador e cliente
            $pdo->prepare('
                INSERT INTO notificacoes (usuario_id, mensagem, lida)
                VALUES (:uid, :msg, 0)
            ')->execute([
                'uid' => $agend['montador_id'],
                'msg' => "O agendamento do serviço \"{$agend['tipo_movel']}\" foi cancelado.",
            ]);
        }

        $pdo->commit();
        responder(['sucesso' => true, 'mensagem' => "Status atualizado para: $status"]);

    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        erroJson('Erro ao atualizar status: ' . $e->getMessage(), 500);
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

function validarEnum(string $valor, array $opcoes, string $padrao): string
{
    return in_array($valor, $opcoes, true) ? $valor : $padrao;
}

