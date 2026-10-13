<?php
// ================================================================
//  conexao.php — Conexão PDO com MySQL para XAMPP
//  Caminho: htdocs/click_montagem/php/conexao.php
// ================================================================

// ── Configurações do XAMPP (padrão de fábrica) ─────────────────
define('DB_HOST',    'localhost');
define('DB_NAME',    'click_montagem');
define('DB_USER',    'root');       // padrão XAMPP
define('DB_PASS',    'root');           // padrão XAMPP (sem senha)
define('DB_CHARSET', 'utf8mb4');

// ── Função de conexão (Singleton) ──────────────────────────────
function conectar(): PDO
{
    static $pdo = null;

    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST
             . ';dbname='    . DB_NAME
             . ';charset='   . DB_CHARSET;

        $opcoes = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4, time_zone='-03:00'",
        ];

        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $opcoes);
        } catch (PDOException $e) {
            // Tenta fallback com senha vazia (comum no XAMPP padrão)
            try {
                $pdo = new PDO($dsn, DB_USER, '', $opcoes);
            } catch (PDOException $e2) {
                http_response_code(500);
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode([
                    'sucesso' => false,
                    'erro'    => 'Falha na conexão com o banco click_montagem. Verifique se o MySQL está ativo no XAMPP.',
                ]);
                exit;
            }
        }
    }

    return $pdo;
}

// ── Helpers de resposta ─────────────────────────────────────────
function responder(array $dados, int $codigo = 200): void
{
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function erroJson(string $mensagem, int $codigo = 400): void
{
    responder(['sucesso' => false, 'erro' => $mensagem], $codigo);
}

// ── CORS — permite chamadas do frontend local ───────────────────
// Em produção, substitua '*' pelo domínio real.
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Max-Age: 86400');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}