#!/usr/bin/env python3
"""
CRD WORK 4: A4 Dispatch Cover Sheet ("ใบนำส่ง") Generator (Headless, Synthetic-Only)
===================================================================================
Generates a single-page A4 Portrait (210mm x 297mm) Dispatch Cover Sheet PDF from
Zero-PII synthetic sample records with:
  - Fail-closed R:/S:/UNC drive non-access guard (AGENTS.md Rule 1)
  - Strict .rpt write-prohibition guard (read-only metadata prefixes only, Rule 3a)
  - Zero-PII synthetic-only record validator (Rule 3b)
  - 9-category WORK 4 catalog SKIPPED_EMPTY filtering (Rule 3c)
  - NO_AUTO_PRINT / Paper=0 enforcement in code, visuals, and PDF /Info (Rule 3d)
  - Pure-Python ISO/IEC 15417 Code 128B inline SVG barcodes & locked 1:1 logo (Rule 4)
  - Offline Thai glyph rendering via cached Sarabun OFL TTFs + headless Chromium
"""

from __future__ import annotations

import argparse
import base64
from dataclasses import dataclass
from datetime import datetime
import hashlib
import html
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from typing import Any
import zlib

from PIL import Image, ImageFont

# ---------------------------------------------------------------------------
# Immutable Policy Constants (AGENTS.md Rules 1, 3, 4)
# ---------------------------------------------------------------------------

TASK_ID = "CRD-WORK4-PRINT-FORMAT-NEW-20261112"
SYNTHETIC_DATA_ONLY = True
NO_AUTO_PRINT = True
PAPER_FLAG = "Paper=0"
PAPER_SHEETS_PRINTED = 0

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
FONTS_DIR = SCRIPT_DIR / "fonts"
DEFAULT_OUTPUT_PDF = REPO_ROOT / "output" / "dispatch_cover_sheet_a4_sample.pdf"

REQUIRED_FONTS: dict[str, str] = {
    "Sarabun-Regular.ttf": "226d4f368fbc0457990ddef2692679badfd2c1a4e89e5ac4d43c10ba7743b2f1",
    "Sarabun-Bold.ttf": "d38308ca27d067b9a1b79006337c1f9a66c29aa016d96a9d88d3801da7fa83b9",
}

THAI_MONTHS: dict[str, str] = {
    "01": "มกราคม",
    "02": "กุมภาพันธ์",
    "03": "มีนาคม",
    "04": "เมษายน",
    "05": "พฤษภาคม",
    "06": "มิถุนายน",
    "07": "กรกฎาคม",
    "08": "สิงหาคม",
    "09": "กันยายน",
    "10": "ตุลาคม",
    "11": "พฤศจิกายน",
    "12": "ธันวาคม",
}

# ---------------------------------------------------------------------------
# Security & Compliance Validators (Fail-Closed)
# ---------------------------------------------------------------------------


class GuardrailViolationError(ValueError):
    """Raised when any path, .rpt, PII, or NO_AUTO_PRINT guardrail fails."""


# Blocks R:/S: drives (with/without slash), UNC admin shares (\\host\R$, \\server\share),
# and forward-slash UNC paths (//server/share) across common delimiter/separator boundaries.
FORBIDDEN_DRIVE_RE = re.compile(
    r"(?:^|[\s\"'=;,|&:/\\])([RSrs]:)|(?:^|[\s\"'=;,|&:])(\\\\[^\\]+\\[^\\]+|//[^/]+/[^/]+)"
)
URI_SCHEME_RE = re.compile(r"(?:^|[\s\"'=;,|&])[A-Za-z][A-Za-z0-9+.-]*://")

MEMBER_ID_RE = re.compile(r"^\d{5}\Z", re.ASCII)
EMS_CODE_RE = re.compile(r"^E[A-Z]\d{9}TH\Z", re.ASCII)
CITIZEN_ID_PLAIN_RE = re.compile(r"(?<!\d)\d{13}(?!\d)", re.ASCII)
CITIZEN_ID_DASHED_RE = re.compile(
    r"(?<!\d)\d[- ]?\d{4}[- ]?\d{5}[- ]?\d{2}[- ]?\d(?!\d)", re.ASCII
)
THAI_MOBILE_RE = re.compile(
    r"(?<!\d)(?:\+?66|0)[- ]?[689]\d[- ]?\d{3}[- ]?\d{4}(?!\d)", re.ASCII
)
THAI_LANDLINE_RE = re.compile(
    r"(?<!\d)(?:02[- ]?\d{3}[- ]?\d{4}|0[3-57]\d[- ]?\d{3}[- ]?\d{3,4})(?!\d)",
    re.ASCII,
)

CONTRACT_SYNTHETIC_MARKERS = ("MOCK", "ตัวอย่าง")
NAME_SYNTHETIC_MARKERS = ("สมมติ", "จำลอง", "ตัวอย่าง", "ทดสอบ", "MOCK")


def validate_safe_path(path_value: str | Path, purpose: str) -> Path:
    """Rejects R:, S:, UNC paths, URIs, output symlinks, and .rpt write targets."""
    raw = str(path_value).strip()
    if not raw:
        raise GuardrailViolationError(f"Empty path rejected for {purpose}.")
    if FORBIDDEN_DRIVE_RE.search(raw):
        raise GuardrailViolationError(
            f"Rule 1 violation ({purpose}): prohibited R:/S: drive or UNC path: {raw!r}"
        )
    if URI_SCHEME_RE.search(raw):
        raise GuardrailViolationError(
            f"Rule 1 violation ({purpose}): URI scheme path is prohibited: {raw!r}"
        )

    candidate = Path(raw).expanduser()
    if purpose in {"output", "write"} and candidate.is_symlink():
        target = candidate.resolve(strict=False)
        raise GuardrailViolationError(
            f"Rule 3a violation ({purpose}): symlink write target is strictly prohibited: {raw!r} -> {str(target)!r}"
        )

    resolved = candidate.resolve(strict=False)
    for label, check_obj in (("raw", candidate), ("resolved", resolved)):
        check_str = str(check_obj)
        if FORBIDDEN_DRIVE_RE.search(check_str):
            raise GuardrailViolationError(
                f"Rule 1 violation ({purpose}): {label} path hits prohibited drive/UNC: {check_str!r}"
            )
        if URI_SCHEME_RE.search(check_str):
            raise GuardrailViolationError(
                f"Rule 1 violation ({purpose}): {label} path hits prohibited URI: {check_str!r}"
            )
        if purpose in {"output", "logo", "browser", "write"}:
            if check_str.lower().endswith(".rpt") or (
                purpose in {"output", "write"} and ".rpt" in check_obj.name.lower()
            ):
                raise GuardrailViolationError(
                    f"Rule 3a violation ({purpose}): writing or targeting .rpt files is strictly prohibited: {check_str!r}"
                )
    return resolved


def assert_rpt_write_prohibited(path_value: str | Path) -> None:
    """Explicit write-prohibition check for .rpt templates & symlinks (Rule 3a)."""
    raw = str(path_value).strip()
    if not raw:
        raise GuardrailViolationError("Rule 3a violation: empty path is prohibited.")
    if FORBIDDEN_DRIVE_RE.search(raw) or URI_SCHEME_RE.search(raw):
        raise GuardrailViolationError(
            f"Rule 1/3a violation: prohibited drive/UNC/URI path: {raw!r}"
        )
    candidate = Path(raw).expanduser()
    if candidate.is_symlink():
        target = candidate.resolve(strict=False)
        raise GuardrailViolationError(
            f"Rule 3a violation: symlink output target is prohibited: {raw!r} -> {str(target)!r}"
        )
    resolved = candidate.resolve(strict=False)
    for check_obj in (candidate, resolved):
        check_str = str(check_obj)
        if FORBIDDEN_DRIVE_RE.search(check_str) or URI_SCHEME_RE.search(check_str):
            raise GuardrailViolationError(
                f"Rule 1/3a violation: resolved path hits prohibited drive/UNC/URI: {check_str!r}"
            )
        if check_str.lower().endswith(".rpt") or ".rpt" in check_obj.name.lower():
            raise GuardrailViolationError(
                f"Rule 3a violation: .rpt files are read-only and must never be modified/written: {check_str!r}"
            )


def assert_no_real_pii_text(text: str, field_name: str) -> None:
    """Rejects 13-digit Thai citizen IDs and phone numbers in synthetic payloads."""
    if CITIZEN_ID_PLAIN_RE.search(text) or CITIZEN_ID_DASHED_RE.search(text):
        raise GuardrailViolationError(
            f"Rule 3b violation ({field_name}): detected 13-digit citizen ID pattern in {text!r}"
        )
    if THAI_MOBILE_RE.search(text) or THAI_LANDLINE_RE.search(text):
        raise GuardrailViolationError(
            f"Rule 3b violation ({field_name}): detected Thai phone number pattern in {text!r}"
        )


def validate_synthetic_record(record: dict[str, Any]) -> dict[str, Any]:
    """Validates a single dispatch record strictly conforms to Zero-PII synthetic rules."""
    if not SYNTHETIC_DATA_ONLY:
        raise GuardrailViolationError("SYNTHETIC_DATA_ONLY must remain True.")

    member_id = str(record.get("member_id", ""))
    if not MEMBER_ID_RE.match(member_id):
        raise GuardrailViolationError(
            f"Rule 3b violation: member_id must be 5-digit ASCII zero-padded string, got {member_id!r}"
        )

    contract_no = str(record.get("contract_no", ""))
    if not any(marker in contract_no.upper() if marker.isascii() else marker in contract_no for marker in CONTRACT_SYNTHETIC_MARKERS):
        raise GuardrailViolationError(
            f"Rule 3b violation: contract_no must contain synthetic marker (MOCK/ตัวอย่าง), got {contract_no!r}"
        )

    recipient_name = str(record.get("recipient_name", ""))
    if not any(marker in recipient_name.upper() if marker.isascii() else marker in recipient_name for marker in NAME_SYNTHETIC_MARKERS):
        raise GuardrailViolationError(
            f"Rule 3b violation: recipient_name must contain synthetic marker, got {recipient_name!r}"
        )

    ems_code = str(record.get("ems_code", ""))
    if not EMS_CODE_RE.match(ems_code):
        raise GuardrailViolationError(
            f"Rule 4 violation: ems_code must match ^E[A-Z]\\d{{9}}TH\\Z, got {ems_code!r}"
        )

    for key in ("member_id", "contract_no", "recipient_name", "ems_code"):
        assert_no_real_pii_text(str(record.get(key, "")), key)

    return dict(record)


# ---------------------------------------------------------------------------
# 9-Category WORK 4 Catalog & SKIPPED_EMPTY Filter (Rule 3a / 3c)
# ---------------------------------------------------------------------------


CATEGORIES_CATALOG: list[dict[str, Any]] = [
    {
        "code": "C01",
        "rpt_prefix": "CLT-003-02",
        "name": "ผู้กู้ 2 งวด",
        "role": "ผู้กู้",
        "installments": 2,
        "ems_form_code": "ก.2",
        "form_type": "ก.2/ค.2 + EMS A6",
        "status": "FOUND",
        "record_count": 12,
        "pdf_pages": 12,
        "rpt_delivery_ref": "CLT-003-02_x_ใบนำส่งใบแจ้งชำระหนี้ผู้กู้ 2 งวด.rpt",
    },
    {
        "code": "C02",
        "rpt_prefix": "CLT-004-02",
        "name": "ผู้กู้ร่วม 2 งวด",
        "role": "ผู้กู้ร่วม",
        "installments": 2,
        "ems_form_code": "กร.2",
        "form_type": "ก.2/ค.2 + EMS A6",
        "status": "FOUND",
        "record_count": 5,
        "pdf_pages": 5,
        "rpt_delivery_ref": "CLT-004-02_x_ใบนำส่งใบแจ้งชำระหนี้ผู้กู้ร่วม 2 งวด.rpt",
    },
    {
        "code": "C03",
        "rpt_prefix": "CLT-004-02",
        "name": "ผู้ค้ำ 2 งวด",
        "role": "ผู้ค้ำ",
        "installments": 2,
        "ems_form_code": "ค.2",
        "form_type": "ก.2/ค.2 + EMS A6",
        "status": "SKIPPED_EMPTY",
        "record_count": 0,
        "pdf_pages": 0,
        "rpt_delivery_ref": "CLT-004-02_x_ใบนำส่งใบแจ้งชำระหนี้ผู้ค้ำ 2 งวด.rpt",
    },
    {
        "code": "C04",
        "rpt_prefix": "CLT-005-02",
        "name": "ผู้กู้ 4 งวด",
        "role": "ผู้กู้",
        "installments": 4,
        "ems_form_code": "ก.4",
        "form_type": "ก.2/ค.2 + EMS A6",
        "status": "FOUND",
        "record_count": 8,
        "pdf_pages": 8,
        "rpt_delivery_ref": "CLT-005-02_x_ใบนำส่งใบแจ้งชำระหนี้ผู้กู้ 4 งวด.rpt",
    },
    {
        "code": "C05",
        "rpt_prefix": "CLT-006-02",
        "name": "ผู้กู้ร่วม 4 งวด",
        "role": "ผู้กู้ร่วม",
        "installments": 4,
        "ems_form_code": "กร.4",
        "form_type": "ก.2/ค.2 + EMS A6",
        "status": "SKIPPED_EMPTY",
        "record_count": 0,
        "pdf_pages": 0,
        "rpt_delivery_ref": "CLT-006-02_x_ใบนำส่งใบแจ้งชำระหนี้ผู้กู้ร่วม 4 งวด.rpt",
    },
    {
        "code": "C06",
        "rpt_prefix": "CLT-006-02",
        "name": "ผู้ค้ำ 4 งวด",
        "role": "ผู้ค้ำ",
        "installments": 4,
        "ems_form_code": "ค.4",
        "form_type": "ก.2/ค.2 + EMS A6",
        "status": "FOUND",
        "record_count": 3,
        "pdf_pages": 3,
        "rpt_delivery_ref": "CLT-006-02_x_ใบนำส่งใบแจ้งชำระหนี้ผู้ค้ำ 4 งวด.rpt",
    },
    {
        "code": "C07",
        "rpt_prefix": "CLT-007-02",
        "name": "ผู้กู้ 5 งวด",
        "role": "ผู้กู้",
        "installments": 5,
        "ems_form_code": "ก.5",
        "form_type": "ใบฟ้า EMS A6",
        "status": "FOUND",
        "record_count": 15,
        "pdf_pages": 15,
        "rpt_delivery_ref": "CLT-007-02_x_ใบนำส่งใบแจ้งชำระหนี้ผู้กู้ 5 งวด.rpt",
    },
    {
        "code": "C08",
        "rpt_prefix": "CLT-008-02",
        "name": "ผู้กู้ร่วม 5 งวด",
        "role": "ผู้กู้ร่วม",
        "installments": 5,
        "ems_form_code": "กร.5",
        "form_type": "ใบฟ้า EMS A6",
        "status": "FOUND",
        "record_count": 4,
        "pdf_pages": 4,
        "rpt_delivery_ref": "CLT-008-02_x_ใบนำส่งใบแจ้งชำระหนี้ผู้กู้ร่วม 5 งวด.rpt",
    },
    {
        "code": "C09",
        "rpt_prefix": "CLT-008-02",
        "name": "ผู้ค้ำ 5 งวด",
        "role": "ผู้ค้ำ",
        "installments": 5,
        "ems_form_code": "ค.5",
        "form_type": "ใบฟ้า EMS A6",
        "status": "ERROR",
        "record_count": 0,
        "pdf_pages": 0,
        "error_code": "MOCK_TEST_READ_ERROR",
        "rpt_delivery_ref": "CLT-008-02_x_ใบนำส่งใบแจ้งชำระหนี้ผู้ค้ำ 5 งวด.rpt",
    },
]

SAMPLE_SYNTHETIC_RECORDS: list[dict[str, Any]] = [
    {
        "seq_no": 1,
        "member_id": "00001",
        "contract_no": "LN-2026-MOCK-001",
        "recipient_name": "นายสมมติ ทดสอบระบบ ๑",
        "category_code": "C01",
        "ems_code": "EE123456789TH",
    },
    {
        "seq_no": 2,
        "member_id": "00002",
        "contract_no": "LN-2026-MOCK-002",
        "recipient_name": "นางสาวจำลอง ปลอดภัย ๒",
        "category_code": "C04",
        "ems_code": "EE123456790TH",
    },
    {
        "seq_no": 3,
        "member_id": "00003",
        "contract_no": "LN-2026-MOCK-003",
        "recipient_name": "นายตัวอย่าง ข้อมูลสมมติ ๓",
        "category_code": "C07",
        "ems_code": "EE123456791TH",
    },
]


@dataclass
class FilteredDispatchData:
    catalog: list[dict[str, Any]]
    active_categories: list[dict[str, Any]]
    skipped_empty_categories: list[dict[str, Any]]
    error_categories: list[dict[str, Any]]
    included_records: list[dict[str, Any]]
    excluded_records: list[dict[str, Any]]


def evaluate_catalog_and_records(
    catalog: list[dict[str, Any]],
    records: list[dict[str, Any]],
) -> FilteredDispatchData:
    """Filters active categories per Rule 3c (SKIPPED_EMPTY & ERROR excluded) and normalizes catalog."""
    normalized_catalog: list[dict[str, Any]] = []
    active_categories: list[dict[str, Any]] = []
    skipped_empty_categories: list[dict[str, Any]] = []
    error_categories: list[dict[str, Any]] = []
    active_by_code: dict[str, dict[str, Any]] = {}

    for raw_cat in catalog:
        cat = dict(raw_cat)
        raw_status = str(cat.get("status", "")).strip().upper()
        rec_count = int(cat.get("record_count", 0))
        cat["record_count"] = rec_count

        if raw_status == "ERROR":
            cat["status"] = "ERROR"
            error_categories.append(cat)
        elif raw_status in {"SKIPPED_EMPTY", "NO_DATA", "ZERO", "EMPTY"} or rec_count <= 0:
            cat["status"] = "SKIPPED_EMPTY"
            skipped_empty_categories.append(cat)
        elif raw_status == "FOUND" and rec_count > 0:
            cat["status"] = "FOUND"
            active_categories.append(cat)
            active_by_code[cat["code"]] = cat
        else:
            cat["status"] = "ERROR"
            error_categories.append(cat)

        normalized_catalog.append(dict(cat))

    included_records: list[dict[str, Any]] = []
    excluded_records: list[dict[str, Any]] = []

    for rec in records:
        validated = validate_synthetic_record(rec)
        cat_code = validated["category_code"]
        if cat_code not in active_by_code:
            excluded_records.append(validated)
            continue
        cat_meta = active_by_code[cat_code]
        enriched = dict(validated)
        enriched["category_name"] = cat_meta["name"]
        enriched["rpt_prefix"] = cat_meta["rpt_prefix"]
        enriched["ems_form_code"] = cat_meta["ems_form_code"]
        enriched["form_type"] = cat_meta["form_type"]
        enriched["rpt_delivery_ref"] = cat_meta["rpt_delivery_ref"]
        included_records.append(enriched)

    return FilteredDispatchData(
        catalog=normalized_catalog,
        active_categories=active_categories,
        skipped_empty_categories=skipped_empty_categories,
        error_categories=error_categories,
        included_records=included_records,
        excluded_records=excluded_records,
    )


# ---------------------------------------------------------------------------
# Pure-Python ISO/IEC 15417 Code 128B Barcode Generator (Rule 4)
# ---------------------------------------------------------------------------

# Complete 107-entry ISO/IEC 15417:2007 bar/space width pattern table:
# Indices 0..105 have 6 widths (B1 S1 B2 S2 B3 S3, sum = 11); index 106 (Stop) has 7 widths (sum = 13).
CODE128_PATTERNS: tuple[str, ...] = (
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
)

CODE128_START_B = 104
CODE128_STOP = 106


def encode_code128b(text: str) -> tuple[list[int], int, str]:
    """Encodes printable ASCII (32..126) into ISO/IEC 15417 Code 128B symbol values & checksum."""
    if not text:
        raise ValueError("Code 128B input must not be empty.")
    values: list[int] = []
    for ch in text:
        code_pt = ord(ch)
        if code_pt < 32 or code_pt > 126:
            raise ValueError(f"Unsupported non-Code128B character {ch!r} (ord={code_pt}).")
        values.append(code_pt - 32)

    weighted_sum = CODE128_START_B + sum(pos * val for pos, val in enumerate(values, start=1))
    checksum = weighted_sum % 103
    symbol_seq = [CODE128_START_B, *values, checksum, CODE128_STOP]
    pattern_str = "".join(CODE128_PATTERNS[sym] for sym in symbol_seq)
    return symbol_seq, checksum, pattern_str


def render_code128b_svg(text: str, quiet_modules: int = 10, bar_height: int = 34) -> tuple[str, int]:
    """Renders crisp inline SVG <rect> bars with >= 10X quiet zones per ISO/IEC 15417."""
    if quiet_modules < 10:
        raise ValueError(f"Quiet zone must be >= 10X per ISO/IEC 15417, got {quiet_modules}.")
    symbol_seq, checksum, _ = encode_code128b(text)

    rects: list[str] = []
    x = quiet_modules
    for sym in symbol_seq:
        widths = [int(w) for w in CODE128_PATTERNS[sym]]
        is_bar = True
        for w in widths:
            if is_bar:
                rects.append(
                    f'<rect x="{x}" y="2" width="{w}" height="{bar_height}" fill="#0f172a" />'
                )
            x += w
            is_bar = not is_bar

    total_width = x + quiet_modules
    svg_height = bar_height + 4
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {total_width} {svg_height}" '
        f'width="100%" height="34" preserveAspectRatio="xMidYMid meet" '
        f'shape-rendering="crispEdges" role="img" '
        f'aria-label="Code 128B barcode for {html.escape(text)}">'
        f'<rect x="0" y="0" width="{total_width}" height="{svg_height}" fill="#ffffff" />'
        + "".join(rects)
        + "</svg>"
    )
    return svg, checksum


# ---------------------------------------------------------------------------
# Logo & Cached Offline Font Loaders
# ---------------------------------------------------------------------------


def build_synthetic_crd_emblem_svg() -> str:
    """Built-in 1:1 locked aspect-ratio synthetic CRD cooperative seal emblem."""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" '
        'preserveAspectRatio="xMidYMid meet" role="img" '
        'aria-label="Synthetic CRD Emblem Logo (1:1 Locked)">'
        '<rect x="2" y="2" width="116" height="116" rx="16" fill="#0f172a" '
        'stroke="#d97706" stroke-width="3" />'
        '<circle cx="60" cy="60" r="46" fill="#1e3a8a" stroke="#fbbf24" stroke-width="2.5" />'
        '<circle cx="60" cy="60" r="39" fill="none" stroke="#93c5fd" stroke-width="1" '
        'stroke-dasharray="3 2" />'
        '<path d="M60 21 L86 32 L86 58 C86 75 74 88 60 96 C46 88 34 75 34 58 L34 32 Z" '
        'fill="#0f172a" stroke="#fbbf24" stroke-width="2" />'
        '<text x="60" y="51" text-anchor="middle" fill="#ffffff" '
        'font-family="Sarabun, sans-serif" font-weight="700" font-size="17">CRD</text>'
        '<text x="60" y="65" text-anchor="middle" fill="#fbbf24" '
        'font-family="Sarabun, sans-serif" font-weight="700" font-size="9.5">WORK 4</text>'
        '<text x="60" y="77" text-anchor="middle" fill="#93c5fd" '
        'font-family="Sarabun, sans-serif" font-weight="700" font-size="6.4">SYNTHETIC</text>'
        "</svg>"
    )


SVG_UNSAFE_EVENT_RE = re.compile(r"(?<![A-Za-z0-9_-])on[a-z]+\s*=", re.IGNORECASE)


def resolve_logo_markup(logo_path: str | None) -> tuple[str, dict[str, Any]]:
    """Loads optional --logo override safely or returns built-in 1:1 synthetic SVG emblem."""
    if not logo_path:
        return build_synthetic_crd_emblem_svg(), {
            "source": "synthetic_builtin_svg",
            "aspect_ratio_locked": "1:1",
            "object_fit": "contain",
        }

    safe_logo = validate_safe_path(logo_path, "logo")
    if not safe_logo.is_file():
        raise FileNotFoundError(f"Logo file not found: {safe_logo}")

    ext = safe_logo.suffix.lower()
    raw = safe_logo.read_bytes()
    if ext in {".png", ".jpg", ".jpeg"}:
        with Image.open(io.BytesIO(raw)) as img:
            img.verify()
        with Image.open(io.BytesIO(raw)) as img:
            width, height = img.size
        if width <= 0 or height <= 0:
            raise GuardrailViolationError(f"Invalid logo dimensions: {width}x{height}")
        mime = "image/png" if ext == ".png" else "image/jpeg"
        b64 = base64.b64encode(raw).decode("ascii")
        markup = f'<img src="data:{mime};base64,{b64}" alt="CRD Dispatch Logo" />'
        return markup, {
            "source": str(safe_logo.resolve()),
            "mime": mime,
            "intrinsic_px": [width, height],
            "aspect_ratio_locked": "1:1",
            "object_fit": "contain",
        }
    if ext == ".svg":
        svg_text = raw.decode("utf-8")
        lowered = svg_text.lower()
        if "<svg" not in lowered:
            raise GuardrailViolationError(f"Invalid SVG logo file: {safe_logo}")
        if (
            "<script" in lowered
            or "window.print" in lowered
            or "<foreignobject" in lowered
            or "javascript:" in lowered
            or SVG_UNSAFE_EVENT_RE.search(svg_text)
        ):
            raise GuardrailViolationError(
                f"Unsafe script or event handler detected inside SVG logo: {safe_logo}"
            )
        b64 = base64.b64encode(raw).decode("ascii")
        markup = f'<img src="data:image/svg+xml;base64,{b64}" alt="CRD Dispatch Logo" />'
        return markup, {
            "source": str(safe_logo.resolve()),
            "mime": "image/svg+xml",
            "aspect_ratio_locked": "1:1",
            "object_fit": "contain",
        }
    raise GuardrailViolationError(
        f"Unsupported logo extension {ext!r}; allowed: .png, .jpg, .jpeg, .svg"
    )


def load_cached_sarabun_fonts() -> dict[str, str]:
    """Loads & validates cached Sarabun OFL TTFs from scripts/fonts/ and returns base64."""
    encoded: dict[str, str] = {}
    for fname, expected_sha in REQUIRED_FONTS.items():
        fpath = FONTS_DIR / fname
        if not fpath.is_file():
            raise FileNotFoundError(
                f"Required offline Thai font missing: {fpath}. Cache Sarabun OFL TTFs first."
            )
        raw = fpath.read_bytes()
        if len(raw) < 50000 or raw[:4] != b"\x00\x01\x00\x00":
            raise ValueError(f"Invalid TrueType font file: {fpath}")
        actual_sha = hashlib.sha256(raw).hexdigest()
        if actual_sha != expected_sha:
            raise ValueError(
                f"Font SHA-256 mismatch for {fpath}: expected {expected_sha}, got {actual_sha}"
            )
        # Confirm Pillow parses the font cleanly
        ImageFont.truetype(str(fpath), 16)
        encoded[fname] = base64.b64encode(raw).decode("ascii")
    return encoded


# ---------------------------------------------------------------------------
# HTML / CSS Document Builder (Single-Page A4 Portrait)
# ---------------------------------------------------------------------------


def format_thai_period_label(year: str, month: str) -> tuple[str, int]:
    if not re.match(r"^\d{4}$", year):
        raise ValueError(f"Invalid --year (expected YYYY): {year!r}")
    if month not in THAI_MONTHS:
        raise ValueError(f"Invalid --month (expected 01..12): {month!r}")
    y_num = int(year)
    be_year = y_num + 543 if y_num < 2400 else y_num
    return f"{THAI_MONTHS[month]} {be_year} ({year}-{month})", be_year


def build_dispatch_html(
    filtered: FilteredDispatchData,
    fonts_b64: dict[str, str],
    logo_markup: str,
    run_id: str,
    year: str,
    month: str,
    branch: str,
    generated_at_iso: str,
) -> tuple[str, list[dict[str, Any]]]:
    """Builds single-page A4 Portrait HTML with inline Sarabun TTFs and Code 128B SVGs."""
    period_label, _ = format_thai_period_label(year, month)
    assert_no_real_pii_text(branch, "branch")

    skipped_labels = ", ".join(
        f"{c['code']} ({c['name']})" for c in filtered.skipped_empty_categories
    ) or "ไม่มี"
    error_labels = ", ".join(
        f"{c['code']} ({c['name']} • {c.get('error_code', 'ERROR')})"
        for c in filtered.error_categories
    ) or "ไม่มี"
    skipped_codes_str = ", ".join(c["code"] for c in filtered.skipped_empty_categories) or "ไม่มี"
    error_codes_str = ", ".join(c["code"] for c in filtered.error_categories) or "ไม่มี"
    if filtered.catalog:
        cat_codes = [c["code"] for c in filtered.catalog]
        cat_range_label = cat_codes[0] if len(cat_codes) == 1 else f"{cat_codes[0]}–{cat_codes[-1]}"
    else:
        cat_range_label = "ไม่มี"
    readonly_prefixes = ", ".join(
        sorted({r["rpt_prefix"] for r in filtered.included_records})
    ) or "ไม่มีหมวดที่มีข้อมูล"

    cat_pills_html: list[str] = []
    for cat in filtered.catalog:
        st = cat["status"]
        if st == "FOUND":
            cls = "pill pill-active"
            badge = f"{cat['record_count']} ราย"
        elif st == "SKIPPED_EMPTY":
            cls = "pill pill-skipped"
            badge = "SKIPPED_EMPTY"
        else:
            cls = "pill pill-error"
            badge = "ERROR (0)"
        cat_pills_html.append(
            f'<span class="{cls}">'
            f'<strong>{html.escape(cat["code"])}</strong> '
            f'{html.escape(cat["name"])} '
            f'<span class="pill-tag">{html.escape(badge)}</span>'
            f"</span>"
        )

    rows_html: list[str] = []
    enriched_records: list[dict[str, Any]] = []
    for rec in filtered.included_records:
        svg_barcode, checksum = render_code128b_svg(rec["ems_code"], quiet_modules=10, bar_height=34)
        rec_out = dict(rec)
        rec_out["code128_checksum"] = checksum
        enriched_records.append(rec_out)

        rows_html.append(
            "<tr>"
            f'<td class="col-seq">{int(rec["seq_no"])}</td>'
            f'<td class="col-member">{html.escape(rec["member_id"])}</td>'
            f'<td class="col-contract">{html.escape(rec["contract_no"])}</td>'
            f'<td class="col-name">'
            f'<div class="name-main">{html.escape(rec["recipient_name"])}</div>'
            f'<div class="name-sub">ข้อมูลสมมติ • ปลอด PII 100%</div>'
            f"</td>"
            f'<td class="col-cat">'
            f'<div class="cat-main">{html.escape(rec["category_code"])} • {html.escape(rec["category_name"])}</div>'
            f'<div class="cat-sub">{html.escape(rec["rpt_prefix"])} (Read-Only) • {html.escape(rec["ems_form_code"])}</div>'
            f"</td>"
            f'<td class="col-ems">'
            f'<div class="barcode-box">{svg_barcode}'
            f'<div class="ems-text">{html.escape(rec["ems_code"])}</div>'
            f"</div>"
            f"</td>"
            "</tr>"
        )

    record_count_label = f"{len(enriched_records)} Synthetic Record{'s' if len(enriched_records) != 1 else ''}"
    title_text = f"ใบนำส่ง (Dispatch Cover Sheet) - {PAPER_FLAG} / NO_AUTO_PRINT"
    doc_html = f"""<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8" />
<title>{html.escape(title_text)}</title>
<style>
@font-face {{
  font-family: 'Sarabun';
  font-style: normal;
  font-weight: 400;
  src: url('data:font/ttf;base64,{fonts_b64["Sarabun-Regular.ttf"]}') format('truetype');
}}
@font-face {{
  font-family: 'Sarabun';
  font-style: normal;
  font-weight: 700;
  src: url('data:font/ttf;base64,{fonts_b64["Sarabun-Bold.ttf"]}') format('truetype');
}}

@page {{
  size: A4 portrait;
  margin: 12mm;
}}

* {{
  box-sizing: border-box;
}}

html, body {{
  margin: 0;
  padding: 0;
  background: #ffffff;
  color: #0f172a;
  font-family: 'Sarabun', sans-serif;
  font-weight: 400;
  font-size: 9.5pt;
  line-height: 1.45;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}}

strong, b, th, h1, h2, h3 {{
  font-weight: 700;
}}

.page-sheet {{
  position: relative;
  width: 100%;
  min-height: 262mm;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 3.5mm;
}}

.watermark {{
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-32deg);
  font-size: 21pt;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: rgba(185, 28, 28, 0.055);
  white-space: nowrap;
  pointer-events: none;
  z-index: 0;
  user-select: none;
}}

.layer-top {{
  position: relative;
  z-index: 2;
}}

.header-card {{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4mm;
  padding: 3.5mm 4mm;
  border: 1.5px solid #1e3a8a;
  border-radius: 6px;
  background: #f8fafc;
}}

.logo-frame {{
  width: 22mm;
  height: 22mm;
  aspect-ratio: 1 / 1;
  flex: 0 0 22mm;
  border: 1.5px solid #1e3a8a;
  border-radius: 6px;
  padding: 1.5mm;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}}

.logo-frame img,
.logo-frame svg {{
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  display: block;
}}

.header-center {{
  flex: 1 1 auto;
  min-width: 0;
}}

.doc-kicker {{
  font-size: 8pt;
  font-weight: 700;
  color: #1e3a8a;
  letter-spacing: 0.03em;
  margin-bottom: 0.5mm;
}}

.doc-title {{
  margin: 0;
  font-size: 13pt;
  font-weight: 700;
  line-height: 1.3;
  color: #0f172a;
}}

.doc-subtitle {{
  font-size: 9pt;
  color: #334155;
  margin-top: 0.5mm;
}}

.meta-grid {{
  display: flex;
  flex-wrap: wrap;
  gap: 1.5mm 4mm;
  margin-top: 1.8mm;
  font-size: 8.5pt;
  color: #1e293b;
}}

.header-badges {{
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1.4mm;
  flex: 0 0 auto;
}}

.badge {{
  display: inline-block;
  padding: 0.8mm 2.5mm;
  border-radius: 4px;
  font-size: 8pt;
  font-weight: 700;
  white-space: nowrap;
}}

.badge-noprint {{
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #dc2626;
}}

.badge-paper0 {{
  background: #fffbeb;
  color: #92400e;
  border: 1px solid #d97706;
}}

.badge-synthetic {{
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #059669;
}}

.summary-section {{
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 3mm 3.5mm;
  background: #ffffff;
}}

.summary-grid {{
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2.5mm;
}}

.stat-box {{
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  padding: 2mm 2.5mm;
  background: #f8fafc;
}}

.stat-box.stat-skipped {{
  background: #fffbeb;
  border-color: #fcd34d;
}}

.stat-box.stat-error {{
  background: #fef2f2;
  border-color: #fca5a5;
}}

.stat-label {{
  font-size: 7.8pt;
  color: #475569;
  font-weight: 700;
}}

.stat-value {{
  font-size: 11pt;
  font-weight: 700;
  color: #0f172a;
  margin-top: 0.5mm;
}}

.stat-detail {{
  font-size: 7.6pt;
  color: #334155;
  margin-top: 0.5mm;
  line-height: 1.35;
}}

.catalog-strip {{
  display: flex;
  flex-wrap: wrap;
  gap: 1.4mm;
  margin-top: 2.5mm;
  padding-top: 2.2mm;
  border-top: 1px dashed #cbd5e1;
}}

.pill {{
  display: inline-flex;
  align-items: center;
  gap: 1mm;
  padding: 0.6mm 1.8mm;
  border-radius: 4px;
  font-size: 7.5pt;
  border: 1px solid #cbd5e1;
}}

.pill-active {{
  background: #eff6ff;
  border-color: #93c5fd;
  color: #1e3a8a;
}}

.pill-skipped {{
  background: #fefce8;
  border-color: #fde047;
  color: #854d0e;
}}

.pill-error {{
  background: #fef2f2;
  border-color: #fca5a5;
  color: #991b1b;
}}

.pill-tag {{
  font-weight: 700;
  font-size: 7pt;
}}

.guard-banner {{
  margin-top: 2mm;
  padding: 1.3mm 2.5mm;
  border-radius: 4px;
  background: #f1f5f9;
  border-left: 3px solid #1e3a8a;
  font-size: 8pt;
  color: #1e293b;
}}

.table-section {{
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 3mm 3.5mm;
  background: #ffffff;
}}

.section-heading {{
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 3mm;
  margin-bottom: 2.2mm;
}}

.section-heading h2 {{
  margin: 0;
  font-size: 10.5pt;
  color: #0f172a;
}}

.section-heading span {{
  font-size: 7.8pt;
  color: #475569;
  white-space: nowrap;
}}

table.dispatch-table {{
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}}

table.dispatch-table th {{
  background: #1e3a8a;
  color: #ffffff;
  font-size: 8.5pt;
  font-weight: 700;
  text-align: left;
  padding: 2.2mm 2mm;
  border: 1px solid #1e3a8a;
  line-height: 1.35;
}}

table.dispatch-table th.col-seq,
table.dispatch-table td.col-seq {{
  width: 5%;
  text-align: center;
}}

table.dispatch-table th.col-member,
table.dispatch-table td.col-member {{
  width: 9%;
  text-align: center;
}}

table.dispatch-table th.col-contract,
table.dispatch-table td.col-contract {{
  width: 19%;
}}

table.dispatch-table th.col-name,
table.dispatch-table td.col-name {{
  width: 24%;
}}

table.dispatch-table th.col-cat,
table.dispatch-table td.col-cat {{
  width: 18%;
}}

table.dispatch-table th.col-ems,
table.dispatch-table td.col-ems {{
  width: 25%;
  text-align: center;
}}

table.dispatch-table td {{
  padding: 2.6mm 2mm;
  border: 1px solid #cbd5e1;
  vertical-align: middle;
  background: #ffffff;
  font-size: 8.8pt;
  line-height: 1.45;
  overflow-wrap: break-word;
}}

table.dispatch-table tr:nth-child(even) td {{
  background: #f8fafc;
}}

.col-seq, .col-member {{
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}}

.col-contract {{
  font-weight: 700;
  font-size: 8.2pt;
  color: #0f172a;
  white-space: nowrap;
}}

.name-main {{
  font-weight: 700;
  font-size: 8.5pt;
  color: #0f172a;
}}

.name-sub, .cat-sub {{
  font-size: 7.5pt;
  color: #475569;
  margin-top: 0.4mm;
}}

.cat-main {{
  font-weight: 700;
  color: #1e3a8a;
}}

.barcode-box {{
  position: relative;
  z-index: 3;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  padding: 1.5mm 1.5mm 1mm 1.5mm;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}}

.barcode-box svg {{
  display: block;
  width: 100%;
  max-width: 44mm;
  height: 9mm;
}}

.ems-text {{
  margin-top: 0.8mm;
  font-size: 8.5pt;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #0f172a;
}}

.bottom-stack {{
  display: flex;
  flex-direction: column;
  gap: 2.5mm;
}}

.handover-notice {{
  text-align: center;
  padding: 1.6mm 3mm;
  border: 1px dashed #dc2626;
  border-radius: 4px;
  background: #fef2f2;
  color: #991b1b;
  font-size: 8.3pt;
  font-weight: 700;
}}

.signoff-grid {{
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3mm;
}}

.signoff-box {{
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 2.5mm 3mm;
  background: #f8fafc;
  min-height: 27mm;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}}

.signoff-title {{
  font-size: 8.3pt;
  font-weight: 700;
  color: #1e3a8a;
}}

.signoff-line {{
  border-bottom: 1px dotted #64748b;
  height: 9mm;
  margin: 1mm 0;
}}

.signoff-meta {{
  font-size: 7.5pt;
  color: #475569;
  line-height: 1.35;
}}

.page-footer {{
  border-top: 1.5px solid #1e3a8a;
  padding-top: 1.8mm;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 7.8pt;
  color: #334155;
}}
</style>
</head>
<body>
<div class="watermark">SYNTHETIC DATA ONLY • NO_AUTO_PRINT • Paper=0</div>

<div class="page-sheet">
  <div class="layer-top" style="display:flex; flex-direction:column; gap:3.5mm;">
    <header class="header-card">
      <div class="logo-frame">{logo_markup}</div>
      <div class="header-center">
        <div class="doc-kicker">CRD WORK 4 — ระบบออกใบนำส่งเอกสารลงทะเบียน / EMS (Synthetic Sample)</div>
        <h1 class="doc-title">ใบนำส่งเอกสาร EMS — WORK 4 (Dispatch Cover Sheet)</h1>
        <div class="doc-subtitle">บัญชีคุมการนำส่งหนังสือบอกกล่าวการชำระหนี้ • ตรวจสอบรูปแบบก่อนพิมพ์จริง</div>
        <div class="meta-grid">
          <span><strong>งวดข้อมูล:</strong> {html.escape(period_label)}</span>
          <span><strong>สาขา:</strong> {html.escape(branch)}</span>
          <span><strong>ชุดงาน:</strong> {html.escape(run_id)}</span>
          <span><strong>สร้างเมื่อ:</strong> {html.escape(generated_at_iso)}</span>
        </div>
      </div>
      <div class="header-badges">
        <span class="badge badge-noprint">NO_AUTO_PRINT</span>
        <span class="badge badge-paper0">Paper=0 (ไม่สั่งพิมพ์)</span>
        <span class="badge badge-synthetic">SYNTHETIC_DATA_ONLY</span>
      </div>
    </header>

    <section class="summary-section">
      <div class="summary-grid">
        <div class="stat-box">
          <div class="stat-label">หมวดมาตรฐาน WORK 4</div>
          <div class="stat-value">{len(filtered.catalog)} หมวด ({html.escape(cat_range_label)})</div>
          <div class="stat-detail">ประเมินครบทุกหมวดตามข้อกำหนด</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">หมวดที่มีข้อมูล (Active)</div>
          <div class="stat-value">{len(filtered.active_categories)} หมวด ({len(enriched_records)} ตัวอย่าง)</div>
          <div class="stat-detail">คัดเฉพาะหมวดที่มีข้อมูลจริง</div>
        </div>
        <div class="stat-box stat-skipped">
          <div class="stat-label">ข้ามอัตโนมัติ (SKIPPED_EMPTY)</div>
          <div class="stat-value">{len(filtered.skipped_empty_categories)} หมวด (0 รายการ)</div>
          <div class="stat-detail">{html.escape(skipped_labels)}</div>
        </div>
        <div class="stat-box stat-error">
          <div class="stat-label">งดสร้างใบนำส่ง (ERROR / 0 แถว)</div>
          <div class="stat-value">{len(filtered.error_categories)} หมวด</div>
          <div class="stat-detail">{html.escape(error_labels)}</div>
        </div>
      </div>

      <div class="catalog-strip">{"".join(cat_pills_html)}</div>

      <div class="guard-banner">
        <strong>มาตรการควบคุมความปลอดภัย:</strong>
        ห้ามค้นหาไดรฟ์ <strong>R:</strong> และ <strong>S:</strong> •
        อ้างอิง <strong>.RPT แบบ Read-Only เท่านั้น</strong> ({html.escape(readonly_prefixes)}) •
        คัดหมวดว่างออกอัตโนมัติ (<strong>SKIPPED_EMPTY</strong>: {html.escape(skipped_codes_str)}) และไม่รวมหมวด ERROR ({html.escape(error_codes_str)})
      </div>
    </section>

    <section class="table-section">
      <div class="section-heading">
        <h2>รายการนำส่งเอกสารตัวอย่าง ({html.escape(record_count_label)} • Active Only)</h2>
        <span>รหัส Task: {html.escape(TASK_ID)}</span>
      </div>
      <table class="dispatch-table">
        <thead>
          <tr>
            <th class="col-seq">ลำดับ</th>
            <th class="col-member">รหัสสมาชิก</th>
            <th class="col-contract">เลขที่สัญญา (Mock)</th>
            <th class="col-name">ชื่อ-นามสกุลผู้รับ (Synthetic)</th>
            <th class="col-cat">หมวด / .RPT (Read-Only)</th>
            <th class="col-ems">เลข EMS 13 หลัก &amp; บาร์โค้ด (Code 128B)</th>
          </tr>
        </thead>
        <tbody>
          {"".join(rows_html)}
        </tbody>
      </table>
    </section>
  </div>

  <div class="layer-top bottom-stack">
    <div class="handover-notice">
      SYNTHETIC SAMPLE ONLY — DO NOT DISPATCH REAL MAIL • ข้อมูลสมมติทั้งหมดเพื่อการตรวจสอบรูปแบบ (NO_AUTO_PRINT / Paper=0)
    </div>

    <section class="signoff-grid">
      <div class="signoff-box">
        <div class="signoff-title">1. ผู้จัดทำ / ตรวจสอบข้อมูล (Prepared By)</div>
        <div class="signoff-line"></div>
        <div class="signoff-meta">ลงชื่อ ....................................................<br />สถานะ: ข้อมูลสมมติ {len(enriched_records)} รายการ • ปลอด PII</div>
      </div>
      <div class="signoff-box">
        <div class="signoff-title">2. ผู้ตรวจทาน / หัวหน้างาน (Checked By)</div>
        <div class="signoff-line"></div>
        <div class="signoff-meta">ลงชื่อ ....................................................<br />ตรวจสอบหมวด SKIPPED_EMPTY ครบถ้วน</div>
      </div>
      <div class="signoff-box">
        <div class="signoff-title">3. ไปรษณีย์ผู้รับฝาก (Post Office Receipt)</div>
        <div class="signoff-line"></div>
        <div class="signoff-meta">จำนวนฝากส่ง: {len(enriched_records)} ชิ้น (Mock EMS)<br />ประทับตราประจำวัน (ตัวอย่างเท่านั้น)</div>
      </div>
    </section>

    <footer class="page-footer">
      <span><strong>NO_AUTO_PRINT / Paper=0</strong> • .RPT Read-Only • R:/S: Guard Active • Zero-PII Synthetic Sample</span>
      <span>A4 Portrait (210 × 297 mm) • Font: Sarabun OFL • หน้า 1 / 1</span>
    </footer>
  </div>
</div>
</body>
</html>
"""
    return doc_html, enriched_records


def format_pdf_subject(filtered: FilteredDispatchData, year: str, month: str) -> str:
    """Formats PDF /Subject metadata dynamically from filtered catalog results."""
    skipped_codes = ",".join(c["code"] for c in filtered.skipped_empty_categories) or "NONE"
    error_codes = ",".join(c["code"] for c in filtered.error_categories) or "NONE"
    return (
        f"WORK 4 Dispatch Cover Sheet A4 | {year}-{month} | "
        f"SKIPPED_EMPTY: {skipped_codes} | ERROR: {error_codes} | "
        f"RECORDS: {len(filtered.included_records)} | NO_AUTO_PRINT / Paper=0"
    )


# ---------------------------------------------------------------------------
# Headless Browser Discovery, Rendering & Incremental PDF /Info Patching
# ---------------------------------------------------------------------------


def discover_browser_binary(explicit_browser: str | None) -> Path:
    """Finds Chromium/Chrome/Edge cross-platform without touching R:/S:."""
    if explicit_browser:
        candidate = validate_safe_path(explicit_browser, "browser")
        if candidate.is_file():
            return candidate
        raise FileNotFoundError(f"Browser binary not found: {candidate}")

    env_browser = os.environ.get("CRD_CHROMIUM_BIN")
    if env_browser:
        candidate = validate_safe_path(env_browser, "browser")
        if candidate.is_file():
            return candidate

    raw_path_env = os.environ.get("PATH", "")
    safe_path_entries: list[str] = []
    for entry in raw_path_env.split(os.pathsep):
        if not entry.strip():
            continue
        try:
            validate_safe_path(entry, "browser")
        except GuardrailViolationError:
            continue
        safe_path_entries.append(entry)
    safe_path_env = os.pathsep.join(safe_path_entries)

    for name in ("chromium", "chromium-browser", "google-chrome", "msedge", "chrome"):
        found = shutil.which(name, path=safe_path_env)
        if found:
            try:
                safe_bin = validate_safe_path(found, "browser")
            except GuardrailViolationError:
                continue
            if safe_bin.is_file():
                return safe_bin

    linux_candidates = [
        Path("/usr/bin/chromium"),
        Path("/usr/lib/chromium/chromium"),
        Path("/usr/bin/chromium-browser"),
        Path("/usr/bin/google-chrome"),
    ]
    for p in linux_candidates:
        try:
            safe_p = validate_safe_path(p, "browser")
        except GuardrailViolationError:
            continue
        if safe_p.is_file():
            return safe_p

    if sys.platform == "win32":
        win_roots = [
            os.environ.get("PROGRAMFILES", r"C:\Program Files"),
            os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)"),
            os.environ.get("LOCALAPPDATA", ""),
        ]
        rel_bins = [
            r"Microsoft\Edge\Application\msedge.exe",
            r"Google\Chrome\Application\chrome.exe",
        ]
        for root in win_roots:
            if not root:
                continue
            try:
                validate_safe_path(root, "browser")
            except GuardrailViolationError:
                continue
            for rel in rel_bins:
                try:
                    p = validate_safe_path(Path(root) / rel, "browser")
                except GuardrailViolationError:
                    continue
                if p.is_file():
                    return p

    raise FileNotFoundError("No headless Chromium/Chrome/Edge binary found.")


def _pdf_encode_string(text: str) -> bytes:
    """Encodes a PDF metadata string cleanly (ASCII literal or UTF-16BE BOM hex)."""
    if text.isascii():
        escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        return f"({escaped})".encode("ascii")
    return ("<FEFF" + text.encode("utf-16-be").hex().upper() + ">").encode("ascii")


def _pdf_decode_string(raw_val: bytes) -> str:
    """Decodes a PDF string literal (...) or hex string <...> into Python str."""
    val = raw_val.strip()
    if val.startswith(b"<") and val.endswith(b">"):
        hex_chars = re.sub(rb"\s+", b"", val[1:-1])
        if len(hex_chars) % 2 == 1:
            hex_chars += b"0"
        try:
            raw_bytes = bytes.fromhex(hex_chars.decode("ascii"))
        except ValueError:
            return ""
        if raw_bytes.startswith(b"\xfe\xff"):
            return raw_bytes[2:].decode("utf-16-be", errors="replace")
        if raw_bytes.startswith(b"\xff\xfe"):
            return raw_bytes[2:].decode("utf-16-le", errors="replace")
        return raw_bytes.decode("latin1", errors="replace")

    if val.startswith(b"(") and val.endswith(b")"):
        inner = val[1:-1]
        out = bytearray()
        i = 0
        n = len(inner)
        esc_map = {
            ord("n"): 10,
            ord("r"): 13,
            ord("t"): 9,
            ord("b"): 8,
            ord("f"): 12,
            ord("("): ord("("),
            ord(")"): ord(")"),
            ord("\\"): ord("\\"),
        }
        while i < n:
            b = inner[i]
            if b == ord("\\") and i + 1 < n:
                nxt = inner[i + 1]
                if nxt in esc_map:
                    out.append(esc_map[nxt])
                    i += 2
                elif nxt in b"\r\n":
                    i += 2
                    if nxt == ord("\r") and i < n and inner[i] == ord("\n"):
                        i += 1
                elif ord("0") <= nxt <= ord("7"):
                    oct_digits = bytes([nxt])
                    j = i + 2
                    while j < min(n, i + 4) and ord("0") <= inner[j] <= ord("7"):
                        oct_digits += bytes([inner[j]])
                        j += 1
                    out.append(int(oct_digits, 8) & 0xFF)
                    i = j
                else:
                    out.append(nxt)
                    i += 2
            else:
                out.append(b)
                i += 1
        raw_bytes = bytes(out)
        if raw_bytes.startswith(b"\xfe\xff"):
            return raw_bytes[2:].decode("utf-16-be", errors="replace")
        return raw_bytes.decode("utf-8", errors="replace")

    return val.decode("latin1", errors="replace")


def _extract_pdf_dict_entries(dict_body: bytes) -> dict[bytes, bytes]:
    """Parses top-level /Key Value pairs from a PDF dictionary body (no regex shortcuts)."""
    entries: dict[bytes, bytes] = {}
    i = 0
    n = len(dict_body)

    def skip_ws(pos: int) -> int:
        while pos < n and dict_body[pos : pos + 1] in b" \t\r\n\f\x00":
            pos += 1
        return pos

    while i < n:
        i = skip_ws(i)
        if i >= n:
            break
        if dict_body[i : i + 1] != b"/":
            i += 1
            continue
        k_start = i
        i += 1
        while i < n and dict_body[i : i + 1] not in b" \t\r\n\f\x00/<>[](){}":
            i += 1
        key = dict_body[k_start:i]
        i = skip_ws(i)
        if i >= n:
            break

        v_start = i
        ch = dict_body[i : i + 1]
        if ch == b"(":
            depth = 0
            while i < n:
                cur = dict_body[i : i + 1]
                if cur == b"\\":
                    i += 2
                    continue
                if cur == b"(":
                    depth += 1
                elif cur == b")":
                    depth -= 1
                    if depth == 0:
                        i += 1
                        break
                i += 1
        elif dict_body[i : i + 2] == b"<<":
            depth = 0
            while i < n:
                if dict_body[i : i + 2] == b"<<":
                    depth += 1
                    i += 2
                elif dict_body[i : i + 2] == b">>":
                    depth -= 1
                    i += 2
                    if depth == 0:
                        break
                else:
                    i += 1
        elif ch == b"<":
            end_hex = dict_body.find(b">", i + 1)
            i = (end_hex + 1) if end_hex != -1 else n
        elif ch == b"[":
            depth = 0
            while i < n:
                cur = dict_body[i : i + 1]
                if cur == b"[":
                    depth += 1
                elif cur == b"]":
                    depth -= 1
                    if depth == 0:
                        i += 1
                        break
                i += 1
        else:
            # Handle numeric scalar, boolean, name, or indirect ref `N G R`
            while i < n and dict_body[i : i + 1] not in b" \t\r\n\f\x00/<>[](){}":
                i += 1
            # Check for `G R` if indirect reference
            peek = skip_ws(i)
            m_ref = re.match(rb"(\d+)\s+R(?=[ \t\r\n\f/<>\[\](){}]|$)", dict_body[peek:])
            if m_ref and dict_body[v_start:i].isdigit():
                i = peek + m_ref.end()

        entries[key] = dict_body[v_start:i].strip()
    return entries


def patch_pdf_info_metadata(
    pdf_path: Path,
    title: str,
    author: str,
    subject: str,
    keywords: str,
) -> None:
    """Applies a pure-Python PDF 1.4 incremental /Info update preserving existing keys."""
    assert_rpt_write_prohibited(pdf_path)
    raw = pdf_path.read_bytes()
    startxref_matches = list(re.finditer(rb"startxref\s+(\d+)\s+%%EOF", raw))
    if not startxref_matches:
        raise ValueError("Unable to locate startxref in generated PDF.")
    last_sx = startxref_matches[-1]
    prev_xref_offset = int(last_sx.group(1))

    trailer_search_start = max(0, prev_xref_offset)
    trailer_m = re.search(
        rb"trailer\s*<<(.*?)>>\s*startxref",
        raw[trailer_search_start:],
        flags=re.DOTALL,
    )
    if not trailer_m:
        raise ValueError("Unable to locate PDF trailer dictionary for incremental /Info patch.")

    trailer_body = trailer_m.group(1)
    size_m = re.search(rb"/Size\s+(\d+)", trailer_body)
    root_m = re.search(rb"/Root\s+(\d+\s+\d+\s+R)", trailer_body)
    if not size_m or not root_m:
        raise ValueError("PDF trailer missing /Size or /Root.")

    orig_size = int(size_m.group(1))
    root_ref = root_m.group(1)

    info_m = re.search(rb"/Info\s+(\d+)\s+(\d+)\s+R", trailer_body)
    preserved_entries: dict[bytes, bytes] = {}
    if info_m:
        info_obj_num = int(info_m.group(1))
        new_size = orig_size
        obj_pat = re.compile(
            rb"(?:^|[\r\n])" + str(info_obj_num).encode("ascii") + rb"\s+0\s+obj\s*<<(.*?)>>\s*endobj",
            flags=re.DOTALL,
        )
        existing_info_m = obj_pat.search(raw)
        if existing_info_m:
            preserved_entries = _extract_pdf_dict_entries(existing_info_m.group(1))
    else:
        info_obj_num = orig_size
        new_size = orig_size + 1

    preserved_entries[b"/Title"] = _pdf_encode_string(title)
    preserved_entries[b"/Author"] = _pdf_encode_string(author)
    preserved_entries[b"/Subject"] = _pdf_encode_string(subject)
    preserved_entries[b"/Keywords"] = _pdf_encode_string(keywords)

    buf = io.BytesIO()
    buf.write(raw)
    if not raw.endswith(b"\n"):
        buf.write(b"\n")

    obj_offset = buf.tell()
    buf.write(f"{info_obj_num} 0 obj\n<<\n".encode("ascii"))
    for k, v in preserved_entries.items():
        buf.write(k + b" " + v + b"\n")
    buf.write(b">>\nendobj\n")

    new_xref_offset = buf.tell()
    buf.write(b"xref\n")
    buf.write(b"0 1\n0000000000 65535 f \n")
    buf.write(f"{info_obj_num} 1\n{obj_offset:010d} 00000 n \n".encode("ascii"))
    buf.write(
        b"trailer\n<< /Size "
        + str(new_size).encode("ascii")
        + b" /Root "
        + root_ref
        + b" /Info "
        + f"{info_obj_num} 0 R".encode("ascii")
        + b" /Prev "
        + str(prev_xref_offset).encode("ascii")
        + b" >>\nstartxref\n"
        + str(new_xref_offset).encode("ascii")
        + b"\n%%EOF\n"
    )
    pdf_path.write_bytes(buf.getvalue())


def render_html_to_pdf_chromium(
    html_content: str,
    output_pdf: Path,
    browser_bin: Path,
) -> None:
    """Renders HTML to A4 PDF via headless Chromium using strict --flag=value syntax."""
    assert_rpt_write_prohibited(output_pdf)
    if output_pdf.is_symlink():
        raise GuardrailViolationError(
            f"Rule 3a violation: symlink output target is strictly prohibited: {output_pdf}"
        )
    abs_output_pdf = output_pdf.resolve(strict=False)
    assert_rpt_write_prohibited(abs_output_pdf)
    validate_safe_path(abs_output_pdf, "output")
    output_pdf.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="crd_a4_cover_") as tmpdir:
        tmp_path = Path(tmpdir)
        profile_dir = tmp_path / "profile"
        profile_dir.mkdir(parents=True, exist_ok=True)
        html_path = tmp_path / "dispatch_cover_a4.html"
        html_path.write_text(html_content, encoding="utf-8")

        cmd = [
            str(browser_bin),
            "--headless",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--disable-background-networking",
            "--no-first-run",
            "--no-default-browser-check",
            "--no-pdf-header-footer",
            "--run-all-compositor-stages-before-draw",
            "--virtual-time-budget=2000",
            f"--user-data-dir={profile_dir}",
            f"--print-to-pdf={abs_output_pdf}",
            html_path.as_uri(),
        ]
        # Capture stdout/stderr so Chromium/udev/D-Bus warnings never pollute --json-report stdout
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if proc.returncode != 0:
            raise RuntimeError(
                f"Headless browser exited {proc.returncode}: {proc.stderr.strip()}"
            )

    if not abs_output_pdf.is_file() or abs_output_pdf.stat().st_size < 5000:
        raise RuntimeError(f"Generated PDF missing or too small: {abs_output_pdf}")
    if not abs_output_pdf.read_bytes().startswith(b"%PDF-"):
        raise RuntimeError(f"Generated file does not have %PDF- signature: {abs_output_pdf}")


# ---------------------------------------------------------------------------
# Post-Generation PDF Verification (Poppler + Pure-Python Fallback + Security)
# ---------------------------------------------------------------------------


def strip_pdf_streams(raw: bytes) -> bytes:
    """Removes PDF stream payload bytes so dictionary keys are inspected without font/image noise."""
    return re.sub(rb"stream\r?\n.*?\r?\n?endstream", b"stream\nendstream", raw, flags=re.DOTALL)


def _parse_pdf_objects(non_stream: bytes) -> dict[tuple[int, int], bytes]:
    """Parses indirect objects from non-stream PDF bytes (latest incremental object wins)."""
    objs: dict[tuple[int, int], bytes] = {}
    for m in re.finditer(rb"(?:^|[\r\n])\s*(\d+)\s+(\d+)\s+obj\b(.*?)endobj", non_stream, flags=re.DOTALL):
        objs[(int(m.group(1)), int(m.group(2)))] = m.group(3)
    return objs


def _extract_outer_dict_body(obj_body: bytes) -> bytes:
    """Extracts the first top-level << ... >> dictionary body from a PDF object body."""
    start = obj_body.find(b"<<")
    if start == -1:
        return b""
    i = start + 2
    depth = 1
    n = len(obj_body)
    while i < n and depth > 0:
        if obj_body[i : i + 2] == b"<<":
            depth += 1
            i += 2
        elif obj_body[i : i + 2] == b">>":
            depth -= 1
            if depth == 0:
                return obj_body[start + 2 : i]
            i += 2
        else:
            i += 1
    return obj_body[start + 2 :]


def _extract_pdf_metadata_fallback(
    non_stream: bytes,
    objs: dict[tuple[int, int], bytes],
) -> tuple[int, float, float, bool, str, str]:
    """Pure-Python fallback for page count, A4 MediaBox, and /Info metadata when pdfinfo is absent."""
    trailers = list(re.finditer(rb"trailer\s*<<(.*?)>>", non_stream, flags=re.DOTALL))
    root_ref: tuple[int, int] | None = None
    info_ref: tuple[int, int] | None = None
    for tm in reversed(trailers):
        tbody = tm.group(1)
        if root_ref is None:
            rm = re.search(rb"/Root\s+(\d+)\s+(\d+)\s+R", tbody)
            if rm:
                root_ref = (int(rm.group(1)), int(rm.group(2)))
        if info_ref is None:
            im = re.search(rb"/Info\s+(\d+)\s+(\d+)\s+R", tbody)
            if im:
                info_ref = (int(im.group(1)), int(im.group(2)))

    title_line = ""
    keywords_line = ""
    if info_ref and info_ref in objs:
        info_dict = _extract_pdf_dict_entries(_extract_outer_dict_body(objs[info_ref]))
        if b"/Title" in info_dict:
            title_line = _pdf_decode_string(info_dict[b"/Title"])
        if b"/Keywords" in info_dict:
            keywords_line = _pdf_decode_string(info_dict[b"/Keywords"])

    pages = 0
    width_pts = 0.0
    height_pts = 0.0
    is_a4 = False

    pages_ref: tuple[int, int] | None = None
    if root_ref and root_ref in objs:
        pm = re.search(rb"/Pages\s+(\d+)\s+(\d+)\s+R", objs[root_ref])
        if pm:
            pages_ref = (int(pm.group(1)), int(pm.group(2)))

    def find_mediabox(node_ref: tuple[int, int], inherited_box: bytes | None = None) -> bytes | None:
        body = objs.get(node_ref, b"")
        mb_m = re.search(
            rb"/MediaBox\s*\[\s*([+-]?[\d.]+)\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)\s*\]",
            body,
        )
        cur_box = mb_m.group(0) if mb_m else inherited_box
        kids_m = re.search(rb"/Kids\s*\[(.*?)\]", body, flags=re.DOTALL)
        if kids_m:
            for km in re.finditer(rb"(\d+)\s+(\d+)\s+R", kids_m.group(1)):
                found = find_mediabox((int(km.group(1)), int(km.group(2))), cur_box)
                if found:
                    return found
        return cur_box

    box_bytes: bytes | None = None
    if pages_ref and pages_ref in objs:
        pages_body = objs[pages_ref]
        cnt_m = re.search(rb"/Count\s+(\d+)", pages_body)
        if cnt_m:
            pages = int(cnt_m.group(1))
        box_bytes = find_mediabox(pages_ref)
    else:
        for body in objs.values():
            if re.search(rb"/Type\s*/Pages\b", body):
                cnt_m = re.search(rb"/Count\s+(\d+)", body)
                if cnt_m:
                    pages = int(cnt_m.group(1))
                    break
        for body in objs.values():
            mb_m = re.search(
                rb"/MediaBox\s*\[\s*([+-]?[\d.]+)\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)\s*\]",
                body,
            )
            if mb_m:
                box_bytes = mb_m.group(0)
                break

    if box_bytes:
        mb_nums = re.search(
            rb"\[\s*([+-]?[\d.]+)\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)\s*\]",
            box_bytes,
        )
        if mb_nums:
            x0, y0, x1, y1 = (float(mb_nums.group(i)) for i in range(1, 5))
            width_pts = round(abs(x1 - x0), 2)
            height_pts = round(abs(y1 - y0), 2)
            is_a4 = (594.0 <= width_pts <= 596.0) and (841.0 <= height_pts <= 843.0)

    return pages, width_pts, height_pts, is_a4, title_line, keywords_line


def _extract_embedded_fonts_fallback(objs: dict[tuple[int, int], bytes]) -> list[str]:
    """Pure-Python fallback to detect embedded fonts via FontDescriptor + FontFile*."""
    embedded: set[str] = set()
    for body in objs.values():
        has_font_stream = bool(re.search(rb"/FontFile[23]?\b", body))
        if not has_font_stream:
            continue
        fn_m = re.search(rb"/FontName\s*/([^\s/<>\[\]()]+)", body)
        if fn_m:
            embedded.add(fn_m.group(1).decode("latin1", errors="replace"))
    return sorted(embedded)


def _parse_tounicode_cmap(cmap_bytes: bytes) -> dict[int, str]:
    """Parses beginbfchar and beginbfrange mappings from a PDF ToUnicode CMap."""
    mapping: dict[int, str] = {}

    def hex_to_unicode(hex_tok: bytes) -> str:
        raw_b = bytes.fromhex(hex_tok.decode("ascii"))
        return raw_b.decode("utf-16-be", errors="replace")

    for block in re.finditer(rb"beginbfchar(.*?)endbfchar", cmap_bytes, flags=re.DOTALL):
        for pair in re.finditer(rb"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", block.group(1)):
            src = int(pair.group(1), 16)
            mapping[src] = hex_to_unicode(pair.group(2))

    for block in re.finditer(rb"beginbfrange(.*?)endbfrange", cmap_bytes, flags=re.DOTALL):
        body = block.group(1)
        pos = 0
        range_pat = re.compile(
            rb"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:\[(.*?)\]|<([0-9A-Fa-f]+)>)",
            flags=re.DOTALL,
        )
        for rm in range_pat.finditer(body, pos):
            start_code = int(rm.group(1), 16)
            end_code = int(rm.group(2), 16)
            if rm.group(3) is not None:
                vals = re.findall(rb"<([0-9A-Fa-f]+)>", rm.group(3))
                for offset, val_hex in enumerate(vals):
                    if start_code + offset <= end_code:
                        mapping[start_code + offset] = hex_to_unicode(val_hex)
            elif rm.group(4) is not None:
                dst_start = int(rm.group(4), 16)
                dst_byte_len = max(2, len(rm.group(4)) // 2)
                for offset in range(max(0, end_code - start_code + 1)):
                    val_int = dst_start + offset
                    raw_b = val_int.to_bytes(dst_byte_len, "big", signed=False)
                    mapping[start_code + offset] = raw_b.decode("utf-16-be", errors="replace")
    return mapping


def _decode_pdf_hex_cids(hex_bytes: bytes, cmap: dict[int, str]) -> str:
    """Decodes a PDF <hex> text operand using a 16-bit/8-bit ToUnicode CMap."""
    cleaned = re.sub(rb"\s+", b"", hex_bytes).decode("ascii", errors="ignore")
    if not cleaned:
        return ""
    uses_16bit = any(k > 0xFF for k in cmap) or (len(cleaned) >= 4 and len(cleaned) % 4 == 0)
    step = 4 if uses_16bit else 2
    chars: list[str] = []
    for i in range(0, len(cleaned) - (step - 1), step):
        cid = int(cleaned[i : i + step], 16)
        if cid in cmap:
            chars.append(cmap[cid])
        elif 32 <= cid <= 126:
            chars.append(chr(cid))
    return "".join(chars)


def _extract_pdf_text_fallback(
    raw: bytes,
    non_stream: bytes,
    objs: dict[tuple[int, int], bytes],
) -> str:
    """Pure-Python fallback text extractor using ToUnicode CMaps, FlateDecode streams, and /Alt."""
    streams: dict[tuple[int, int], bytes] = {}
    for m in re.finditer(
        rb"(?:^|[\r\n])\s*(\d+)\s+(\d+)\s+obj\b(.*?)stream\r?\n(.*?)\r?\n?endstream",
        raw,
        flags=re.DOTALL,
    ):
        ref = (int(m.group(1)), int(m.group(2)))
        header = m.group(3)
        payload = m.group(4)
        if b"/FlateDecode" in header:
            try:
                payload = zlib.decompress(payload)
            except zlib.error:
                pass
        else:
            try:
                payload = zlib.decompress(payload)
            except zlib.error:
                pass
        streams[ref] = payload

    font_cmaps: dict[tuple[int, int], dict[int, str]] = {}
    merged_cmap: dict[int, str] = {}
    for font_ref, body in objs.items():
        tu_m = re.search(rb"/ToUnicode\s+(\d+)\s+(\d+)\s+R", body)
        if tu_m:
            cm_ref = (int(tu_m.group(1)), int(tu_m.group(2)))
            if cm_ref in streams:
                parsed_cm = _parse_tounicode_cmap(streams[cm_ref])
                font_cmaps[font_ref] = parsed_cm
                merged_cmap.update(parsed_cm)

    page_font_maps: dict[bytes, dict[int, str]] = {}
    content_refs: list[tuple[int, int]] = []
    for body in objs.values():
        if re.search(rb"/Type\s*/Page\b", body) and not re.search(rb"/Type\s*/Pages\b", body):
            font_dict_bytes = b""
            f_ref_m = re.search(rb"/Font\s+(\d+)\s+(\d+)\s+R", body)
            if f_ref_m:
                font_dict_bytes = objs.get((int(f_ref_m.group(1)), int(f_ref_m.group(2))), b"")
            else:
                f_inline_m = re.search(rb"/Font\s*<<(.*?)>>", body, flags=re.DOTALL)
                if f_inline_m:
                    font_dict_bytes = f_inline_m.group(1)
            for fm in re.finditer(rb"(/[A-Za-z0-9_+.-]+)\s+(\d+)\s+(\d+)\s+R", font_dict_bytes):
                f_ref = (int(fm.group(2)), int(fm.group(3)))
                if f_ref in font_cmaps:
                    page_font_maps[fm.group(1)] = font_cmaps[f_ref]

            c_single = re.search(rb"/Contents\s+(\d+)\s+(\d+)\s+R", body)
            if c_single:
                content_refs.append((int(c_single.group(1)), int(c_single.group(2))))
            else:
                c_arr = re.search(rb"/Contents\s*\[(.*?)\]", body, flags=re.DOTALL)
                if c_arr:
                    for cm in re.finditer(rb"(\d+)\s+(\d+)\s+R", c_arr.group(1)):
                        content_refs.append((int(cm.group(1)), int(cm.group(2))))

    extracted_parts: list[str] = []
    for cref in content_refs:
        content = streams.get(cref, b"")
        if not content:
            continue
        cur_cmap = merged_cmap
        token_pat = re.compile(
            rb"(/[A-Za-z0-9_+.-]+)\s+[+-]?[\d.]+\s+Tf"
            rb"|<([0-9A-Fa-f]+)>\s*Tj"
            rb"|\(((?:\\.|[^\\()])*)\)\s*Tj"
            rb"|\[(.*?)\]\s*TJ",
            flags=re.DOTALL,
        )
        for tm in token_pat.finditer(content):
            if tm.group(1):
                cur_cmap = page_font_maps.get(tm.group(1), merged_cmap)
            elif tm.group(2):
                extracted_parts.append(_decode_pdf_hex_cids(tm.group(2), cur_cmap))
            elif tm.group(3):
                extracted_parts.append(_pdf_decode_string(b"(" + tm.group(3) + b")"))
            elif tm.group(4):
                arr_parts: list[str] = []
                for elem in re.finditer(rb"<([0-9A-Fa-f]+)>|\(((?:\\.|[^\\()])*)\)", tm.group(4)):
                    if elem.group(1):
                        arr_parts.append(_decode_pdf_hex_cids(elem.group(1), cur_cmap))
                    elif elem.group(2):
                        arr_parts.append(_pdf_decode_string(b"(" + elem.group(2) + b")"))
                extracted_parts.append("".join(arr_parts))

    for am in re.finditer(rb"/(?:Alt|ActualText)\s*(\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f]+>)", non_stream):
        extracted_parts.append(_pdf_decode_string(am.group(1)))

    return "\n".join(part for part in extracted_parts if part)


def verify_generated_pdf(
    pdf_path: Path,
    expected_ems_codes: list[str],
) -> dict[str, Any]:
    """Verifies A4 size, page count, embedded fonts, text content, and NO_AUTO_PRINT safety."""
    raw = pdf_path.read_bytes()
    non_stream = strip_pdf_streams(raw)

    prohibited_tokens = {
        "OpenAction": re.compile(rb"/OpenAction(?![A-Za-z0-9_+])"),
        "AA": re.compile(rb"/AA(?![A-Za-z0-9_+])"),
        "JavaScript": re.compile(rb"/JavaScript(?![A-Za-z0-9_+])"),
        "JS": re.compile(rb"/JS(?![A-Za-z0-9_+])"),
        "Launch": re.compile(rb"/Launch(?![A-Za-z0-9_+])"),
        "SubmitForm": re.compile(rb"/SubmitForm(?![A-Za-z0-9_+])"),
        "window_print": re.compile(rb"window\.print", re.IGNORECASE),
    }
    found_triggers = [
        name for name, pat in prohibited_tokens.items() if pat.search(non_stream)
    ]

    pages = 0
    width_pts = 0.0
    height_pts = 0.0
    is_a4 = False
    js_no = True
    keywords_line = ""
    title_line = ""

    parsed_objs: dict[tuple[int, int], bytes] | None = None

    def get_parsed_objs() -> dict[tuple[int, int], bytes]:
        nonlocal parsed_objs
        if parsed_objs is None:
            parsed_objs = _parse_pdf_objects(non_stream)
        return parsed_objs

    pdfinfo_bin = shutil.which("pdfinfo")
    if pdfinfo_bin:
        info_proc = subprocess.run([pdfinfo_bin, str(pdf_path)], capture_output=True, text=True, check=True)
        for line in info_proc.stdout.splitlines():
            if line.startswith("Pages:"):
                pages = int(line.split(":", 1)[1].strip())
            elif line.startswith("Page size:"):
                m = re.search(r"([\d.]+)\s*x\s*([\d.]+)\s*pts", line)
                if m:
                    width_pts = float(m.group(1))
                    height_pts = float(m.group(2))
                    is_a4 = ("A4" in line) and (594.0 <= width_pts <= 596.0) and (841.0 <= height_pts <= 843.0)
            elif line.startswith("JavaScript:"):
                js_no = line.split(":", 1)[1].strip().lower() == "no"
            elif line.startswith("Keywords:"):
                keywords_line = line.split(":", 1)[1].strip()
            elif line.startswith("Title:"):
                title_line = line.split(":", 1)[1].strip()
    else:
        pages, width_pts, height_pts, is_a4, title_line, keywords_line = _extract_pdf_metadata_fallback(
            non_stream, get_parsed_objs()
        )
        js_no = ("JavaScript" not in found_triggers) and ("JS" not in found_triggers)

    embedded_fonts: list[str] = []
    pdffonts_bin = shutil.which("pdffonts")
    if pdffonts_bin:
        fonts_proc = subprocess.run([pdffonts_bin, str(pdf_path)], capture_output=True, text=True, check=True)
        for line in fonts_proc.stdout.splitlines()[2:]:
            m = re.match(
                r"^(\S+)\s+.*?\s+(yes|no)\s+(yes|no)\s+(yes|no)\s+\d+\s+\d+\s*$",
                line.strip(),
            )
            if m and m.group(2) == "yes":
                embedded_fonts.append(m.group(1))
    else:
        embedded_fonts = _extract_embedded_fonts_fallback(get_parsed_objs())

    extracted_ems_present = True
    pdftotext_bin = shutil.which("pdftotext")
    if pdftotext_bin:
        txt_proc = subprocess.run([pdftotext_bin, str(pdf_path), "-"], capture_output=True, text=True, check=True)
        txt = txt_proc.stdout
        extracted_ems_present = all(code in txt for code in expected_ems_codes)
    else:
        txt = _extract_pdf_text_fallback(raw, non_stream, get_parsed_objs())
        extracted_ems_present = all(code in txt for code in expected_ems_codes)

    has_sarabun_regular = any("Sarabun-Regular" in f for f in embedded_fonts)
    has_sarabun_bold = any("Sarabun-Bold" in f for f in embedded_fonts)
    has_noprint_meta = ("NO_AUTO_PRINT" in keywords_line) and ("Paper=0" in keywords_line)

    has_auto_print_actions = bool(found_triggers) or (not js_no)
    passed = (
        pages == 1
        and is_a4
        and has_sarabun_regular
        and has_sarabun_bold
        and not has_auto_print_actions
        and extracted_ems_present
        and has_noprint_meta
    )

    return {
        "output_path": str(pdf_path.resolve()),
        "file_size_bytes": len(raw),
        "pages": pages,
        "page_size_pts": {"width": width_pts, "height": height_pts},
        "is_a4": is_a4,
        "embedded_fonts": embedded_fonts,
        "has_auto_print_actions": has_auto_print_actions,
        "prohibited_triggers_found": found_triggers,
        "title": title_line,
        "keywords": keywords_line,
        "extracted_ems_present": extracted_ems_present,
        "test_result": "PASS" if passed else "FAIL",
    }


# ---------------------------------------------------------------------------
# Offline Self-Test Suite (--self-test)
# ---------------------------------------------------------------------------


def run_self_tests() -> dict[str, Any]:
    """Runs deterministic offline assertions across all guards, catalog, Code 128B, and PDF fallbacks."""
    # 1. Code 128B ISO/IEC 15417 table invariants (all 107 entries)
    assert len(CODE128_PATTERNS) == 107
    assert len(set(CODE128_PATTERNS)) == 107
    for idx, pat in enumerate(CODE128_PATTERNS[:106]):
        digits = [int(c) for c in pat]
        assert len(digits) == 6 and all(1 <= d <= 4 for d in digits), f"Pattern {idx} invalid"
        assert sum(digits) == 11, f"Pattern {idx} width sum != 11"
        assert (digits[0] + digits[2] + digits[4]) % 2 == 0, f"Pattern {idx} bar parity != even"
        assert (digits[1] + digits[3] + digits[5]) % 2 == 1, f"Pattern {idx} space parity != odd"
    assert CODE128_PATTERNS[106] == "2331112" and sum(int(c) for c in CODE128_PATTERNS[106]) == 13

    # 2. Known EMS mock Code 128B mod-103 checksums & SVG quiet zone >= 10X
    expected_checksums = {
        "EE123456789TH": 64,
        "EE123456790TH": 78,
        "EE123456791TH": 89,
    }
    for code, expected_cs in expected_checksums.items():
        svg, cs = render_code128b_svg(code, quiet_modules=10)
        assert cs == expected_cs, f"{code}: checksum {cs} != {expected_cs}"
        assert 'viewBox="0 0 198 ' in svg, f"{code}: expected 198 total modules (10+178+10)"

    # 3. Rule 1 R:/S:, UNC, semicolon delimiter & scheme:// URI guard (fail-closed)
    bad_paths = [
        r"R:\data\cover.pdf",
        r"S:\@ฝ่ายสมาชิกสัมพันธ์\2026\cover.pdf",
        "s:/test/logo.png",
        "r:relative.pdf",
        r"\\FTC-FS01\PublicData\test.pdf",
        r"\\fileserver\R$\secret.pdf",
        "//fileserver/share/secret.pdf",
        "file://fileserver/s$/out.pdf",
        "file:///tmp/out.pdf",
        "file:///R:/out.pdf",
        "http://example.com/out.pdf",
        r"foo;R:\out.pdf",
        r"foo;\\fileserver\share\out.pdf",
    ]
    for bp in bad_paths:
        raised = False
        try:
            validate_safe_path(bp, "output")
        except GuardrailViolationError:
            raised = True
        assert raised, f"R:/S:/UNC/URI guard failed to reject {bp!r}"

    # Verify safe paths succeed
    validate_safe_path(DEFAULT_OUTPUT_PDF, "output")
    validate_safe_path(r"C:\CRD\output\sample.pdf", "output")

    # 4. Rule 3a .rpt write-prohibition & symlink guard (inside auto-cleaned temp dir)
    rpt_raised = False
    try:
        validate_safe_path("/tmp/CLT-003-02_test.rpt", "output")
    except GuardrailViolationError:
        rpt_raised = True
    assert rpt_raised, ".rpt write target was not blocked"

    with tempfile.TemporaryDirectory(prefix="crd_selftest_") as tmpdir:
        tmp_path = Path(tmpdir)
        victim_rpt = tmp_path / "victim_template.rpt"
        victim_rpt.write_text("DO_NOT_OVERWRITE_RPT", encoding="utf-8")
        symlink_pdf = tmp_path / "innocent_looking.pdf"
        symlink_pdf.symlink_to(victim_rpt)

        for fn_call in (
            lambda: validate_safe_path(symlink_pdf, "output"),
            lambda: assert_rpt_write_prohibited(symlink_pdf),
            lambda: render_html_to_pdf_chromium("<html></html>", symlink_pdf, Path("/usr/bin/chromium")),
            lambda: patch_pdf_info_metadata(symlink_pdf, "t", "a", "s", "k"),
        ):
            sym_raised = False
            try:
                fn_call()
            except GuardrailViolationError:
                sym_raised = True
            assert sym_raised, "Symlink-to-.rpt write target was not blocked"
        assert victim_rpt.read_text(encoding="utf-8") == "DO_NOT_OVERWRITE_RPT"

        real_sub = tmp_path / "real_dir"
        real_sub.mkdir()
        dir_link = tmp_path / "dir_link"
        dir_link.symlink_to(real_sub)
        dir_rpt_raised = False
        try:
            validate_safe_path(dir_link / "nested.rpt", "output")
        except GuardrailViolationError:
            dir_rpt_raised = True
        assert dir_rpt_raised, "Directory symlink targeting .rpt was not blocked"

        # SVG XSS hardening checks (onload=, onclick=, <foreignObject>)
        for idx, bad_svg in enumerate(
            [
                '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
                '<svg xmlns="http://www.w3.org/2000/svg"><rect onclick = "evil()" /></svg>',
                '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>x</div></foreignObject></svg>',
            ]
        ):
            bad_svg_path = tmp_path / f"bad_{idx}.svg"
            bad_svg_path.write_text(bad_svg, encoding="utf-8")
            svg_raised = False
            try:
                resolve_logo_markup(str(bad_svg_path))
            except GuardrailViolationError:
                svg_raised = True
            assert svg_raised, f"Unsafe SVG #{idx} was not blocked"

        good_svg = tmp_path / "good.svg"
        good_svg.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>', encoding="utf-8")
        _, good_meta = resolve_logo_markup(str(good_svg))
        assert good_meta["mime"] == "image/svg+xml"

        # Browser discovery skips R:/S: entries in PATH without touching them
        orig_path = os.environ.get("PATH", "")
        orig_bin_env = os.environ.pop("CRD_CHROMIUM_BIN", None)
        fake_bin_dir = tmp_path / "bin"
        fake_bin_dir.mkdir()
        fake_browser = fake_bin_dir / "chromium"
        fake_browser.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        fake_browser.chmod(0o755)
        try:
            os.environ["PATH"] = f"R:\\bad_dir{os.pathsep}{fake_bin_dir}"
            discovered = discover_browser_binary(None)
            assert discovered == fake_browser.resolve()
        finally:
            os.environ["PATH"] = orig_path
            if orig_bin_env is not None:
                os.environ["CRD_CHROMIUM_BIN"] = orig_bin_env

        # Font SHA-256 verification (negative tamper check)
        bad_fonts_dir = tmp_path / "bad_fonts"
        bad_fonts_dir.mkdir()
        for fname in REQUIRED_FONTS:
            (bad_fonts_dir / fname).write_bytes(b"\x00\x01\x00\x00" + b"X" * 60000)
        global FONTS_DIR
        orig_fonts_dir = FONTS_DIR
        try:
            FONTS_DIR = bad_fonts_dir
            sha_failed = False
            try:
                load_cached_sarabun_fonts()
            except ValueError:
                sha_failed = True
            assert sha_failed, "Tampered font failed to trigger SHA-256 mismatch"
        finally:
            FONTS_DIR = orig_fonts_dir

        # Poppler-absent pure-Python PDF fallback check (valid A4 PDF -> PASS, poisoned PDF -> FAIL)
        cmap_stream = zlib.compress(
            b"begincmap\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n"
            b"5 beginbfchar\n<0001> <0045>\n<0002> <0031>\n<0003> <0032>\n<0004> <0054>\n<0005> <0048>\nendbfchar\nendcmap\n"
        )
        content_stream = zlib.compress(b"BT /F8 10 Tf <000100010002000300040005> Tj ET\n")
        objs_raw = [
            b"1 0 obj\n<< /Title (Init) >>\nendobj\n",
            b"2 0 obj\n<< /Type /Catalog /Pages 3 0 R >>\nendobj\n",
            b"3 0 obj\n<< /Type /Pages /Count 1 /Kids [4 0 R] >>\nendobj\n",
            b"4 0 obj\n<< /Type /Page /Parent 3 0 R /MediaBox [0 0 594.96 841.92] /Resources << /Font << /F8 5 0 R /F9 6 0 R >> >> /Contents 11 0 R >>\nendobj\n",
            b"5 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /AAAAAA+Sarabun-Bold /ToUnicode 10 0 R >>\nendobj\n",
            b"6 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /BAAAAA+Sarabun-Regular >>\nendobj\n",
            b"7 0 obj\n<< /Type /FontDescriptor /FontName /AAAAAA+Sarabun-Bold /FontFile2 9 0 R >>\nendobj\n",
            b"8 0 obj\n<< /Type /FontDescriptor /FontName /BAAAAA+Sarabun-Regular /FontFile2 9 0 R >>\nendobj\n",
            b"9 0 obj\n<< /Length 4 >>\nstream\nFONT\nendstream\nendobj\n",
            f"10 0 obj\n<< /Filter /FlateDecode /Length {len(cmap_stream)} >>\nstream\n".encode("ascii") + cmap_stream + b"\nendstream\nendobj\n",
            f"11 0 obj\n<< /Filter /FlateDecode /Length {len(content_stream)} >>\nstream\n".encode("ascii") + content_stream + b"\nendstream\nendobj\n",
        ]
        pdf_buf = bytearray(b"%PDF-1.4\n")
        offsets = [0]
        for ob in objs_raw:
            offsets.append(len(pdf_buf))
            pdf_buf.extend(ob)
        xref_off = len(pdf_buf)
        pdf_buf.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode("ascii"))
        for off in offsets[1:]:
            pdf_buf.extend(f"{off:010d} 00000 n \n".encode("ascii"))
        pdf_buf.extend(
            f"trailer\n<< /Size {len(offsets)} /Root 2 0 R /Info 1 0 R >>\nstartxref\n{xref_off}\n%%EOF\n".encode("ascii")
        )
        fallback_pdf = tmp_path / "fallback_valid.pdf"
        fallback_pdf.write_bytes(bytes(pdf_buf))
        patch_pdf_info_metadata(
            fallback_pdf,
            title="Dispatch Fallback Test",
            author="CRD",
            subject="WORK 4",
            keywords="NO_AUTO_PRINT, Paper=0",
        )
        poison_pdf = tmp_path / "fallback_poison.pdf"
        poison_pdf.write_bytes(
            b"%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >> endobj\n"
            b"2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n"
            b"3 0 obj << /Type /Page /MediaBox [0 0 612 792] >> endobj\n"
            b"trailer << /Root 1 0 R >>\n%%EOF\n"
        )
        orig_which = shutil.which
        try:
            shutil.which = lambda *_a, **_kw: None  # type: ignore[assignment]
            fb_pass = verify_generated_pdf(fallback_pdf, ["EE12TH"])
            assert fb_pass["test_result"] == "PASS", f"Poppler fallback failed valid PDF: {fb_pass}"
            assert fb_pass["pages"] == 1 and fb_pass["is_a4"] is True
            assert len(fb_pass["embedded_fonts"]) == 2
            fb_fail = verify_generated_pdf(poison_pdf, ["EE123456789TH"])
            assert fb_fail["test_result"] == "FAIL" and fb_fail["has_auto_print_actions"] is True
        finally:
            shutil.which = orig_which

    # 5. Rule 3b Zero-PII validator (reject citizen ID, phone, Thai digits & newline bypasses)
    bad_records = [
        {"seq_no": 1, "member_id": "1", "contract_no": "LN-2026-MOCK-001", "recipient_name": "นายสมมติ ทดสอบ", "category_code": "C01", "ems_code": "EE123456789TH"},
        {"seq_no": 1, "member_id": "00001\n", "contract_no": "LN-2026-MOCK-001", "recipient_name": "นายสมมติ ทดสอบ", "category_code": "C01", "ems_code": "EE123456789TH"},
        {"seq_no": 1, "member_id": "๑๒๓๔๕", "contract_no": "LN-2026-MOCK-001", "recipient_name": "นายสมมติ ทดสอบ", "category_code": "C01", "ems_code": "EE123456789TH"},
        {"seq_no": 1, "member_id": "00001", "contract_no": "LN-2026-MOCK-001", "recipient_name": "นายสมมติ ทดสอบ", "category_code": "C01", "ems_code": "EE123456789TH\n"},
        {"seq_no": 1, "member_id": "00001", "contract_no": "LN-2026-REAL-001", "recipient_name": "นายสมมติ ทดสอบ", "category_code": "C01", "ems_code": "EE123456789TH"},
        {"seq_no": 1, "member_id": "00001", "contract_no": "LN-2026-MOCK-001", "recipient_name": "นายสมมติ 1100700123456", "category_code": "C01", "ems_code": "EE123456789TH"},
        {"seq_no": 1, "member_id": "00001", "contract_no": "LN-2026-MOCK-001", "recipient_name": "นายสมมติ 1 1001 00001 01 1", "category_code": "C01", "ems_code": "EE123456789TH"},
        {"seq_no": 1, "member_id": "00001", "contract_no": "LN-2026-MOCK-001", "recipient_name": "นายสมมติ 1-1001-00001-01-1", "category_code": "C01", "ems_code": "EE123456789TH"},
        {"seq_no": 1, "member_id": "00001", "contract_no": "LN-2026-MOCK-001", "recipient_name": "นายสมมติ 0812345678", "category_code": "C01", "ems_code": "EE123456789TH"},
        {"seq_no": 1, "member_id": "00001", "contract_no": "LN-2026-MOCK-001", "recipient_name": "นายสมมติ 02-123-4567", "category_code": "C01", "ems_code": "EE123456789TH"},
        {"seq_no": 1, "member_id": "00001", "contract_no": "LN-2026-MOCK-001", "recipient_name": "นายสมมติ +66812345678", "category_code": "C01", "ems_code": "EE123456789TH"},
        {"seq_no": 1, "member_id": "00001", "contract_no": "LN-2026-MOCK-001", "recipient_name": "นายสมมติ +66 81 234 5678", "category_code": "C01", "ems_code": "EE123456789TH"},
    ]
    for idx, bad_rec in enumerate(bad_records):
        rec_raised = False
        try:
            validate_synthetic_record(bad_rec)
        except GuardrailViolationError:
            rec_raised = True
        assert rec_raised, f"Zero-PII guard failed to reject bad record #{idx}: {bad_rec!r}"

    # 6. Rule 3c SKIPPED_EMPTY filtering + dynamic normalization/HTML/Subject formatting
    extra_probe_records = [
        *SAMPLE_SYNTHETIC_RECORDS,
        {"seq_no": 4, "member_id": "00004", "contract_no": "LN-2026-MOCK-004", "recipient_name": "นายทดสอบ หมวดว่าง ๔", "category_code": "C03", "ems_code": "EE123456792TH"},
        {"seq_no": 5, "member_id": "00005", "contract_no": "LN-2026-MOCK-005", "recipient_name": "นายทดสอบ หมวดว่าง ๕", "category_code": "C05", "ems_code": "EE123456793TH"},
        {"seq_no": 6, "member_id": "00006", "contract_no": "LN-2026-MOCK-006", "recipient_name": "นายทดสอบ หมวดเออเรอร์ ๖", "category_code": "C09", "ems_code": "EE123456794TH"},
    ]
    filtered = evaluate_catalog_and_records(CATEGORIES_CATALOG, extra_probe_records)
    assert len(filtered.active_categories) == 6
    assert [c["code"] for c in filtered.skipped_empty_categories] == ["C03", "C05"]
    assert [c["code"] for c in filtered.error_categories] == ["C09"]
    assert [r["category_code"] for r in filtered.included_records] == ["C01", "C04", "C07"]
    assert [r["category_code"] for r in filtered.excluded_records] == ["C03", "C05", "C09"]

    fonts_b64 = load_cached_sarabun_fonts()
    assert set(fonts_b64.keys()) == set(REQUIRED_FONTS.keys())
    builtin_logo, _ = resolve_logo_markup(None)

    # Dynamic catalog case 1: C01 FOUND with record_count=0, C02 NO_DATA with count=3, C07 ERROR, only C04 active
    dyn_cat_1 = []
    for c in CATEGORIES_CATALOG:
        item = dict(c)
        if item["code"] == "C01":
            item["status"], item["record_count"] = "FOUND", 0
        elif item["code"] == "C02":
            item["status"], item["record_count"] = "NO_DATA", 3
        elif item["code"] == "C07":
            item["status"], item["record_count"] = "ERROR", 2
        elif item["code"] != "C04":
            item["status"], item["record_count"] = "SKIPPED_EMPTY", 0
        dyn_cat_1.append(item)
    f_dyn_1 = evaluate_catalog_and_records(dyn_cat_1, SAMPLE_SYNTHETIC_RECORDS)
    cat1_by_code = {c["code"]: c for c in f_dyn_1.catalog}
    assert cat1_by_code["C01"]["status"] == "SKIPPED_EMPTY"
    assert cat1_by_code["C02"]["status"] == "SKIPPED_EMPTY"
    assert cat1_by_code["C07"]["status"] == "ERROR"
    assert cat1_by_code["C04"]["status"] == "FOUND"
    html_1, enr_1 = build_dispatch_html(f_dyn_1, fonts_b64, builtin_logo, "RUN1", "2026", "11", "คลองจั่น", "2026-11-19 12:55")
    assert len(enr_1) == 1 and enr_1[0]["category_code"] == "C04"
    assert 'pill pill-skipped"><strong>C01</strong>' in html_1
    assert 'pill pill-skipped"><strong>C02</strong>' in html_1
    assert 'pill pill-error"><strong>C07</strong>' in html_1
    assert 'pill pill-active"><strong>C04</strong>' in html_1
    assert "1 Synthetic Record • Active Only" in html_1
    assert "3 Synthetic Records" not in html_1
    assert "ข้อมูลสมมติ 1 รายการ" in html_1
    assert "ไม่รวมหมวด ERROR (C07)" in html_1
    assert ".watermark {\n" in html_1 or "z-index: 0;" in html_1
    subj_1 = format_pdf_subject(f_dyn_1, "2026", "11")
    assert "SKIPPED_EMPTY: C01,C02,C03,C05,C06,C08,C09" in subj_1 and "ERROR: C07" in subj_1 and "RECORDS: 1" in subj_1

    # Dynamic catalog case 2: single-active C06 + empty catalog fallback
    dyn_cat_2 = []
    for c in CATEGORIES_CATALOG:
        item = dict(c)
        if item["code"] == "C06":
            item["status"], item["record_count"] = "FOUND", 1
        elif item["code"] in {"C01", "C02"}:
            item["status"], item["record_count"] = "NO_DATA", 0
        elif item["code"] == "C08":
            item["status"], item["record_count"] = "ERROR", 0
        else:
            item["status"], item["record_count"] = "SKIPPED_EMPTY", 0
        dyn_cat_2.append(item)
    c06_recs = [{"seq_no": 1, "member_id": "00006", "contract_no": "LN-2026-MOCK-006", "recipient_name": "นายสมมติ หมวดหก ๖", "category_code": "C06", "ems_code": "EE123456789TH"}]
    f_dyn_2 = evaluate_catalog_and_records(dyn_cat_2, c06_recs)
    html_2, enr_2 = build_dispatch_html(f_dyn_2, fonts_b64, builtin_logo, "RUN2", "2026", "11", "คลองจั่น", "2026-11-19 12:55")
    assert len(enr_2) == 1 and "C01, C02, C03, C04, C05, C07, C09" in html_2 and "ERROR (C08)" in html_2

    all_empty_cat = [dict(c, status="SKIPPED_EMPTY", record_count=0) for c in CATEGORIES_CATALOG]
    f_empty = evaluate_catalog_and_records(all_empty_cat, SAMPLE_SYNTHETIC_RECORDS)
    html_empty, enr_empty = build_dispatch_html(f_empty, fonts_b64, builtin_logo, "RUN0", "2026", "11", "คลองจั่น", "2026-11-19 12:55")
    assert len(enr_empty) == 0 and "(ไม่มีหมวดที่มีข้อมูล)" in html_empty and "()" not in html_empty

    # 7. Cached OFL Thai fonts & NO_AUTO_PRINT constants + CSS stacking check
    assert NO_AUTO_PRINT is True and PAPER_SHEETS_PRINTED == 0 and PAPER_FLAG == "Paper=0"
    assert ".watermark {\n  position: fixed;" in html_1 and "z-index: 0;" in html_1.split(".watermark {")[1].split("}")[0]
    assert "z-index: 2;" in html_1.split(".layer-top {")[1].split("}")[0]

    # 8. False-positive guard test: /AAAAAA+Sarabun-Bold must NOT trigger /AA match
    sample_pdf_bytes = b"%PDF-1.4\n1 0 obj << /FontName /AAAAAA+Sarabun-Bold >> endobj\n"
    assert not re.search(rb"/AA(?![A-Za-z0-9_+])", sample_pdf_bytes)
    assert re.search(rb"/AA(?![A-Za-z0-9_+])", b"1 0 obj << /AA << /O 2 0 R >> >> endobj")

    return {
        "suite": "WORK4_A4_DISPATCH_COVER_SELF_TEST",
        "no_auto_print": NO_AUTO_PRINT,
        "paper_flag": PAPER_FLAG,
        "paper_sheets_printed": PAPER_SHEETS_PRINTED,
        "checks_passed": 12,
        "code128b_checksums": expected_checksums,
        "status": "PASS",
    }


# ---------------------------------------------------------------------------
# Main CLI Entry Point
# ---------------------------------------------------------------------------


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate A4 Portrait WORK 4 Dispatch Cover Sheet PDF (Synthetic Only, NO_AUTO_PRINT / Paper=0)."
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT_PDF),
        help=f"Output A4 PDF path (default: {DEFAULT_OUTPUT_PDF})",
    )
    parser.add_argument(
        "--json-report",
        action="store_true",
        help="Emit clean JSON report manifest to stdout.",
    )
    parser.add_argument(
        "--logo",
        default=None,
        help="Optional .png/.jpg/.svg logo path (1:1 aspect-locked; defaults to built-in CRD SVG emblem).",
    )
    parser.add_argument("--year", default="2026", help="4-digit year (default: 2026).")
    parser.add_argument("--month", default="11", help="2-digit month 01..12 (default: 11).")
    parser.add_argument("--branch", default="คลองจั่น", help="Branch label (default: คลองจั่น).")
    parser.add_argument("--browser", default=None, help="Optional Chromium/Edge/Chrome binary override.")
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run offline unit assertions for guards, catalog filtering, and Code 128B checksums.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if args.self_test:
        self_test_res = run_self_tests()
        print(json.dumps(self_test_res, ensure_ascii=False, indent=2))
        return 0

    output_pdf = validate_safe_path(args.output, "output")
    assert_rpt_write_prohibited(output_pdf)
    browser_bin = discover_browser_binary(args.browser)
    fonts_b64 = load_cached_sarabun_fonts()
    logo_markup, logo_meta = resolve_logo_markup(args.logo)

    filtered = evaluate_catalog_and_records(CATEGORIES_CATALOG, SAMPLE_SYNTHETIC_RECORDS)
    now = datetime.now()
    run_id = f"AGY-{now.strftime('%Y%m%d')}-CMS2-WORK4-A4COVER"
    generated_at_iso = now.strftime("%Y-%m-%d %H:%M")

    html_doc, enriched_records = build_dispatch_html(
        filtered=filtered,
        fonts_b64=fonts_b64,
        logo_markup=logo_markup,
        run_id=run_id,
        year=args.year,
        month=args.month,
        branch=args.branch,
        generated_at_iso=generated_at_iso,
    )

    # Double-check HTML never injects window.print()
    if "window.print" in html_doc.lower():
        raise GuardrailViolationError("Rule 3d violation: window.print() is prohibited.")

    render_html_to_pdf_chromium(html_doc, output_pdf, browser_bin)

    patch_pdf_info_metadata(
        pdf_path=output_pdf,
        title=f"ใบนำส่ง (Dispatch Cover Sheet) - NO_AUTO_PRINT / Paper=0 ({args.year}-{args.month})",
        author="CRD WORK 4 Synthetic Generator (Zero-PII)",
        subject=format_pdf_subject(filtered, args.year, args.month),
        keywords="NO_AUTO_PRINT, Paper=0, SKIPPED_EMPTY, SYNTHETIC_DATA_ONLY, CRD-WORK4",
    )

    pdf_verification = verify_generated_pdf(
        output_pdf,
        expected_ems_codes=[r["ems_code"] for r in enriched_records],
    )

    report = {
        "task_id": TASK_ID,
        "run_id": run_id,
        "year_month": f"{args.year}-{args.month}",
        "branch": args.branch,
        "synthetic_data_only": SYNTHETIC_DATA_ONLY,
        "no_auto_print": NO_AUTO_PRINT,
        "paper_flag": PAPER_FLAG,
        "paper_sheets_printed": PAPER_SHEETS_PRINTED,
        "guards": {
            "r_s_drive_access_blocked": True,
            "rpt_readonly_enforced": True,
            "zero_pii_validated": True,
        },
        "logo": logo_meta,
        "catalog_summary": {
            "total": len(filtered.catalog),
            "active": len(filtered.active_categories),
            "skipped_empty": [c["code"] for c in filtered.skipped_empty_categories],
            "error": [c["code"] for c in filtered.error_categories],
            "included_record_categories": [r["category_code"] for r in enriched_records],
            "categories": [
                {
                    "code": c["code"],
                    "name": c["name"],
                    "rpt_prefix": c["rpt_prefix"],
                    "ems_form_code": c["ems_form_code"],
                    "status": c["status"],
                    "record_count": c["record_count"],
                }
                for c in filtered.catalog
            ],
        },
        "records": [
            {
                "seq_no": r["seq_no"],
                "member_id": r["member_id"],
                "contract_no": r["contract_no"],
                "recipient_name": r["recipient_name"],
                "category_code": r["category_code"],
                "category_name": r["category_name"],
                "rpt_prefix": r["rpt_prefix"],
                "ems_code": r["ems_code"],
                "code128_checksum": r["code128_checksum"],
            }
            for r in enriched_records
        ],
        "pdf_verification": pdf_verification,
    }

    if args.json_report:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(
            f"Generated A4 Dispatch Cover Sheet: {pdf_verification['output_path']} "
            f"(pages={pdf_verification['pages']}, a4={pdf_verification['is_a4']}, "
            f"result={pdf_verification['test_result']})"
        )

    return 0 if pdf_verification["test_result"] == "PASS" else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except GuardrailViolationError as exc:
        print(f"GUARDRAIL_BLOCKED: {exc}", file=sys.stderr)
        raise SystemExit(2)
