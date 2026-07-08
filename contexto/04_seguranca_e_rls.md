# 04. Segurança e Row Level Security (RLS)

A plataforma **MS Sustentável** trata dados agronômicos confidenciais (ex: Cadastro Ambiental Rural) e portanto, possui uma arquitetura de segurança rigorosa enquadrada em princípios da LGPD, delegando toda a validação de autorização DIRETAMENTE para a camada de banco de dados do Supabase. O Frontend React é tratado como ambiente inseguro e não carrega lógicas de segurança sensíveis.

## 1. O Conceito de RLS (Row Level Security)

Nenhum usuário acessa tabelas inteiras. Toda tabela no banco possui políticas de segurança que validam o token JWT de quem está pedindo o dado e filtram os dados "no nível da linha" antes mesmo de devolver a resposta.

### Casos Reais Aplicados no MS Sustentável:
- **Regra do Produtor (`propriedades`):** Um produtor X só consegue realizar SELECT, INSERT ou UPDATE na tabela de propriedades caso a coluna `produtor_id` seja igual ao `uid()` dele. Tentativas de ler propriedades vizinhas retornarão zero resultados sem causar erros na aplicação.
- **Regra do Técnico (`auditorias`):** Técnicos só enxergam eventos (vistorias) onde a coluna `tecnico_responsavel_id` seja o seu próprio ID.
- **Funções `SECURITY DEFINER`:** Usadas com cautela para "furar" o RLS de maneira controlada, como por exemplo, na página de esqueci a senha para verificar se um email existe sem expor todos os usuários da tabela `perfis`.

---

## 2. Checklist Crítico de Segurança (Ambiente de Produção)

Para engenheiros de DevOps preparando o deploy definitivo do ambiente em Nuvem, certifique-se de:

1. **Variáveis de Ambiente Protegidas:** As variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` são públicas para o Frontend. No entanto, a `VITE_GEMINI_API_KEY` e a `SUPABASE_SERVICE_ROLE_KEY` (Chave de administrador de banco) jamais devem vazar no repositório de frontend.
2. **Revisão Integral de Tabelas:** O banco não deve possuir NENHUMA tabela com a opção `Enable RLS` desmarcada, caso contrário, estará permitindo um CRUD anônimo global em sua API REST nativa.
3. **CORS e Cabeçalhos:** Configurar no painel do Supabase a URL definitiva de produção (ex: `https://app.mssustentavel.gov.br`) e remover as origens abertas (`*` ou `localhost`) para prevenir ataques de Cross-Origin.
4. **Supabase Storage:**
   - O Bucket de documentos (como CNDs e laudos) deve estar marcado como **Privado**.
   - O download e visualização de documentos deve exigir a emissão de URLs temporárias (`Signed URLs`).
5. **Autenticação Invites:**
   - Evitar envios manuais de inserts no banco para criar usuários. Sempre utilizar as **Edge Functions** (`invite-user`) acionando o gatilho "oficial" de convites do Supabase para garantir logs de auditoria de conta e senhas não expostas.
