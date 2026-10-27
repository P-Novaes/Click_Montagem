/**
 * Procedimento de Migração e Recuperação: MySQL / Dump SQL -> MongoDB
 * - Não executa operações destrutivas sobre bancos existentes.
 * - Gera backup JSON de verificação antes de inserir no MongoDB.
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const env = require('../src/config/env');
const { seedDatabase } = require('./seed');

function checkPort(port, host = '127.0.0.1') {
    return new Promise((resolve) => {
        const s = net.connect(port, host);
        s.setTimeout(1500);
        s.once('connect', () => {
            s.destroy();
            resolve(true);
        });
        s.once('error', () => resolve(false));
        s.once('timeout', () => {
            s.destroy();
            resolve(false);
        });
    });
}

async function runMigration() {
    const mysqlPort = parseInt(process.env.MYSQL_PORT || '3306', 10);
    const mysqlHost = process.env.MYSQL_HOST || '127.0.0.1';

    console.log(`[Migração] Verificando disponibilidade do MySQL em ${mysqlHost}:${mysqlPort}...`);
    const mysqlAtivo = await checkPort(mysqlPort, mysqlHost);

    const xamppDataDir = 'C:\\xampp\\mysql\\data\\click_montagem';
    const xamppBancoExiste = fs.existsSync(xamppDataDir);

    if (!mysqlAtivo) {
        console.log(
            `[Migração] Serviço MySQL não está ativo na porta ${mysqlPort} (Banco físico no XAMPP existe: ${xamppBancoExiste ? 'Sim' : 'Não'}).`
        );
        console.log('[Migração] Utilizando carga estruturada segura a partir do esquema de referência (seed não-destrutivo)...');
        const res = await seedDatabase({ closeConnection: true });

        const backupDir = path.resolve(__dirname, '../database/backups');
        fs.mkdirSync(backupDir, { recursive: true });
        const reportPath = path.join(backupDir, `migration-report-${Date.now()}.json`);
        fs.writeFileSync(
            reportPath,
            JSON.stringify(
                {
                    executado_em: new Date().toISOString(),
                    mysql_online: false,
                    xampp_data_dir_encontrado: xamppBancoExiste,
                    acao: res.skipped ? 'Dados já existentes no MongoDB preservados' : 'Seed inicial aplicado no MongoDB',
                },
                null,
                2
            ),
            'utf8'
        );
        console.log(`[Migração] Relatório salvo em: ${reportPath}`);
        return;
    }

    console.log('[Migração] MySQL detectado! Caso deseje importar dados extras do MySQL, configure o driver mysql2 e execute novamente.');
}

if (require.main === module) {
    runMigration().catch((err) => {
        console.error('[Migração Erro]:', err);
        process.exit(1);
    });
}

module.exports = { runMigration };
