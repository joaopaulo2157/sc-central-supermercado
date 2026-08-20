@echo off
setlocal EnableExtensions
title Atualizar SC Central V6 no GitHub
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo ERRO: Git nao encontrado.
  pause
  exit /b 1
)

if not exist ".git" (
  echo ERRO: Esta pasta nao contem o repositorio Git local.
  echo Extraia estas melhorias DENTRO da pasta que voce ja publicou.
  pause
  exit /b 1
)

echo.
echo ===============================================
echo  SC CENTRAL V6 - ATUALIZAR GITHUB
echo ===============================================
echo.

where node >nul 2>nul
if not errorlevel 1 (
  echo Validando JavaScript...
  call npm run check
  if errorlevel 1 (
    echo.
    echo A validacao falhou. O push foi cancelado.
    pause
    exit /b 1
  )
)

set /p MSG=Mensagem do commit [chore: profissionaliza repositorio V6]: 
if "%MSG%"=="" set MSG=chore: profissionaliza repositorio V6

git add .
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "%MSG%"
  if errorlevel 1 goto :erro
) else (
  echo Nenhuma alteracao local para novo commit.
)

echo.
echo Sincronizando com o GitHub...
git pull --rebase origin main
if errorlevel 1 goto :erro

echo.
echo Enviando...
git push origin main
if errorlevel 1 goto :erro

echo.
echo ===============================================
echo  ATUALIZACAO CONCLUIDA COM SUCESSO
echo ===============================================
echo.
echo Repositorio:
echo https://github.com/joaopaulo2157/sc-central-supermercado
echo.
pause
exit /b 0

:erro
echo.
echo Nao foi possivel concluir.
echo Nenhum force push foi utilizado.
echo Copie a mensagem acima e envie ao ChatGPT.
echo.
pause
exit /b 1
