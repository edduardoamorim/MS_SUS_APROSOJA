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
  - Validar os dados de suas propriedades (incluindo o CAR - Cadastro Ambiental Rural).
  - Preencher a *Autoavaliação RTRS* (podendo anexar evidências fotográficas).
  - Enviar documentos exigidos (Certidões Negativas, Laudos, Manuais de RH).
  - Acompanhar e resolver *Pendências* levantadas pelos auditores.
- **Segurança:** O Produtor só pode visualizar e editar dados de propriedades que estejam explicitamente vinculadas ao seu ID.

### 2. Técnico Agrícola / Auditor (`tecnico`)
- **Objetivo:** Realizar vistorias in-loco e avaliar o cumprimento dos critérios.
- **Responsabilidades:**
  - Acessar propriedades e auditorias que lhe foram designadas.
  - Realizar o preenchimento do checklist oficial da RTRS durante a visita de campo.
  - Aprovar critérios ou gerar *Pendências* detalhadas (com prazo para resolução).
  - Revisar resoluções de pendências enviadas pelos produtores.
- **Segurança:** O Técnico enxerga exclusivamente a carteira de propriedades atribuídas a ele pelo Gestor.

### 3. Gestor Estadual (`gestor`)
- **Objetivo:** Governança total do programa.
- **Responsabilidades:**
  - Acompanhar os Dashboards com indicadores macro (propriedades certificadas, gargalos comuns).
  - Convidar e cadastrar novos Produtores e Técnicos no sistema.
  - Distribuir e agendar auditorias, vinculando técnicos às propriedades.
  - Homologar o status final de certificação (aprovação definitiva).
- **Segurança:** O Gestor tem acesso irrestrito de leitura a todos os painéis e dados macro da plataforma.

---

## Fluxo da Certificação

1. **Cadastro e Vínculo:** O Gestor convida o Produtor e vincula as Fazendas (via CAR/SIGEF).
2. **Autoavaliação:** O Produtor acessa o portal, envia a documentação inicial e responde aos requisitos básicos.
3. **Agendamento:** O Gestor delega um Técnico e agenda a "Data Alvo" da vistoria.
4. **Auditoria em Campo:** O Técnico visita a fazenda, valida o questionário, tira fotos (evidências) e aponta pendências se houver.
5. **Resolução:** O Produtor resolve as pendências no seu painel.
6. **Certificação:** Estando 100% conforme, a fazenda é marcada como "Certificada".
