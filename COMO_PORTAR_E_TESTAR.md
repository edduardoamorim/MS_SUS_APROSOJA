# 📦 Guia de Portabilidade e Testes: Como enviar e rodar o projeto em outro PC

Este guia foi elaborado para que qualquer pessoa (mesmo com pouca experiência técnica) consiga compactar, enviar, instalar e testar o projeto **MS Sustentável** em outro computador do zero.

---

## 1. Como Empacotar o Projeto para Enviar (Mais Simples)
Para compactar o projeto de forma automática e leve (aproximadamente 10 MB em vez de 1 GB), sem precisar selecionar pastas manualmente:

1. Dê dois cliques no arquivo **`4_compactar_projeto.bat`** na raiz do projeto.
2. Ele criará um arquivo chamado **`MS_SUS_projeto.zip`** diretamente na sua **Área de Trabalho (Desktop)**.
3. Envie esse arquivo `.zip` para o outro computador (por e-mail, WhatsApp, Google Drive, Pendrive, etc.).

---

## 2. Pré-requisitos no Computador de Destino
Para que o projeto funcione no novo computador, garanta que os seguintes programas gratuitos estejam instalados:

1. **Node.js (v18 ou superior)**: Necessário para rodar o servidor do site. [Baixar Node.js](https://nodejs.org/)
2. **Docker Desktop**: Necessário para rodar o banco de dados local (Supabase). [Baixar Docker](https://www.docker.com/products/docker-desktop/)
3. **Python (opcional)**: Apenas se desejar executar os testes de backend automatizados. [Baixar Python](https://www.python.org/)

---

## 3. Como Instalar e Rodar no Novo Computador (Passo a Passo)

Uma vez que o novo computador tenha os pré-requisitos instalados:

### Passo 1: Extrair os arquivos
Extraia o arquivo `.zip` recebido em uma pasta de sua escolha (ex: na Área de Trabalho ou Documentos).

### Passo 2: Abrir o Docker Desktop
Dê dois cliques no ícone do **Docker Desktop** e certifique-se de que ele esteja aberto e rodando em segundo plano (o ícone da baleia na barra de tarefas deve estar verde).

### Passo 3: Configurar o Projeto (Um clique)
Dê dois cliques no arquivo **`1_instalar_dependencias.bat`** na raiz da pasta extraída.
* Este script instalará automaticamente todas as bibliotecas necessárias para o site rodar.
* Aguarde até que a janela do terminal exiba a mensagem de sucesso e feche-a.

### Passo 4: Inicializar o Banco de Dados (Um clique)
Dê dois cliques no arquivo **`2_iniciar_banco.bat`**.
* Este script iniciará o banco de dados local usando o Docker, aplicará todas as tabelas, criará os logins de teste e importará o mapa de municípios do Mato Grosso do Sul automaticamente.
* Aguarde o término do processo (pode levar de 1 a 2 minutos na primeira execução).

### Passo 5: Iniciar o Site (Um clique)
Dê dois cliques no arquivo **`3_iniciar_site.bat`**.
* O site abrirá automaticamente no seu navegador no endereço: **`http://localhost:5173/`**.
* O terminal ficará aberto rodando o servidor. Para fechar o site, basta fechar este terminal.

---

## 4. Como Executar os Testes no Novo Computador

### Opção A: Teste de Usabilidade Manual (Ideal para leigos)
1. Acesse o endereço **`http://localhost:5173/login`**.
2. Na parte inferior, na seção de desenvolvimento, clique primeiro em **"Criar/Garantir Contas de Teste no Banco"**.
3. Utilize os botões rápidos **"Gestor"**, **"Técnico"** ou **"Produtor"** para logar instantaneamente sem precisar digitar senhas.
4. Teste as transações de fluxo:
   - Crie propriedades ou agende visitas como **Gestor**.
   - Insira pendências e preencha o questionário (anexando imagens) como **Técnico**.
   - Envie as resoluções e use a IA do Gemini como **Produtor**.

### Opção B: Testes de Banco de Dados Automatizados (Python)
Se você for desenvolvedor e quiser garantir que as regras de segurança RLS e PostGIS estão funcionando via código:
1. Abra um terminal na raiz do projeto e instale o Python pytest e dependências:
   ```bash
   pip install -r requirements.txt
   ```
2. Execute o comando de teste:
   ```bash
   pytest tests/test_db_workflow.py
   ```
3. O terminal mostrará se todos os testes de segurança, validação do CAR e PostGIS passaram com sucesso.
