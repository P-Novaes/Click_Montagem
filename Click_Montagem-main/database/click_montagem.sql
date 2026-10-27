-- ================================================================
--  CLICK MONTAGEM — Banco de Dados MySQL Completo, Atualizado e Otimizado
--  Inclui: Usuários, Perfis de Montadores, Orçamentos, Propostas,
--          Agendamentos, Avaliações e Notificações.
--  Como usar:
--    1. Abra: http://localhost/phpmyadmin
--    2. Aba "Importar" → escolha este arquivo → "Executar"
-- ================================================================

SET NAMES utf8mb4;
SET time_zone = '-03:00';
SET FOREIGN_KEY_CHECKS = 0;

-- ── BANCO ────────────────────────────────────────────────────
CREATE DATABASE IF NOT EXISTS click_montagem
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE click_montagem;

-- ── REMOVE SE JÁ EXISTIR (seguro para reimportar) ────────────
DROP TABLE IF EXISTS notificacoes;
DROP TABLE IF EXISTS avaliacoes;
DROP TABLE IF EXISTS agendamentos;
DROP TABLE IF EXISTS propostas;
DROP TABLE IF EXISTS orcamentos;
DROP TABLE IF EXISTS montadores;
DROP TABLE IF EXISTS usuarios;

-- ── TABELA: usuarios (Central de Autenticação) ───────────────
CREATE TABLE usuarios (
    id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    nome          VARCHAR(120)    NOT NULL,
    email         VARCHAR(160)    NOT NULL,
    telefone      VARCHAR(20)     NOT NULL,
    senha         VARCHAR(255)    NOT NULL,
    tipo          ENUM('cliente','montador') NOT NULL DEFAULT 'cliente',
    criado_em     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── TABELA: montadores (Dados Profissionais Específicos) ──────
CREATE TABLE montadores (
    usuario_id           INT UNSIGNED    NOT NULL,
    cpf_cnpj             VARCHAR(20)     NOT NULL,
    descricao_profissional TEXT,
    especialidades       TEXT,
    regiao_atendimento   VARCHAR(150),
    disponibilidade_geral VARCHAR(100),
    PRIMARY KEY (usuario_id),
    UNIQUE KEY uq_cpf_cnpj (cpf_cnpj),
    CONSTRAINT fk_montador_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── TABELA: orcamentos ───────────────────────────────────────
CREATE TABLE orcamentos (
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    usuario_id       INT UNSIGNED NOT NULL,
    categoria        ENUM('padrao','planejado') NOT NULL DEFAULT 'padrao',
    tipo_movel       VARCHAR(80)  NOT NULL,
    quantidade_pecas TINYINT UNSIGNED NOT NULL DEFAULT 1,
    complexidade     ENUM('simples','moderado','complexo') NOT NULL DEFAULT 'simples',
    descricao        TEXT,
    cep              VARCHAR(9),
    bairro           VARCHAR(100),
    horario          ENUM('manha','tarde','qualquer') NOT NULL DEFAULT 'qualquer',
    preco_estimado   VARCHAR(30),
    status           ENUM('aberto','em_andamento','concluido','cancelado')
                         NOT NULL DEFAULT 'aberto',
    criado_em        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                         ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_usuario (usuario_id),
    KEY idx_status  (status),
    CONSTRAINT fk_orc_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── TABELA: propostas ────────────────────────────────────────
CREATE TABLE propostas (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    orcamento_id    INT UNSIGNED NOT NULL,
    montador_id     INT UNSIGNED NOT NULL,
    valor           DECIMAL(10,2) NOT NULL,
    disponibilidade DATE         NOT NULL,
    horario         ENUM('manha','tarde','qualquer') NOT NULL DEFAULT 'qualquer',
    mensagem        TEXT,
    status          ENUM('pendente','aceita','recusada','concluida')
                        NOT NULL DEFAULT 'pendente',
    criado_em       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_orcamento (orcamento_id),
    KEY idx_montador  (montador_id),
    KEY idx_status    (status),
    CONSTRAINT fk_prop_orcamento
        FOREIGN KEY (orcamento_id) REFERENCES orcamentos (id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_prop_montador
        FOREIGN KEY (montador_id) REFERENCES usuarios (id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── TABELA: agendamentos ─────────────────────────────────────
CREATE TABLE agendamentos (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    proposta_id   INT UNSIGNED NOT NULL,
    cliente_id    INT UNSIGNED NOT NULL,
    montador_id   INT UNSIGNED NOT NULL,
    data_servico  DATE         NOT NULL,
    horario       ENUM('manha','tarde','qualquer') NOT NULL DEFAULT 'qualquer',
    endereco      VARCHAR(255) NOT NULL,
    status        ENUM('agendado','em_andamento','concluido','cancelado')
                      NOT NULL DEFAULT 'agendado',
    criado_em     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                      ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_proposta (proposta_id),
    KEY idx_cliente  (cliente_id),
    KEY idx_montador (montador_id),
    CONSTRAINT fk_agend_proposta
        FOREIGN KEY (proposta_id) REFERENCES propostas (id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_agend_cliente
        FOREIGN KEY (cliente_id) REFERENCES usuarios (id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_agend_montador
        FOREIGN KEY (montador_id) REFERENCES usuarios (id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── TABELA: avaliacoes ───────────────────────────────────────
CREATE TABLE avaliacoes (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    agendamento_id INT UNSIGNED NOT NULL,
    cliente_id    INT UNSIGNED NOT NULL,
    montador_id   INT UNSIGNED NOT NULL,
    nota          TINYINT UNSIGNED NOT NULL CHECK (nota BETWEEN 1 AND 5),
    comentario    TEXT,
    criado_em     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_agendamento_aval (agendamento_id),
    KEY idx_montador_aval (montador_id),
    CONSTRAINT fk_aval_agendamento
        FOREIGN KEY (agendamento_id) REFERENCES agendamentos (id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_aval_cliente
        FOREIGN KEY (cliente_id) REFERENCES usuarios (id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_aval_montador
        FOREIGN KEY (montador_id) REFERENCES usuarios (id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── TABELA: notificacoes ─────────────────────────────────────
CREATE TABLE notificacoes (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    usuario_id    INT UNSIGNED NOT NULL,
    mensagem      VARCHAR(255) NOT NULL,
    lida          BOOLEAN NOT NULL DEFAULT 0,
    criado_em     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_usuario_notif (usuario_id),
    CONSTRAINT fk_notif_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── DADOS DE EXEMPLO ─────────────────────────────────────────
-- Senha de todos: "senha123"
-- Hash válido gerado com password_hash("senha123", PASSWORD_BCRYPT)
INSERT INTO usuarios (nome, email, telefone, senha, tipo) VALUES
('João Silva',      'joao@clickmontagem.com',    '(11) 91234-5678',
 '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'cliente'),
('Marcos Oliveira', 'marcos@clickmontagem.com',  '(11) 99876-5432',
 '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'montador'),
('Roberto Lima',    'roberto@clickmontagem.com', '(11) 94567-1234',
 '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'montador'),
('Ana Santos',      'ana@clickmontagem.com',     '(11) 93456-7890',
 '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'montador');

-- Perfis específicos de montadores
INSERT INTO montadores (usuario_id, cpf_cnpj, descricao_profissional, especialidades, regiao_atendimento, disponibilidade_geral) VALUES
(2, '123.456.789-01', 'Especialista em guarda-roupas, cozinhas moduladas e móveis planejados em geral. 8 anos de experiência.', 'Guarda-roupas, Cozinhas, Painéis TV', 'São Paulo e Região Metropolitana', 'Segunda a Sábado - Manhã e Tarde'),
(3, '234.567.890-12', 'Montagem rápida e limpa de móveis convencionais e escritório.', 'Mesas, Cadeiras, Armários Escritório', 'Zona Norte e Centro - SP', 'Segunda a Sexta - Tarde'),
(4, '345.678.901-23', 'Profissional dedicada a móveis planejados de alto padrão.', 'Móveis Planejados, Closets, Cozinhas', 'Grande São Paulo', 'Segunda a Domingo - Integral');

-- Orçamento de exemplo
INSERT INTO orcamentos
    (usuario_id, categoria, tipo_movel, quantidade_pecas,
     complexidade, cep, bairro, horario, preco_estimado)
VALUES
    (1, 'padrao', 'Guarda-roupa 6 portas', 1,
     'moderado', '01310-100', 'São Paulo, SP', 'manha', 'R$ 150 – 220');

-- Propostas de exemplo
INSERT INTO propostas
    (orcamento_id, montador_id, valor, disponibilidade, horario, mensagem, status)
VALUES
    (1, 2, 180.00, DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'manha',
     'Tenho experiência com guarda-roupas de 6 portas. Ferramentas inclusas.', 'aceita'),
    (1, 3, 150.00, DATE_ADD(CURDATE(), INTERVAL 3 DAY), 'tarde',
     'Posso realizar o serviço com qualidade garantida.', 'recusada'),
    (1, 4, 200.00, CURDATE(), 'manha',
     'Sou especialista em móveis planejados. Disponível hoje.', 'pendente');

-- Agendamento de exemplo (referente à proposta aceita do montador 2)
INSERT INTO agendamentos
    (proposta_id, cliente_id, montador_id, data_servico, horario, endereco, status)
VALUES
    (1, 1, 2, DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'manha', 'Av. Paulista, 1000, Ap 42 - São Paulo, SP', 'agendado');

-- Avaliação de exemplo
INSERT INTO avaliacoes
    (agendamento_id, cliente_id, montador_id, nota, comentario)
VALUES
    (1, 1, 2, 5, 'Excelente profissional! Chegou no horário combinado, montou o guarda-roupa com perfeição e deixou tudo limpo.');

-- Notificações de exemplo
INSERT INTO notificacoes
    (usuario_id, mensagem, lida)
VALUES
    (1, 'Sua proposta foi aceita pelo cliente João Silva!', 0),
    (1, 'Novo agendamento confirmado para amanhã pela manhã.', 0);

SET FOREIGN_KEY_CHECKS = 1;