@echo off
setlocal EnableExtensions
title Publicar adaptacao Railway - SC Central V6
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo ERRO: Git nao encontrado.
  pause
  exit /b 1
)

if not exist ".git" (
  echo ERRO: extraia este patch dentro da pasta do repositorio ja publicado.
  pause
  exit /b 1
)

echo.
echo Validando a V6...
call npm run check
if errorlevel 1 (
  echo A validacao falhou. Push cancelado.
  pause
  exit /b 1
)

git add .
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "chore: prepara V6 FINAL para deploy persistente no Railway"
  if errorlevel 1 goto :erro
) else (
  echo Nenhuma alteracao local encontrada.
)

git pull --rebase origin main
if errorlevel 1 goto :erro

git push origin main
if errorlevel 1 goto :erro

echo.
echo ===============================================
echo  RAILWAY READY PUBLICADO COM SUCESSO
echo ===============================================
echo.
pause
exit /b 0

:erro
echo.
echo Nao foi possivel concluir.
echo Nenhum force push foi utilizado.
pause
exit /b 1
