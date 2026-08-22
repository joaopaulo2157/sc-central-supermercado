@echo off
setlocal EnableExtensions
title Corrigir Hero - SC Central V6
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo ERRO: Git nao encontrado.
  pause
  exit /b 1
)

if not exist ".git" (
  echo ERRO: Extraia este patch dentro da pasta local do repositorio SC Central.
  pause
  exit /b 1
)

echo.
echo =====================================================
echo   SC CENTRAL V6 - CORRECAO DA ANIMACAO DA HERO
echo =====================================================
echo.

where node >nul 2>nul
if not errorlevel 1 (
  call npm run check
  if errorlevel 1 (
    echo A validacao falhou. Nenhum push foi realizado.
    pause
    exit /b 1
  )
)

git add .
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "fix: restaura animacao da hero e corrige cache PWA"
  if errorlevel 1 goto :erro
) else (
  echo Nenhuma alteracao nova para commit.
)

git pull --rebase origin main
if errorlevel 1 goto :erro

git push origin main
if errorlevel 1 goto :erro

echo.
echo =====================================================
echo   CORRECAO DA HERO PUBLICADA COM SUCESSO
echo =====================================================
echo.
echo Aguarde o redeploy do Railway.
echo Depois abra o site com Ctrl+F5 uma vez.
echo.
pause
exit /b 0

:erro
echo.
echo Nao foi possivel concluir.
echo Nenhum force push foi utilizado.
pause
exit /b 1
