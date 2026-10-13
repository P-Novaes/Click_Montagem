<?php
// ================================================================
//  notificacoes.php — Gestão de Notificações do Usuário
//  Caminho: htdocs/click_montagem/api/notificacoes.php
//
//  ROTAS:
//    GET  ?action=listar&uid=X       → lista notificações do usuário
//    GET  ?action=contar&uid=X       → conta notificações não lidas
//    POST ?action=marcar_lida&id=X   → marca uma notificação como lida
//    POST ?action=marcar_todas&uid=X → marca todas como lidas
// ================================================================

require_once __DIR__ . '/config/conexao.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

match (true) {
    $method === 'GET'  && $action === 'listar'       => listar((int)($_GET['uid'] ?? 0)),
    $method === 'GET'  && $action === 'contar'       => contarNaoLidas((int)($_GET['uid'] ?? 0)),
    $method === 'POST' && $action === 'marcar_lida'  => marcarLida((int)($_GET['id'] ?? 0)),
    $method === 'POST' && $action === 'marcar_todas' => marcarTodas((int)($_GET['uid'] ?? 0)),
    default                                          => erroJson('Rota inválida em notificacoes.php.', 404),
};

// ================================================================
// LISTAR NOTIFICAÇÕES
// ================================================================
function listar(int $uid): void
{
    if ($uid <= 0) erroJson('uid é obrigatório.');

    $pdo  = conectar();
    $stmt = $pdo->prepare('
        SELECT id, usuario_id, mensagem, lida, criado_em
        FROM notificacoes
        WHERE usuario_id = :uid
        ORDER BY criado_em DESC
        LIMIT 50
    ');
    $stmt->execute(['uid' => $uid]);
    $lista = $stmt->fetchAll();

    foreach ($lista as &$n) {
        $n['id']         = (int)$n['id'];
        $n['usuario_id'] = (int)$n['usuario_id'];
        $n['lida']       = (bool)$n['lida'];
    }

    responder(['sucesso' => true, 'notificacoes' => $lista]);
}

// ================================================================
// CONTAR NÃO LIDAS
// ================================================================
function contarNaoLidas(int $uid): void
{
    if ($uid <= 0) erroJson('uid é obrigatório.');

    $pdo  = conectar();
    $stmt = $pdo->prepare('
        SELECT COUNT(*) FROM notificacoes WHERE usuario_id = :uid AND lida = 0
    ');
    $stmt->execute(['uid' => $uid]);
    $total = (int)$stmt->fetchColumn();

    responder(['sucesso' => true, 'nao_lidas' => $total]);
}

// ================================================================
// MARCAR UMA COMO LIDA
// ================================================================
function marcarLida(int $id): void
{
    if ($id <= 0) erroJson('ID da notificação é obrigatório.');

    $pdo  = conectar();
    $stmt = $pdo->prepare('UPDATE notificacoes SET lida = 1 WHERE id = :id');
    $stmt->execute(['id' => $id]);

    responder(['sucesso' => true, 'mensagem' => 'Notificação marcada como lida.']);
}

// ================================================================
// MARCAR TODAS COMO LIDAS
// ================================================================
function marcarTodas(int $uid): void
{
    if ($uid <= 0) erroJson('uid é obrigatório.');

    $pdo  = conectar();
    $stmt = $pdo->prepare('UPDATE notificacoes SET lida = 1 WHERE usuario_id = :uid');
    $stmt->execute(['uid' => $uid]);

    responder(['sucesso' => true, 'mensagem' => 'Todas as notificações foram marcadas como lidas.']);
}

