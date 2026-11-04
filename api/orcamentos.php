<?php
// ================================================================
//  orcamentos.php — Gestão de Orçamentos e Pedidos de Serviço
//  Caminho: htdocs/click_montagem/api/orcamentos.php
//
//  ROTAS:
//    POST ?action=criar              → salva novo orçamento (com data preferida e montador opcional)
//    GET  ?action=listar&uid=X       → lista orçamentos do cliente
//    GET  ?action=listar_abertos     → lista solicitações abertas para montadores (suporta ?mid=X)
//    GET  ?action=buscar&id=X        → detalha um orçamento com dados do cliente
//    POST ?action=confirmar_montador&id=X → montador confirma o orçamento e gera o agendamento
//    POST ?action=status&id=X        → atualiza status (aberto, em_andamento, concluido, cancelado)
//    POST ?action=deletar&id=X       → remove orçamento
// ================================================================

require_once __DIR__ . '/config/conexao.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

match (true) {
    $method === 'POST' && $action === 'criar'              => criar(),
    $method === 'GET'  && $action === 'listar'             => listar((int)($_GET['uid'] ?? 0)),
    $method === 'GET'  && $action === 'listar_abertos'     => listarAbertos(),
    $method === 'GET'  && $action === 'buscar'             => buscar((int)($_GET['id'] ?? 0)),
    $method === 'POST' && $action === 'confirmar_montador' => confirmarMontador((int)($_GET['id'] ?? 0)),
    $method === 'POST' && $action === 'status'             => atualizarStatus((int)($_GET['id'] ?? 0)),
    $method === 'POST' && $action === 'deletar'            => deletar((int)($_GET['id'] ?? 0)),
    default                                                => erroJson('Rota inválida em orcamentos.php.', 404),
};

// ================================================================
// CRIAR ORÇAMENTO (INSERT)
// ================================================================
function criar(): void
{
    $d = lerJson();

    $uid        = (int)($d['usuario_id']      ?? 0);
    $montadorId = (int)($d['montador_id']     ?? 0);
    $categoria  = validarEnum($d['categoria']  ?? 'padrao',   ['padrao','planejado'],              'padrao');
    $tipoMovel  = trim($d['tipo_movel']        ?? '');
    $qtd        = max(1, (int)($d['quantidade_pecas'] ?? 1));
    $complex    = validarEnum($d['complexidade'] ?? 'simples', ['simples','moderado','complexo'],   'simples');
    $descricao  = trim($d['descricao']         ?? '');
    $cep        = trim($d['cep']               ?? '');
    $bairro     = trim($d['bairro']            ?? '');
    $horario    = validarEnum($d['horario']     ?? 'qualquer', ['manha','tarde','qualquer'],        'qualquer');
    $dataPref   = trim($d['data_preferida']    ?? '');
    $preco      = trim($d['preco_estimado']    ?? '');

    if ($uid <= 0)   erroJson('usuario_id é obrigatório e deve ser válido.');
    if (!$tipoMovel) erroJson('O tipo de móvel é obrigatório.');

    if ($dataPref && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dataPref)) {
        $dataPref = null;
    }

    $pdo  = conectar();

    // Verifica se usuário existe
    $chkUser = $pdo->prepare('SELECT id, nome FROM usuarios WHERE id = :id LIMIT 1');
    $chkUser->execute(['id' => $uid]);
    $usr = $chkUser->fetch();
    if (!$usr) erroJson('Usuário não encontrado.', 404);

    // Valida montador alvo se informado
    $montadorAlvoNome = null;
    if ($montadorId > 0) {
        $chkMont = $pdo->prepare('SELECT id, nome FROM usuarios WHERE id = :id AND tipo = "montador" LIMIT 1');
        $chkMont->execute(['id' => $montadorId]);
        $mRow = $chkMont->fetch();
        if ($mRow) {
            $montadorAlvoNome = $mRow['nome'];
        } else {
            $montadorId = null;
        }
    } else {
        $montadorId = null;
    }

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare('
            INSERT INTO orcamentos
                (usuario_id, montador_id, categoria, tipo_movel, quantidade_pecas,
                 complexidade, descricao, cep, bairro, horario, data_preferida, preco_estimado, status)
            VALUES
                (:uid, :mid, :cat, :tipo, :qtd,
                 :comp, :desc, :cep, :bairro, :hor, :datapref, :preco, "aberto")
        ');
        $stmt->execute([
            'uid'      => $uid,
            'mid'      => $montadorId,
            'cat'      => $categoria,
            'tipo'     => $tipoMovel,
            'qtd'      => $qtd,
            'comp'     => $complex,
            'desc'     => $descricao,
            'cep'      => $cep,
            'bairro'   => $bairro,
            'hor'      => $horario,
            'datapref' => $dataPref,
            'preco'    => $preco,
        ]);

        $idOrc = (int)$pdo->lastInsertId();

        // Notificação para o cliente confirmando envio
        $msgClie = $montadorAlvoNome
            ? "Seu pedido de orçamento para \"$tipoMovel\" foi enviado diretamente para o montador $montadorAlvoNome!"
            : "Seu pedido de orçamento para \"$tipoMovel\" foi publicado para os montadores da plataforma!";

        $pdo->prepare('
            INSERT INTO notificacoes (usuario_id, mensagem, lida)
            VALUES (:uid, :msg, 0)
        ')->execute([
            'uid' => $uid,
            'msg' => $msgClie,
        ]);

        // Se direcionado a um montador específico, notifica-o imediatamente
        if ($montadorId) {
            $pdo->prepare('
                INSERT INTO notificacoes (usuario_id, mensagem, lida)
                VALUES (:uid, :msg, 0)
            ')->execute([
                'uid' => $montadorId,
                'msg' => "Novo pedido de orçamento recebido de {$usr['nome']} para \"$tipoMovel\"!",
            ]);
        }

        $pdo->commit();

        responder([
            'sucesso'  => true,
            'mensagem' => 'Orçamento enviado! Aguarde a confirmação do montador.',
            'id'       => $idOrc,
            'montador' => $montadorAlvoNome,
        ], 201);

    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        erroJson('Erro ao criar orçamento: ' . $e->getMessage(), 500);
    }
}

// ================================================================
// LISTAR POR CLIENTE (SELECT)
// ================================================================
function listar(int $uid): void
{
    if ($uid <= 0) erroJson('uid é obrigatório para listar orçamentos do cliente.');

    $pdo  = conectar();
    $stmt = $pdo->prepare('
        SELECT
            o.*,
            uMont.nome AS montador_alvo_nome,
            (SELECT COUNT(*) FROM propostas p WHERE p.orcamento_id = o.id) AS total_propostas,
            (SELECT COUNT(*) FROM propostas p WHERE p.orcamento_id = o.id AND p.status = "pendente") AS propostas_novas
        FROM orcamentos o
        LEFT JOIN usuarios uMont ON uMont.id = o.montador_id
        WHERE o.usuario_id = :uid
        ORDER BY o.criado_em DESC
    ');
    $stmt->execute(['uid' => $uid]);
    $orcamentos = $stmt->fetchAll();

    foreach ($orcamentos as &$o) {
        $o['id']               = (int)$o['id'];
        $o['usuario_id']       = (int)$o['usuario_id'];
        $o['montador_id']      = $o['montador_id'] ? (int)$o['montador_id'] : null;
        $o['quantidade_pecas'] = (int)$o['quantidade_pecas'];
        $o['total_propostas']  = (int)$o['total_propostas'];
        $o['propostas_novas']  = (int)$o['propostas_novas'];
    }

    responder(['sucesso' => true, 'orcamentos' => $orcamentos]);
}

// ================================================================
// LISTAR ABERTOS (Para montadores visualizarem pedidos disponíveis)
// ================================================================
function listarAbertos(): void
{
    $pdo = conectar();
    $mid = (int)($_GET['mid'] ?? 0);

    $sql = '
        SELECT
            o.id,
            o.categoria,
            o.tipo_movel,
            o.quantidade_pecas,
            o.complexidade,
            o.descricao,
            o.cep,
            o.bairro,
            o.horario,
            o.data_preferida,
            o.preco_estimado,
            o.status,
            o.criado_em,
            o.montador_id,
            u.id       AS cliente_id,
            u.nome     AS cliente_nome,
            u.telefone AS cliente_telefone,
            (SELECT COUNT(*) FROM propostas p WHERE p.orcamento_id = o.id) AS total_propostas
        FROM orcamentos o
        JOIN usuarios u ON u.id = o.usuario_id
        WHERE o.status = "aberto"
    ';

    $params = [];
    if ($mid > 0) {
        // Mostra pedidos abertos gerais (montador_id IS NULL) OU direcionados a este montador
        $sql .= ' AND (o.montador_id IS NULL OR o.montador_id = :mid)';
        $params['mid'] = $mid;
        $sql .= ' ORDER BY (o.montador_id = :mid_order) DESC, o.criado_em DESC LIMIT 40';
        $params['mid_order'] = $mid;
    } else {
        $sql .= ' ORDER BY o.criado_em DESC LIMIT 40';
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $pedidos = $stmt->fetchAll();

    foreach ($pedidos as &$p) {
        $p['id']               = (int)$p['id'];
        $p['cliente_id']       = (int)$p['cliente_id'];
        $p['montador_id']      = $p['montador_id'] ? (int)$p['montador_id'] : null;
        $p['exclusivo']        = ($mid > 0 && (int)$p['montador_id'] === $mid);
        $p['quantidade_pecas'] = (int)$p['quantidade_pecas'];
        $p['total_propostas']  = (int)$p['total_propostas'];
    }

    responder(['sucesso' => true, 'pedidos' => $pedidos]);
}

// ================================================================
// BUSCAR UM ORÇAMENTO (SELECT)
// ================================================================
function buscar(int $id): void
{
    if ($id <= 0) erroJson('ID do orçamento é obrigatório.');

    $pdo  = conectar();
    $stmt = $pdo->prepare('
        SELECT
            o.*,
            u.nome     AS cliente_nome,
            u.telefone AS cliente_telefone,
            u.email    AS cliente_email,
            uMont.nome AS montador_alvo_nome
        FROM orcamentos o
        JOIN usuarios u ON u.id = o.usuario_id
        LEFT JOIN usuarios uMont ON uMont.id = o.montador_id
        WHERE o.id = :id
        LIMIT 1
    ');
    $stmt->execute(['id' => $id]);
    $orc = $stmt->fetch();

    if (!$orc) erroJson('Orçamento não encontrado.', 404);

    $orc['id']               = (int)$orc['id'];
    $orc['usuario_id']       = (int)$orc['usuario_id'];
    $orc['montador_id']      = $orc['montador_id'] ? (int)$orc['montador_id'] : null;
    $orc['quantidade_pecas'] = (int)$orc['quantidade_pecas'];

    responder(['sucesso' => true, 'orcamento' => $orc]);
}

// ================================================================
// CONFIRMAR ORÇAMENTO PELO MONTADOR (Gera Agendamento no Calendário)
// ================================================================
function confirmarMontador(int $id): void
{
    if ($id <= 0) erroJson('ID do orçamento é obrigatório.');

    $d = lerJson();
    $montadorId = (int)($d['montador_id'] ?? $_GET['montador_id'] ?? 0);
    if ($montadorId <= 0) erroJson('montador_id é obrigatório.');

    $pdo = conectar();

    // 1. Busca orçamento
    $stmtOrc = $pdo->prepare('
        SELECT o.*, u.nome AS cliente_nome, u.telefone AS cliente_telefone, u.email AS cliente_email
        FROM orcamentos o
        JOIN usuarios u ON u.id = o.usuario_id
        WHERE o.id = :id
        LIMIT 1
    ');
    $stmtOrc->execute(['id' => $id]);
    $orc = $stmtOrc->fetch();

    if (!$orc) erroJson('Orçamento não encontrado.', 404);
    if ($orc['status'] !== 'aberto') {
        erroJson('Este orçamento já foi confirmado ou não está mais aberto.', 400);
    }

    // 2. Busca montador
    $stmtM = $pdo->prepare('SELECT id, nome, telefone FROM usuarios WHERE id = :id AND tipo = "montador" LIMIT 1');
    $stmtM->execute(['id' => $montadorId]);
    $montador = $stmtM->fetch();
    if (!$montador) erroJson('Montador não encontrado.', 404);

    // 3. Define data do serviço
    $dataSrv = trim($d['data_servico'] ?? '');
    if (!$dataSrv || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dataSrv)) {
        $dataSrv = $orc['data_preferida'] ?: date('Y-m-d', strtotime('+1 day'));
    }

    // 4. Define horário
    $horario = validarEnum($d['horario'] ?? $orc['horario'] ?? 'qualquer', ['manha','tarde','qualquer'], 'qualquer');

    // 5. Define valor do serviço
    $valor = (float)($d['valor'] ?? 0);
    if ($valor <= 0) {
        if (preg_match('/(\d+)/', str_replace(['.', ','], '', $orc['preco_estimado']), $matches)) {
            $valor = (float)$matches[1];
        } else {
            $valor = 150.00;
        }
    }

    // 6. Define endereço completo
    $endereco = trim($d['endereco'] ?? '');
    if (!$endereco) {
        $endereco = trim(($orc['bairro'] ? $orc['bairro'] . ' - ' : '') . ($orc['cep'] ? 'CEP ' . $orc['cep'] : 'São Paulo, SP'));
    }

    try {
        $pdo->beginTransaction();

        // 1. Atualiza status do orçamento para em_andamento e vincula o montador
        $pdo->prepare('
            UPDATE orcamentos
            SET status = "em_andamento", montador_id = :mid
            WHERE id = :id
        ')->execute(['mid' => $montadorId, 'id' => $id]);

        // 2. Cria registro na tabela propostas como 'aceita'
        $stmtProp = $pdo->prepare('
            INSERT INTO propostas (orcamento_id, montador_id, valor, disponibilidade, horario, mensagem, status)
            VALUES (:oid, :mid, :val, :disp, :hor, "Agendamento confirmado pelo montador.", "aceita")
        ');
        $stmtProp->execute([
            'oid'  => $id,
            'mid'  => $montadorId,
            'val'  => $valor,
            'disp' => $dataSrv,
            'hor'  => $horario,
        ]);
        $propostaId = (int)$pdo->lastInsertId();

        // 3. Cria agendamento na tabela agendamentos
        $stmtAgend = $pdo->prepare('
            INSERT INTO agendamentos (proposta_id, cliente_id, montador_id, data_servico, horario, endereco, status)
            VALUES (:prop, :clie, :mont, :data, :hor, :end, "agendado")
        ');
        $stmtAgend->execute([
            'prop' => $propostaId,
            'clie' => $orc['usuario_id'],
            'mont' => $montadorId,
            'data' => $dataSrv,
            'hor'  => $horario,
            'end'  => $endereco,
        ]);
        $agendamentoId = (int)$pdo->lastInsertId();

        // 4. Notifica o cliente
        $dataFormatada = date('d/m/Y', strtotime($dataSrv));
        $pdo->prepare('
            INSERT INTO notificacoes (usuario_id, mensagem, lida)
            VALUES (:uid, :msg, 0)
        ')->execute([
            'uid' => $orc['usuario_id'],
            'msg' => "Seu orçamento para \"{$orc['tipo_movel']}\" foi confirmado por {$montador['nome']}! O serviço foi agendado para $dataFormatada.",
        ]);

        // 5. Notifica o montador
        $pdo->prepare('
            INSERT INTO notificacoes (usuario_id, mensagem, lida)
            VALUES (:uid, :msg, 0)
        ')->execute([
            'uid' => $montadorId,
            'msg' => "Você confirmou o agendamento de \"{$orc['tipo_movel']}\" com {$orc['cliente_nome']} para $dataFormatada!",
        ]);

        $pdo->commit();

        responder([
            'sucesso'        => true,
            'mensagem'       => 'Orçamento confirmado com sucesso! Agendamento registrado no calendário.',
            'agendamento_id' => $agendamentoId,
            'proposta_id'    => $propostaId,
            'data_servico'   => $dataSrv,
        ]);

    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        erroJson('Erro ao confirmar orçamento: ' . $e->getMessage(), 500);
    }
}

// ================================================================
// ATUALIZAR STATUS (UPDATE)
// ================================================================
function atualizarStatus(int $id): void
{
    if ($id <= 0) erroJson('ID inválido.');

    $d      = lerJson();
    $status = validarEnum(
        $d['status'] ?? '',
        ['aberto','em_andamento','concluido','cancelado'],
        ''
    );

    if (!$status) erroJson('Status inválido. Use: aberto, em_andamento, concluido ou cancelado.');

    $pdo  = conectar();
    $stmt = $pdo->prepare('UPDATE orcamentos SET status = :status WHERE id = :id');
    $stmt->execute(['status' => $status, 'id' => $id]);

    responder(['sucesso' => true, 'mensagem' => "Status atualizado para: $status"]);
}

// ================================================================
// DELETAR (DELETE)
// ================================================================
function deletar(int $id): void
{
    if ($id <= 0) erroJson('ID inválido.');

    $pdo  = conectar();
    $stmt = $pdo->prepare('DELETE FROM orcamentos WHERE id = :id');
    $stmt->execute(['id' => $id]);

    if ($stmt->rowCount() === 0) erroJson('Orçamento não encontrado.', 404);

    responder(['sucesso' => true, 'mensagem' => 'Orçamento removido com sucesso.']);
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