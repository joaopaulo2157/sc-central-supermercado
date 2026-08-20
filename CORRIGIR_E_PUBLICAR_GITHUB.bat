@echo off
setlocal EnableExtensions
title Corrigir e publicar SC Central V6 no GitHub

cd /d "%~dp0"

echo.
echo ==========================================================
echo   SC CENTRAL V6 - CORRIGIR HISTORICO E PUBLICAR NO GITHUB
echo ==========================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo ERRO: Git nao foi encontrado.
  echo Instale o Git for Windows e execute novamente.
  echo.
  pause
  exit /b 1
)

if not exist ".git" (
  echo Inicializando repositorio Git local...
  git init -b main
  if errorlevel 1 goto :erro
)

git branch -M main

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  git remote add origin https://github.com/joaopaulo2157/sc-central-supermercado.git
) else (
  git remote set-url origin https://github.com/joaopaulo2157/sc-central-supermercado.git
)

echo.
echo 1/5 - Baixando o historico que ja existe no GitHub...
git fetch origin main
if errorlevel 1 goto :erro

echo.
echo 2/5 - Ligando esta pasta ao historico remoto...
echo      Seus arquivos locais NAO serao apagados.
git reset --mixed origin/main
if errorlevel 1 goto :erro

echo.
echo 3/5 - Normalizando finais de linha...
git add --renormalize .
git add .
if errorlevel 1 goto :erro

echo.
echo 4/5 - Criando commit somente se houver diferencas...
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "chore: integra V6 FINAL e configura fluxo GitHub"
  if errorlevel 1 goto :erro
) else (
  echo Nenhuma diferenca nova para commit.
)

echo.
echo 5/5 - Enviando para o GitHub...
git push -u origin main
if errorlevel 1 goto :erro

echo.
echo ==========================================================
echo   PUBLICACAO CONCLUIDA COM SUCESSO
echo ==========================================================
echo.
echo Repositorio:
echo https://github.com/joaopaulo2157/sc-central-supermercado
echo.
pause
exit /b 0

:erro
echo.
echo ==========================================================
echo   NAO FOI POSSIVEL CONCLUIR
echo ==========================================================
echo.
echo Copie a mensagem de erro exibida acima e envie para o ChatGPT.
echo Nenhum comando de force push foi utilizado.
echo.
pause
exit /b 1
