# 03. Modelagem de Dados e Inteligência Geoespacial (PostGIS)

O modelo de dados do **MS Sustentável** foi projetado para sustentar o complexo questionário da certificação RTRS e integrar a inteligência geográfica de cada propriedade.

## 1. O "Casamento" dos Dados Geográficos (PostGIS)

Como o Supabase utiliza **PostgreSQL**, ele suporta nativamente a extensão espacial **PostGIS**, que é a engrenagem mais poderosa do mundo para bancos de dados geoespaciais.

- **Tipo Geometry:** Na tabela `propriedades`, a coluna `geom` não armazena um texto ou número simples; ela armazena a representação matemática vetorial da fazenda (o Polígono real com suas coordenadas de latitude e longitude).
- **Consultas Espaciais (Spatial Queries):** Isso permite que o banco de dados responda perguntas complexas instantaneamente, como:
  - *"Calcule a área desta fazenda em Hectares."* (`ST_Area`)
  - *"Verifique se esta fazenda invade alguma Terra Indígena cadastrada."* (`ST_Intersects`)
- **Tratamento Seguro:** Todas as inserções e conversões de mapas vetoriais (ex: GeoJSON vindo do frontend) passam por funções de cast interno (`ST_GeomFromGeoJSON`) para garantir integridade e conversão de projeção (SRID 4326).

---

## 2. Estrutura Central de Tabelas (ERD)

A aplicação gira em torno do fluxo de auditoria, exigindo as seguintes entidades principais:

### `propriedades` (Cadastro das Fazendas)
- `id` (UUID - Chave Primária)
- `nome_fazenda`, `nome_produtor`, `codigo_car` (Dados cadastrais)
- `produtor_id` (UUID - FK apontando para o dono na tabela de perfis)
- `geom` (Geometry/Polygon - O mapa da fazenda)
- *Regra RLS:* Somente Gestores ou o Produtor dono do ID podem editar/ver.

### `auditorias` (A Jornada de Certificação)
- `id` (UUID - Chave Primária)
- `propriedade_id` (FK para a fazenda)
- `data_agendamento` (Data alvo para a visita de campo)
- `status` (Enum: "Agendada", "Em Andamento", "Em Análise", "Pendência", "Certificada", "Reprovada")
- `tecnico_responsavel_id` (FK para o auditor de campo encarregado)

### `perguntas_rtrs` (Catálogo Estático de Critérios)
- `id` (UUID - Chave Primária)
- `secao` (Texto: "Ambiental", "Trabalhista", etc.)
- `numero_criterio` (Texto: ex: "Criterio 4.1")
- `enunciado` (A pergunta real que o auditor vai checar no campo)
- *Comportamento:* Tabela estática. Não muda por fazenda.

### `respostas_auditoria` (Inspeção de Campo)
- `id` (UUID - Chave Primária)
- `auditoria_id` (FK para o evento de auditoria)
- `pergunta_id` (FK para a pergunta do catálogo RTRS)
- `conforme` (Booleano: Cumpre a regra ou não?)
- `observacoes` (Anotações do auditor)
- `evidencia_url` (Texto: Link para a foto/documento armazenado no Supabase Storage)

### `pendencias` (Gestão de Anomalias)
- Se durante a vistoria um critério crítico não é cumprido, o Técnico lança uma pendência.
- O Produtor pode interagir com essa pendência enviando um arquivo de resolução e alterando o status para "Resolvido", sujeito a reavaliação do Técnico.
