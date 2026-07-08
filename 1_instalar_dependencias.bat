@echo off
title 1. Instalar Dependencias - MS Sustentavel
echo ==========================================================
echo    Instalando dependencias do MS Sustentavel
echo ==========================================================
echo.
echo [1/2] Instalando dependencias da raiz do projeto...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Falha ao instalar dependencias da raiz. Certifique-se de que o Node.js esta instalado!
    pause
    exit /b %errorlevel%
)

echo.
echo [2/2] Instalando dependencias da pasta Frontend...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Falha ao instalar dependencias do Frontend.
    pause
    exit /b %errorlevel%
)
cd ..

echo.
echo ==========================================================
echo   Dependencias instaladas com sucesso!
echo   Agora, abra o Docker Desktop e execute: 2_iniciar_banco.bat
echo ==========================================================
pause
