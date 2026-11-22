# Configure CMS-2 Worker Task Scheduler (Auto-start on Boot/Logon + Auto-restart on failure)
$ErrorActionPreference = "Stop"

$TaskName = "CRD_CMS2_Worker_Boot"
$ScriptDir = "D:\Documents\GitHub\Work-space-aap\scripts"
$WorkerScript = Join-Path $ScriptDir "crd_worker.py"
$PythonExe = "C:\Users\Natee.yan\AppData\Local\Python\pythoncore-3.14-64\python.exe"

if (-not (Test-Path $PythonExe)) {
    $PythonExe = (Get-Command python.exe).Source
}

Write-Host "Configuring Windows Task Scheduler for $TaskName..." -ForegroundColor Cyan

$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.3" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>CRD CMS-2 Worker Daemon (Auto-starts on Boot/Logon, Zero-PII Safe)</Description>
    <URI>\$TaskName</URI>
  </RegistrationInfo>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-21-3952739048-1314983714-2650247053-1126</UserId>
      <LogonType>InteractiveToken</LogonType>
    </Principal>
  </Principals>
  <Settings>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <RestartOnFailure>
      <Count>999</Count>
      <Interval>PT1M</Interval>
    </RestartOnFailure>
    <StartWhenAvailable>true</StartWhenAvailable>
    <IdleSettings>
      <Duration>PT10M</Duration>
      <WaitTimeout>PT1H</WaitTimeout>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <UseUnifiedSchedulingEngine>true</UseUnifiedSchedulingEngine>
  </Settings>
  <Triggers>
    <LogonTrigger>
      <UserId>FTC\Natee.yan</UserId>
      <Repetition>
        <Interval>PT10M</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
    </LogonTrigger>
  </Triggers>
  <Actions Context="Author">
    <Exec>
      <Command>$PythonExe</Command>
      <Arguments>-B "$WorkerScript" --daemon</Arguments>
      <WorkingDirectory>$ScriptDir</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@

$tempXml = Join-Path $env:TEMP "crd_worker_task.xml"
[System.IO.File]::WriteAllText($tempXml, $xml, [System.Text.Encoding]::Unicode)

try {
    $res = schtasks.exe /create /tn $TaskName /xml $tempXml /f
    Write-Host "schtasks output: $res" -ForegroundColor Green
} finally {
    if (Test-Path $tempXml) {
        Remove-Item $tempXml -Force
    }
}

Write-Host "Auditing configured scheduled task:" -ForegroundColor Cyan
Get-ScheduledTask -TaskName $TaskName | Format-List TaskName, State
(Get-ScheduledTask -TaskName $TaskName).Actions | Format-List Execute, Arguments, WorkingDirectory
(Get-ScheduledTask -TaskName $TaskName).Settings | Format-List RestartCount, RestartInterval, MultipleInstances, StartWhenAvailable
