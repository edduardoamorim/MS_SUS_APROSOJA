# 05. Manual de Operação e Testes Automatizados

Este documento orienta o ambiente operacional (DevOps), inicialização da plataforma e o pipeline de testes de integridade.

## 1. Inicializando o Projeto Localmente (Docker)

A infraestrutura inteira roda isoladamente através do Docker Desktop utilizando a CLI do Supabase.

### Pré-Requisitos
- Node.js (v18+)
- Docker Desktop (Rodando)

### Rotina de Deploy (Scripts na Raiz)
Para simplificar o "onboarding" de novos desenvolvedores, criamos scripts `.bat` auto-executáveis na raiz:
1. `1_instalar_dependencias.bat`: Executa o `npm install` no Frontend.
2. `2_iniciar_banco.bat`: Sobe os containers de Banco, Storage, Autenticação e Edge Functions (`npx supabase start`). Também injeta dados sementes (seeding) como mapas dos municípios.
3. `3_iniciar_site.bat`: Levanta o servidor web Vite de desenvolvimento (`npm run dev`) na porta 5173.

### Caixa de E-mails Local (Inbucket)
Ao criar um usuário ou testar o "Esqueci a Senha" localmente, nenhum e-mail real é gasto. O Supabase intercepta todas as mensagens e as joga em um servidor Inbucket que pode ser acessado em: `http://localhost:54324`.

---

## 2. Testes de Validação e Qualidade (QA)

### Testes Manuais Direcionados
Na tela de login em modo de desenvolvimento (`localhost`), há uma barra inferior que gera tokens "mágicos" simulando cada Perfil (Gestor, Técnico, Produtor). Isso permite testar os fluxos de interface (frontend) instantaneamente, simulando as três pontas da auditoria RTRS.

### Testes Automatizados de Backend (Python)
Para garantir as lógicas mais profundas (regras de postGIS e bloqueios de RLS), existe uma suíte de testes construída em `pytest`.

```bash
# Na raiz do projeto, com o Python e Pip instalados:
pip install -r requirements.txt
pytest tests/test_db_workflow.py
```
Estes testes injetam conexões diretas no Postgres para garantir que o Técnico "A" não consiga ler a Fazenda que está na carteira do Técnico "B", certificando que não há quebras no Row Level Security após alterações.

---

## 3. Histórico de Inconformidades Tratadas (Auditoria)

Como garantia histórica da maturação da plataforma, deixamos registrado problemas complexos que já foram superados e devem servir como aviso de "Não Retroceder" (Regressions):
- **Recursões RLS Resolvidas:** Houve um erro no passado onde a política RLS de Propriedades tentava ler Auditorias e a de Auditorias tentava ler Propriedades, causando erro `500 Infinity Recursion`. A lógica foi separada com uso de `SECURITY DEFINER` nas consultas da migration `010`.
- **Divergência de Timezones:** Datas de auditoria cadastradas sem consideração ao timezone causam offset negativo (data exibindo um dia anterior). As formatações no React devem forçar `Date` objects ao fuso de Brasília local, ignorando mutações automáticas do DatePicker em tempo de execução.
- **Uploaders Reais:** Nunca usar mock de Timeout nos portais; todas as imagens estão agora fluindo e convertendo com sucesso para a API do Storage Oficial do Supabase.
