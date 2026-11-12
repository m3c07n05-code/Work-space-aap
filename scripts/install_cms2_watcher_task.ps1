<#
.SYNOPSIS
    CRD CMS-2 Windows Task Scheduler Registration (10-Minute Inbox Watcher)
.DESCRIPTION
    Registers a background scheduled task on CMS-2 Windows host to run
    crd_inbox_watcher_10min.py every 10 minutes silently.
#>

$TaskName = "CRD_CMS2_TaskInbox_Watcher_10Min"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonScript = Join-Path $ScriptDir "crd_inbox_watcher_10min.py"

Write-Host "--- Registering CRD 10-Minute Inbox Watcher on CMS-2 ---" -ForegroundColor Cyan
Write-Host "Task Name: $TaskName"
Write-Host "Target Script: $PythonScript"

# Action: Run pythonw.exe (windowless) with script path
$Action = New-ScheduledTaskAction -Execute "pythonw.exe" -Argument "`"$PythonScript`" --once" -WorkingDirectory $ScriptDir

# Trigger: Repeat every 10 minutes indefinitely
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration ([TimeSpan]::MaxValue)

# Settings: Allow on battery, start when available, restart on failure
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

# Register or update task
try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "CRD CMS-2 10-Minute Task Inbox Auto-Watcher (Zero-PII Safe)" | Out-Null
    Write-Host "[SUCCESS] Scheduled task '$TaskName' registered successfully with 10-minute interval." -ForegroundColor Green
    
    # Run immediate first cycle test
    Write-Host "Executing immediate cycle 1 test..." -ForegroundColor Yellow
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "[SUCCESS] Cycle 1 initiated in background." -ForegroundColor Green
} catch {
    Write-Error "Failed to register scheduled task: $_"
}
