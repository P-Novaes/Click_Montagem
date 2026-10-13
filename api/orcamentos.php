<?php
// ================================================================
//  orcamentos.php — Gestão de Orçamentos e Pedidos de Serviço
//  Caminho: htdocs/click_montagem/api/orcamentos.php
//
//  ROTAS:
//    POST ?action=criar              → salva novo orçamento
//    GET  ?action=listar&uid=X       → lista orçamentos do cliente
//    GET  ?action=listar_abertos     → lista solicitações abertas para montadores
//    GET  ?action=buscar&id=X        → detalha um orçamento com dados do cliente
//    POST ?action=status&id=X        → atualiza status (aberto, em_andamento, concluido, cancelado)
//    POST ?action=deletar&id=X       → remove orçamento
// ================================================================

require_once __DIR__ . '/config/conexao.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

match (true) {
    $method === 'POST' && $action === 'criar'          => criar(),
    $method === 'GET'  && $action === 'listar'         => listar((int)($_GET['uid'] ?? 0)),
    $method === 'GET'  && $action === 'listar_abertos' => listarAbertos(),
    $method === 'GET'  && $action === 'buscar'         => buscar((int)($_GET['id'] ?? 0)),
    $method === 'POST' && $action === 'status'         => atualizarStatus((int)($_GET['id'] ?? 0)),
    $method === 'POST' && $action === 'deletar'        => deletar((int)($_GET['id'] ?? 0)),
    default                                            => erroJson('Rota inválida em orcamentos.php.', 404),
};

// ================================================================
// CRIAR ORÇAMENTO (INSERT)
// ================================================================
function criar(): void
{
    $d = lerJson();

    $uid        = (int)($d['usuario_id']      ?? 0);
    $categoria  = validarEnum($d['categoria']  ?? 'padrao',   ['padrao','planejado'],              'padrao');
    $tipoMovel  = trim($d['tipo_movel']        ?? '');
    $qtd        = max(1, (int)($d['quantidade_pecas'] ?? 1));
    $complex    = validarEnum($d['complexidade'] ?? 'simples', ['simples','moderado','complexo'],   'simples');
    $descricao  = trim($d['descricao']         ?? '');
    $cep        = trim($d['cep']               ?? '');
    $bairro     = trim($d['bairro']            ?? '');
    $horario    = validarEnum($d['horario']     ?? 'qualquer', ['manha','tarde','qualquer'],        'qualquer');
    $preco      = trim($d['preco_estimado']    ?? '');

    if ($uid <= 0)   erroJson('usuario_id é obrigatório e deve ser válido.');
    if (!$tipoMovel) erroJson('O tipo de móvel é obrigatório.');

    $pdo  = conectar();

    // Verifica se usuário existe
    $chkUser = $pdo->prepare('SELECT id, nome FROM usuarios WHERE id = :id LIMIT 1');
    $chkUser->execute(['id' => $uid]);
    $usr = $chkUser->fetch();
    if (!$usr) erroJson('Usuário não encontrado.', 404);

    $stmt = $pdo->prepare('
        INSERT INTO orcamentos
            (usuario_id, categoria, tipo_movel, quantidade_pecas,
             complexidade, descricao, cep, bairro, horario, preco_estimado, status)
        VALUES
            (:uid, :cat, :tipo, :qtd,
             :comp, :desc, :cep, :bairro, :hor, :preco, "aberto")
    ');
    $stmt->execute([
        'uid'    => $uid,
        'cat'    => $categoria,
        'tipo'   => $tipoMovel,
        'qtd'    => $qtd,
        'comp'   => $complex,
        'desc'   => $descricao,
        'cep'    => $cep,
        'bairro' => $bairro,
        'hor'    => $horario,
        'preco'  => $preco,
    ]);

    $idOrc = (int)$pdo->lastInsertId();

    // Notificação para o cliente confirmando envio
    $pdo->prepare('
        INSERT INTO notificacoes (usuario_id, mensagem, lida)
        VALUES (:uid, :msg, 0)
    ')->execute([
        'uid' => $uid,
        'msg' => "Seu pedido de orçamento para \"$tipoMovel\" foi publicado com sucesso!",
    ]);

    responder([
        'sucesso'  => true,
        'mensagem' => 'Orçamento enviado! Aguarde propostas dos montadores.',
        'id'       => $idOrc,
    ], 201);
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
            (SELECT COUNT(*) FROM propostas p WHERE p.orcamento_id = o.id) AS total_propostas,
            (SELECT COUNT(*) FROM propostas p WHERE p.orcamento_id = o.id AND p.status = "pendente") AS propostas_novas
        FROM orcamentos o
        WHERE o.usuario_id = :uid
        ORDER BY o.criado_em DESC
    ');
    $stmt->execute(['uid' => $uid]);
    $orcamentos = $stmt->fetchAll();

    foreach ($orcamentos as &$o) {
        $o['id']               = (int)$o['id'];
        $o['usuario_id']       = (int)$o['usuario_id'];
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
    $stmt = $pdo->prepare('
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
            o.preco_estimado,
            o.status,
            o.criado_em,
            u.id   AS cliente_id,
            u.nome AS cliente_nome,
            (SELECT COUNT(*) FROM propostas p WHERE p.orcamento_id = o.id) AS total_propostas
        FROM orcamentos o
        JOIN usuarios u ON u.id = o.usuario_id
        WHERE o.status = "aberto"
        ORDER BY o.criado_em DESC
        LIMIT 30
    ');
    $stmt->execute();
    $pedidos = $stmt->fetchAll();

    foreach ($pedidos as &$p) {
        $p['id']               = (int)$p['id'];
        $p['cliente_id']       = (int)$p['cliente_id'];
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
            u.email    AS cliente_email
        FROM orcamentos o
        JOIN usuarios u ON u.id = o.usuario_id
        WHERE o.id = :id
        LIMIT 1
    ');
    $stmt->execute(['id' => $id]);
    $orc = $stmt->fetch();

    if (!$orc) erroJson('Orçamento não encontrado.', 404);

    $orc['id']               = (int)$orc['id'];
    $orc['usuario_id']       = (int)$orc['usuario_id'];
    $orc['quantidade_pecas'] = (int)$orc['quantidade_pecas'];

    responder(['sucesso' => true, 'orcamento' => $orc]);
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