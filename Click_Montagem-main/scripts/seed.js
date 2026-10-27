const bcrypt = require('bcryptjs');
const env = require('../src/config/env');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { ensureLocalMongoRunning } = require('../src/config/localMongoRunner');
const { User, Orcamento, Proposta, Agendamento, Avaliacao, Notificacao } = require('../src/models');

function dataFuturaISO(dias = 1) {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return d.toISOString().split('T')[0];
}

async function seedDatabase({ closeConnection = true } = {}) {
    await ensureLocalMongoRunning(env.mongoUri);
    await connectDatabase(env.mongoUri);

    const totalUsuarios = await User.countDocuments();
    if (totalUsuarios > 0) {
        console.log(`[Seed] Banco já possui ${totalUsuarios} usuário(s). Preservando dados existentes (sem operação destrutiva).`);
        if (closeConnection) await disconnectDatabase();
        return { skipped: true, totalUsuarios };
    }

    console.log('[Seed] Populando dados iniciais do Click Montagem no MongoDB...');
    const senhaPadraoHash = await bcrypt.hash('senha123', 12);

    const joao = await User.create({
        nome: 'João Silva',
        email: 'joao@clickmontagem.com',
        telefone: '(11) 91234-5678',
        senha: senhaPadraoHash,
        tipo: 'cliente',
        cidade: 'São Paulo',
        cep: '01310-100',
        endereco: 'Av. Paulista, 1000, Ap 42 - São Paulo, SP',
    });

    const marcos = await User.create({
        nome: 'Marcos Oliveira',
        email: 'marcos@clickmontagem.com',
        telefone: '(11) 99876-5432',
        senha: senhaPadraoHash,
        tipo: 'montador',
        cidade: 'São Paulo',
        montador: {
            cpf_cnpj: '123.456.789-01',
            descricao_profissional:
                'Especialista em guarda-roupas, cozinhas moduladas e móveis planejados em geral. 8 anos de experiência.',
            especialidades: 'Guarda-roupas, Cozinhas, Painéis TV',
            regiao_atendimento: 'São Paulo e Região Metropolitana',
            disponibilidade_geral: 'Segunda a Sábado - Manhã e Tarde',
            preco_base: 120,
        },
    });

    const roberto = await User.create({
        nome: 'Roberto Lima',
        email: 'roberto@clickmontagem.com',
        telefone: '(11) 94567-1234',
        senha: senhaPadraoHash,
        tipo: 'montador',
        cidade: 'São Paulo',
        montador: {
            cpf_cnpj: '234.567.890-12',
            descricao_profissional: 'Montagem rápida e limpa de móveis convencionais e escritório.',
            especialidades: 'Mesas, Cadeiras, Armários Escritório',
            regiao_atendimento: 'Zona Norte e Centro - SP',
            disponibilidade_geral: 'Segunda a Sexta - Tarde',
            preco_base: 100,
        },
    });

    const ana = await User.create({
        nome: 'Ana Santos',
        email: 'ana@clickmontagem.com',
        telefone: '(11) 93456-7890',
        senha: senhaPadraoHash,
        tipo: 'montador',
        cidade: 'São Paulo',
        montador: {
            cpf_cnpj: '345.678.901-23',
            descricao_profissional: 'Profissional dedicada a móveis planejados de alto padrão.',
            especialidades: 'Móveis Planejados, Closets, Cozinhas',
            regiao_atendimento: 'Grande São Paulo',
            disponibilidade_geral: 'Segunda a Domingo - Integral',
            preco_base: 150,
        },
    });

    // Orçamento 1 (Concluído com avaliação - histórico real)
    const orcConcluido = await Orcamento.create({
        usuario_id: joao._id,
        categoria: 'padrao',
        tipo_movel: 'Guarda-roupa 6 portas',
        quantidade_pecas: 1,
        complexidade: 'moderado',
        cep: '01310-100',
        bairro: 'São Paulo, SP',
        horario: 'manha',
        preco_estimado: 'R$ 150 – 220',
        status: 'concluido',
    });

    const propMarcos = await Proposta.create({
        orcamento_id: orcConcluido._id,
        montador_id: marcos._id,
        valor: 180.0,
        disponibilidade: dataFuturaISO(1),
        horario: 'manha',
        mensagem: 'Tenho experiência com guarda-roupas de 6 portas. Ferramentas inclusas.',
        status: 'concluida',
    });

    await Proposta.create({
        orcamento_id: orcConcluido._id,
        montador_id: roberto._id,
        valor: 150.0,
        disponibilidade: dataFuturaISO(3),
        horario: 'tarde',
        mensagem: 'Posso realizar o serviço com qualidade garantida.',
        status: 'recusada',
    });

    const agendConcluido = await Agendamento.create({
        proposta_id: propMarcos._id,
        orcamento_id: orcConcluido._id,
        cliente_id: joao._id,
        montador_id: marcos._id,
        data_servico: dataFuturaISO(1),
        horario: 'manha',
        endereco: 'Av. Paulista, 1000, Ap 42 - São Paulo, SP',
        valor: 180.0,
        status: 'concluido',
    });

    await Avaliacao.create({
        agendamento_id: agendConcluido._id,
        cliente_id: joao._id,
        montador_id: marcos._id,
        nota: 5,
        comentario:
            'Excelente profissional! Chegou no horário combinado, montou o guarda-roupa com perfeição e deixou tudo limpo.',
    });

    // Orçamento 2 (Aberto com proposta pendente para demonstração de fluxo)
    const orcAberto = await Orcamento.create({
        usuario_id: joao._id,
        categoria: 'planejado',
        tipo_movel: 'Home office planejado',
        quantidade_pecas: 2,
        complexidade: 'moderado',
        cep: '01310-100',
        bairro: 'Bela Vista, SP',
        horario: 'manha',
        preco_estimado: 'R$ 350 – 600',
        status: 'aberto',
    });

    await Proposta.create({
        orcamento_id: orcAberto._id,
        montador_id: ana._id,
        valor: 380.0,
        disponibilidade: dataFuturaISO(2),
        horario: 'manha',
        mensagem: 'Sou especialista em móveis planejados. Disponível com ferramentas completas.',
        status: 'pendente',
    });

    await Notificacao.create([
        {
            usuario_id: joao._id,
            mensagem: 'Sua proposta foi aceita e o serviço de Guarda-roupa 6 portas foi concluído!',
            lida: false,
        },
        {
            usuario_id: joao._id,
            mensagem: 'Você recebeu uma nova proposta de R$ 380,00 para "Home office planejado"!',
            lida: false,
        },
        {
            usuario_id: marcos._id,
            mensagem: 'Você recebeu uma nova avaliação de 5 estrela(s) de João Silva!',
            lida: false,
        },
    ]);

    console.log('[Seed] Dados iniciais inseridos com sucesso!');
    if (closeConnection) await disconnectDatabase();
    return { skipped: false };
}

if (require.main === module) {
    seedDatabase().catch((err) => {
        console.error('[Seed Error]:', err);
        process.exit(1);
    });
}

module.exports = { seedDatabase };
