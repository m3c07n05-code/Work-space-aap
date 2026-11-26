<#
.SYNOPSIS
    Installs the modular Coordination Center & WORK 1 scripts onto CMS-2 OneDrive
    and optionally registers a hidden Windows Task Scheduler job for the 21-5 cycle.
    Zero-PII | Zero-Secret | Non-Destructive (preserves existing local coord_config.json & AI_OUTPUT\work1_gmail_pull.py).
#>
param(
    [string]$OneDriveRoot = "$env:USERPROFILE\OneDrive",
    [switch]$InstallTask,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$RepoScriptsDir = Split-Path -Parent $PSScriptRoot
$SourceCoordDir = Join-Path $RepoScriptsDir "coordination_center"
$SourceWork1Dir = Join-Path $RepoScriptsDir "work1"

$TargetCoordDir = Join-Path $OneDriveRoot "CRD PROJECT\SCRIPTS\COORDINATION_CENTER"
$TargetWork1Dir = Join-Path $OneDriveRoot "CRD PROJECT\SCRIPTS\WORK1"

Write-Host "[CRD-MODULAR] Target Coord Dir : $TargetCoordDir"
Write-Host "[CRD-MODULAR] Target WORK1 Dir : $TargetWork1Dir"

if ($DryRun) {
    Write-Host "[DRY-RUN] Would copy modular scripts to OneDrive and verify --dry-run (no files modified)."
    exit 0
}

New-Item -ItemType Directory -Force -Path $TargetCoordDir | Out-Null
New-Item -ItemType Directory -Force -Path $TargetWork1Dir | Out-Null

# Copy scripts (preserve existing local coord_config.json if already customized)
$coordFiles = @("coord_01_gmail_intake.py", "coord_02_receipt_summary.py", "coord_03_interest_rate_prep.py")
foreach ($file in $coordFiles) {
    Copy-Item -Force (Join-Path $SourceCoordDir $file) (Join-Path $TargetCoordDir $file)
}

$targetConfig = Join-Path $TargetCoordDir "coord_config.json"
if (-not (Test-Path $targetConfig)) {
    Copy-Item (Join-Path $SourceCoordDir "coord_config.json") $targetConfig
    Write-Host "[CRD-MODULAR] Created initial coord_config.json (fill in 9+1 branch senders locally)."
} else {
    Write-Host "[CRD-MODULAR] Preserved existing local coord_config.json."
}

Copy-Item -Force (Join-Path $SourceWork1Dir "work1_termination_prep.py") (Join-Path $TargetWork1Dir "work1_termination_prep.py")

# Verify --dry-run with PYTHONDONTWRITEBYTECODE=1
$env:PYTHONDONTWRITEBYTECODE = "1"
python (Join-Path $TargetCoordDir "coord_01_gmail_intake.py") --dry-run
python (Join-Path $TargetCoordDir "coord_02_receipt_summary.py") --dry-run
python (Join-Path $TargetWork1Dir "work1_termination_prep.py") --dry-run
python (Join-Path $TargetCoordDir "coord_03_interest_rate_prep.py") --dry-run

if ($InstallTask) {
    $TaskName = "CRD_Coord_Modular_Cycle_21_5"
    $ScriptPath = Join-Path $TargetCoordDir "coord_01_gmail_intake.py"
    $Action = New-ScheduledTaskAction -Execute "pythonw.exe" -Argument "`"$ScriptPath`""
    $Trigger = New-ScheduledTaskTrigger -Daily -At 08:30AM
    $Settings = New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "CRD Coordination Center Stage-1 Auto Intake (21-5 Cycle, Zero-PII)" -Force | Out-Null
    Write-Host "[CRD-MODULAR] Registered hidden Scheduled Task: $TaskName (Daily 08:30 AM)"
}

Write-Host "[CRD-MODULAR] Completed cleanly."
