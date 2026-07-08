@echo off
title 3. Iniciar Site - MS Sustentavel
echo ==========================================================
echo    Iniciando Servidor Web do MS Sustentavel
echo ==========================================================
echo.
echo Abrindo o site no seu navegador padrao...
start http://localhost:5173
echo.
echo Executando o servidor (npm run dev)...
cd frontend
call npm run dev
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] O servidor web parou inesperadamente.
    pause
)
cd ..
