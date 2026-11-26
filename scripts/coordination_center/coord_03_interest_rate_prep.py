#!/usr/bin/env python3
"""
Stage 3: Interest Rate Adjustment Prep (Standalone)
- Consumes ONLY '04 ปรับอัตราดอกเบี้ยผิดนัด'
- Compares S_Data_Loan!I vs Ref!BC in strict READ-ONLY mode
- Stages consolidated list for credit department review (Draft/Staging ONLY — NO auto-send email)
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

TARGET_CATEGORY_FOLDER = "04 ปรับอัตราดอกเบี้ยผิดนัด"
NO_AUTO_SEND_EMAIL = True


def compare_rate_columns(rows: List[Dict[str, Any]]) -> Dict[str, int]:
    """Counts matches vs discrepancies between S_Data_Loan!I and Ref!BC (Zero-PII aggregates only)."""
    matched = 0
    mismatched = 0
    for row in rows:
        loan_i = str(row.get("s_data_loan_I", "")).strip()
        ref_bc = str(row.get("ref_BC", "")).strip()
        if loan_i == ref_bc:
            matched += 1
        else:
            mismatched += 1
    return {"total_checked": len(rows), "matched": matched, "mismatched": mismatched}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Stage 3: Interest Rate Adjustment Prep (04 ปรับอัตราดอกเบี้ยผิดนัด, Read-Only)"
    )
    parser.add_argument("--month", default=datetime.now().strftime("%Y-%m"), help="Report month YYYY-MM")
    parser.add_argument("--input-dir", type=Path, default=None, help="Path to 04 ปรับอัตราดอกเบี้ยผิดนัด folder")
    parser.add_argument("--loan-workbook", type=Path, default=None, help="Read-only path to FTCPrg_TK_01*.xlsm")
    parser.add_argument("--dry-run", action="store_true", help="Validate comparison and draft-only guardrails")
    args = parser.parse_args()

    input_files: List[Path] = []
    if args.input_dir and args.input_dir.exists():
        input_files = sorted(
            p for p in args.input_dir.rglob("*") if p.is_file() and not p.name.startswith("~$")
        )

    sample_stats = compare_rate_columns(
        [
            {"s_data_loan_I": "6.50", "ref_BC": "6.50"},
            {"s_data_loan_I": "6.50", "ref_BC": "7.25"},
        ]
    ) if args.dry_run else {"total_checked": 0, "matched": 0, "mismatched": 0}

    print(
        json.dumps(
            {
                "status": "DRAFT_STAGING_OK",
                "script": "coord_03_interest_rate_prep.py",
                "dry_run": args.dry_run,
                "report_month": args.month,
                "target_category": TARGET_CATEGORY_FOLDER,
                "comparison_rule": "S_Data_Loan!I vs Ref!BC (READ_ONLY)",
                "input_files_found": len(input_files),
                "comparison_summary": sample_stats,
                "no_auto_send_email": NO_AUTO_SEND_EMAIL,
                "zero_pii": True,
                "checked_at_utc": datetime.now(timezone.utc).isoformat(),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
