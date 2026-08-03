# 05. Manual de Operação e Testes Automatizados

Este documento orienta o ambiente operacional (DevOps), inicialização da plataforma, o pipeline de testes de integridade e os procedimentos de deploy.

## 1. Inicializando o Projeto Localmente (Docker)

A infraestrutura inteira roda isoladamente através do Docker Desktop utilizando a CLI do Supabase.

### Pré-Requisitos
- Node.js (v18+)
- Docker Desktop (Rodando)

### Rotina de Deploy (Scripts na Raiz)
Para simplificar o "onboarding" de novos desenvolvedores, criamos scripts `.bat` auto-executáveis na raiz:
1. `1_instalar_dependencias.bat`: Executa o `npm install` no Frontend.
2. `2_iniciar_banco.bat`: Sobe os containers de Banco, Storage, Autenticação e Edge Functions (`npx supabase start`). Também injeta dados sementes (seeding) como mapas dos municípios e perguntas RTRS.
3. `3_iniciar_site.bat`: Levanta o servidor web Vite de desenvolvimento (`npm run dev --host`) na porta 5173.
4. `4_compactar_projeto.bat`: Gera um pacote compactado do projeto para backup ou distribuição.

### Caixa de E-mails Local (Inbucket)
Ao criar um usuário ou testar o "Esqueci a Senha" localmente, nenhum e-mail real é gasto. O Supabase intercepta todas as mensagens e as joga em um servidor Inbucket que pode ser acessado em: `http://localhost:54324`.

### Tela de Diagnóstico de Desenvolvimento
Caso as variáveis de ambiente do Supabase não estejam configuradas no `frontend/.env.local`, o sistema exibe automaticamente uma **tela de diagnóstico** (DevDiagnosticScreen) com instruções detalhadas sobre como obter e configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

---

## 2. Estrutura de Migrations

O banco de dados é versionado através de **44 migrations SQL** (numeradas de `001` a `044`) localizadas em `supabase/migrations/`. As mais relevantes incluem:

| Migration | Descrição |
|-----------|-----------|
| `001_init_rtrs_schema` | Schema inicial: propriedades, auditorias, perguntas RTRS, respostas, RLS básico |
| `006_setup_pendencias` | Criação da tabela de pendências |
| `009_sync_profiles_trigger` | Trigger de sincronização auth.users ↔ perfis |
| `010_fix_rls_recursion` | Correção de recursão infinita no RLS |
| `016_import_car_sigef` | Importação de imóveis CAR/SIGEF |
| `019_block_certificar_com_pendencias` | Trigger que bloqueia certificação com pendências ativas |
| `023_rpc_cadastrar_prospeccao` | RPC transacional para cadastro de prospecção completa |
| `027/028_auto_fetch` | Auto-fetch de geometria e município via PostGIS |
| `032_etapa1_novas_tabelas` | 5 novas tabelas: prospectos, producao_credito, grupos, modelos, aceite_termos |
| `039_producer_properties_rls` | Isolamento RLS por produtor (propriedades e pendências) |
| `040_standardize_user_contact` | Padronização de campos de contato (telefone, WhatsApp) |
| `042/043_etapa_auditoria` | Sistema de etapas (Prospecção, Auditoria Prévia, Auditoria Oficial) |
| `044_documentos_propriedade` | Tabela de documentos por propriedade |

### Seeds
- `seed.sql`: Dados básicos iniciais.
- `seed_rtrs.sql` (~141KB): Perguntas e critérios completos da certificação RTRS.

---

## 3. Testes de Validação e Qualidade (QA)

### Testes Manuais Direcionados
Na tela de login, há um **Painel de Testes & Desenvolvimento** que permite:
- **Login rápido** com contas de teste pré-cadastradas (Gestor, Técnico/Patrícia, Produtor) com um clique.
- Botão "Garantir Acesso a Todas as Contas" para verificar integridade das contas de teste.
- As contas de teste incluem: `gestor@ms.gov.br`, `analistacampo1@aprosojams.org.br`, `analistacampo2@aprosojams.org.br`, `edward.produtor@aprosojams.org.br`, entre outros.
- O login resiliente suporta fallback (dicionário `TEST_USERS`) para ambientes onde o Supabase Auth local está indisponível.

### Testes Automatizados de Backend (Python)
Para garantir as lógicas mais profundas (regras de postGIS e bloqueios de RLS), existe uma suíte de testes construída em `pytest`.

```bash
# Na raiz do projeto, com o Python e Pip instalados:
pip install -r requirements.txt
pytest tests/test_db_workflow.py
```
Estes testes injetam conexões diretas no Postgres para garantir que o Técnico "A" não consiga ler a Fazenda que está na carteira do Técnico "B", certificando que não há quebras no Row Level Security após alterações.

---

## 4. Deploy e Hospedagem

### Vercel (Principal)
O projeto está configurado para deploy na **Vercel** via `vercel.json`:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```
Este rewrite garante que o React Router DOM funcione corretamente em produção (todas as rotas servem o `index.html`).

### GitHub Pages (Alternativo)
Configurado via pacote `gh-pages` no `package.json`:
```bash
npm run predeploy  # Executa vite build
npm run deploy     # Publica no GitHub Pages
```

---

## 5. Histórico de Inconformidades Tratadas (Auditoria)

Como garantia histórica da maturação da plataforma, deixamos registrado problemas complexos que já foram superados e devem servir como aviso de "Não Retroceder" (Regressions):

- **Recursões RLS Resolvidas (Migration 010):** Houve um erro no passado onde a política RLS de Propriedades tentava ler Auditorias e a de Auditorias tentava ler Propriedades, causando erro `500 Infinity Recursion`. A lógica foi separada com uso de `SECURITY DEFINER` nas consultas da migration `010`.
- **Divergência de Timezones:** Datas de auditoria cadastradas sem consideração ao timezone causam offset negativo (data exibindo um dia anterior). As formatações no React devem forçar `Date` objects ao fuso de Brasília local, ignorando mutações automáticas do DatePicker em tempo de execução.
- **Uploaders Reais:** Nunca usar mock de Timeout nos portais; todas as imagens estão agora fluindo e convertendo com sucesso para a API do Storage Oficial do Supabase.
- **Bloqueio de Certificação (Migration 019):** Trigger `check_propriedade_pendencias` garante que nenhuma fazenda seja certificada enquanto existirem pendências com status diferente de "Resolvida". Qualquer tentativa de mudar o status da auditoria para "Certificada" com pendências ativas resulta em erro `RAISE EXCEPTION`.
- **Isolamento RLS do Produtor (Migration 039):** Políticas antigas davam visão global a todos os autenticados. A migration 039 separou as políticas: Gestores/Técnicos mantiveram visão global, Produtores foram isolados a suas próprias propriedades e pendências.
