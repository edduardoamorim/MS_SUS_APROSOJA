@echo off
title 4. Compactar Projeto - MS Sustentavel
echo ==========================================================
echo    Compactando o projeto para portabilidade (MS Sustentavel)
echo ==========================================================
echo.
echo Este script criara um arquivo ZIP leve pronto para enviar,
echo removendo pastas pesadas como node_modules e temporarios.
echo.

set TEMP_DIR=%TEMP%\MS_SUS_ZIP_TEMP
set ZIP_NAME=MS_SUS_projeto.zip
set ZIP_FILE=%USERPROFILE%\Desktop\%ZIP_NAME%

echo [1/4] Limpando tentativas anteriores...
if exist "%TEMP_DIR%" rmdir /s /q "%TEMP_DIR%"
if exist "%ZIP_FILE%" del /f /q "%ZIP_FILE%"

echo.
echo [2/4] Copiando arquivos do projeto...
:: Robocopy e nativo do Windows, rapido e ideal para excluir pastas pesadas
robocopy . "%TEMP_DIR%" /E /XD node_modules .git .supabase .next .venv /XF *.tmp ~$* *package-lock.json /NDL /NFL /NJH /NJS

echo.
echo [3/4] Criando arquivo ZIP no Desktop (%ZIP_FILE%)...
powershell -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('%TEMP_DIR%', '%ZIP_FILE%')"

if exist "%ZIP_FILE%" (
    echo.
    echo ==========================================================
    echo   [SUCESSO] Projeto compactado com sucesso!
    echo   Arquivo criado no seu Desktop: %ZIP_NAME%
    echo   Tamanho aproximado:
    powershell -Command "echo (([math]::round((Get-Item '%ZIP_FILE%').Length / 1MB, 2)).ToString() + ' MB')"
    echo   Agora voce pode transferir este arquivo por Pendrive, 
    echo   Google Drive, WhatsApp ou E-mail!
    echo ==========================================================
) else (
    :: Fallback para a pasta anterior caso o Desktop nao seja acessivel
    set ZIP_FILE=%~dp0..\%ZIP_NAME%
    if exist "%ZIP_FILE%" del /f /q "%ZIP_FILE%"
    powershell -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('%TEMP_DIR%', '%ZIP_FILE%')"
    
    if exist "%ZIP_FILE%" (
        echo.
        echo ==========================================================
        echo   [SUCESSO] Projeto compactado com sucesso!
        echo   Arquivo criado na pasta acima do projeto:
        echo   %ZIP_FILE%
        echo ==========================================================
    ) else (
        echo.
        echo [ERRO] Ocorreu um erro ao criar o arquivo ZIP.
    )
)

:: Limpar pasta temporaria
if exist "%TEMP_DIR%" rmdir /s /q "%TEMP_DIR%"

echo.
pause
