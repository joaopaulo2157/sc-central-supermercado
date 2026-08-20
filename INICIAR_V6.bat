@echo off
chcp 65001 > nul
title SC Central - V6 Final
cd /d "%~dp0"
echo.
echo ======================================================
echo       SUPERMERCADO SC CENTRAL - V6 FINAL
echo ======================================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao foi encontrado.
  echo Instale o Node.js 22.5 ou superior e tente novamente.
  pause
  exit /b 1
)
echo Iniciando servidor em http://localhost:3000 ...
start "" http://localhost:3000/
start "" http://localhost:3000/login.html
node server.js
pause
