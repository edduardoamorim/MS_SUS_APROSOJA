# 01. Visão de Negócio e Perfis

## O Propósito do MS Sustentável
O **Programa MS Sustentável** foi projetado para facilitar, estruturar e auditar o processo de certificação **RTRS (Round Table on Responsible Soy)** para propriedades rurais no estado de Mato Grosso do Sul.
A certificação RTRS é rigorosa e exige um controle de dados impecável, cruzando critérios ambientais, sociais e agrícolas. O objetivo do sistema é abandonar o uso de planilhas e formulários físicos, centralizando a inteligência geográfica e as regras de negócio em um portal unificado e seguro.

---

## Perfis de Usuário (RBAC)

A plataforma opera sob um sistema rígido de controle de acessos (Role-Based Access Control), onde cada perfil tem visões e permissões estritas:

### 1. Produtor Rural (`produtor`)
- **Objetivo:** Iniciar e acompanhar o processo de certificação de suas fazendas.
- **Responsabilidades:**
  - Pode se **autocadastrar** na plataforma via formulário público (`/cadastro`), informando nome, e-mail, telefone/WhatsApp e senha — ou ser convidado pelo Gestor.
  - Validar os dados de suas propriedades (incluindo o CAR - Cadastro Ambiental Rural ou SIGEF).
  - Preencher a *Autoavaliação RTRS* (com upload de evidências fotográficas e documentos via Supabase Storage).
  - Enviar documentos exigidos (Certidões Negativas, Laudos, Manuais de RH).
  - Acompanhar e resolver *Pendências* levantadas pelos auditores (com envio de resolução e acompanhamento de status).
  - Utilizar a **Pré-Auditoria Inteligente** (IA Generativa Gemini) para obter ações corretivas antes da visita do auditor.
- **Segurança:** O Produtor só pode visualizar e editar dados de propriedades que estejam explicitamente vinculadas ao seu `produtor_id` (ou ao e-mail correspondente no perfil). Pendências são filtradas automaticamente por propriedade.

### 2. Técnico Agrícola / Analista de Campo (`tecnico`)
- **Objetivo:** Realizar vistorias in-loco e avaliar o cumprimento dos critérios.
- **Responsabilidades:**
  - Acessar propriedades e auditorias via dashboard unificado com todas as fazendas e auditorias do programa.
  - Realizar o preenchimento do checklist oficial da RTRS durante a visita de campo (componente `QuestionarioRTRS`).
  - Aprovar critérios ou gerar *Pendências* detalhadas (com prazo, descrição e possibilidade de rejeição com motivo).
  - Revisar resoluções de pendências enviadas pelos produtores (componente `RevisaoAuditoria`).
  - Visualizar informações detalhadas de auditorias no modal `AuditDetailModal`.
- **Segurança:** Técnicos possuem visão global de todas as propriedades e auditorias do programa (política RLS diferente do Produtor).

### 3. Gestor Estadual (`gestor`)
- **Objetivo:** Governança total do programa.
- **Responsabilidades (7 Módulos no Painel):**
  1. **Visão Geral (Dashboard):** Indicadores macro com Briefing Executivo gerado por IA (Gemini), contadores de propriedades, auditorias e gargalos.
  2. **Propriedades:** Cadastro completo de fazendas com prospecção automatizada (`cadastrar_prospeccao_completa`), vínculo de produtores (novos ou existentes), importação de dados via CAR/SIGEF/KML.
  3. **Auditorias:** Agendamento, vinculação de técnicos, acompanhamento de status e etapas.
  4. **Documentação & Evidências:** Upload, categorização e gerenciamento de documentos por propriedade, modelos de documentos reutilizáveis.
  5. **Mapa e Cruzamento:** Visualização geoespacial das fazendas com MapLibre GL, cruzamento com camadas municipais, busca por localização.
  6. **Usuários:** Convidar e gerenciar Produtores e Técnicos (`invite-user` via Edge Function).
  7. **Questionário RTRS:** Gerenciamento do catálogo de perguntas/critérios da certificação.
- **Segurança:** O Gestor tem acesso irrestrito de leitura e escrita a todos os dados da plataforma. Função helper `is_gestor()` valida seu acesso no nível do banco.

---

## Ponto de Entrada Público (Landing Page e Prospecção)

Antes mesmo do login, a plataforma possui uma **Landing Page pública** (`/`) com:
- Apresentação institucional do programa com contadores animados (hectares, propriedades).
- **Modal de Manifestação de Interesse:** Produtores podem preencher um formulário com nome, e-mail, telefone, propriedade e município.
- Os dados são salvos na tabela `prospectos` e uma notificação é disparada via Edge Function `send-interest-email` para a equipe técnica da APROSOJA-MS.
- Páginas informativas de **Termos de Uso** e **Política de Privacidade**.

---

## Fluxo da Certificação (3 Etapas Macro)

O sistema opera com **3 Etapas macro**, registradas na coluna `etapa` das tabelas `auditorias` e `propriedades`:

### Etapa 1 — Prospecção
1. **Captação:** Produtor manifesta interesse via Landing Page ou é identificado pelo Gestor.
2. **Cadastro e Vínculo:** O Gestor cadastra o Produtor (novo ou existente) e vincula suas Fazendas (via CAR/SIGEF/KML) usando a função transacional `cadastrar_prospeccao_completa`.
3. **Autocadastro:** Alternativamente, o Produtor pode se registrar diretamente em `/cadastro` com seus dados pessoais e da fazenda.

### Etapa 2 — Auditoria Prévia
4. **Autoavaliação:** O Produtor acessa o portal, envia a documentação inicial e responde aos requisitos básicos do questionário RTRS.
5. **Pré-Auditoria IA:** O Produtor pode solicitar ações corretivas automatizadas via IA antes da visita do técnico.
6. **Agendamento:** O Gestor delega um Técnico e agenda a "Data Alvo" da vistoria.

### Etapa 3 — Auditoria Oficial
7. **Auditoria em Campo:** O Técnico visita a fazenda, preenche o questionário oficial RTRS, tira fotos (evidências) e aponta pendências se houver.
8. **Resolução:** O Produtor resolve as pendências no seu painel (com upload de documentos e descrição da resolução).
9. **Certificação:** Estando 100% conforme (sem pendências ativas — validado por trigger no banco), a fazenda é marcada como "Certificada".

---

## Configurações de Perfil

Todos os perfis (Produtor, Técnico e Gestor) possuem acesso a uma página de **Configurações de Perfil** (`/app/perfil`) para edição de dados pessoais.
