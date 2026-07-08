@echo off
title 2. Iniciar Banco - MS Sustentavel
echo ==========================================================
echo    Iniciando Banco de Dados Local (Supabase + PostGIS)
echo    ATENCAO: Certifique-se de que o Docker Desktop esta aberto!
echo ==========================================================
echo.

echo [1/3] Iniciando containers locais do Supabase...
call npx supabase start
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Nao foi possivel iniciar o Supabase. O Docker Desktop esta rodando?
    pause
    exit /b %errorlevel%
)

echo.
echo [2/3] Aplicando as migracoes e dados de teste (Seed)...
call npx supabase db reset
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Falha ao redefinir/aplicar migracoes no banco.
    pause
    exit /b %errorlevel%
)

echo.
echo [3/3] Importando limites municipais e dados geoespaciais...
call node scripts/import_municipios_shp.js
if %errorlevel% neq 0 (
    echo.
    echo [AVISO] Ocorreu um erro ao importar dados geoespaciais (import_municipios_shp.js).
    echo O banco foi iniciado, mas o mapa pode nao mostrar todos os municipios.
)

echo.
echo ==========================================================
echo   Banco de dados pronto e populado!
echo   Para iniciar o site, execute: 3_iniciar_site.bat
echo ==========================================================
pause
