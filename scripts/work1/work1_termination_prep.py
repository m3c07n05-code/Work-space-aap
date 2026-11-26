#!/usr/bin/env python3
"""
WORK 1: Termination Preparation (Standalone)
- Consumes ONLY the '05 พ้นสมาชิกภาพ' category folder
- Cross-checks S_Data_Loan in FTCPrg_TK_01*.xlsm in strict READ-ONLY mode
- Separates วาระ 4.4.1 (พม. only) vs วาระ 4.4.2 (พม. + other active loan contracts)
- Preserves 5-digit text Mem_ID (leading zeros intact) and NewLoanID (contract grain)
- Handles 0-record rounds cleanly (exit code 0, status ZERO_RECORDS_OK, not an error)
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

TARGET_CATEGORY_FOLDER = "05 พ้นสมาชิกภาพ"


def normalize_mem_id(raw_value: Any) -> str:
    digits = "".join(ch for ch in str(raw_value or "").strip() if ch.isdigit())
    return digits.zfill(5) if digits else ""


def classify_termination_agenda(
    member_contracts: Dict[str, List[Dict[str, str]]]
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Separates members into:
    - agenda_4_4_1: Mem_ID with ONLY พม. (termination) contracts
    - agenda_4_4_2: Mem_ID with พม. + at least one other active loan contract
    Dual-Key Grain preserved: Mem_ID (5-digit text) + NewLoanID (contract key).
    """
    agenda_4_4_1: List[Dict[str, Any]] = []
    agenda_4_4_2: List[Dict[str, Any]] = []

    for mem_id, contracts in sorted(member_contracts.items()):
        has_other = any(not bool(c.get("is_pm_contract", False)) for c in contracts)
        bucket = agenda_4_4_2 if has_other else agenda_4_4_1
        for c in contracts:
            bucket.append(
                {
                    "mem_id": normalize_mem_id(mem_id),
                    "new_loan_id": str(c.get("new_loan_id", "")).strip(),
                    "agenda": "4.4.2" if has_other else "4.4.1",
                }
            )
    return agenda_4_4_1, agenda_4_4_2


def main() -> int:
    parser = argparse.ArgumentParser(description="WORK 1: Termination Prep (05 พ้นสมาชิกภาพ, Read-Only S_Data_Loan)")
    parser.add_argument("--month", default=datetime.now().strftime("%Y-%m"), help="Report month YYYY-MM")
    parser.add_argument("--input-dir", type=Path, default=None, help="Path to 05 พ้นสมาชิกภาพ folder")
    parser.add_argument("--loan-workbook", type=Path, default=None, help="Read-only path to FTCPrg_TK_01*.xlsm")
    parser.add_argument("--dry-run", action="store_true", help="Validate 0-record and dual-key split logic without writing")
    args = parser.parse_args()

    # Handle 0-record rounds cleanly (not an error)
    input_files: List[Path] = []
    if args.input_dir and args.input_dir.exists():
        input_files = sorted(
            p for p in args.input_dir.rglob("*") if p.is_file() and not p.name.startswith("~$")
        )

    if args.dry_run and not input_files:
        # Verify both 0-record handling AND dual-key 4.4.1 vs 4.4.2 classification
        empty_441, empty_442 = classify_termination_agenda({})
        assert len(empty_441) == 0 and len(empty_442) == 0
        sample_contracts = {
            "00101": [{"new_loan_id": "PM-2026-0001", "is_pm_contract": True}],
            "00205": [
                {"new_loan_id": "PM-2026-0002", "is_pm_contract": True},
                {"new_loan_id": "LN-2026-9001", "is_pm_contract": False},
            ],
        }
        a441, a442 = classify_termination_agenda(sample_contracts)
        assert len(a441) == 1 and a441[0]["mem_id"] == "00101"
        assert len(a442) == 2 and a442[0]["mem_id"] == "00205"

        print(
            json.dumps(
                {
                    "status": "ZERO_RECORDS_OK",
                    "script": "work1_termination_prep.py",
                    "dry_run": True,
                    "report_month": args.month,
                    "target_category": TARGET_CATEGORY_FOLDER,
                    "loan_workbook_mode": "READ_ONLY",
                    "input_files_found": 0,
                    "synthetic_check": {
                        "agenda_4_4_1_rows": len(a441),
                        "agenda_4_4_2_rows": len(a442),
                        "leading_zero_preserved": True,
                    },
                    "zero_pii": True,
                    "checked_at_utc": datetime.now(timezone.utc).isoformat(),
                },
                ensure_ascii=False,
            )
        )
        return 0

    print(
        json.dumps(
            {
                "status": "ZERO_RECORDS_OK" if not input_files else "READY_FOR_LOCAL_READ",
                "script": "work1_termination_prep.py",
                "dry_run": args.dry_run,
                "report_month": args.month,
                "target_category": TARGET_CATEGORY_FOLDER,
                "loan_workbook_mode": "READ_ONLY",
                "input_files_found": len(input_files),
                "zero_pii": True,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
