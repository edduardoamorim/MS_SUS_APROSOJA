const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Criar o documento
const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 50, bottom: 50, left: 50, right: 50 }
});

const outputPath = path.join(__dirname, '../documentacao_usuarios.pdf');
const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

// Cores Executivas
const COLOR_PRIMARY = '#064e3b'; // Forest Green
const COLOR_SECONDARY = '#1e293b'; // Slate Grey
const COLOR_TEXT = '#0f172a'; // Charcoal Body Text
const COLOR_MUTED = '#64748b'; // Muted Grey
const COLOR_BG_BOX = '#f8fafc'; // Light grey-blue background
const COLOR_BORDER = '#e2e8f0';

// Helpers para layout
const drawHeader = (title) => {
  doc.fillColor(COLOR_PRIMARY)
     .font('Helvetica-Bold')
     .fontSize(20)
     .text(title)
     .moveDown(0.2);
  
  // Linha horizontal
  doc.strokeColor(COLOR_PRIMARY)
     .lineWidth(1.5)
     .moveTo(50, doc.y)
     .lineTo(545, doc.y)
     .stroke()
     .moveDown(1);
};

const drawSubheader = (title) => {
  doc.fillColor(COLOR_SECONDARY)
     .font('Helvetica-Bold')
     .fontSize(13)
     .text(title)
     .moveDown(0.4);
};

const drawBodyText = (text) => {
  doc.fillColor(COLOR_TEXT)
     .font('Helvetica')
     .fontSize(10)
     .text(text, { align: 'justify', lineGap: 3 })
     .moveDown(0.8);
};

const drawCodeBlock = (code) => {
  const currentY = doc.y;
  const padding = 10;
  
  // Medir linhas para calcular altura da caixa
  const lines = code.split('\n');
  const height = lines.length * 11 + padding * 2;
  
  // Desenhar fundo
  doc.rect(50, currentY, 495, height)
     .fill(COLOR_BG_BOX);
  
  // Desenhar borda esquerda decorativa
  doc.rect(50, currentY, 4, height)
     .fill(COLOR_PRIMARY);
  
  // Escrever código
  doc.fillColor('#27272a')
     .font('Courier')
     .fontSize(8);
  
  let lineY = currentY + padding;
  lines.forEach(line => {
    doc.text(line, 60, lineY);
    lineY += 11;
  });
  
  doc.y = currentY + height + 10;
};

// ==========================================
// CAPA / TÍTULO PRINCIPAL
// ==========================================
doc.rect(0, 0, 595, 200).fill(COLOR_PRIMARY);

doc.fillColor('#ffffff')
   .font('Helvetica-Bold')
   .fontSize(26)
   .text('MS SUSTENTÁVEL', 50, 60)
   .fontSize(16)
   .font('Helvetica')
   .text('Manual de Usuários, Tabelas e Permissões', 50, 100);

doc.fillColor(COLOR_MUTED)
   .fontSize(9)
   .text('Gerado em: ' + new Date().toLocaleDateString('pt-BR'), 50, 160);

doc.y = 230;

// ==========================================
// SEÇÃO 1: LOGIN E ACESSO RÁPIDO
// ==========================================
drawHeader('1. Guia de Login e Contas de Teste');

drawBodyText(
  'A plataforma MS Sustentável possui três níveis de perfis de usuários com restrições e visualizações adaptadas para suas respectivas funções. Para facilitar a homologação e testes do sistema local, adicionamos um Painel de Testes & Desenvolvimento diretamente na tela de login.'
);

drawSubheader('Acesso Rápido via Tela de Login:');
drawBodyText(
  'Ao acessar http://localhost:5173/login, você verá um painel na parte inferior da tela contendo as seguintes ações:\n\n' +
  '1. Botão "Criar/Garantir Contas de Teste no Banco": Clique nesta opção para inserir automaticamente os três usuários de teste com os papéis de Gestor, Técnico e Produtor diretamente na autenticação do Supabase.\n' +
  '2. Botões Rápidos (Gestor / Técnico / Produtor): Após criar os usuários, basta clicar no botão correspondente para preencher as credenciais e efetuar o login imediatamente.'
);

drawSubheader('Credenciais de Teste Criadas:');
drawBodyText(
  '- Gestor: gestor@ms.gov.br  (senha: Senha@123) -> Redireciona para o Painel de Governança.\n' +
  '- Técnico: tecnico@ms.gov.br (senha: Senha@123) -> Redireciona para o Portal do Técnico.\n' +
  '- Produtor: produtor@ms.gov.br (senha: Senha@123) -> Redireciona para o Portal do Produtor.'
);

doc.addPage();

// ==========================================
// SEÇÃO 2: FLUXO DE TRABALHO E RELAÇÃO ENTRE PERFIS
// ==========================================
drawHeader('2. Fluxo de Trabalho e Relação entre Perfis');

drawBodyText(
  'O MS Sustentável organiza a certificação RTRS em um fluxo de trabalho colaborativo de ponta a ponta entre três perfis de usuários: Gestores, Técnicos e Produtores. O fluxo foi planejado para descentralizar os envios e garantir o rigor metodológico da certificação RTRS.'
);

drawSubheader('Fase 1: Cadastro e Agendamento Autônomo (Técnico / Gestor)');
drawBodyText(
  '- O Gestor agenda auditorias e as vincula a técnicos, configurando a data programada para a vistoria.\n' +
  '- Alternativamente, o Técnico de Campo possui autonomia total para cadastrar novas propriedades (fazendas) diretamente do campo e iniciar/agendar novas vistorias (atribuídas a si mesmo) imediatamente.'
);

drawSubheader('Fase 2: Vistoria In Loco e Checklist de Pendências (Técnico -> Produtor)');
drawBodyText(
  '- O Técnico de Campo realiza a auditoria presencial na propriedade rural usando um tablet ou smartphone.\n' +
  '- O Técnico responde aos critérios RTRS no formulário digital, insere observações e anexa fotos reais de evidências.\n' +
  '- Caso algum critério seja descumprido, o Técnico abre "Exigências de Regularização" (pendências) no checklist da fazenda com uma descrição detalhada e prazo para o produtor regularizar.'
);

drawSubheader('Fase 3: Resolução e Planos de Ação (Produtor -> Gestor/Técnico)');
drawBodyText(
  '- O Produtor Rural acessa seu portal privado, visualiza a lista de exigências pendentes e anexa as evidências de correção.\n' +
  '- O Produtor também pode consultar o painel de Inteligência Artificial (Gemini AI) para gerar planos de ação customizados para cada exigência.'
);

drawSubheader('Fase 4: Regularização e Certificação Direta (Técnico / Gestor)');
drawBodyText(
  '- O Técnico de Campo ou Gestor analisa a resolução enviada pelo produtor. Se o técnico estiver na fazenda e vir que a pendência foi regularizada, ele pode clicar em "Resolver Manualmente (In Loco)" para resolver o item imediatamente.\n' +
  '- Quando todas as pendências da fazenda são sanadas e o questionário da auditoria é concluído, o Técnico de Campo ou Gestor pode homologar o processo clicando em "Liberar (Certificar)", o que altera o status da auditoria diretamente para "Certificada" e conclui o fluxo. A propriedade passa a constar como "Regularizada" no mapa e dashboard do produtor, finalizando o ciclo com sucesso.'
);

doc.addPage();

// ==========================================
// SEÇÃO 3: CADASTRO MANUAL NO BANCO (PASSO A PASSO)
// ==========================================
drawHeader('3. Cadastro Manual de Usuários no Banco de Dados');

drawBodyText(
  'Por questões de governança, apenas Produtores Rurais podem se autocadastrar pela tela pública de registro. Gestores e Técnicos de Campo devem ser criados diretamente no banco de dados. Siga o passo a passo abaixo para cadastrar novos usuários de forma manual.'
);

drawSubheader('Passo 1: Criar o Usuário na Autenticação (auth.users)');
drawBodyText(
  'O Supabase armazena as credenciais de login de forma segura no schema auth. Para cadastrar um usuário com a role correta, utilize a aba SQL Editor do painel do Supabase (ou ferramenta como DBeaver conectada à porta 54322) e execute o script SQL abaixo:'
);

drawCodeBlock(
`-- Script para criar um Gestor diretamente na tabela de autenticação
INSERT INTO auth.users (id, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, is_sso_user, created_at, updated_at)
VALUES (
  gen_random_uuid(), 
  'novo_gestor@ms.gov.br', 
  crypt('sua_senha_aqui', gen_salt('bf')), -- Senha criptografada com Blowfish/Bcrypt
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Nome do Gestor", "role": "gestor"}', -- Meta_data essencial para o login
  false, 
  now(), 
  now()
);`
);

drawBodyText(
  'Nota: Substitua "novo_gestor@ms.gov.br", "sua_senha_aqui" e "Nome do Gestor" pelos dados correspondentes. Para criar um Técnico de Campo, mude a role no JSON para "tecnico".'
);

drawSubheader('Passo 2: Vincular o Perfil na Tabela de Perfis (public.perfis)');
drawBodyText(
  'Para que o sistema consiga listar os usuários de forma limpa e administrar as permissões internas de visualização, insira um registro na tabela public.perfis utilizando o ID do usuário criado no passo anterior:'
);

drawCodeBlock(
`-- Script para cadastrar o perfil de uso associado
INSERT INTO public.perfis (id, nome, email, role, status)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'novo_gestor@ms.gov.br'),
  'Nome do Gestor',
  'novo_gestor@ms.gov.br',
  'gestor', -- 'gestor' ou 'tecnico'
  'Ativo'
);`
);

doc.addPage();

// ==========================================
// SEÇÃO 4: ARQUITETURA DO BANCO DE DADOS
// ==========================================
drawHeader('4. Dicionário de Tabelas do Banco de Dados');

drawBodyText(
  'Abaixo estão descritas todas as tabelas implementadas no banco de dados local do MS Sustentável (Supabase/PostgreSQL) e suas finalidades na plataforma.'
);

const tables = [
  { name: 'auth.users', desc: 'Tabela nativa do Supabase. Gerencia a autenticação, emails, senhas criptografadas e dados de login.' },
  { name: 'public.perfis', desc: 'Armazena informações adicionais e o papel administrativo (role: gestor, tecnico, produtor) associado ao usuário.' },
  { name: 'public.propriedades', desc: 'Guarda o cadastro das fazendas produtores, incluindo o código do CAR (Cadastro Ambiental Rural) e o polígono espacial da fazenda (PostGIS).' },
  { name: 'public.auditorias', desc: 'Agenda e rastreia o ciclo de auditoria de cada propriedade (status: Autoavaliação, Visita de Campo, Em Análise, Certificada).' },
  { name: 'public.perguntas_rtrs', desc: 'Contém os critérios de sustentabilidade RTRS separados por seção (Meio Ambiente, Direitos Trabalhistas, etc.) e se estão ativos ou não.' },
  { name: 'public.respostas_auditoria', desc: 'Registra a resposta dada (Conforme/Não Conforme), observações e links de evidência para cada critério avaliado.' },
  { name: 'public.pendencias', desc: 'Checklist de pendências e exigências emitidas para uma fazenda por um gestor/técnico e resoluções submetidas pelo produtor.' }
];

tables.forEach(t => {
  doc.fillColor(COLOR_PRIMARY)
     .font('Helvetica-Bold')
     .fontSize(11)
     .text(t.name)
     .moveDown(0.2);
     
  doc.fillColor(COLOR_TEXT)
     .font('Helvetica')
     .fontSize(10)
     .text(t.desc, { align: 'justify' })
     .moveDown(0.6);
});

doc.addPage();

// ==========================================
// SEÇÃO 5: PERMISSÕES E RLS
// ==========================================
drawHeader('5. Políticas de Segurança e Permissões (RLS)');

drawBodyText(
  'Para assegurar a integridade e privacidade dos dados de conformidade ambiental e trabalhista do agronegócio do MS, ativamos o Row Level Security (RLS) nas tabelas principais. As regras de acesso são aplicadas em nível de banco de dados baseado no token de autenticação JWT.'
);

drawSubheader('Como funciona o controle de papéis (Roles):');
drawBodyText(
  'Durante o login, o Supabase lê a role definida no metadado do usuário (user_metadata -> role). Criamos as funções plpgsql public.is_gestor() e public.is_tecnico() que verificam essa role no token JWT para gerenciar as permissões correspondentes de forma transparente.'
);

drawSubheader('Políticas de Acesso Específicas por Tabela:');

const policies = [
  {
    table: 'public.propriedades',
    desc: '- Gestores: Acesso total (CRUD).\n- Técnicos: Acesso total (CRUD) para cadastrar e gerenciar propriedades no campo.\n- Produtores: Podem ver, criar e editar apenas as suas próprias propriedades (comparação auth.uid() = produtor_id).'
  },
  {
    table: 'public.auditorias',
    desc: '- Gestores: Acesso total (CRUD).\n- Técnicos: Acesso total para criar, editar ou liberar/certificar auditorias sob sua responsabilidade (auth.uid() = tecnico_responsavel_id).\n- Produtores: Podem ver apenas auditorias feitas nas suas propriedades.'
  },
  {
    table: 'public.pendencias (Checklist)',
    desc: '- Gestores: Acesso total.\n- Técnicos: Acesso total para cadastrar, editar, excluir ou resolver/regularizar pendências in loco diretamente.\n- Produtores: Podem ver as pendências e enviar resoluções, mas sem permissão de marcar como "Resolvida" diretamente (precisa de homologação).'
  }
];

policies.forEach(p => {
  doc.fillColor(COLOR_SECONDARY)
     .font('Helvetica-Bold')
     .fontSize(11)
     .text(p.table)
     .moveDown(0.2);
     
  doc.fillColor(COLOR_TEXT)
     .font('Helvetica')
     .fontSize(9.5)
     .text(p.desc, { lineGap: 2 })
     .moveDown(0.6);
});

// Finalizar documento
doc.end();

stream.on('finish', () => {
  console.log('PDF gerado com sucesso em: ' + outputPath);
});
