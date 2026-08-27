# DOCUMENTO DE CONTEXTO TÉCNICO E HISTÓRICO DE DESENVOLVIMENTO
**Projeto:** MS Sustentável (APROSOJA/MS)  
**Destinatário:** Agentes de Inteligência Artificial / Desenvolvedores  
**Data:** 25 de Agosto de 2026  
**Repositório Base:** `MS_SUS_APROSOJA` (Branch `main`)

---

## 1. VISÃO GERAL DO SISTEMA

O **MS Sustentável** é uma plataforma desenvolvida para a **APROSOJA/MS** voltada à gestão de conformidade socioambiental e preparação de propriedades rurais de Mato Grosso do Sul para a **Certificação RTRS (Round Table on Responsible Soy)** e outros padrões de sustentabilidade.

### Perfis de Usuário na Plataforma:
1. **Gestor:** Administra técnicos, questionários, relatórios, documentações e liberações.
2. **Técnico de Campo:** Realiza vistorias presenciais (*Auditoria In Loco*), preenche os 115 critérios da matriz RTRS, anexa evidências fotográficas/documentais e cria apontamentos de não conformidade (*Pendências de Regularização*).
3. **Produtor Rural:** Acompanha o status das fazendas, realiza a *Autoavaliação RTRS*, envia documentos e resolve pendências anexando comprovantes.

---

## 2. ARQUITETURA DE BANCO DE DADOS & SUPABASE CLOUD

O frontend conecta-se à nuvem do **Supabase Cloud** (projeto `bosbmfnzhjdtirhitgig.supabase.co`). Há também um espelho local configurado em `supabase/` (Docker PostgreSQL porta `54322`, Studio porta `54323`).

### 2.1. Configuração do Cliente Supabase (`frontend/src/lib/supabase.ts`)
- O client extrai dinamicamente o `ref` do projeto através do payload JWT da `VITE_SUPABASE_ANON_KEY` se a URL não for fornecida explicitamente, garantindo conexão transparente tanto em ambiente local quanto em produção (Vercel).

### 2.2. Estrutura Exata das Tabelas no PostgreSQL:

#### A. `public.propriedades` (6 fazendas cadastradas)
- **Colunas:** `id (UUID, PK)`, `produtor_id`, `nome_fazenda (TEXT)`, `nome_produtor (TEXT)`, `codigo_car (TEXT)`, `codigo_sigef (TEXT)`, `origem_cadastro (TEXT)`, `municipio (TEXT)`, `geom (GEOMETRY)`, `created_at`, `updated_at`.
- **Fazendas Ativas:** FAZENDA CÁCERES, Fazenda Santa Virgínia, FAZENDA CAMPANÁRIO - Área 06, Fazenda teste chapadao, FAZENDA TRÊS IRMÃOS, FAZENDA RIO VERDE.
- **Atenção:** A coluna `status_certificacao` NÃO existe nesta tabela (o status é derivado da tabela `auditorias`).

#### B. `public.auditorias` (15 auditorias cadastradas)
- **Colunas:** `id (UUID, PK)`, `propriedade_id (UUID, FK -> propriedades.id)`, `tecnico_responsavel_id (UUID/TEXT)`, `data_agendamento (TIMESTAMPTZ)`, `status (TEXT)`, `created_at`, `updated_at`.
- **Status possíveis:** `'Autoavaliação'`, `'Visita de Campo'`, `'Em Andamento'`, `'Em Análise'`, `'Aguardando Aprovação'`, `'Acompanhamento'`, `'Certificada'`.
- **Atenção:** A coluna `data_realizacao` NÃO existe nesta tabela. Utiliza-se `updated_at` / `data_agendamento`.

#### C. `public.perguntas_rtrs` (115 indicadores oficiais)
- **Colunas:** `id (UUID, PK)`, `secao (TEXT)`, `numero_criterio (TEXT)`, `enunciado (TEXT)`, `criterio (TEXT)`, `ponderacao (TEXT)`, `orientacao (TEXT)`, `interpretacao_nacional (TEXT)`, `ativo (BOOLEAN)`, `ordem (INT)`, `created_at`.
- **Princípios RTRS (5 Princípios):**
  1. *Princípio 1: Cumprimento da Legislação e Boas Práticas Empresariais* (7 critérios: 1.1.1 a 1.2.3)
  2. *Princípio 2: Relações Trabalhistas e Condições de Trabalho* (34 critérios)
  3. *Princípio 3: Relações com a Comunidade* (10 critérios)
  4. *Princípio 4: Responsabilidade Ambiental* (23 critérios)
  5. *Princípio 5: Boas Práticas Agrícolas* (41 critérios)

#### D. `public.respostas_auditoria` (Tabela de Respostas e Evidências)
- **Colunas:** 
  - `id (UUID, PK)`
  - `auditoria_id (UUID, FK -> auditorias.id)`
  - `pergunta_id (UUID, FK -> perguntas_rtrs.id)`
  - `conforme (BOOLEAN)`
  - `observacoes (TEXT)` ⚠️ **CRÍTICO: O nome da coluna é `observacoes` (PLURAL), NÃO `observacao`!**
  - `evidencia_url (TEXT)` (Armazena URL pública ou Data URL em Base64 da foto anexada)
  - `created_at`, `updated_at`
- **Constraint de unicidade:** `(auditoria_id, pergunta_id)` para operações de `upsert`.

#### E. `public.pendencias` (Checklist de Não Conformidades)
- **Colunas:** `id (UUID, PK)`, `propriedade_id (UUID)`, `auditoria_id (UUID)`, `titulo (TEXT)`, `descricao (TEXT)`, `status (TEXT: 'Pendente', 'Em Análise', 'Resolvida')`, `prazo (DATE)`, `evidencia_url (TEXT)`, `resolucao_descricao (TEXT)`, `motivo_rejeicao (TEXT)`, `criado_por (UUID)`, `created_at`, `updated_at`.

---

## 3. MATRIZ OFICIAL RTRS & REGRAS DE NEGÓCIO

### 3.1. Arquivo Mestre
- Os 115 critérios oficiais foram extraídos da planilha matriz [`base_doc_RTRS/Certificação RTRS.xlsx`](file:///c:/Users/antonio.amorim/Documents/MS_SUS/_atualizado/base_doc_RTRS/Certifica%C3%A7%C3%A3o%20RTRS.xlsx) e compilados em [`base_doc_RTRS/rtrs_questions.json`](file:///c:/Users/antonio.amorim/Documents/MS_SUS/_atualizado/base_doc_RTRS/rtrs_questions.json).

### 3.2. Critério 5.5.1 (Registro de Aplicações de Agroquímicos)
Subdividido estritamente em 5 sub-itens com ponderações individuais:
- `5.5.1.a`: *"a) os produtos comprados e aplicados, as quantidades e as datas;"* (`Imediata`)
- `5.5.1.b`: *"b) a identificação da área onde a aplicação foi realizada;"* (`Imediata`)
- `5.5.1.c`: *"c) os nomes das pessoas que fizeram a preparação dos produtos e a aplicação em campo;"* (`Curto prazo`)
- `5.5.1.d`: *"d) a identificação do equipamento de aplicação utilizado;"* (`Curto prazo`)
- `5.5.1.e`: *"e) as condições meteorológicas durante a aplicação."* (`Médio prazo`)
- **Interpretação Nacional 5.5.1:** *"5.5.1 Levar em conta a escala e o contexto, especialmente nas fazendas de pequeno porte."*

### 3.3. Orientações Nacionais do Brasil (Formato e Parser)
- No banco de dados, o campo `orientacao` armazena de forma estruturada:
  ```text
  [INTERPRETAÇÃO NACIONAL - BRASIL]
  Texto com as leis e instruções específicas para produtores do Brasil.

  [DIRETRIZES GERAIS]
  Texto com as diretrizes e procedimentos padrão de auditoria internacional RTRS.
  ```
- O frontend utiliza a função `parseOrientacoes(orientacao, interpretacao_nacional)` em [`QuestionarioRTRS.tsx`](file:///c:/Users/antonio.amorim/Documents/MS_SUS/_atualizado/frontend/src/components/auditoria/QuestionarioRTRS.tsx) e [`GestorQuestionarios.tsx`](file:///c:/Users/antonio.amorim/Documents/MS_SUS/_atualizado/frontend/src/pages/gestor/GestorQuestionarios.tsx) para separar dinamicamente os dois blocos em cards estilizados distintos.
- **Design do Botão:** O botão do acordeão exibe de forma limpa `VER ORIENTAÇÃO / DIRETRIZES` (sem badges extras no cabeçalho, a pedido do usuário).

---

## 4. PROBLEMAS DIAGNOSTICADOS E SOLUÇÕES APLICADAS

### ❌ Problema 1: "Nenhum critério nesta seção" no Questionário do Técnico
- **Causa:** A query no `fetchPerguntas` executava `.select('id, secao, ..., interpretacao_nacional, ativo')`. Como a coluna `interpretacao_nacional` não constava no schema cache do PostgREST do Supabase Cloud, a API retornava erro `42703 (column does not exist)` e `data: null`, fazendo com que nenhuma pergunta fosse exibida.
- **Solução:** A busca foi unificada para `.select('*')` (idêntico ao painel do Gestor). O parser `parseOrientacoes()` extrai a interpretação nacional do texto estruturado de forma resiliente tanto na nuvem quanto localmente.

### ❌ Problema 2: Barra de Progresso marcando "1%" ou "5%" com 0 critérios preenchidos
- **Causa:** O cálculo do progresso global somava `Object.values(respostas).length`. Quando as perguntas foram re-semeadas com novos UUIDs, o `localStorage` do navegador do usuário mantinha chaves com UUIDs antigos (órfãos). Na tela, as perguntas atuais apareciam desmarcadas (`0/7`), mas o cálculo somava os itens órfãos do cache, resultando em `1 / 115 = 1%`.
- **Solução:** 
  1. O cálculo de progresso foi reescrito para consultar exclusivamente as perguntas ativas na tela:
     ```tsx
     const totalRespondidas = perguntas.filter(p => {
       const r = respostas[p.id];
       return r && r.conforme !== null && r.conforme !== undefined;
     }).length;
     const percentualConcluido = totalPerguntas > 0 ? Math.round((totalRespondidas / totalPerguntas) * 100) : 0;
     ```
  2. Implementada limpeza e reconciliação automática de rascunhos órfãos no carregamento de `perguntas`.

### ❌ Problema 3: Respostas não persistindo no Banco de Dados
- **Causa:** A tabela `respostas_auditoria` do Supabase Cloud possui a coluna `observacoes` (plural). O frontend enviava `observacao` (singular) no payload do `upsert`, causando erro `PGRST204 (400 Bad Request: column 'observacao' does not exist)`.
- **Solução:** 
  1. Corrigidos todos os payloads de `upsert` e `select` para utilizar estritamente a coluna `observacoes`.
  2. Implementada **auto-persistência em tempo real**: toda vez que o usuário clica em "Sim, Conforme", "Não Conforme" ou digita uma observação, o sistema grava automaticamente no Supabase em segundo plano via `upsert`.
  3. Adicionado `propriedadeId={activeAuditoria.propriedade_id || activeAuditoria.propriedades?.id}` no [DashboardTecnico.tsx](file:///c:/Users/antonio.amorim/Documents/MS_SUS/_atualizado/frontend/src/pages/tecnico/DashboardTecnico.tsx) para garantir vínculo perfeito da fazenda.

### ❌ Problema 4: Evidências/Imagens anexadas sumindo
- **Causa:** 
  - Quando o upload para o bucket do Supabase Storage falhava (buckets não criados ou sem permissão pública), o código antigo gerava uma URL fictícia (`https://supabase.local/storage/...`). Em produção, esse link quebrava (404) e a imagem desaparecia.
  - Apenas as fotos de *Pendências* permaneciam visíveis porque eram armazenadas como **Base64 Data URL** (`data:image/jpeg;base64,...`) gravadas diretamente no texto do banco.
- **Solução Blindada:**
  1. No [QuestionarioRTRS.tsx](file:///c:/Users/antonio.amorim/Documents/MS_SUS/_atualizado/frontend/src/components/auditoria/QuestionarioRTRS.tsx), caso o storage não esteja acessível, a imagem capturada da câmera ou enviada por arquivo é convertida via `FileReader` para **Base64 Data URL** de alta resolução e gravada diretamente na coluna `evidencia_url` de `respostas_auditoria`.
  2. A imagem fica permanentemente gravada no próprio PostgreSQL: **nunca mais expira, nunca dá erro 404 e abre instantaneamente**.
  3. A aba `Histórico de Documentação & Evidências` do [DashboardTecnico.tsx](file:///c:/Users/antonio.amorim/Documents/MS_SUS/_atualizado/frontend/src/pages/tecnico/DashboardTecnico.tsx) busca diretamente de `respostas_auditoria` e `pendencias`, exibindo todos os laudos e fotos com visualizador Lightbox integrado.

---

## 5. REGRAS CRÍTICAS DE CONDUTA E FLUXO GIT

1. ⚠️ **REGRA DE OURO DO GIT:**
   - **NUNCA, JAMAIS executar `git commit` sem solicitação explícita do usuário.**
   - Quando o usuário autorizar/pedir o commit: **SEMPRE executar `git push origin main` logo em seguida.**
2. 🔒 **CONFIDENCIALIDADE E SEGURANÇA:**
   - NUNCA ler, abrir, editar, registrar em log ou exibir arquivos `.env` (`.env`, `.env.local`, `.env.production`).
   - NUNCA exibir chaves secretas ou credenciais em comentários ou chats.
3. 🧪 **VERIFICAÇÃO DE BUILD:**
   - Sempre validar as alterações de código executando `npm.cmd run build` na pasta `frontend/` (garantindo 0 erros de TypeScript e compilação).

---

## 6. MAPA DOS PRINCIPAIS ARQUIVOS DO PROJETO

- [`frontend/src/components/auditoria/QuestionarioRTRS.tsx`](file:///c:/Users/antonio.amorim/Documents/MS_SUS/_atualizado/frontend/src/components/auditoria/QuestionarioRTRS.tsx): Componente principal do questionário de 115 itens, com auto-persistência, upload base64 blindado, abas por princípio e cálculo de conformidade.
- [`frontend/src/pages/tecnico/DashboardTecnico.tsx`](file:///c:/Users/antonio.amorim/Documents/MS_SUS/_atualizado/frontend/src/pages/tecnico/DashboardTecnico.tsx): Portal do técnico de campo (Mapa, Auditorias e Histórico de Documentos & Evidências).
- [`frontend/src/pages/gestor/GestorQuestionarios.tsx`](file:///c:/Users/antonio.amorim/Documents/MS_SUS/_atualizado/frontend/src/pages/gestor/GestorQuestionarios.tsx): Gestão da matriz RTRS, edição e cadastro de novos critérios com interpretação nacional.
- [`frontend/src/pages/produtor/DashboardProdutor.tsx`](file:///c:/Users/antonio.amorim/Documents/MS_SUS/_atualizado/frontend/src/pages/produtor/DashboardProdutor.tsx): Portal do produtor rural (Autoavaliação e regularização de pendências).
- [`base_doc_RTRS/rtrs_questions.json`](file:///c:/Users/antonio.amorim/Documents/MS_SUS/_atualizado/base_doc_RTRS/rtrs_questions.json): Base mestre dos 115 indicadores oficiais.
- [`supabase/seed_rtrs.sql`](file:///c:/Users/antonio.amorim/Documents/MS_SUS/_atualizado/supabase/seed_rtrs.sql): Script SQL para seed local dos 115 indicadores.
