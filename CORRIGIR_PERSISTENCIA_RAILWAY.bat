@echo off
setlocal EnableExtensions
title Corrigir persistencia Railway - SC Central V6
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
echo   SC CENTRAL V6 - CORRECAO DE PERSISTENCIA RAILWAY
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
  git commit -m "fix: garante persistencia SQLite no Railway"
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
echo   CORRECAO DE PERSISTENCIA PUBLICADA COM SUCESSO
echo =====================================================
echo.
echo No Railway confirme:
echo Volume ligado ao MESMO servico/ambiente
echo Mount Path: /app/storage
echo /api/health com persistent=true e volumeMounted=true
echo.
pause
exit /b 0

:erro
echo.
echo Nao foi possivel concluir.
echo Nenhum force push foi utilizado.
pause
exit /b 1
