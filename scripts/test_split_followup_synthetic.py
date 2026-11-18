#!/usr/bin/env python3
"""
Unit Test: CRD Split Followup 077 Synthetic Logic & Rule Verification
====================================================================
Tests the core business logic of CRD-077:
1. Yellow divider row detection and lower-half row extraction
2. Mem_ID 5-digit zero-padding format preservation
3. Cut-off rule: Payment Date <= 20 only
4. Strict Rule: Payments after day 20 (21-31) must NOT be counted, nor carried to next month
5. 5-Column trailing injection (AF to AJ):
   - AF: "077"
   - AG: Payment Date (dd/mm/yyyy <= 20)
   - AH: Payment Time
   - AI: Amount Paid
   - AJ: Status Note
6. Zero-PII Summary stats generation
"""

import unittest
from datetime import datetime
from typing import List, Dict, Any, Optional

def pad_mem_id(val: Any) -> str:
    """Ensures Mem_ID is always formatted as 5-digit zero-padded string."""
    if val is None or str(val).strip() == "":
        return ""
    s = str(val).strip()
    # Strip any decimal if float came from excel (e.g. 1234.0 -> 1234)
    if s.endswith(".0"):
        s = s[:-2]
    if s.isdigit():
        return s.zfill(5)
    return s

def filter_payment_records(
    payments: List[Dict[str, Any]],
    target_year: int,
    target_month: int,
    contract_id: str,
    mem_id: str
) -> Optional[Dict[str, Any]]:
    """
    Finds valid payment record for a given contract/member in target cycle.
    Strict Rule:
    - Payment date must be in target_year and target_month
    - Payment day must be <= 20
    - If payment is after day 20 (21-31), it is excluded and NOT carried over.
    """
    valid_records = []
    norm_mem = pad_mem_id(mem_id)

    for p in payments:
        p_contract = str(p.get("contract_id", "")).strip()
        p_mem = pad_mem_id(p.get("mem_id", ""))

        # Check match on contract or member
        if p_contract != contract_id and (not norm_mem or p_mem != norm_mem):
            continue

        p_date = p.get("pay_date")  # datetime object or string 'YYYY-MM-DD'
        if isinstance(p_date, str):
            p_date = datetime.strptime(p_date, "%Y-%m-%d")

        # Cycle check
        if p_date.year == target_year and p_date.month == target_month:
            if p_date.day <= 20:
                valid_records.append({
                    "date": p_date,
                    "time": p.get("pay_time", "00:00"),
                    "amount": float(p.get("amount", 0)),
                    "status": str(p.get("status", "ปกติ"))
                })
            else:
                # Paid between 21-31: Excluded from this cycle, strict prohibition from carry-forward
                pass

    if not valid_records:
        return None

    # If multiple payments before 20th, sort by date/time ascending, sum amount, take latest date/time
    total_amount = sum(r["amount"] for r in valid_records)
    latest = sorted(valid_records, key=lambda x: x["date"])[-1]
    return {
        "pay_date_str": latest["date"].strftime("%d/%m/%Y"),
        "pay_time": latest["time"],
        "amount": total_amount,
        "status": latest["status"]
    }

def process_monthly_followup_rows(
    raw_rows: List[Dict[str, Any]],
    yellow_divider_index: int,
    payments_db: List[Dict[str, Any]],
    target_year: int,
    target_month: int
) -> Dict[str, Any]:
    """
    Executes steps 2, 3, 4, 5 on rows below yellow divider.
    """
    # Step 2: Extract rows strictly below yellow divider
    target_rows = raw_rows[yellow_divider_index + 1:]

    processed = []
    matched_count = 0
    unmatched_count = 0

    for r in target_rows:
        row_copy = dict(r)
        c_id = str(row_copy.get("contract_id", "")).strip()
        m_id = pad_mem_id(row_copy.get("mem_id", ""))
        row_copy["mem_id"] = m_id

        # Step 3 & 4: Match and inject 5 columns (AF to AJ)
        match = filter_payment_records(payments_db, target_year, target_month, c_id, m_id)

        # AF: ผู้ติดตาม = 077
        row_copy["AF_Follower"] = "077"

        if match:
            matched_count += 1
            # AG: วันติดตาม (dd/mm/yyyy <= 20)
            row_copy["AG_FollowDate"] = match["pay_date_str"]
            # AH: เวลาติดตาม
            row_copy["AH_FollowTime"] = match["pay_time"]
            # AI: จำนวนเงิน
            row_copy["AI_Amount"] = match["amount"]
            # AJ: หมายเหตุ
            row_copy["AJ_Note"] = match["status"]
        else:
            unmatched_count += 1
            row_copy["AG_FollowDate"] = ""
            row_copy["AH_FollowTime"] = ""
            row_copy["AI_Amount"] = 0.0
            row_copy["AJ_Note"] = "ไม่มีรายการชำระในรอบ"

        processed.append(row_copy)

    return {
        "total_extracted": len(target_rows),
        "matched_count": matched_count,
        "unmatched_count": unmatched_count,
        "rows": processed
    }


class TestSplitFollowup077(unittest.TestCase):

    def setUp(self):
        # Synthetic mock dataset
        self.raw_rows = [
            {"row_idx": 1, "contract_id": "CNTR-001", "mem_id": 12, "name": "Member A", "is_yellow": False},
            {"row_idx": 2, "contract_id": "CNTR-002", "mem_id": 45, "name": "Member B", "is_yellow": False},
            {"row_idx": 3, "contract_id": "DIVIDER", "mem_id": 0, "name": "--- YELLOW LINE ---", "is_yellow": True},
            # Rows below yellow divider (indices 3, 4, 5, 6 in 0-indexed list)
            {"row_idx": 4, "contract_id": "CNTR-101", "mem_id": 101, "name": "Target Member 1", "is_yellow": False},
            {"row_idx": 5, "contract_id": "CNTR-102", "mem_id": "00202", "name": "Target Member 2", "is_yellow": False},
            {"row_idx": 6, "contract_id": "CNTR-103", "mem_id": 303, "name": "Target Member 3 (Paid > 20th)", "is_yellow": False},
            {"row_idx": 7, "contract_id": "CNTR-104", "mem_id": 404, "name": "Target Member 4 (No Pay)", "is_yellow": False},
        ]
        self.yellow_divider_index = 2  # row_idx 3 is at index 2

        # Payments DB
        self.payments_db = [
            # CNTR-101 paid on 2026-07-15 (Day <= 20) -> Valid in July
            {"contract_id": "CNTR-101", "mem_id": 101, "pay_date": "2026-07-15", "pay_time": "10:30", "amount": 2500.0, "status": "ชำระปกติ"},
            # CNTR-102 paid on 2026-07-20 (Day == 20) -> Valid in July
            {"contract_id": "CNTR-102", "mem_id": 202, "pay_date": "2026-07-20", "pay_time": "14:15", "amount": 3200.0, "status": "ชำระปกติ"},
            # CNTR-103 paid on 2026-07-25 (Day > 20) -> MUST BE EXCLUDED in July & MUST NOT CARRY OVER to August/Sept
            {"contract_id": "CNTR-103", "mem_id": 303, "pay_date": "2026-07-25", "pay_time": "09:00", "amount": 1800.0, "status": "ชำระหลังวันที่ 20"},
            # CNTR-104 has no payment in July
            # Next month (August) payment for CNTR-103 on 2026-08-05 (Valid only in August, not July)
            {"contract_id": "CNTR-103", "mem_id": 303, "pay_date": "2026-08-05", "pay_time": "11:00", "amount": 1800.0, "status": "ชำระปกติ"},
        ]

    def test_mem_id_formatting(self):
        self.assertEqual(pad_mem_id(1), "00001")
        self.assertEqual(pad_mem_id(123), "00123")
        self.assertEqual(pad_mem_id("04567"), "04567")
        self.assertEqual(pad_mem_id("99999"), "99999")
        self.assertEqual(pad_mem_id(1234.0), "01234")

    def test_yellow_divider_split(self):
        res = process_monthly_followup_rows(
            self.raw_rows,
            self.yellow_divider_index,
            self.payments_db,
            target_year=2026,
            target_month=7
        )
        # Should extract exactly 4 rows (CNTR-101, 102, 103, 104)
        self.assertEqual(res["total_extracted"], 4)
        contracts = [r["contract_id"] for r in res["rows"]]
        self.assertEqual(contracts, ["CNTR-101", "CNTR-102", "CNTR-103", "CNTR-104"])

    def test_cutoff_day_20_and_no_carryforward(self):
        res = process_monthly_followup_rows(
            self.raw_rows,
            self.yellow_divider_index,
            self.payments_db,
            target_year=2026,
            target_month=7
        )
        # CNTR-101: paid on 15th (<= 20) -> Matched
        row_101 = next(r for r in res["rows"] if r["contract_id"] == "CNTR-101")
        self.assertEqual(row_101["AF_Follower"], "077")
        self.assertEqual(row_101["AG_FollowDate"], "15/07/2026")
        self.assertEqual(row_101["AH_FollowTime"], "10:30")
        self.assertEqual(row_101["AI_Amount"], 2500.0)
        self.assertEqual(row_101["AJ_Note"], "ชำระปกติ")
        self.assertEqual(row_101["mem_id"], "00101")

        # CNTR-102: paid on 20th (<= 20) -> Matched
        row_102 = next(r for r in res["rows"] if r["contract_id"] == "CNTR-102")
        self.assertEqual(row_102["AG_FollowDate"], "20/07/2026")
        self.assertEqual(row_102["AI_Amount"], 3200.0)

        # CNTR-103: paid on 25th (> 20) -> Excluded from July!
        row_103 = next(r for r in res["rows"] if r["contract_id"] == "CNTR-103")
        self.assertEqual(row_103["AG_FollowDate"], "")
        self.assertEqual(row_103["AI_Amount"], 0.0)
        self.assertEqual(row_103["AJ_Note"], "ไม่มีรายการชำระในรอบ")

        # CNTR-104: no payment
        row_104 = next(r for r in res["rows"] if r["contract_id"] == "CNTR-104")
        self.assertEqual(row_104["AG_FollowDate"], "")
        self.assertEqual(row_104["AI_Amount"], 0.0)

        # Summary check: 2 matched, 2 unmatched
        self.assertEqual(res["matched_count"], 2)
        self.assertEqual(res["unmatched_count"], 2)

    def test_next_month_isolation(self):
        # Verify that payment on 2026-07-25 does NOT get carried forward to August
        # Only the actual August payment on 2026-08-05 is counted in August
        res_aug = process_monthly_followup_rows(
            self.raw_rows,
            self.yellow_divider_index,
            self.payments_db,
            target_year=2026,
            target_month=8
        )
        row_103_aug = next(r for r in res_aug["rows"] if r["contract_id"] == "CNTR-103")
        self.assertEqual(row_103_aug["AG_FollowDate"], "05/08/2026")
        self.assertEqual(row_103_aug["AI_Amount"], 1800.0)
        # It does NOT include 1800 from July 25th!


if __name__ == "__main__":
    unittest.main()
