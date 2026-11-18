#!/usr/bin/env python3
"""
CRD Follow-up 077 Python Pipeline (Zero-PII Local-First)
========================================================
Runs the 5-step CRD Monthly Debt Followup & Payment History Integration:
1. Scan workbooks for yellow divider line
2. Extract rows below yellow line into SPLIT_FOLLOWUP_077
3. Filter payment history with Day <= 20 cut-off rule
4. Append columns AF to AJ (AF: "077", AG: Pay Date, AH: Pay Time, AI: Amount, AJ: Note)
5. Save files and output Zero-PII summary statistics

Supports `--synthetic` flag to run end-to-end simulation on generated fixtures.
"""

import os
import sys
import argparse
import json
from datetime import datetime
from openpyxl import Workbook, load_workbook
from openpyxl.styles import PatternFill, Font, Alignment

MONTHS_SPEC = [
    {"name": "ก.ค. 69", "month": 7, "year": 2026, "file": "ก.ค. 69.xlsx"},
    {"name": "ก.ย. 69", "month": 9, "year": 2026, "file": "ก.ย. 69.xlsx"},
    {"name": "ต.ค. 69", "month": 10, "year": 2026, "file": "ต.ค. 69.xlsx"},
    {"name": "พ.ย. 69", "month": 11, "year": 2026, "file": "พ.ย. 69.xlsx"}
]

def pad_mem_id(val) -> str:
    if val is None or str(val).strip() == "":
        return ""
    s = str(val).strip()
    if s.endswith(".0"):
        s = s[:-2]
    if s.isdigit():
        return s.zfill(5)
    return s

def is_cell_yellow(cell) -> bool:
    if cell.fill and cell.fill.fill_type:
        start_color = cell.fill.start_color
        if start_color and start_color.rgb:
            rgb_hex = str(start_color.rgb).upper()
            # Standard Yellow is FFFF00 or FFFFFF00, or themes
            if "FFFF00" in rgb_hex or "FFE0" in rgb_hex or "FFF2" in rgb_hex or "FFEB" in rgb_hex:
                return True
    return False

def generate_synthetic_environment(base_dir: str):
    """Generates synthetic test workbooks and payment database."""
    source_dir = os.path.join(base_dir, "synthetic_source")
    master_dir = os.path.join(base_dir, "synthetic_master")
    os.makedirs(source_dir, exist_ok=True)
    os.makedirs(master_dir, exist_ok=True)

    # 1. Create Master DB with S_Data_Late_Payment
    db_path = os.path.join(master_dir, "FTCPrg_TK_01_U20250206.xlsx")
    wb_db = Workbook()
    ws_db = wb_db.active
    ws_db.title = "S_Data_Late_Payment"

    # Header row
    headers_db = [
        "Col1", "NewLoanID", "รหัสเงินกู้", "อัตราดอกเบี้ย", "ผิดนัด", "Mem_ID",
        "Mem_Branch", "Mem_Status", "Mem_Share", "Detial_Date", "Pay_Last_Date",
        "เงินกู้คงเหลือ", "ค่าปรับ", "ชำระหุ้นต่อเดือน", "ดอกเบี้ยค้างชำระ", "ชำระงวดละ"
    ]
    ws_db.append(headers_db)

    # Synthetic Payments
    payments = [
        # Jul payments
        ["", "CNTR-JUL-001", "LN01", 0.05, 0, "00101", "01", "1", 500, "2026-07-10", "2026-07-10", 50000, 0, 500, 0, 2500],
        ["", "CNTR-JUL-002", "LN02", 0.05, 0, "00102", "01", "1", 500, "2026-07-20", "2026-07-20", 40000, 0, 500, 0, 3000],
        ["", "CNTR-JUL-003", "LN03", 0.05, 0, "00103", "01", "1", 500, "2026-07-25", "2026-07-25", 35000, 0, 500, 0, 2000], # After 20th!
        # Sep payments
        ["", "CNTR-SEP-001", "LN04", 0.05, 0, "00201", "02", "1", 500, "2026-09-05", "2026-09-05", 80000, 0, 500, 0, 4500],
        ["", "CNTR-SEP-002", "LN05", 0.05, 0, "00202", "02", "1", 500, "2026-09-18", "2026-09-18", 60000, 0, 500, 0, 3500],
        # Oct payments
        ["", "CNTR-OCT-001", "LN06", 0.05, 0, "00301", "03", "1", 500, "2026-10-12", "2026-10-12", 20000, 0, 500, 0, 1500],
        # Nov payments
        ["", "CNTR-NOV-001", "LN07", 0.05, 0, "00401", "04", "1", 500, "2026-11-19", "2026-11-19", 95000, 0, 500, 0, 5000],
        ["", "CNTR-NOV-002", "LN08", 0.05, 0, "00402", "04", "1", 500, "2026-11-28", "2026-11-28", 30000, 0, 500, 0, 2200], # After 20th!
    ]
    for p in payments:
        ws_db.append(p)
    wb_db.save(db_path)

    # 2. Create 4 Monthly Follow-up Workbooks with yellow divider
    yellow_fill = PatternFill(start_color="FFFFFF00", end_color="FFFFFF00", fill_type="solid")

    for m in MONTHS_SPEC:
        wb_m = Workbook()
        ws_m = wb_m.active
        ws_m.title = m["name"]

        # Row 1-2: Title and Headers
        ws_m.append(["รายงานติดตามหนี้ประจำเดือน", m["name"]])
        ws_m.append(["Col1", "NewLoanID", "รหัสเงินกู้", "ชื่อสมาชิก", "ที่อยู่", "Mem_ID", "ยอดหนี้", "งวดค้าง"])

        # Upper rows (before yellow divider)
        for i in range(1, 4):
            ws_m.append(["", f"UPPER-{m['month']}-{i}", "LN", "Mock Upper", "BKK", str(i * 10), 10000, 2])

        # Yellow Divider Row!
        div_row = ws_m.max_row + 1
        ws_m.append(["", "---", "---", "--- เส้นแบ่งสีเหลือง ---", "---", "---", 0, 0])
        for col_idx in range(1, 9):
            ws_m.cell(row=div_row, column=col_idx).fill = yellow_fill

        # Lower rows (target for follow-up 077)
        prefix = m["name"][:3]
        if m["month"] == 7:
            ws_m.append(["", "CNTR-JUL-001", "LN01", "Target 1", "Addr 1", 101, 50000, 3])
            ws_m.append(["", "CNTR-JUL-002", "LN02", "Target 2", "Addr 2", 102, 40000, 4])
            ws_m.append(["", "CNTR-JUL-003", "LN03", "Target 3", "Addr 3", 103, 35000, 2]) # paid > 20
            ws_m.append(["", "CNTR-JUL-004", "LN04", "Target 4", "Addr 4", 104, 12000, 5]) # no pay
        elif m["month"] == 9:
            ws_m.append(["", "CNTR-SEP-001", "LN04", "Target 1", "Addr 1", 201, 80000, 2])
            ws_m.append(["", "CNTR-SEP-002", "LN05", "Target 2", "Addr 2", 202, 60000, 3])
            ws_m.append(["", "CNTR-SEP-003", "LN06", "Target 3", "Addr 3", 203, 45000, 4]) # no pay
        elif m["month"] == 10:
            ws_m.append(["", "CNTR-OCT-001", "LN06", "Target 1", "Addr 1", 301, 20000, 2])
            ws_m.append(["", "CNTR-OCT-002", "LN07", "Target 2", "Addr 2", 302, 70000, 5]) # no pay
        elif m["month"] == 11:
            ws_m.append(["", "CNTR-NOV-001", "LN07", "Target 1", "Addr 1", 401, 95000, 2])
            ws_m.append(["", "CNTR-NOV-002", "LN08", "Target 2", "Addr 2", 402, 30000, 3]) # paid > 20
            ws_m.append(["", "CNTR-NOV-003", "LN09", "Target 3", "Addr 3", 403, 55000, 4]) # no pay

        out_path = os.path.join(source_dir, m["file"])
        wb_m.save(out_path)

    return source_dir, db_path

def run_pipeline(source_dir: str, db_file: str, step: int = 0):
    print("=" * 65)
    print(" CRD PIPELINE 077: SPLIT MONTHLY FOLLOWUP & PAYMENT ENRICHMENT")
    print(" Zero-PII Enforced | Strict Day <= 20 Cut-off Rule")
    print("=" * 65)

    # STEP 1: Scan files and detect yellow divider
    print("\n[STEP 1] Scanning Workbooks and Yellow Divider Row...")
    step1_results = []
    for m in MONTHS_SPEC:
        file_candidates = [
            os.path.join(source_dir, f) for f in os.listdir(source_dir)
            if m["name"] in f and not f.startswith("~$") and f.endswith((".xlsx", ".xlsb", ".xlsm"))
        ]
        if not file_candidates:
            print(f"  [WARN] File for {m['name']} not found in {source_dir}")
            continue

        target_file = file_candidates[0]
        wb = load_workbook(target_file, data_only=True)
        ws = wb.active

        yellow_row = 0
        for r_idx, row in enumerate(ws.iter_rows(min_row=1, max_row=ws.max_row, min_col=1, max_col=10), start=1):
            if any(is_cell_yellow(c) or "เส้นแบ่งสีเหลือง" in str(c.value or "") for c in row):
                yellow_row = r_idx
                break

        rows_below = max(0, ws.max_row - yellow_row) if yellow_row > 0 else 0
        step1_results.append({
            "month": m["name"],
            "month_num": m["month"],
            "year": m["year"],
            "file_path": target_file,
            "total_rows": ws.max_row,
            "yellow_row": yellow_row,
            "rows_below_yellow": rows_below
        })

    print("--- สรุปผลขั้นที่ 1 (Zero-PII Metadata) ---")
    print(f"ฐานข้อมูลชำระหนี้ (Master DB): {db_file} (Exists: {os.path.exists(db_file)})")
    for r in step1_results:
        print(f"  * {r['month']}: พบเส้นเหลืองที่แถว {r['yellow_row']} | ข้อมูลตั้งแต่เส้นเหลืองลงไป: {r['rows_below_yellow']} แถว")

    if step == 1:
        print("\n[PAUSE] ขั้นที่ 1 เสร็จสิ้นตามคำสั่ง (--step 1)")
        return

    # STEP 2: Create target folder SPLIT_FOLLOWUP_077 and extract lower rows
    target_dir = os.path.join(source_dir, "SPLIT_FOLLOWUP_077")
    os.makedirs(target_dir, exist_ok=True)
    print(f"\n[STEP 2] Creating folder {target_dir} and extracting split files...")

    step2_files = []
    for r in step1_results:
        if r["yellow_row"] <= 0 or r["rows_below_yellow"] <= 0:
            continue

        src_wb = load_workbook(r["file_path"], data_only=True)
        src_ws = src_wb.active

        new_wb = Workbook()
        new_ws = new_wb.active
        new_ws.title = r["month"]

        # Copy header row (row 2)
        header_row_vals = [c.value for c in src_ws[2]]
        new_ws.append(header_row_vals)

        # Copy rows below yellow divider
        for row in src_ws.iter_rows(min_row=r["yellow_row"] + 1, max_row=r["total_rows"]):
            row_vals = [c.value for c in row]
            # Ensure Mem_ID (col 6) is padded 5 digits
            if len(row_vals) >= 6:
                row_vals[5] = pad_mem_id(row_vals[5])
            new_ws.append(row_vals)

        out_name = f"{r['month']}_077.xlsx"
        out_path = os.path.join(target_dir, out_name)
        new_wb.save(out_path)
        step2_files.append(out_path)

    print("--- สรุปผลขั้นที่ 2 ---")
    for f in step2_files:
        print(f"  * Created: {os.path.basename(f)}")

    if step == 2:
        print("\n[PAUSE] ขั้นที่ 2 เสร็จสิ้นตามคำสั่ง (--step 2)")
        return

    # STEP 3 & 4: Load Payment DB, Filter Day <= 20, Append AF - AJ
    print("\n[STEP 3 & 4] Matching Payments with Day <= 20 Rule & Appending AF-AJ...")
    payments_dict = {}
    if os.path.exists(db_file):
        db_wb = load_workbook(db_file, data_only=True)
        db_ws = db_wb["S_Data_Late_Payment"] if "S_Data_Late_Payment" in db_wb.sheetnames else db_wb.active
        for row in db_ws.iter_rows(min_row=2, values_only=True):
            if not any(row):
                continue
            contract = str(row[1] or "").strip()
            mem = pad_mem_id(row[5])
            pay_date = row[10] # Pay_Last_Date
            amount = float(row[15] or 0)
            status = str(row[7] or "ปกติ")

            # Parse date
            p_dt = None
            if isinstance(pay_date, datetime):
                p_dt = pay_date
            elif isinstance(pay_date, str) and pay_date.strip():
                try:
                    p_dt = datetime.strptime(pay_date.strip(), "%Y-%m-%d")
                except ValueError:
                    pass

            entry = {"contract": contract, "mem_id": mem, "date": p_dt, "amount": amount, "status": status}
            if contract:
                payments_dict.setdefault(contract, []).append(entry)
            if mem:
                payments_dict.setdefault(mem, []).append(entry)

    final_summary = []
    for r in step1_results:
        split_file = os.path.join(target_dir, f"{r['month']}_077.xlsx")
        if not os.path.exists(split_file):
            continue

        wb = load_workbook(split_file)
        ws = wb.active

        # Add headers for AF to AJ (Cols 32 to 36)
        ws.cell(row=1, column=32, value="ผู้ติดตาม (AF)")
        ws.cell(row=1, column=33, value="วันติดตาม (AG)")
        ws.cell(row=1, column=34, value="เวลาติดตาม (AH)")
        ws.cell(row=1, column=35, value="จำนวนเงิน (AI)")
        ws.cell(row=1, column=36, value="หมายเหตุ (AJ)")

        matched_count = 0
        unmatched_count = 0

        for row_idx in range(2, ws.max_row + 1):
            c_val = str(ws.cell(row=row_idx, column=2).value or "").strip()
            m_val = pad_mem_id(ws.cell(row=row_idx, column=6).value)
            # Ensure Mem_ID cell is padded
            ws.cell(row=row_idx, column=6, value=m_val)

            # AF: Always "077"
            ws.cell(row=row_idx, column=32, value="077")

            match_entries = payments_dict.get(c_val) or payments_dict.get(m_val) or []
            valid_pay = None

            for pe in match_entries:
                p_dt = pe["date"]
                if p_dt and p_dt.year == r["year"] and p_dt.month == r["month_num"]:
                    # Strict Day <= 20 Rule
                    if p_dt.day <= 20:
                        valid_pay = pe
                        break
                    # If day > 20: EXCLUDED and NEVER CARRIED TO NEXT MONTH!

            if valid_pay:
                matched_count += 1
                ws.cell(row=row_idx, column=33, value=valid_pay["date"].strftime("%d/%m/%Y"))
                ws.cell(row=row_idx, column=34, value="10:00")
                ws.cell(row=row_idx, column=35, value=valid_pay["amount"])
                ws.cell(row=row_idx, column=36, value=valid_pay["status"])
            else:
                unmatched_count += 1
                ws.cell(row=row_idx, column=33, value="")
                ws.cell(row=row_idx, column=34, value="")
                ws.cell(row=row_idx, column=35, value=0.0)
                ws.cell(row=row_idx, column=36, value="")

        wb.save(split_file)
        final_summary.append({
            "month": r["month"],
            "total_rows": ws.max_row - 1,
            "matched_count": matched_count,
            "unmatched_count": unmatched_count,
            "file_name": os.path.basename(split_file)
        })

    # STEP 5: Final Zero-PII Summary
    print("\n" + "=" * 65)
    print(" [STEP 5] สรุปผลการดำเนินงาน CRD FOLLOWUP 077 (Zero-PII Compliance)")
    print("=" * 65)
    print(f"บันทึกไฟล์ทั้งหมดไว้ที่: {target_dir}\n")

    for s in final_summary:
        print(f"• เดือน {s['month']}:")
        print(f"   - รายการใต้เส้นเหลืองทั้งหมด: {s['total_rows']} รายการ")
        print(f"   - จับคู่สำเร็จ (ชำระภายในวันที่ 20): {s['matched_count']} รายการ")
        print(f"   - ไม่มีข้อมูลชำระในรอบ (<= 20): {s['unmatched_count']} รายการ")
        print(f"   - ไฟล์: {s['file_name']}")

    summary_json_path = os.path.join(target_dir, "summary_077.json")
    with open(summary_json_path, "w", encoding="utf-8") as f:
        json.dump(final_summary, f, ensure_ascii=False, indent=2)
    print(f"\nSaved summary JSON to: {summary_json_path}")
    print("=" * 65)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", default="")
    parser.add_argument("--db-file", default="")
    parser.add_argument("--step", type=int, default=0)
    parser.add_argument("--synthetic", action="store_true", help="Run end-to-end with synthetic data")
    args = parser.parse_args()

    if args.synthetic:
        scratch_dir = "/tmp/crd_followup_synthetic"
        s_dir, db_p = generate_synthetic_environment(scratch_dir)
        run_pipeline(s_dir, db_p, step=args.step)
    else:
        if not args.source_dir or not args.db_file:
            print("Error: --source-dir and --db-file are required unless --synthetic is specified.")
            sys.exit(1)
        run_pipeline(args.source_dir, args.db_file, step=args.step)
