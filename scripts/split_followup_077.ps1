<#
.SYNOPSIS
    CRD Automated Split Monthly Follow-up & Payment History Integration (Follower 077)
    Enforces Day 20 Cut-off Rule & Zero-PII Compliance.

.DESCRIPTION
    Executes the 5-step CRD workflow:
    1. Scan monthly workbooks (ก.ค. 69, ก.ย. 69, ต.ค. 69, พ.ย. 69) and detect Yellow Divider Row.
    2. Extract only rows below the yellow divider into folder SPLIT_FOLLOWUP_077. Preserve 5-digit Mem_ID.
    3. Match contract/member with S_Data_Late_Payment in master DB with Day <= 20 cut-off rule.
    4. Append 5 trailing columns (AF: 077, AG: Pay Date, AH: Pay Time, AI: Amount, AJ: Status).
    5. Save results and output Zero-PII summary statistics.

.PARAMETER SourceDir
    Folder containing monthly debt followup files.
    Default: C:\Users\Natee.yan\OneDrive\CRD PROJECT\2026\2026 งานตามหนี้ ศปง.+สนง.ใหญ่\งานตามหนี้ สนง.ญ

.PARAMETER DbFile
    Master DB file containing S_Data_Late_Payment.
    Default: C:\Users\Natee.yan\OneDrive\CRD PROJECT\00_MASTER_SOURCE_งานผู้จัดการ_รอตรวจสอบ\FTCPrg_TK_01_U20250206.xlsm

.PARAMETER Step
    Run up to specified step (1 to 5). Default 0 (run all steps).
#>

[CmdletBinding()]
param(
    [string]$SourceDir = "C:\Users\Natee.yan\OneDrive\CRD PROJECT\2026\2026 งานตามหนี้ ศปง.+สนง.ใหญ่\งานตามหนี้ สนง.ญ",
    [string]$DbFile = "C:\Users\Natee.yan\OneDrive\CRD PROJECT\00_MASTER_SOURCE_งานผู้จัดการ_รอตรวจสอบ\FTCPrg_TK_01_U20250206.xlsm",
    [string]$TargetFolderName = "SPLIT_FOLLOWUP_077",
    [int]$Step = 0,
    [switch]$DryRun
)

# Check Excel COM architecture compatibility
# Excel 2016+ on CMS-2 is 64-bit; run in current bitness without forcing 32-bit redirect.

$ErrorActionPreference = "Stop"
$Months = @(
    @{ Name = "ก.ค. 69"; MonthNum = 7; YearBE = 2569; YearCE = 2026; FilePattern = "*ก.ค.*69*" },
    @{ Name = "ก.ย. 69"; MonthNum = 9; YearBE = 2569; YearCE = 2026; FilePattern = "*ก.ย.*69*" },
    @{ Name = "ต.ค. 69"; MonthNum = 10; YearBE = 2569; YearCE = 2026; FilePattern = "*ต.ค.*69*" },
    @{ Name = "พ.ย. 69"; MonthNum = 11; YearBE = 2569; YearCE = 2026; FilePattern = "*พ.ย.*69*" }
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " CRD FOLLOWUP 077 — AUTOMATED SPLIT & PAYMENT ENRICHMENT " -ForegroundColor Cyan
Write-Host " Zero-PII Strict Enforcement | Day <= 20 Cut-off Rule   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Fallback DB file check
if (-not (Test-Path $DbFile)) {
    $altDb = "C:\Users\Natee.yan\Desktop\งานผู้จัดการ\Late (version 20240426).xlsb"
    if (Test-Path $altDb) {
        $DbFile = $altDb
    }
}

function New-ExcelApp {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.ScreenUpdating = $false
    $excel.AskToUpdateLinks = $false
    $excel.AutomationSecurity = 3 # msoAutomationSecurityForceDisable (prevents hanging on macros)
    return $excel
}

function Release-Com($obj) {
    if ($null -ne $obj) {
        [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj)
    }
}

function Close-ExcelApp($excel) {
    if ($null -ne $excel) {
        try { $excel.Quit() } catch {}
        Release-Com($excel)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

function Find-YellowDividerRow($worksheet, $maxRow, $maxCol) {
    # Scan from row 2 upwards to row maxRow
    for ($r = 2; $r -le [Math]::Min($maxRow, 250); $r++) {
        # Check first 5 columns or row interior
        for ($c = 1; $c -le [Math]::Min($maxCol, 10); $c++) {
            $cell = $worksheet.Cells.Item($r, $c)
            $interior = $cell.Interior
            $colorIndex = $interior.ColorIndex
            $color = $interior.Color

            # Excel ColorIndex 6 = Yellow
            # Standard Yellow RGB: 65535 (#00FFFF in BGR = #FFFF00 in RGB)
            $isYellow = ($colorIndex -eq 6) -or ($color -eq 65535)
            if (-not $isYellow -and $color -gt 0) {
                $rVal = $color -band 0xFF
                $gVal = ($color -shr 8) -band 0xFF
                $bVal = ($color -shr 16) -band 0xFF
                # High red & green, low blue indicates yellow tone
                if ($rVal -ge 200 -and $gVal -ge 200 -and $bVal -le 100) {
                    $isYellow = $true
                }
            }

            if ($isYellow) {
                return $r
            }
        }
    }
    return 0
}

# =========================================================================
# STEP 1: Verify source files and scan yellow divider row
# =========================================================================
Write-Host "`n[STEP 1] Inspecting Source Workbooks & Yellow Divider Structure..." -ForegroundColor Yellow

$excel = New-ExcelApp
$Step1Results = @()

try {
    foreach ($m in $Months) {
        $foundFiles = Get-ChildItem -Path $SourceDir -Filter ($m.FilePattern + "*") -File -ErrorAction SilentlyContinue |
                      Where-Object { $_.Extension -match '^\.(xlsb|xlsx|xlsm)$' -and -not $_.Name.StartsWith("~$") }

        if (-not $foundFiles -or $foundFiles.Count -eq 0) {
            Write-Warning "Source file for $($m.Name) not found in $SourceDir"
            continue
        }

        $targetFile = $foundFiles[0].FullName
        $wb = $excel.Workbooks.Open($targetFile, 0, $true) # Read-Only
        $ws = $wb.Worksheets.Item(1)
        $used = $ws.UsedRange
        $maxRow = $used.Row + $used.Rows.Count - 1
        $maxCol = $used.Column + $used.Columns.Count - 1

        $yellowRow = Find-YellowDividerRow -worksheet $ws -maxRow $maxRow -maxCol $maxCol
        $rowsBelowYellow = if ($yellowRow -gt 0) { $maxRow - $yellowRow } else { 0 }

        $Step1Results += [PSCustomObject]@{
            Month = $m.Name
            FilePath = $targetFile
            TotalRows = $maxRow
            YellowDividerRow = $yellowRow
            RowsBelowYellow = $rowsBelowYellow
        }

        $wb.Close($false)
        Release-Com($ws)
        Release-Com($wb)
    }
}
finally {
    Close-ExcelApp($excel)
}

Write-Host "--- ผลการตรวจพบขั้นที่ 1 (Zero-PII Metadata) ---" -ForegroundColor Green
Write-Host "ฐานข้อมูลชำระหนี้หลัก (Master DB): $DbFile (Exists: $(Test-Path $DbFile))"
foreach ($res in $Step1Results) {
    Write-Host "  * $($res.Month): พบเส้นเหลืองที่แถว $($res.YellowDividerRow) | ข้อมูลตั้งแต่เส้นเหลืองลงไป: $($res.RowsBelowYellow) แถว"
}

if ($Step -eq 1) {
    Write-Host "`n[PAUSE] ขั้นที่ 1 เสร็จสิ้นตามคำสั่ง (-Step 1)" -ForegroundColor Cyan
    exit 0
}

# =========================================================================
# STEP 2: Create SPLIT_FOLLOWUP_077 and export lower-half rows
# =========================================================================
Write-Host "`n[STEP 2] Creating $TargetFolderName & Extracting Split Workbooks..." -ForegroundColor Yellow

$TargetDir = Join-Path $SourceDir $TargetFolderName
if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
    Write-Host "Created target folder: $TargetDir" -ForegroundColor Green
}

$Step2Files = @()
$excel = New-ExcelApp

try {
    foreach ($res in $Step1Results) {
        if ($res.YellowDividerRow -le 0 -or $res.RowsBelowYellow -le 0) {
            Write-Warning "Skipping $($res.Month) due to missing yellow divider."
            continue
        }

        $srcWb = $excel.Workbooks.Open($res.FilePath, 0, $true)
        $srcWs = $srcWb.Worksheets.Item(1)
        $headerRow = if ($res.YellowDividerRow -gt 3) { 3 } else { 2 }

        # Create new workbook
        $newWb = $excel.Workbooks.Add()
        $newWs = $newWb.Worksheets.Item(1)
        $newWs.Name = $res.Month

        # Copy Header Row
        $srcWs.Rows.Item($headerRow).Copy()
        $newWs.Rows.Item(1).PasteSpecial(-4104) # xlPasteAll

        # Copy Rows Below Yellow Divider
        $startRow = $res.YellowDividerRow + 1
        $endRow = $res.TotalRows
        $srcRange = $srcWs.Range($srcWs.Cells.Item($startRow, 1), $srcWs.Cells.Item($endRow, $srcWs.UsedRange.Columns.Count))
        $srcRange.Copy()
        $newWs.Range("A2").PasteSpecial(-4104)

        # Ensure Mem_ID format as Text (Col 2 or 6) with 5-digit padding
        $outRows = $endRow - $startRow + 1
        for ($r = 2; $r -le ($outRows + 1); $r++) {
            # Check cell for Mem_ID candidate
            $cell = $newWs.Cells.Item($r, 6) # Column F often Mem_ID, fallback Col B
            $val = [string]$cell.Value2
            if ($val -match '^\d+$') {
                $cell.NumberFormat = "@"
                $cell.Value2 = $val.PadLeft(5, '0')
            }
        }

        $outFileName = "$($res.Month)_077.xlsx"
        $outFilePath = Join-Path $TargetDir $outFileName
        if (Test-Path $outFilePath) { Remove-Item $outFilePath -Force }

        $newWb.SaveAs($outFilePath, 51) # 51 = xlOpenXMLWorkbook (.xlsx)
        $newWb.Close($false)
        $srcWb.Close($false)

        Release-Com($newWs)
        Release-Com($newWb)
        Release-Com($srcWs)
        Release-Com($srcWb)

        $Step2Files += $outFilePath
    }
}
finally {
    Close-ExcelApp($excel)
}

Write-Host "--- ผลการสร้างไฟล์ขั้นที่ 2 ---" -ForegroundColor Green
foreach ($f in $Step2Files) {
    Write-Host "  * Created: $(Split-Path -Leaf $f)"
}

if ($Step -eq 2) {
    Write-Host "`n[PAUSE] ขั้นที่ 2 เสร็จสิ้นตามคำสั่ง (-Step 2)" -ForegroundColor Cyan
    exit 0
}

# =========================================================================
# STEP 3 & 4: Load Payment DB, Filter Day <= 20 Cut-off, Append AF - AJ
# =========================================================================
Write-Host "`n[STEP 3 & 4] Matching Payments with Day <= 20 Rule & Appending AF-AJ..." -ForegroundColor Yellow

# Load Payments into Hash Table from DB
$PaymentDict = @{} # Key: ContractID (or MemID), Value: List of payments
$excel = New-ExcelApp

try {
    if (Test-Path $DbFile) {
        Write-Host "Reading payment records from $DbFile..." -ForegroundColor Gray
        $dbWb = $excel.Workbooks.Open($DbFile, 0, $true)
        $dbWs = $null
        foreach ($s in $dbWb.Worksheets) {
            if ($s.Name -eq "S_Data_Late_Payment" -or $s.Name -match "Late") {
                $dbWs = $s
                break
            }
        }
        if ($null -eq $dbWs) { $dbWs = $dbWb.Worksheets.Item(1) }

        $usedDb = $dbWs.UsedRange
        $maxDbRow = $usedDb.Row + $usedDb.Rows.Count - 1
        Write-Host "Loaded DB Sheet '$($dbWs.Name)' with $maxDbRow rows." -ForegroundColor Gray

        # Fast bulk read into memory (1 COM call instead of 250,000 cell calls)
        if ($maxDbRow -ge 3) {
            $rawDbData = $dbWs.Range("A3", $dbWs.Cells.Item($maxDbRow, 22)).Value2
            $rowCountInBlock = $maxDbRow - 2
            for ($i = 1; $i -le $rowCountInBlock; $i++) {
                $contract = [string]$rawDbData[$i, 2]
                $mem = [string]$rawDbData[$i, 6]
                $payDateVal = $rawDbData[$i, 11] # Pay_Last_Date / Detial_Date
                $amount = $rawDbData[$i, 16]     # ชำระงวดละ / AMT
                $status = [string]$rawDbData[$i, 22] # Late_Status

                if ($contract -or $mem) {
                    $key = if ($contract) { $contract.Trim() } else { $mem.Trim().PadLeft(5, '0') }
                    if (-not $PaymentDict.ContainsKey($key)) {
                        $PaymentDict[$key] = New-Object System.Collections.Generic.List[object]
                    }
                    $PaymentDict[$key].Add([PSCustomObject]@{
                        Contract = $contract
                        MemID = $mem
                        DateVal = $payDateVal
                        Amount = $amount
                        Status = $status
                    })
                }
            }
        }

        $dbWb.Close($false)
        Release-Com($dbWs)
        Release-Com($dbWb)
    }
}
finally {
    Close-ExcelApp($excel)
}

# Process each split file
$FinalSummary = @()
$excel = New-ExcelApp

try {
    foreach ($m in $Months) {
        $filePath = Join-Path $TargetDir "$($m.Name)_077.xlsx"
        if (-not (Test-Path $filePath)) { continue }

        $wb = $excel.Workbooks.Open($filePath, 0, $false) # Read/Write
        $ws = $wb.Worksheets.Item(1)
        $used = $ws.UsedRange
        $rowCount = $used.Row + $used.Rows.Count - 1

        # Setup Header for AF - AJ (Row 1)
        # Col 32 = AF, 33 = AG, 34 = AH, 35 = AI, 36 = AJ
        $ws.Cells.Item(1, 32).Value2 = "ผู้ติดตาม (AF)"
        $ws.Cells.Item(1, 33).Value2 = "วันติดตาม (AG)"
        $ws.Cells.Item(1, 34).Value2 = "เวลาติดตาม (AH)"
        $ws.Cells.Item(1, 35).Value2 = "จำนวนเงิน (AI)"
        $ws.Cells.Item(1, 36).Value2 = "หมายเหตุ (AJ)"

        $matchedCount = 0
        $unmatchedCount = 0

        for ($r = 2; $r -le $rowCount; $r++) {
            $cId = [string]$ws.Cells.Item($r, 2).Value2
            $mId = [string]$ws.Cells.Item($r, 6).Value2
            if ($mId -match '^\d+$') { $mId = $mId.PadLeft(5, '0') }

            $matchKey = if ($cId -and $PaymentDict.ContainsKey($cId.Trim())) { $cId.Trim() }
                        elseif ($mId -and $PaymentDict.ContainsKey($mId)) { $mId }
                        else { $null }

            # AF: Always "077"
            $ws.Cells.Item($r, 32).Value2 = "077"

            $foundCyclePay = $null
            if ($matchKey) {
                # Look for payment in target month with Day <= 20
                foreach ($p in $PaymentDict[$matchKey]) {
                    # Parse Date
                    $pDate = $null
                    if ($p.DateVal -is [DateTime]) { $pDate = $p.DateVal }
                    elseif ($p.DateVal -is [double]) { $pDate = [DateTime]::FromOADate($p.DateVal) }
                    elseif ($p.DateVal -as [DateTime]) { $pDate = [DateTime]$p.DateVal }

                    if ($null -ne $pDate) {
                        # Match cycle month
                        if ($pDate.Month -eq $m.MonthNum -and ($pDate.Year -eq $m.YearCE -or $pDate.Year -eq $m.YearBE)) {
                            # Strict Day <= 20 Cut-off Rule
                            if ($pDate.Day -le 20) {
                                $foundCyclePay = [PSCustomObject]@{
                                    DateStr = $pDate.ToString("dd/MM/yyyy")
                                    TimeStr = $pDate.ToString("HH:mm")
                                    Amount = $p.Amount
                                    Status = $p.Status
                                }
                                break
                            }
                            # If Day > 20, STRICT PROHIBITION: Excluded from cycle and NOT carried forward!
                        }
                    }
                }
            }

            if ($foundCyclePay) {
                $matchedCount++
                $ws.Cells.Item($r, 33).NumberFormat = "@"
                $ws.Cells.Item($r, 33).Value2 = $foundCyclePay.DateStr
                $ws.Cells.Item($r, 34).Value2 = $foundCyclePay.TimeStr
                $ws.Cells.Item($r, 35).Value2 = $foundCyclePay.Amount
                $ws.Cells.Item($r, 36).Value2 = if ($foundCyclePay.Status) { $foundCyclePay.Status } else { "ชำระในรอบปกติ" }
            } else {
                $unmatchedCount++
                $ws.Cells.Item($r, 33).Value2 = ""
                $ws.Cells.Item($r, 34).Value2 = ""
                $ws.Cells.Item($r, 35).Value2 = 0
                $ws.Cells.Item($r, 36).Value2 = ""
            }
        }

        $wb.Save()
        $wb.Close($false)
        Release-Com($ws)
        Release-Com($wb)

        $FinalSummary += [PSCustomObject]@{
            Month = $m.Name
            TotalRows = ($rowCount - 1)
            MatchedCount = $matchedCount
            UnmatchedCount = $unmatchedCount
            FilePath = $filePath
        }
    }
}
finally {
    Close-ExcelApp($excel)
}

# =========================================================================
# STEP 5: Final Summary (Zero-PII Compliance)
# =========================================================================
Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host " [STEP 5] สรุปผลการดำเนินงาน CRD FOLLOWUP 077 (Zero-PII) " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "บันทึกไฟล์ทั้งหมดไว้ที่โฟลเดอร์: $TargetDir`n"

foreach ($s in $FinalSummary) {
    Write-Host "• $($s.Month):" -ForegroundColor Cyan
    Write-Host "   - จำนวนรายการใต้เส้นเหลืองทั้งหมด: $($s.TotalRows) รายการ"
    Write-Host "   - จับคู่สำเร็จ (ชำระภายในวันที่ 20): $($s.MatchedCount) รายการ"
    Write-Host "   - ไม่มีข้อมูลชำระในรอบ (<= 20): $($s.UnmatchedCount) รายการ"
    Write-Host "   - ไฟล์: $(Split-Path -Leaf $s.FilePath)"
}

# Write Summary JSON (Strictly Zero-PII)
$jsonSummaryPath = Join-Path $TargetDir "summary_077.json"
$FinalSummary | ConvertTo-Json -Depth 3 | Set-Content -Path $jsonSummaryPath -Encoding UTF8
Write-Host "`nSummary JSON saved to: $jsonSummaryPath" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Green
