#!/usr/bin/env python3
"""
Stage 2: Coordination Center Receipt & Missing-Branch Summary (Standalone)
- Reads Stage-1 Zero-PII intake registry JSON
- Optionally cross-checks Google Form response counts (counts only, never merges identities)
- Generates per-branch, per-category receipt & missing-branch summary (Zero-PII)
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CONFIG = SCRIPT_DIR / "coord_config.json"


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def build_receipt_summary(
    cfg: Dict[str, Any],
    report_month: str,
    intake_records: List[Dict[str, Any]],
    form_counts: Dict[str, int],
) -> Dict[str, Any]:
    counts: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for rec in intake_records:
        branch_id = str(rec.get("branch_id", "UNKNOWN"))
        cat_code = str(rec.get("category_code", "07"))
        counts[branch_id][cat_code] += 1

    branch_rows: List[Dict[str, Any]] = []
    missing_branches: List[str] = []

    for br in cfg["branches"]:
        bid = br["branch_id"]
        per_cat = {cat["code"]: counts[bid].get(cat["code"], 0) for cat in cfg["categories"]}
        total_files = sum(per_cat.values())
        if total_files == 0:
            missing_branches.append(bid)
        branch_rows.append(
            {
                "branch_id": bid,
                "branch_name": br["name"],
                "branch_status": br["status"],
                "total_files": total_files,
                "form_response_count": int(form_counts.get(bid, 0)),
                "categories": per_cat,
                "received": total_files > 0,
            }
        )

    return {
        "stage": "STAGE_2_RECEIPT_SUMMARY",
        "task_id": "CRD-COORD-SPLIT-SCRIPTS-MODULAR-20261125",
        "report_month": report_month,
        "zero_pii": True,
        "total_branches": len(cfg["branches"]),
        "received_branches_count": len(cfg["branches"]) - len(missing_branches),
        "missing_branches_count": len(missing_branches),
        "missing_branches": missing_branches,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "branches": branch_rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Stage 2: Coordination Center Receipt Summary (Zero-PII)")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG, help="Path to coord_config.json")
    parser.add_argument("--month", default=datetime.now().strftime("%Y-%m"), help="Report month YYYY-MM")
    parser.add_argument("--registry", type=Path, default=None, help="Path to Stage-1 intake registry JSON")
    parser.add_argument("--form-counts", type=Path, default=None, help="Optional counts-only Google Form JSON")
    parser.add_argument("--output-dir", type=Path, default=None, help="Output directory for summary files")
    parser.add_argument("--dry-run", action="store_true", help="Run summary calculation without writing files")
    args = parser.parse_args()

    cfg = load_json(args.config)

    intake_records: List[Dict[str, Any]] = []
    if args.registry and args.registry.exists():
        reg_data = load_json(args.registry)
        intake_records = reg_data.get("records", []) if isinstance(reg_data, dict) else []
    elif args.dry_run:
        intake_records = [
            {"branch_id": "BR-01", "category_code": "05"},
            {"branch_id": "BR-02", "category_code": "04"},
        ]

    form_counts: Dict[str, int] = {}
    if args.form_counts and args.form_counts.exists():
        raw_fc = load_json(args.form_counts)
        if isinstance(raw_fc, dict):
            form_counts = {str(k): int(v) for k, v in raw_fc.items()}

    summary = build_receipt_summary(cfg, args.month, intake_records, form_counts)

    if not args.dry_run:
        out_dir = args.output_dir or Path(
            os.environ.get("ONEDRIVE_ROOT", str(SCRIPT_DIR / "_local_staging_preview"))
        ) / cfg["onedrive_relative_roots"]["staging_output"]
        out_dir.mkdir(parents=True, exist_ok=True)
        with (out_dir / f"coord_receipt_summary_{args.month}.json").open("w", encoding="utf-8") as jf:
            json.dump(summary, jf, ensure_ascii=False, indent=2)
        with (out_dir / f"coord_receipt_summary_{args.month}.csv").open("w", encoding="utf-8-sig", newline="") as cf:
            cat_codes = [c["code"] for c in cfg["categories"]]
            writer = csv.writer(cf)
            writer.writerow(["branch_id", "branch_name", "branch_status", "total_files", "form_response_count", *cat_codes])
            for row in summary["branches"]:
                writer.writerow(
                    [
                        row["branch_id"],
                        row["branch_name"],
                        row["branch_status"],
                        row["total_files"],
                        row["form_response_count"],
                        *[row["categories"][c] for c in cat_codes],
                    ]
                )

    print(
        json.dumps(
            {
                "status": "OK",
                "script": "coord_02_receipt_summary.py",
                "dry_run": args.dry_run,
                "report_month": args.month,
                "total_branches": summary["total_branches"],
                "received_branches": summary["received_branches_count"],
                "missing_branches": summary["missing_branches_count"],
                "zero_pii": True,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
