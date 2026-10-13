<?php
// ================================================================
//  propostas.php — Gestão de Propostas de Montadores
//  Caminho: htdocs/click_montagem/api/propostas.php
//
//  ROTAS:
//    GET  ?action=listar&orc_id=X       → lista propostas de um orçamento
//    GET  ?action=listar_montador&mid=X → lista propostas enviadas por um montador
//    POST ?action=criar                 → montador envia proposta
//    POST ?action=aceitar&id=X          → cliente aceita (cria agendamento automático)
//    POST ?action=recusar&id=X          → cliente recusa
//    POST ?action=deletar&id=X          → remove proposta
// ================================================================

require_once __DIR__ . '/config/conexao.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

match (true) {
    $method === 'GET'  && $action === 'listar'          => listar((int)($_GET['orc_id'] ?? 0)),
    $method === 'GET'  && $action === 'listar_montador' => listarPorMontador((int)($_GET['mid'] ?? 0)),
    $method === 'POST' && $action === 'criar'           => criar(),
    $method === 'POST' && $action === 'aceitar'         => aceitarProposta((int)($_GET['id'] ?? 0)),
    $method === 'POST' && $action === 'recusar'         => recusarProposta((int)($_GET['id'] ?? 0)),
    $method === 'POST' && $action === 'deletar'         => deletar((int)($_GET['id'] ?? 0)),
    default                                             => erroJson('Rota inválida em propostas.php.', 404),
};

// ================================================================
// LISTAR PROPOSTAS DE UM ORÇAMENTO (Para o cliente)
// ================================================================
function listar(int $orcId): void
{
    if ($orcId <= 0) erroJson('orc_id é obrigatório.');

    $pdo  = conectar();
    $stmt = $pdo->prepare('
        SELECT
            p.id,
            p.orcamento_id,
            p.montador_id,
            p.valor,
            p.disponibilidade,
            p.horario,
            p.mensagem,
            p.status,
            p.criado_em,
            u.nome      AS montador_nome,
            u.telefone  AS montador_telefone,
            m.regiao_atendimento,
            ROUND(COALESCE((SELECT AVG(av.nota) FROM avaliacoes av WHERE av.montador_id = u.id), 5.0), 1) AS montador_nota,
            (SELECT COUNT(*) FROM avaliacoes av WHERE av.montador_id = u.id) AS total_avaliacoes,
            (SELECT COUNT(*) FROM agendamentos ag WHERE ag.montador_id = u.id AND ag.status = "concluido") AS servicos_concluidos
        FROM propostas p
        JOIN usuarios u ON u.id = p.montador_id
        LEFT JOIN montadores m ON m.usuario_id = u.id
        WHERE p.orcamento_id = :orc_id
        ORDER BY
            CASE p.status
                WHEN "aceita" THEN 1
                WHEN "pendente" THEN 2
                ELSE 3
            END,
            p.valor ASC
    ');
    $stmt->execute(['orc_id' => $orcId]);
    $lista = $stmt->fetchAll();

    foreach ($lista as &$row) {
        $row['id']                 = (int)$row['id'];
        $row['orcamento_id']       = (int)$row['orcamento_id'];
        $row['montador_id']        = (int)$row['montador_id'];
        $row['valor']              = (float)$row['valor'];
        $row['montador_nota']      = (float)$row['montador_nota'];
        $row['total_avaliacoes']   = (int)$row['total_avaliacoes'];
        $row['servicos_concluidos']= (int)$row['servicos_concluidos'];
    }

    responder(['sucesso' => true, 'propostas' => $lista]);
}

// ================================================================
// LISTAR PROPOSTAS DE UM MONTADOR
// ================================================================
function listarPorMontador(int $montadorId): void
{
    if ($montadorId <= 0) erroJson('mid (ID do montador) é obrigatório.');

    $pdo  = conectar();
    $stmt = $pdo->prepare('
        SELECT
            p.id,
            p.orcamento_id,
            p.valor,
            p.disponibilidade,
            p.horario,
            p.mensagem,
            p.status,
            p.criado_em,
            o.tipo_movel,
            o.categoria,
            o.bairro,
            o.cep,
            o.status AS orcamento_status,
            u.nome   AS cliente_nome
        FROM propostas p
        JOIN orcamentos o ON o.id = p.orcamento_id
        JOIN usuarios u   ON u.id = o.usuario_id
        WHERE p.montador_id = :mid
        ORDER BY p.criado_em DESC
    ');
    $stmt->execute(['mid' => $montadorId]);
    $lista = $stmt->fetchAll();

    foreach ($lista as &$row) {
        $row['id']           = (int)$row['id'];
        $row['orcamento_id'] = (int)$row['orcamento_id'];
        $row['valor']        = (float)$row['valor'];
    }

    responder(['sucesso' => true, 'propostas' => $lista]);
}

// ================================================================
// CRIAR PROPOSTA (INSERT)
// ================================================================
function criar(): void
{
    $d = lerJson();

    $orcId   = (int)($d['orcamento_id']  ?? 0);
    $montId  = (int)($d['montador_id']   ?? 0);
    $valor   = (float)($d['valor']       ?? 0);
    $disp    = trim($d['disponibilidade'] ?? '');
    $horario = validarEnum($d['horario'] ?? 'qualquer', ['manha','tarde','qualquer'], 'qualquer');
    $msg     = trim($d['mensagem']       ?? '');

    if ($orcId <= 0)  erroJson('orcamento_id é obrigatório.');
    if ($montId <= 0) erroJson('montador_id é obrigatório.');
    if ($valor <= 0)  erroJson('O valor da proposta deve ser maior que zero.');
    if (!$disp)       erroJson('A data de disponibilidade é obrigatória.');

    // Valida formato de data AAAA-MM-DD
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $disp)) {
        erroJson('Formato de data inválido. Use AAAA-MM-DD.');
    }

    $pdo = conectar();

    // Verifica se o orçamento existe e busca dono
    $chkOrc = $pdo->prepare('SELECT id, usuario_id, tipo_movel FROM orcamentos WHERE id = :id LIMIT 1');
    $chkOrc->execute(['id' => $orcId]);
    $orc = $chkOrc->fetch();
    if (!$orc) erroJson('Orçamento não encontrado.', 404);

    // Impede o dono do orçamento de fazer proposta para si mesmo
    if ((int)$orc['usuario_id'] === $montId) {
        erroJson('Você não pode enviar propostas para o seu próprio orçamento.');
    }

    // Verifica se montador já enviou proposta para este orçamento
    $chkDup = $pdo->prepare('
        SELECT id FROM propostas WHERE orcamento_id = :o AND montador_id = :m LIMIT 1
    ');
    $chkDup->execute(['o' => $orcId, 'm' => $montId]);
    if ($chkDup->fetch()) {
        erroJson('Você já enviou uma proposta para este orçamento.');
    }

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare('
            INSERT INTO propostas (orcamento_id, montador_id, valor, disponibilidade, horario, mensagem, status)
            VALUES (:orc, :mont, :valor, :disp, :hor, :msg, "pendente")
        ');
        $stmt->execute([
            'orc'   => $orcId,
            'mont'  => $montId,
            'valor' => $valor,
            'disp'  => $disp,
            'hor'   => $horario,
            'msg'   => $msg,
        ]);
        $propId = (int)$pdo->lastInsertId();

        // Notifica o cliente
        $pdo->prepare('
            INSERT INTO notificacoes (usuario_id, mensagem, lida)
            VALUES (:uid, :msg, 0)
        ')->execute([
            'uid' => $orc['usuario_id'],
            'msg' => "Você recebeu uma nova proposta de R$ " . number_format($valor, 2, ',', '.') . " para o serviço \"{$orc['tipo_movel']}\"!",
        ]);

        $pdo->commit();

        responder([
            'sucesso'  => true,
            'mensagem' => 'Proposta enviada com sucesso!',
            'id'       => $propId,
        ], 201);

    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        erroJson('Erro ao criar proposta: ' . $e->getMessage(), 500);
    }
}

// ================================================================
// ACEITAR PROPOSTA (Atualiza orcamento, proposta e CRIA AGENDAMENTO)
// ================================================================
function aceitarProposta(int $id): void
{
    if ($id <= 0) erroJson('ID da proposta inválido.');

    $d = lerJson();
    $enderecoCustom = trim($d['endereco'] ?? '');

    $pdo = conectar();

    // Busca detalhes da proposta, montador e do orçamento
    $stmt = $pdo->prepare('
        SELECT
            p.id,
            p.orcamento_id,
            p.montador_id,
            p.valor,
            p.disponibilidade,
            p.horario,
            o.usuario_id  AS cliente_id,
            o.tipo_movel,
            o.cep,
            o.bairro,
            uClie.nome    AS cliente_nome,
            uMont.nome    AS montador_nome
        FROM propostas p
        JOIN orcamentos o    ON o.id = p.orcamento_id
        JOIN usuarios uClie  ON uClie.id = o.usuario_id
        JOIN usuarios uMont  ON uMont.id = p.montador_id
        WHERE p.id = :id
        LIMIT 1
    ');
    $stmt->execute(['id' => $id]);
    $prop = $stmt->fetch();

    if (!$prop) erroJson('Proposta não encontrada.', 404);

    $orcId   = (int)$prop['orcamento_id'];
    $clieId  = (int)$prop['cliente_id'];
    $montId  = (int)$prop['montador_id'];
    $dataSrv = $prop['disponibilidade'];
    $horario = $prop['horario'];

    // Monta o endereço
    $endereco = $enderecoCustom;
    if (!$endereco) {
        $endereco = trim(($prop['bairro'] ? $prop['bairro'] . ' - ' : '') . ($prop['cep'] ? 'CEP ' . $prop['cep'] : 'Endereço a combinar'));
    }

    try {
        $pdo->beginTransaction();

        // 1. Marca esta proposta como 'aceita'
        $pdo->prepare('UPDATE propostas SET status = "aceita" WHERE id = :id')
            ->execute(['id' => $id]);

        // 2. Recusa as outras propostas pendentes para este orçamento
        $pdo->prepare('
            UPDATE propostas SET status = "recusada"
            WHERE orcamento_id = :orc AND id != :id AND status = "pendente"
        ')->execute(['orc' => $orcId, 'id' => $id]);

        // 3. Atualiza orçamento para 'em_andamento'
        $pdo->prepare('UPDATE orcamentos SET status = "em_andamento" WHERE id = :orc')
            ->execute(['orc' => $orcId]);

        // 4. CRIA O REGISTRO EM agendamentos
        $stmtAgend = $pdo->prepare('
            INSERT INTO agendamentos (proposta_id, cliente_id, montador_id, data_servico, horario, endereco, status)
            VALUES (:prop, :clie, :mont, :data, :hor, :end, "agendado")
        ');
        $stmtAgend->execute([
            'prop' => $id,
            'clie' => $clieId,
            'mont' => $montId,
            'data' => $dataSrv,
            'hor'  => $horario,
            'end'  => $endereco,
        ]);
        $agendamentoId = (int)$pdo->lastInsertId();

        // 5. Notificação para o montador
        $pdo->prepare('
            INSERT INTO notificacoes (usuario_id, mensagem, lida)
            VALUES (:uid, :msg, 0)
        ')->execute([
            'uid' => $montId,
            'msg' => "Sua proposta de R$ " . number_format((float)$prop['valor'], 2, ',', '.') . " foi aceita por {$prop['cliente_nome']}! Serviço agendado para $dataSrv.",
        ]);

        // 6. Notificação para o cliente
        $pdo->prepare('
            INSERT INTO notificacoes (usuario_id, mensagem, lida)
            VALUES (:uid, :msg, 0)
        ')->execute([
            'uid' => $clieId,
            'msg' => "Agendamento confirmado com o montador {$prop['montador_nome']} para o dia $dataSrv!",
        ]);

        $pdo->commit();

        responder([
            'sucesso'        => true,
            'mensagem'       => 'Proposta aceita com sucesso! Agendamento criado.',
            'agendamento_id' => $agendamentoId,
        ]);

    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        erroJson('Erro ao aceitar proposta: ' . $e->getMessage(), 500);
    }
}

// ================================================================
// RECUSAR PROPOSTA
// ================================================================
function recusarProposta(int $id): void
{
    if ($id <= 0) erroJson('ID inválido.');

    $pdo  = conectar();
    $stmt = $pdo->prepare('UPDATE propostas SET status = "recusada" WHERE id = :id');
    $stmt->execute(['id' => $id]);

    if ($stmt->rowCount() === 0) erroJson('Proposta não encontrada.', 404);

    responder(['sucesso' => true, 'mensagem' => 'Proposta recusada.']);
}

// ================================================================
// DELETAR PROPOSTA
// ================================================================
function deletar(int $id): void
{
    if ($id <= 0) erroJson('ID inválido.');

    $pdo  = conectar();
    $stmt = $pdo->prepare('DELETE FROM propostas WHERE id = :id');
    $stmt->execute(['id' => $id]);

    if ($stmt->rowCount() === 0) erroJson('Proposta não encontrada.', 404);

    responder(['sucesso' => true, 'mensagem' => 'Proposta removida.']);
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