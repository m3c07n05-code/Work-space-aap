@echo off
chcp 65001 >nul
title "CRD FOLLOWUP 077 - AUTOMATED SPLIT & ENRICHMENT"
echo ==========================================================
echo  CRD FOLLOWUP 077 RUNNER (PowerShell / Excel COM)
echo ==========================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0split_followup_077.ps1" %*

echo.
echo Execution finished.
