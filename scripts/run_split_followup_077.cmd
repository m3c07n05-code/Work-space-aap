@echo off
chcp 65001 >nul
title CRD FOLLOWUP 077 - AUTOMATED SPLIT & ENRICHMENT
echo ==========================================================
echo  CRD FOLLOWUP 077 RUNNER (32-bit PowerShell / Excel COM)
echo ==========================================================
echo.
set "PS32=%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS32%" set "PS32=powershell.exe"

"%PS32%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0split_followup_077.ps1" %*

echo.
echo Execution finished. Press any key to exit...
pause >nul
