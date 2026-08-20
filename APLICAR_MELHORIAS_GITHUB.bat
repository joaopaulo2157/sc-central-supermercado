@echo off
setlocal EnableExtensions
title Aplicar profissionalizacao do repositorio SC Central
cd /d "%~dp0"

echo.
echo Este script vai validar, criar um commit e enviar as melhorias
echo de README, GitHub Actions, Docker e documentacao.
echo.

call ATUALIZAR_GITHUB.bat
