@echo off
title Avvio Gioco - Volcanic Island Digger
cd /d "%~dp0"
echo Avvio in corso del server di gioco tramite PowerShell...
powershell -ExecutionPolicy Bypass -File server.ps1
pause
