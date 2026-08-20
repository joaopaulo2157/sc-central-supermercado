@echo off
setlocal
title Publicar SC Central V6 no GitHub

cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERRO: Git nao foi encontrado no computador.
  echo Instale o Git for Windows e execute este arquivo novamente.
  echo https://git-scm.com/download/win
  echo.
  pause
  exit /b 1
)

echo.
echo ===============================================
echo  SC CENTRAL V6 - PUBLICAR NO GITHUB
echo ===============================================
echo.

if not exist ".git" (
  git init -b main
)

git branch -M main

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  git remote add origin https://github.com/joaopaulo2157/sc-central-supermercado.git
) else (
  git remote set-url origin https://github.com/joaopaulo2157/sc-central-supermercado.git
)

for /f "delims=" %%A in ('git config user.name') do set GITNAME=%%A
if "%GITNAME%"=="" (
  set /p GITNAME=Digite seu nome para os commits do Git: 
  git config user.name "%GITNAME%"
)

for /f "delims=" %%A in ('git config user.email') do set GITEMAIL=%%A
if "%GITEMAIL%"=="" (
  set /p GITEMAIL=Digite seu e-mail para os commits do Git: 
  git config user.email "%GITEMAIL%"
)

git add .

git diff --cached --quiet
if errorlevel 1 (
  git commit -m "feat: publica Supermercado SC Central V6 FINAL"
) else (
  echo Nenhuma alteracao nova para commit.
)

echo.
echo Enviando para:
echo https://github.com/joaopaulo2157/sc-central-supermercado
echo.

git push -u origin main

if errorlevel 1 (
  echo.
  echo O push nao foi concluido.
  echo Se o GitHub solicitar autenticacao, conclua o login no navegador e execute novamente.
  echo.
  pause
  exit /b 1
)

echo.
echo ===============================================
echo  PUBLICACAO CONCLUIDA
echo ===============================================
echo.
echo Repositorio:
echo https://github.com/joaopaulo2157/sc-central-supermercado
echo.
pause
