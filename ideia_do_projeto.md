A certificação RTRS (Round Table on Responsible Soy) é rigorosa e exige um controle de dados impecável, cruzando critérios ambientais, sociais e agrícolas. Para o **MS SUSTENTÁVEL**, centralizar isso no Supabase é a decisão certa para tirar o peso da infraestrutura das suas costas e focar na inteligência geográfica e na regra de negócio.

Para conectar os dados geográficos e estruturar o questionário de auditoria dos técnicos e produtores, nós dividimos o projeto em três camadas no Supabase: **Dados Geográficos (PostGIS)**, **Modelagem das Tabelas (Banco Relacional)** e **Controle de Acesso (Segurança)**.

Aqui está o mapa mental e estrutural de como colocar essa ideia de pé:

---

### 1. O "Casamento" dos Dados Geográficos (PostGIS)

Como o Supabase é o PostgreSQL puro, ele tem suporte nativo à extensão **PostGIS**, que é a engrenagem mais poderosa do mundo para dados espaciais em bancos de dados.

* **Como funciona a ativação:** No painel do Supabase, você vai na aba *Extensions*, procura por `postgis` e clica em ativar. Pronto. Seu banco agora entende o tipo de dados `geometry` ou `geography`.
* **Armazenamento:** Na sua tabela de fazendas, você terá colunas tradicionais (como Nome, Inscrição Estadual, CAR) e uma coluna chamada `geom`. Nessa coluna, você pode salvar o **ponto (coordenada da sede)** ou o **polígono (limite da propriedade)**.
* **Cruzamento Espacial Automático:** A mágica acontece aqui. RTRS exige que a soja não venha de áreas de desmatamento ilegal, terras indígenas ou APPs degradadas. Com o PostGIS ativo no Supabase, o próprio banco de dados pode rodar consultas espaciais instantâneas quando o site carregar.
* *Exemplo:* O sistema pode verificar se o polígono da fazenda intersecta (`ST_Intersects`) alguma camada de embargo ambiental ou área protegida que você tenha importado para o banco.



---

### 2. Estrutura do Banco de Dados (Modelagem das Tabelas)

Para que o questionário gigantesco da RTRS funcione bem tanto para o produtor (no site) quanto para o técnico (no campo), precisamos relacionar as tabelas. Uma estrutura básica e eficiente seria:

#### Tabela `propriedades` (Cadastro das Fazendas)

* `id` (Chave primária)
* `nome_fazenda` (Texto)
* `nome_produtor` (Texto)
* `codigo_car` (Texto)
* `geom` (Tipo: Geometry - Polígono do limite da fazenda)

#### Tabela `auditorias` (A jornada de certificação)

* `id` (Chave primária)
* `propriedade_id` (Chave estrangeira apontando para a tabela acima)
* `data_agendamento` (Data)
* `status` (Texto: "Autoavaliação", "Visita de Campo", "Em Análise", "Certificada")
* `tecnico_responsavel_id` (Chave estrangeira apontando para o técnico)

#### Tabela `perguntas_rtrs` (O questionário estático)

* `id` (Chave primária)
* `secao` (Texto: ex: "Direitos Trabalhistas", "Práticas Agrícolas", "Meio Ambiente")
* `numero_criterio` (Texto: ex: "Criterio 4.1")
* `enunciado` (Texto da pergunta)

#### Tabela `respostas_auditoria` (Onde o dado real é salvo)

* `id` (Chave primária)
* `auditoria_id` (Chave estrangeira)
* `pergunta_id` (Chave estrangeira)
* `conforme` (Booleano: Sim/Não)
* `observacoes` (Texto livre do auditor)
* `evidencia_url` (Texto - link da foto tirada no campo provando a conformidade)

---

### 3. O Fluxo de Trabalho e Mídias (Storage)

A auditoria RTRS exige evidências (fotos de placas de EPI, galpões de defensivos, frentes de trabalho, etc.). É aqui que entra o **Supabase Storage**.

1. **No Campo:** O técnico chega na fazenda com o aplicativo/site aberto no celular. Ele responde "Sim" para um critério e clica em tirar foto para comprovar.
2. **O Upload:** A imagem vai direto para o *Storage* do Supabase (uma pasta em nuvem segura).
3. **O Vínculo:** O Supabase gera uma URL pública/protegida dessa imagem e você grava esse link direto na tabela `respostas_auditoria` (na coluna `evidencia_url`).

---

### 4. Controle de Acesso Seguro (RLS)

O calcanhar de Aquiles de muitos sistemas agrícolas é a privacidade. Um fazendeiro não pode, de forma alguma, ver as respostas do questionário ou o polígono da fazenda do vizinho.

No Supabase, você resolve isso com o **Row Level Security (RLS)**. Você cria regras direto no banco que dizem:

* *Regra do Produtor:* "Se o usuário logado for o Produtor X, ele só pode ler/escrever nas linhas onde o `produtor_id` seja igual ao ID dele."
* *Regra do Técnico:* "O técnico Y pode ver e editar todas as fazendas da região atribuída a ele."
