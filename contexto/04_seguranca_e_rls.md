# 04. Segurança e Row Level Security (RLS)

A plataforma **MS Sustentável** trata dados agronômicos confidenciais (ex: Cadastro Ambiental Rural) e portanto, possui uma arquitetura de segurança rigorosa enquadrada em princípios da LGPD, delegando toda a validação de autorização DIRETAMENTE para a camada de banco de dados do Supabase. O Frontend React é tratado como ambiente inseguro e não carrega lógicas de segurança sensíveis.

## 1. O Conceito de RLS (Row Level Security)

Nenhum usuário acessa tabelas inteiras. Toda tabela no banco possui políticas de segurança que validam o token JWT de quem está pedindo o dado e filtram os dados "no nível da linha" antes mesmo de devolver a resposta.

### Função Helper: `is_gestor()` (SECURITY DEFINER)

Criada na migration 032, esta função reutilizável verifica se o usuário logado é Gestor de duas formas:
1. Via JWT claims: `request.jwt.claims -> 'user_metadata' ->> 'role' = 'gestor'`
2. Via consulta direta à tabela `perfis`: `perfis.id = auth.uid() AND perfis.role = 'gestor'`

É utilizada como condição padrão em todas as políticas RLS de tabelas onde o Gestor tem acesso total.

---

### Casos Reais Aplicados no MS Sustentável:

#### Propriedades (Migration 039 — Isolamento por Perfil)
- **Gestores e Técnicos:** Possuem visão global com `FOR ALL` — veem e gerenciam todas as propriedades. Validação via `perfis.role IN ('gestor', 'tecnico')`.
- **Produtores:** Veem apenas fazendas onde `produtor_id = auth.uid()` OU onde o `produtor_id` corresponda a um perfil com o mesmo e-mail (`LOWER(email) = LOWER(auth.jwt() ->> 'email')`). Tentativas de acessar propriedades alheias retornam zero resultados sem erro.

#### Auditorias
- **Produtores:** Podem VER auditorias de suas próprias propriedades (via subquery em `propriedades.produtor_id`).
- **Técnicos:** Gerenciam auditorias onde `tecnico_responsavel_id = auth.uid()`. A migration 012 expandiu a autonomia do técnico para operações completas.
- **Gestores:** Acesso total via `is_gestor()`.

#### Pendências (Migration 039)
- **Gestores e Técnicos:** Veem e gerenciam todas as pendências.
- **Produtores:** Veem apenas pendências vinculadas às suas propriedades (subquery cruzando `propriedade_id` com suas fazendas).

#### Respostas de Auditoria (Migrations 001/035)
- **Produtores:** Podem VER respostas de auditorias de suas propriedades. Podem INSERIR/EDITAR respostas apenas quando a auditoria está em status "Autoavaliação".
- **Técnicos:** Gerenciam respostas de auditorias sob sua responsabilidade.

#### Perguntas RTRS (Migration 025)
- Leitura liberada para todos os usuários autenticados (catálogo estático de referência).

#### Prospectos (Migration 032)
- **Inserção:** Pública e anônima — qualquer visitante da Landing Page pode registrar interesse.
- **Leitura:** Exclusiva do Gestor via `is_gestor()`.

#### Produção de Crédito (Migration 032)
- Gestor OU Produtor dono da propriedade vinculada. Técnicos são bloqueados.

#### Grupos de Propriedades (Migration 032)
- Leitura e escrita exclusivas do Gestor.

#### Modelos de Documentos (Migration 032)
- Leitura para todos os autenticados. Gerenciamento (INSERT, UPDATE, DELETE) exclusivo do Gestor.

#### Aceite de Termos (Migration 032)
- Leitura e inserção apenas pelo próprio produtor (`usuario_id = auth.uid()`) ou pelo Gestor.

#### Documentos de Propriedade (Migration 044)
- Acesso amplo: SELECT, INSERT, UPDATE, DELETE liberados para todos (autenticados e anônimos). *Nota: Revisar para produção.*

---

## 2. Autenticação e Fluxo de Acesso

### Autocadastro de Produtores
Produtores podem se registrar diretamente via `/cadastro` com:
- Nome completo, e-mail, telefone/WhatsApp, senha.
- Dados opcionais da fazenda (código CAR/SIGEF, área de soja).
- O cadastro utiliza `supabase.auth.signUp()` com metadados de perfil.

### Login Resiliente
O sistema de login possui uma estratégia em camadas:
1. Tenta autenticação via Supabase Auth (`signInWithPassword`).
2. Se falhar, busca o perfil na tabela `perfis` ou no dicionário de teste.
3. Estabelece sessão fallback para desenvolvimento e ambientes com restrições de autenticação.

### Recuperação de Senha
- Páginas dedicadas: `/esqueci-a-senha` e `/redefinir-senha`.
- Edge Function `send-reset-password` para gerenciar o fluxo de forma segura.

### Funções `SECURITY DEFINER`
Usadas com cautela para "furar" o RLS de maneira controlada:
- `is_gestor()`: Valida se o usuário é gestor.
- `cadastrar_prospeccao_completa()`: Operação transacional que insere em múltiplas tabelas protegidas.
- `check_propriedade_pendencias()`: Trigger que valida integridade antes de certificar.
- `check_email_exists()`: Verifica se um e-mail existe sem expor a tabela de perfis (migration 024/037).

---

## 3. Checklist Crítico de Segurança (Ambiente de Produção)

Para engenheiros de DevOps preparando o deploy definitivo do ambiente em Nuvem, certifique-se de:

1. **Variáveis de Ambiente Protegidas:** As variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` são públicas para o Frontend. No entanto, a `VITE_GEMINI_API_KEY` e a `SUPABASE_SERVICE_ROLE_KEY` (Chave de administrador de banco) jamais devem vazar no repositório de frontend.
2. **Revisão Integral de Tabelas:** O banco não deve possuir NENHUMA tabela com a opção `Enable RLS` desmarcada, caso contrário, estará permitindo um CRUD anônimo global em sua API REST nativa.
   - *Atenção especial:* A tabela `documentos_propriedade` (migration 044) possui RLS habilitado mas com políticas permissivas (`USING (true)`) — revisar antes de produção.
3. **CORS e Cabeçalhos:** Configurar no painel do Supabase a URL definitiva de produção (ex: `https://app.mssustentavel.gov.br`) e remover as origens abertas (`*` ou `localhost`) para prevenir ataques de Cross-Origin.
4. **Supabase Storage:**
   - O Bucket de documentos (como CNDs e laudos) deve estar marcado como **Privado**.
   - O download e visualização de documentos deve exigir a emissão de URLs temporárias (`Signed URLs`).
5. **Autenticação e Convites:**
   - Evitar envios manuais de inserts no banco para criar usuários. Sempre utilizar as **Edge Functions** (`invite-user`) acionando o gatilho "oficial" de convites do Supabase para garantir logs de auditoria de conta e senhas não expostas.
   - Para produtores que se autocadastram, garantir que o trigger `sync_profiles` (migration 009) está ativo para sincronizar `auth.users` com `perfis`.
6. **Migrar API do Gemini:** Transferir a chamada da `VITE_GEMINI_API_KEY` do frontend para uma Edge Function dedicada, evitando exposição da chave no navegador.
7. **Login Resiliente / Fallback:** Desativar o mecanismo de fallback (`setFallbackSession` e `TEST_USERS`) em produção, mantendo apenas autenticação real via Supabase Auth.
