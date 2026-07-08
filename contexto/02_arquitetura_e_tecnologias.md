# 02. Arquitetura e Tecnologias

O **MS Sustentável** foi construído sob uma arquitetura serverless moderna, separando o frontend (SPA) do backend as a service (BaaS), garantindo escalabilidade, segurança e desenvolvimento ágil.

## 1. Frontend (Interface Web)

O frontend é um *Single Page Application (SPA)* construído com as ferramentas mais modernas do ecossistema JavaScript:

- **React 19:** Biblioteca base para construção das interfaces de usuário. Componentizado e altamente reativo.
- **TypeScript:** Superset de tipagem forte para JavaScript. Previne erros de tipagem em tempo de compilação e garante que o contrato de dados com o banco de dados seja estrito e seguro.
- **Vite 8:** Build tool de altíssima performance. Utilizado para o ambiente de desenvolvimento local (Hot Module Replacement instantâneo) e empacotamento otimizado (bundling via Rollup) para produção.
- **Tailwind CSS 4:** Framework CSS utilitário. Permite a construção de interfaces complexas, responsivas e visualmente ricas (Premium UI, Glassmorphism, Dark Modes) diretamente no JSX, sem necessidade de arquivos CSS separados (exceto o `index.css` raiz).
- **Lucide React:** Biblioteca de ícones vetoriais modernos e leves, padronizando a iconografia do sistema.
- **MapLibre GL & React Map GL:** Engine open-source de renderização vetorial de mapas. Essencial para renderizar os polígonos das fazendas sobre camadas de satélite e mapas de ruas.
- **JSZip:** Biblioteca auxiliar no frontend para descompactar arquivos GIS (como Shapefiles), permitindo que o navegador processe localmente dados complexos extraídos do SIGEF.

## 2. Backend & Infraestrutura (Supabase)

Toda a camada de banco de dados, armazenamento, funções serverless e autenticação é provida pelo **Supabase**, rodando sobre uma infraestrutura sólida de PostgreSQL.

- **Supabase Auth:** Sistema nativo de gerenciamento de identidades e login (via senhas, links ou OAuth). O Frontend nunca manipula senhas diretamente, trabalhando exclusivamente com os tokens JWT seguros (Sessão).
- **PostgreSQL:** O coração da aplicação. Toda a modelagem relacional (propriedades, auditorias, questionários, usuários) reside aqui.
- **Supabase Storage:** Serviço de "Buckets" (pastas em nuvem seguras). Utilizado para hospedar:
  - Arquivos PDF (Certidões, laudos).
  - Fotos de evidências capturadas em campo pelo Técnico.
  - Imagens de avatar de usuários.
- **Supabase Edge Functions (Deno):** Funções serverless que rodam no backend para tarefas sensíveis (ex: disparar e-mails de convite para usuários sem expor chaves administrativas).

## 3. Inteligência Artificial e Resumos Executivos

O MS Sustentável inova ao integrar IA generativa para auxiliar gestores na tomada de decisão rápida.

- **Google Generative AI (Gemini):** O modelo da Google está conectado ao sistema para gerar **Briefings Executivos**. Ele analisa instantaneamente os dados de uma propriedade (tamanho, status de vistoria, quantidade de pendências) e gera um resumo textual formatado em linguagem natural, apontando gargalos estruturais e recomendações.
- *Nota de Segurança:* Para o ambiente de produção, a chamada da API do Gemini (`VITE_GEMINI_API_KEY`) será transferida para uma Supabase Edge Function para garantir que a chave não fique exposta no navegador do cliente.
