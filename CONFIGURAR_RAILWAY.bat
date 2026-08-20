@echo off
setlocal EnableExtensions
title Configurar Railway no SC Central V6
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo ERRO: Git nao encontrado.
  pause
  exit /b 1
)

if not exist ".git" (
  echo ERRO: extraia este patch dentro da pasta local do repositorio.
  pause
  exit /b 1
)

echo.
echo ================================================
echo  SC CENTRAL V6 - CONFIGURACAO RAILWAY
echo ================================================
echo.

where node >nul 2>nul
if not errorlevel 1 (
  echo Validando codigo...
  call npm run check
  if errorlevel 1 (
    echo Validacao falhou. Push cancelado.
    pause
    exit /b 1
  )
)

git add .
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "chore: configura deploy Railway da V6 FINAL"
  if errorlevel 1 goto :erro
) else (
  echo Nenhuma alteracao nova para commit.
)

git pull --rebase origin main
if errorlevel 1 goto :erro

git push origin main
if errorlevel 1 goto :erro

echo.
echo ================================================
echo  CONFIGURACAO RAILWAY PUBLICADA NO GITHUB
echo ================================================
echo.
echo Agora no Railway:
echo 1. Deploy from GitHub repo
echo 2. Escolha joaopaulo2157/sc-central-supermercado
echo 3. Adicione SC_ADMIN_PASSWORD
echo 4. Adicione um Volume em /app/storage
echo 5. Settings ^> Networking ^> Generate Domain
echo.
pause
exit /b 0

:erro
echo.
echo Nao foi possivel concluir.
echo Nenhum force push foi utilizado.
pause
exit /b 1
