@echo off
setlocal
title Atualizar SC Central no GitHub
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo Git nao encontrado.
  pause
  exit /b 1
)

if not exist ".git" (
  echo Este projeto ainda nao foi inicializado no Git.
  echo Execute primeiro PUBLICAR_NO_GITHUB.bat
  pause
  exit /b 1
)

set /p MSG=Mensagem da atualizacao [update: evolui V6 FINAL]: 
if "%MSG%"=="" set MSG=update: evolui V6 FINAL

git add .
git diff --cached --quiet
if not errorlevel 1 (
  echo Nenhuma alteracao nova encontrada.
  pause
  exit /b 0
)

git commit -m "%MSG%"
git push origin main

if errorlevel 1 (
  echo Falha ao enviar atualizacao.
  pause
  exit /b 1
)

echo Atualizacao enviada com sucesso.
pause
