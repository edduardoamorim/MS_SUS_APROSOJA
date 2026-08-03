# 02. Arquitetura e Tecnologias

O **MS Sustentável** foi construído sob uma arquitetura serverless moderna, separando o frontend (SPA) do backend as a service (BaaS), garantindo escalabilidade, segurança e desenvolvimento ágil.

## 1. Frontend (Interface Web)

O frontend é um *Single Page Application (SPA)* construído com as ferramentas mais modernas do ecossistema JavaScript:

- **React 19:** Biblioteca base para construção das interfaces de usuário. Componentizado e altamente reativo.
- **TypeScript 6:** Superset de tipagem forte para JavaScript. Previne erros de tipagem em tempo de compilação e garante que o contrato de dados com o banco de dados seja estrito e seguro.
- **Vite 8:** Build tool de altíssima performance. Utilizado para o ambiente de desenvolvimento local (Hot Module Replacement instantâneo) e empacotamento otimizado (bundling via Rollup) para produção.
- **Tailwind CSS 4:** Framework CSS utilitário. Permite a construção de interfaces complexas, responsivas e visualmente ricas (Premium UI, Glassmorphism, Dark Modes) diretamente no JSX, sem necessidade de arquivos CSS separados (exceto o `index.css` raiz).
- **React Router DOM 7:** Gerenciamento de rotas com layouts aninhados, rota protegida (`ProtectedRoute`) e sistema de redirecionamento por perfil.
- **Lucide React:** Biblioteca de ícones vetoriais modernos e leves, padronizando a iconografia do sistema.
- **MapLibre GL & React Map GL:** Engine open-source de renderização vetorial de mapas. Essencial para renderizar os polígonos das fazendas sobre camadas de satélite e mapas de ruas. Inclui o componente `LocationFinderModal` para busca interativa de localização.
- **JSZip:** Biblioteca auxiliar no frontend para descompactar arquivos GIS (como Shapefiles), permitindo que o navegador processe localmente dados complexos extraídos do SIGEF.
- **Shapefile (v0.6.6):** Parser de arquivos Shapefile (SHP) diretamente no browser, complementando o fluxo de importação geoespacial CAR/SIGEF.
- **@hello-pangea/dnd:** Biblioteca de drag-and-drop para interfaces interativas de reordenação (ex: perguntas do questionário RTRS).
- **@google/generative-ai:** SDK oficial da Google para integração com a IA Generativa (Gemini) diretamente no frontend.

### Arquitetura de Rotas e Layouts

A aplicação utiliza uma hierarquia de layouts para organizar a experiência do usuário:

- **`PublicLayout`:** Envolve as rotas públicas (Landing Page, Login, Cadastro, Termos, Privacidade, Recuperação de Senha).
- **`BaseLayout`:** Envolve todas as rotas privadas da intranet (`/app/*`).
- **`GestorLayout`:** Sub-layout exclusivo do Gestor com sidebar de navegação premium contendo os 7 módulos.
- **`ProtectedRoute`:** Componente HOC que valida se o usuário está autenticado e possui a `role` permitida (RBAC no frontend).

### Sistema de Notificações (ToastContext)

A plataforma utiliza um sistema global de notificações (`ToastContext`) que provê toasts categorizados (success, error, warning, info) com animações e auto-dismiss.

### Diagnóstico de Desenvolvimento (DevDiagnosticScreen)

No `main.tsx`, caso as variáveis de ambiente do Supabase não estejam configuradas, uma tela de diagnóstico amigável é exibida orientando o desenvolvedor sobre como configurar o `frontend/.env.local`.

---

## 2. Backend & Infraestrutura (Supabase)

Toda a camada de banco de dados, armazenamento, funções serverless e autenticação é provida pelo **Supabase**, rodando sobre uma infraestrutura sólida de PostgreSQL.

- **Supabase Auth:** Sistema nativo de gerenciamento de identidades e login (via senhas, links ou OAuth). O Frontend nunca manipula senhas diretamente, trabalhando exclusivamente com os tokens JWT seguros (Sessão). Suporta autocadastro de produtores e login resiliente com fallback para perfis do banco.
- **PostgreSQL:** O coração da aplicação. Toda a modelagem relacional (propriedades, auditorias, questionários, usuários, prospectos, produção de créditos, grupos, documentos, termos) reside aqui. Atualmente com **44 migrations** aplicadas.
- **Supabase Storage:** Serviço de "Buckets" (pastas em nuvem seguras). Utilizado para hospedar:
  - Arquivos PDF (Certidões, laudos, documentos de propriedade).
  - Fotos de evidências capturadas em campo pelo Técnico.
  - Documentos de resolução de pendências enviados pelo Produtor.
  - Imagens de avatar de usuários.
- **Supabase Edge Functions (Deno):** Funções serverless que rodam no backend para tarefas sensíveis. O sistema possui **4 Edge Functions** ativas:
  1. **`invite-user`:** Dispara convites oficiais para novos usuários via Supabase Auth, garantindo logs de auditoria.
  2. **`send-interest-email`:** Recebe dados da Landing Page (prospectos) e notifica a equipe técnica da APROSOJA-MS.
  3. **`send-reset-password`:** Gerencia o fluxo seguro de recuperação de senha.
  4. **`upload-to-gdrive`:** Integra uploads com o Google Drive para backup externo de documentos.

---

## 3. Inteligência Artificial e Resumos Executivos

O MS Sustentável inova ao integrar IA generativa para auxiliar **Gestores e Produtores** na tomada de decisão rápida.

- **Google Generative AI (Gemini 2.5 Flash):** O modelo da Google está conectado ao sistema via SDK `@google/generative-ai` e provê **dois serviços distintos**:

  1. **Briefing Executivo (Gestor):** Analisa instantaneamente os dados macro da plataforma (propriedades, status de vistorias, pendências) e gera um resumo textual formatado em linguagem natural, apontando gargalos estruturais e recomendações. Disponível no `DashboardGestor`.

  2. **Pré-Auditoria Inteligente (Produtor):** Recebe a lista de problemas/pendências do produtor e gera um plano de ações corretivas prático, acionável e formatado em Markdown. Permite que o produtor se prepare proativamente antes da visita do auditor. Disponível no `DashboardProdutor`.

- *Nota de Segurança:* Para o ambiente de produção, a chamada da API do Gemini (`VITE_GEMINI_API_KEY`) deverá ser transferida para uma Supabase Edge Function para garantir que a chave não fique exposta no navegador do cliente.

---

## 4. Deploy e Hospedagem

O sistema está preparado para deploy em dois ambientes:

- **Vercel:** Configurado via `vercel.json` com rewrite SPA (`/(.*) → /index.html`) para suportar o roteamento client-side do React Router.
- **GitHub Pages:** Script `gh-pages` configurado no `package.json` para deploy estático alternativo.
