# 03. Modelagem de Dados e Inteligência Geoespacial (PostGIS)

O modelo de dados do **MS Sustentável** foi projetado para sustentar o complexo questionário da certificação RTRS, integrar a inteligência geográfica de cada propriedade e suportar os fluxos de prospecção, auditoria, documentação e termos de adesão.

## 1. O "Casamento" dos Dados Geográficos (PostGIS)

Como o Supabase utiliza **PostgreSQL**, ele suporta nativamente a extensão espacial **PostGIS**, que é a engrenagem mais poderosa do mundo para bancos de dados geoespaciais.

- **Tipo Geometry:** Na tabela `propriedades`, a coluna `geom` não armazena um texto ou número simples; ela armazena a representação matemática vetorial da fazenda (o Polígono real com suas coordenadas de latitude e longitude).
- **Consultas Espaciais (Spatial Queries):** Isso permite que o banco de dados responda perguntas complexas instantaneamente, como:
  - *"Calcule a área desta fazenda em Hectares."* (`ST_Area`)
  - *"Verifique se esta fazenda invade alguma Terra Indígena cadastrada."* (`ST_Intersects`)
  - *"Encontre o município desta fazenda automaticamente."* (Função `auto_fetch_municipio` via trigger)
- **Tratamento Seguro:** Todas as inserções e conversões de mapas vetoriais (ex: GeoJSON vindo do frontend) passam por funções de cast interno (`ST_GeomFromGeoJSON`) com projeção forçada (`ST_SetSRID(..., 4326)`) para garantir integridade.
- **Auto-fetch de Geometrias:** A migration `027_auto_fetch_property_geom` configura busca automática de geometrias ao cadastrar propriedades via código CAR/SIGEF.
- **Auto-fetch de Município:** A migration `028_auto_fetch_municipio` cruza automaticamente a geometria da fazenda com a camada de municípios via `ST_Intersects`.

---

## 2. Estrutura Central de Tabelas (ERD)

A aplicação gira em torno do fluxo de auditoria e certificação, composta pelas seguintes entidades:

### `perfis` (Usuários da Plataforma)
- `id` (UUID - Chave Primária, vinculado ao `auth.users`)
- `nome`, `email` (Dados de identificação)
- `role` (Texto: `gestor`, `tecnico`, `produtor`)
- `regiao` (Texto - Região de atuação)
- `telefone`, `whatsapp` (VARCHAR(50) - Campos de contato adicionados na migration 040)
- `status` (Texto - Ex: "Ativo")
- `fazendas_vinculadas` (Numérico - Contagem opcional)
- *Comportamento:* Sincronizado automaticamente com `auth.users` via trigger (migration 009).

### `propriedades` (Cadastro das Fazendas)
- `id` (UUID - Chave Primária)
- `nome_fazenda`, `nome_produtor` (Dados cadastrais)
- `produtor_id` (UUID - FK apontando para o dono na tabela de perfis/auth.users)
- `codigo_car` (VARCHAR - Cadastro Ambiental Rural)
- `codigo_sigef` (VARCHAR - Código SIGEF para imóveis certificados)
- `origem_cadastro` (Texto: `CAR`, `SIGEF` ou `KML` - Método de importação)
- `municipio` (Texto - Preenchido automaticamente via cruzamento PostGIS)
- `telefone_produtor`, `email_produtor` (VARCHAR - Contato do produtor vinculado, migration 040)
- `etapa` (Texto: `Prospecção`, `Auditoria Prévia`, `Auditoria Oficial` - Etapa macro do fluxo, migrations 042/043)
- `geom` (Geometry/Polygon - O mapa da fazenda, SRID 4326)
- *Regra RLS (migration 039):* Gestores e Técnicos veem todas. Produtores veem apenas fazendas onde `produtor_id` corresponda ao seu ID ou e-mail.

### `auditorias` (A Jornada de Certificação)
- `id` (UUID - Chave Primária)
- `propriedade_id` (FK para a fazenda)
- `tecnico_responsavel_id` (FK para o auditor de campo encarregado)
- `data_agendamento` (TIMESTAMPTZ - Data alvo para a visita de campo)
- `status` (Enum `status_auditoria`: `Autoavaliação`, `Visita de Campo`, `Em Análise`, `Certificada`)
- `etapa` (Texto: `Prospecção`, `Auditoria Prévia`, `Auditoria Oficial` - Etapa macro, migrations 042/043)
- *Trigger de Integridade (migration 019):* Impede a mudança de status para "Certificada" caso existam pendências não resolvidas na propriedade.

### `perguntas_rtrs` (Catálogo de Critérios)
- `id` (UUID - Chave Primária)
- `secao` (Texto: "Ambiental", "Trabalhista", etc.)
- `numero_criterio` (Texto: ex: "Criterio 4.1")
- `enunciado` (A pergunta real que o auditor vai checar no campo)
- `ativo` (Booleano - Permite desativar perguntas sem excluí-las, migration 005)
- `ordem` (Inteiro - Ordenação personalizada, migration 022)
- *Comportamento:* Tabela estática de referência. RLS permite leitura para todos os autenticados.

### `respostas_auditoria` (Inspeção de Campo)
- `id` (UUID - Chave Primária)
- `auditoria_id` (FK para o evento de auditoria)
- `pergunta_id` (FK para a pergunta do catálogo RTRS)
- `conforme` (Booleano: Cumpre a regra ou não?)
- `observacoes` (Anotações do auditor)
- `evidencia_url` (Texto: Link para a foto/documento armazenado no Supabase Storage)
- *Constraint:* UNIQUE (auditoria_id, pergunta_id) — uma pergunta não pode ser respondida duas vezes na mesma auditoria.

### `pendencias` (Gestão de Anomalias)
- `id` (UUID - Chave Primária)
- `propriedade_id` (FK para a fazenda)
- `titulo` (Texto - Título descritivo da pendência)
- `descricao` (Texto - Detalhamento do problema)
- `status` (Texto: `Pendente`, `Em Análise`, `Resolvida`)
- `prazo` (TIMESTAMPTZ - Prazo para resolução)
- `evidencia_url` (Texto - Link para arquivo de evidência)
- `resolucao_descricao` (Texto - Descrição da resolução enviada pelo Produtor)
- `motivo_rejeicao` (Texto - Motivo caso o Técnico rejeite a resolução, migration 030)
- `criado_por` (UUID - Quem criou a pendência)
- *Regra RLS (migration 039):* Gestores e Técnicos veem todas. Produtores veem apenas pendências de suas propriedades.

---

## 3. Tabelas Complementares (Etapa 1 — Migration 032)

### `prospectos` (Captação de Leads)
- `id`, `nome`, `email`, `telefone`, `nome_propriedade`, `municipio`, `mensagem`
- `status` (Texto: `novo`, `em_atendimento`, `convertido`, `arquivado`)
- *RLS:* Inserção pública anônima (qualquer visitante pode enviar). Leitura exclusiva do Gestor.

### `producao_credito` (Dados de Safra e Créditos RTRS)
- `id`, `propriedade_id` (FK), `ano_safra` (ex: "2025/2026")
- `area_plantada_ha`, `producao_estimada_ton`, `volume_credito_rtrs` (NUMERIC(15,4))
- `observacoes`
- *RLS:* Gestor ou Produtor dono da propriedade. Técnicos bloqueados.

### `grupos_propriedades` e `propriedades_grupos` (Agrupamento de Fazendas)
- Permite agrupar fazendas logicamente por região ou programa.
- `nome_grupo`, `regiao`, `descricao` + tabela associativa M:N.
- *RLS:* Exclusivo do Gestor.

### `modelos_documentos` (Templates de Documentação)
- `id`, `titulo`, `descricao`, `categoria` (RH, Ambiental, Seguranca, Geral)
- `arquivo_url`, `criado_por` (FK para auth.users)
- *RLS:* Leitura para todos os autenticados. Gerenciamento exclusivo do Gestor.

### `aceite_termos` (Assinaturas e Termos Legais)
- `id`, `usuario_id` (FK), `propriedade_id` (FK)
- `tipo_termo` (Adesao, Delegacao), `metodo` (GovBr, UploadManual)
- `assinado_em`, `ip_origem`, `arquivo_pdf_url`, `hash_validacao`
- *RLS:* Leitura e inserção apenas pelo próprio produtor ou pelo gestor.

### `documentos_propriedade` (Documentos por Fazenda — Migration 044)
- `id`, `propriedade_id` (FK), `nome`, `categoria` (default: Geral)
- `arquivo_url`
- *RLS:* Acesso amplo para todas as operações (SELECT, INSERT, UPDATE, DELETE) a usuários autenticados e anônimos.

### `imoveis_car_sigef` (Importação CAR/SIGEF — Migrations 016/026/031)
- Tabela auxiliar para importação e processamento de dados geoespaciais dos sistemas CAR e SIGEF nacionais.
- Expandida com colunas adicionais na migration 031.

---

## 4. Funções RPC (Remote Procedure Calls)

### `cadastrar_prospeccao_completa` (Migration 023)
- Função transacional `SECURITY DEFINER` que cadastra, em uma única transação atômica:
  1. Um Produtor (novo ou existente).
  2. Uma ou mais Propriedades (com código CAR/SIGEF e geometria GeoJSON).
  3. Auditorias auto-agendadas opcionais (com técnico vinculado).
- Qualquer erro reverte toda a transação automaticamente.

### `check_propriedade_pendencias` (Migration 019)
- Trigger `BEFORE INSERT OR UPDATE` na tabela `auditorias`.
- Bloqueia a certificação caso existam pendências com status diferente de "Resolvida".

### `is_gestor()` (Migration 032)
- Função helper `SECURITY DEFINER` reutilizável em todas as políticas RLS.
- Verifica se o usuário é Gestor via JWT claims ou consulta à tabela `perfis`.

### `auto_fetch_municipio` e `auto_fetch_property_geom` (Migrations 027/028)
- Triggers automáticos que populam o município e a geometria da propriedade baseando-se no código CAR/SIGEF ao inserir ou atualizar registros.
