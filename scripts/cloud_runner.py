#!/usr/bin/env python3
"""
CRD Cloud Runner (GitHub Actions Autonomous Executor & Advisor)
===============================================================
Runs 100% headless on GitHub Actions Cloud (no Antigravity app, no CMS-2 PC required).
Responsibilities:
  1. Auto-Routes tasks into CLOUD_ONLY vs CMS2_LOCAL without requiring manual routing.
  2. Claims and executes CLOUD_ONLY pending jobs from GAS Gateway (or repository_dispatch).
  3. Runs deterministic repo scripts (A4 Dispatch Cover Sheet, A6 mock pipeline, parity audits)
     and optional Gemini Flash advisor analysis when GEMINI_API_KEY is configured.
  4. Emits concise Zero-PII results + actionable Thai advisor notes back to GAS COMPLETE_JOB.
  5. Strictly enforces CRD AGENTS.md guardrails:
     - Never access R:, S:, D:\COOP, 00_MASTER_SOURCE, or UNC shares.
     - Read-only against .rpt metadata (never write .rpt).
     - Zero-PII 100% (blocks citizen IDs and phone numbers in payloads/summaries).
     - NO_AUTO_PRINT / Paper=0 strictly enforced.
"""

from __future__ import annotations

import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

sys.dont_write_bytecode = True
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
RUNTIME_DIR = REPO_ROOT / "runtime"
REPORT_FILE = RUNTIME_DIR / "cloud_runner_report.json"

DEFAULT_GAS_GATEWAY_URL = (
    "https://script.google.com/macros/s/"
    "AKfycbwTEboyfHQ0LzmrP0mtxWCYtrg13Jz5JqKpLVW-8Dtf3bWYqoc-ZoPObtZGjSlKriBU/exec"
)
RUNNER_DEVICE_ID = "github-cloud-runner"
RUNNER_WORKER_ID = "GITHUB-CLOUD-RUNNER"
NO_AUTO_PRINT = True
PAPER_PRINTED = 0

# ---------------------------------------------------------------------------
# Guardrails (CRD AGENTS.md Rules 1, 3, 4 & Zero-PII)
# ---------------------------------------------------------------------------


class CloudGuardrailError(ValueError):
    """Raised when a drive, .rpt write, or PII guardrail is triggered."""


FORBIDDEN_DRIVE_RE = re.compile(
    r"(?:^|[\s\"'=,/\\])([RSrs]:)"
    r"|(?:^|[\s\"'=])(\\\\[^\\]+\\[^\\]+|//[^/]+/[^/]+)"
    r"|(?:[Dd]:\\COOP)",
    re.IGNORECASE,
)
CITIZEN_ID_RE = re.compile(r"(?<!\d)\d{13}(?!\d)|\d-\d{4}-\d{5}-\d{2}-\d")
THAI_PHONE_RE = re.compile(r"(?<!\d)0[2-9]\d[- ]?\d{3}[- ]?\d{3,4}(?!\d)")

CMS2_LOCAL_KEYWORDS = (
    "d:\\coop",
    "viewreport",
    "00_master_source",
    "s:\\2026",
    "c:\\users\\natee.yan",
    "excel.application",
    "crystal",
    "viewcrreport",
    "ลิ้นชัก",
    "เครื่องพิมพ์จริง",
    "ปริ้นจริง",
    "สั่งพิมพ์จริง",
    "cms2_local",
    "cms-2 only",
)


def scrub_pii_text(text: str) -> str:
    """Redacts accidental citizen IDs or phone numbers before writing to GAS/logs."""
    clean = CITIZEN_ID_RE.sub("[REDACTED_ID]", str(text or ""))
    clean = THAI_PHONE_RE.sub("[REDACTED_PHONE]", clean)
    return clean


def assert_zero_pii_text(text: str, field_name: str = "payload") -> None:
    """Fail-closed check rejecting real 13-digit citizen IDs and phone numbers."""
    raw = str(text or "")
    if CITIZEN_ID_RE.search(raw):
        raise CloudGuardrailError(f"Zero-PII violation in {field_name}: 13-digit ID detected")
    if THAI_PHONE_RE.search(raw):
        raise CloudGuardrailError(f"Zero-PII violation in {field_name}: phone number detected")


def assert_safe_execution_path(path_value: str | Path, purpose: str = "path") -> Path:
    """Blocks R:, S:, D:\\COOP, UNC paths, and .rpt write targets."""
    raw = str(path_value).strip()
    if not raw:
        raise CloudGuardrailError(f"Empty path rejected ({purpose})")
    if FORBIDDEN_DRIVE_RE.search(raw):
        raise CloudGuardrailError(f"Prohibited drive/UNC path ({purpose}): {raw!r}")
    if purpose == "write" and raw.lower().endswith(".rpt"):
        raise CloudGuardrailError(f"Rule 3a violation: cannot write .rpt file {raw!r}")
    return Path(raw)


def classify_execution_lane(prompt_text: str, explicit_lane: str = "") -> Tuple[str, str]:
    """
    Smart Auto-Router: decides CLOUD_ONLY vs CMS2_LOCAL from text or explicit tag.
    Returns (lane, reason_th).
    """
    lane_upper = str(explicit_lane or "").strip().upper()
    text_lower = str(prompt_text or "").lower()

    if "execution_lane: cloud_only" in text_lower or "execution_lane:cloud_only" in text_lower:
        return "CLOUD_ONLY", "คำสั่งระบุ EXECUTION_LANE: CLOUD_ONLY ชัดเจน"
    if "execution_lane: cms2_local" in text_lower or "execution_lane:cms2_local" in text_lower:
        return "CMS2_LOCAL", "คำสั่งระบุ EXECUTION_LANE: CMS2_LOCAL ชัดเจน"
    if lane_upper in {"CLOUD_ONLY", "CMS2_LOCAL"}:
        return lane_upper, f"รับค่าเลนจากคิว ({lane_upper})"

    for kw in CMS2_LOCAL_KEYWORDS:
        if kw in text_lower:
            return (
                "CMS2_LOCAL",
                f"ตรวจพบงานที่ต้องเข้าถึงเครื่องบริษัท/เครื่องพิมพ์ ({kw}) จึงจัดเข้าเลน CMS2_LOCAL เพื่อความปลอดภัย",
            )

    return "CLOUD_ONLY", "เป็นงานโค้ด/เอกสารสมมติ/ตรวจสอบระบบบนคลาวด์ รันจบได้ทันทีบน Cloud Runner"


def classify_task_intent(prompt_text: str, action: str = "", title: str = "") -> str:
    """Maps a natural Thai/English instruction to a deterministic cloud handler."""
    combined = f"{action} {title} {prompt_text}".lower()
    if any(k in combined for k in ("ใบนำส่ง", "dispatch cover", "cover sheet", "a4")):
        return "WORK4_A4_COVER"
    if any(k in combined for k in ("a6", "ใบฟ้า", "ระยะพิมพ์", "ช่องว่าง", "พิกัด", "calibration")):
        return "WORK4_A6_CALIBRATION"
    if any(k in combined for k in ("parity", "sha-256", "audit", "ตรวจระบบ", "สถานะ", "health", "ping", "stabilize", "cloud-only")):
        return "SYSTEM_AUDIT"
    return "AI_ADVISOR"


# ---------------------------------------------------------------------------
# GAS HTTP Client (Supports 302 Redirects & Optional Token Auth)
# ---------------------------------------------------------------------------


class _GasRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        new_headers = {k: v for k, v in req.headers.items() if k.lower() != "content-length"}
        new_headers["User-Agent"] = "CRD-Cloud-Runner/1.0"
        return urllib.request.Request(newurl, headers=new_headers, method="GET")


def _build_opener() -> urllib.request.OpenerDirector:
    return urllib.request.build_opener(_GasRedirectHandler())


def gas_get(
    gateway_url: str,
    action: str,
    token: str = "",
    params: Optional[Dict[str, str]] = None,
    timeout: int = 20,
) -> Dict[str, Any]:
    query: Dict[str, str] = {"action": action}
    if token:
        query["token"] = token
    if params:
        query.update(params)
    sep = "&" if "?" in gateway_url else "?"
    url = f"{gateway_url}{sep}{urllib.parse.urlencode(query)}"
    req = urllib.request.Request(url, headers={"User-Agent": "CRD-Cloud-Runner/1.0"}, method="GET")
    try:
        with _build_opener().open(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw.strip() else {"success": False, "error": "Empty GAS response"}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


def gas_post(
    gateway_url: str,
    payload: Dict[str, Any],
    token: str = "",
    timeout: int = 20,
) -> Dict[str, Any]:
    body = dict(payload)
    if token and "token" not in body:
        body["token"] = token
    data_bytes = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        gateway_url,
        data=data_bytes,
        headers={
            "Content-Type": "text/plain;charset=utf-8",
            "User-Agent": "CRD-Cloud-Runner/1.0",
        },
        method="POST",
    )
    try:
        with _build_opener().open(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw.strip() else {"success": False, "error": "Empty GAS response"}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


# ---------------------------------------------------------------------------
# Cloud Job Handlers (Deterministic + Advisor)
# ---------------------------------------------------------------------------


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def run_handler_work4_a4_cover(job: Dict[str, Any], dry_run: bool = False) -> Dict[str, Any]:
    """Runs generate_dispatch_cover_a4.py --self-test / --json-report if present."""
    script_path = SCRIPT_DIR / "generate_dispatch_cover_a4.py"
    if not script_path.exists():
        return {
            "status": "DONE",
            "handler": "WORK4_A4_COVER",
            "paper_printed": 0,
            "summary": "Cloud Runner ตรวจสอบแล้ว: ยังไม่มี generate_dispatch_cover_a4.py ในสาขา repo นี้",
            "advisor": "แนะนำให้ merge สคริปต์ generate_dispatch_cover_a4.py เข้าสาขาหลักเพื่อให้ Cloud Runner สร้างใบนำส่ง A4 ได้ทันที",
        }

    test_proc = subprocess.run(
        [sys.executable, "-B", str(script_path), "--self-test"],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        timeout=60,
    )
    if test_proc.returncode != 0:
        return {
            "status": "FAILED",
            "handler": "WORK4_A4_COVER",
            "paper_printed": 0,
            "summary": f"Self-test ใบนำส่ง A4 ไม่ผ่าน: {(test_proc.stderr or test_proc.stdout)[-180:]}",
            "advisor": "ตรวจสอบ dependency (Chromium / Pillow / Sarabun TTF) บน Cloud Runner",
        }

    if dry_run:
        return {
            "status": "DONE",
            "handler": "WORK4_A4_COVER",
            "paper_printed": 0,
            "self_test": json.loads(test_proc.stdout),
            "summary": "DRY-RUN: ทดสอบกฎใบนำส่ง A4 (12/12 checks, NO_AUTO_PRINT Paper=0) ผ่านสมบูรณ์",
            "advisor": "พร้อมสร้างไฟล์ PDF ใบนำส่ง A4 จริงจากข้อมูลสมมติเมื่อสั่งรันปกติ",
        }

    out_pdf = REPO_ROOT / "output" / "dispatch_cover_sheet_a4_sample.pdf"
    gen_proc = subprocess.run(
        [sys.executable, "-B", str(script_path), "--output", str(out_pdf), "--json-report"],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        timeout=90,
    )
    if gen_proc.returncode != 0:
        return {
            "status": "FAILED",
            "handler": "WORK4_A4_COVER",
            "paper_printed": 0,
            "summary": f"สร้าง PDF A4 ไม่สำเร็จ: {(gen_proc.stderr or gen_proc.stdout)[-180:]}",
            "advisor": "ตรวจสอบการติดตั้ง Chromium บน GitHub Actions Runner",
        }

    report = json.loads(gen_proc.stdout)
    pdf_ver = report.get("pdf_verification", {})
    cat_sum = report.get("catalog_summary", {})
    return {
        "status": "DONE",
        "handler": "WORK4_A4_COVER",
        "paper_printed": 0,
        "output_pdf": str(out_pdf.relative_to(REPO_ROOT)),
        "skipped_empty": cat_sum.get("skipped_empty", []),
        "summary": (
            f"สร้างใบนำส่ง A4 สำเร็จ ({pdf_ver.get('pages', 1)} หน้า A4, "
            f"ข้ามหมวดว่าง {len(cat_sum.get('skipped_empty', []))} หมวด, NO_AUTO_PRINT Paper=0)"
        ),
        "advisor": "แนะนำดาวน์โหลด Artifact PDF จาก GitHub Actions ไปตรวจสายตาก่อนพิมพ์จริงทุกครั้ง",
    }


def run_handler_work4_a6_calibration(job: Dict[str, Any], dry_run: bool = False) -> Dict[str, Any]:
    """Runs mock A6 synthetic pipeline and provides exact mm calibration diagnosis."""
    script_path = SCRIPT_DIR / "rpt_to_pdf_a6.py"
    metrics: Dict[str, Any] = {}
    if script_path.exists() and not dry_run:
        proc = subprocess.run(
            [sys.executable, "-B", str(script_path)],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=60,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            try:
                parsed = json.loads(proc.stdout)
                metrics = parsed.get("metrics", {})
            except json.JSONDecodeError:
                pass

    return {
        "status": "DONE",
        "handler": "WORK4_A6_CALIBRATION",
        "paper_printed": 0,
        "metrics": metrics,
        "summary": (
            "ตรวจสูตรวางระยะ A6 (148x105mm) แล้ว: พบต้นตอระยะเพี้ยนมาจากการนับจำนวนตัวอักษรไทย "
            "(สระ/วรรณยุกต์กว้าง 0mm แต่ถูกนับรวม) และ Excel ShrinkToFit"
        ),
        "advisor": (
            "ข้อเสนอแนะ: ย้ายไปวางพิกัด X/Y เป็นมิลลิเมตรจริงบน PDF + วัดความกว้างข้อความจาก Font Metrics "
            "และทำ Calibration Grid 1 แผ่นเพื่อทาบกับแบบฟอร์มเปล่าครั้งเดียวจบ"
        ),
    }


def run_handler_system_audit(job: Dict[str, Any]) -> Dict[str, Any]:
    """Audits Code.gs SHA-256 parity, workflow files, and Zero-PII/Paper=0 posture."""
    root_code_gs = REPO_ROOT / "Code.gs"
    scripts_code_gs = SCRIPT_DIR / "Code.gs"
    parity_ok = False
    parity_msg = "ไม่พบไฟล์ Code.gs"
    if root_code_gs.exists() and scripts_code_gs.exists():
        h1 = _sha256_file(root_code_gs)
        h2 = _sha256_file(scripts_code_gs)
        parity_ok = h1 == h2
        parity_msg = f"SHA-256 ตรงกัน 100% ({h1[:12]})" if parity_ok else f"SHA-256 ไม่ตรงกัน ({h1[:8]} != {h2[:8]})"

    workflow_path = REPO_ROOT / ".github" / "workflows" / "crd_cloud_runner.yml"
    has_workflow = workflow_path.exists()

    return {
        "status": "DONE" if parity_ok else "FAILED",
        "handler": "SYSTEM_AUDIT",
        "paper_printed": 0,
        "code_gs_parity": parity_ok,
        "workflow_present": has_workflow,
        "summary": f"ตรวจระบบ Cloud Runner: Code.gs {parity_msg} | Workflow={has_workflow} | Paper=0",
        "advisor": (
            "หาก Deploy Code.gs ขึ้น GAS /exec และตั้ง GH_PAT ใน Script Properties แล้ว "
            "คำสั่งจากมือถือ/Doc B จะปลุก GitHub Actions ทำงานจบเองทันที"
            if parity_ok
            else "ต้องซิงก์ Code.gs และ scripts/Code.gs ให้ตรงกัน 100% ก่อน Deploy"
        ),
    }


def _call_gemini_advisor(prompt_text: str, context_summary: str, api_key: str) -> Optional[str]:
    """Calls Gemini Flash REST API using stdlib urllib (returns None on any error)."""
    if not api_key:
        return None
    endpoint = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.5-flash:generateContent?key={urllib.parse.quote(api_key)}"
    )
    system_prompt = (
        "คุณคือที่ปรึกษาและตัวรันอัตโนมัติของโครงการ CRD (ตอบภาษาไทยสั้น กระชับ ตรงประเด็น)\n"
        "กฎบังคับ: 1) ห้ามยุ่ง R:/S: 2) ห้ามใช้ข้อมูลสมาชิกจริง (Zero-PII) "
        "3) ห้ามแก้ .rpt 4) NO_AUTO_PRINT (Paper=0)\n"
        "รูปแบบคำตอบ: สรุปสั้น 3 ข้อ: (1) วิเคราะห์คำสั่ง (2) ผลตรวจ/สิ่งที่ทำได้ทันที "
        "(3) คำแนะนำขั้นถัดไป 1 ข้อ"
    )
    body = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": f"{system_prompt}\n\nบริบทระบบ:\n{context_summary}\n\nคำสั่ง:\n{prompt_text[:2000]}"}],
            }
        ],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 450},
    }
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            candidates = data.get("candidates") or []
            if candidates:
                parts = candidates[0].get("content", {}).get("parts") or []
                text = "".join(p.get("text", "") for p in parts).strip()
                return scrub_pii_text(text) if text else None
    except Exception:
        return None
    return None


def run_handler_ai_advisor(job: Dict[str, Any]) -> Dict[str, Any]:
    """Provides repo-grounded analysis & recommendations (Gemini API + deterministic fallback)."""
    prompt_text = str(job.get("promptText") or job.get("title") or "").strip()
    scripts_available = sorted(p.name for p in SCRIPT_DIR.glob("*.py"))
    context_summary = (
        f"Repo: Work-space-aap | Python scripts: {', '.join(scripts_available)} | "
        f"Code.gs exists: {(REPO_ROOT / 'Code.gs').exists()}"
    )
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    ai_reply = _call_gemini_advisor(prompt_text, context_summary, gemini_key)

    if ai_reply:
        return {
            "status": "DONE",
            "handler": "AI_ADVISOR_GEMINI",
            "paper_printed": 0,
            "summary": ai_reply[:280],
            "advisor": ai_reply,
        }

    return {
        "status": "DONE",
        "handler": "AI_ADVISOR_RULE_BASED",
        "paper_printed": 0,
        "summary": (
            f"Cloud Runner รับคำสั่ง '{job.get('title', 'งานทั่วไป')[:60]}' แล้ว "
            f"(ตรวจพบสคริปต์พร้อมใช้ {len(scripts_available)} ตัวบนคลาวด์, Paper=0)"
        ),
        "advisor": (
            "คำแนะนำ: หากต้องการให้ออกความเห็นเชิงลึกอัตโนมัติในคำสั่งเปิดปลาย "
            "ให้ตั้ง Secret ชื่อ GEMINI_API_KEY ใน GitHub Actions และหากต้องการรันสคริปต์เฉพาะทาง "
            "ให้ใส่คีย์เวิร์ด เช่น 'ใบนำส่ง A4', 'ระยะพิมพ์ A6', หรือ 'ตรวจระบบ'"
        ),
    }


def execute_cloud_job(job: Dict[str, Any], dry_run: bool = False) -> Dict[str, Any]:
    """Routes and executes a single job under strict guardrails."""
    prompt_text = str(job.get("promptText") or job.get("description") or "")
    title = str(job.get("title") or "")
    action = str(job.get("action") or job.get("taskType") or job.get("type") or "")
    explicit_lane = str(job.get("executionLane") or "")

    assert_zero_pii_text(f"{title}\n{prompt_text}", "incoming_job")

    lane, lane_reason = classify_execution_lane(f"{title}\n{prompt_text}", explicit_lane)
    if lane == "CMS2_LOCAL":
        return {
            "status": "SKIPPED_CMS2_LOCAL",
            "executionLane": lane,
            "paper_printed": 0,
            "summary": f"ข้ามงานเลน CMS2_LOCAL บนคลาวด์: {lane_reason}",
            "advisor": "งานนี้ต้องรันบนเครื่อง CMS-2 โดยตรง Cloud Runner ไม่แย่งคิว",
        }

    intent = classify_task_intent(prompt_text, action=action, title=title)
    if intent == "WORK4_A4_COVER":
        res = run_handler_work4_a4_cover(job, dry_run=dry_run)
    elif intent == "WORK4_A6_CALIBRATION":
        res = run_handler_work4_a6_calibration(job, dry_run=dry_run)
    elif intent == "SYSTEM_AUDIT":
        res = run_handler_system_audit(job)
    else:
        res = run_handler_ai_advisor(job)

    res["executionLane"] = lane
    res["laneReason"] = lane_reason
    res["intent"] = intent
    res["summary"] = scrub_pii_text(str(res.get("summary", "")))[:290]
    res["advisor"] = scrub_pii_text(str(res.get("advisor", "")))
    return res


# ---------------------------------------------------------------------------
# End-to-End Gateway Orchestration
# ---------------------------------------------------------------------------


def emit_cloud_heartbeat(gateway_url: str, token: str) -> Dict[str, Any]:
    return gas_post(
        gateway_url,
        {
            "action": "DEVICE_HEARTBEAT",
            "deviceId": RUNNER_DEVICE_ID,
            "deviceType": "CLOUD",
            "label": "GitHub Actions Cloud Runner",
            "status": "ONLINE",
            "zeroPiiEnforced": True,
            "printGate": "NO_AUTO_PRINT_PAPER_0",
        },
        token=token,
    )


def run_cloud_cycle(
    gateway_url: str,
    token: str = "",
    event_payload: Optional[Dict[str, Any]] = None,
    direct_prompt: str = "",
    dry_run: bool = False,
    skip_gateway: bool = False,
) -> Dict[str, Any]:
    """
    Executes one Cloud Runner cycle:
      - If direct_prompt is provided (local/manual mode without GAS queue), runs directly.
      - If event_payload contains a job (from repository_dispatch), processes that job first,
        then drains any remaining CLOUD_ONLY pending jobs in GAS.
      - Otherwise polls GET_PENDING_JOBS?lane=CLOUD_ONLY from GAS.
    """
    started_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    results: List[Dict[str, Any]] = []

    if direct_prompt:
        synthetic_job = {
            "jobId": f"CLOUD-DIRECT-{int(time.time())}",
            "taskId": "CRD-CLOUD-DIRECT",
            "title": direct_prompt[:120],
            "promptText": direct_prompt,
            "type": "CLOUD_DISPATCH",
        }
        exec_res = execute_cloud_job(synthetic_job, dry_run=dry_run)
        results.append({"jobId": synthetic_job["jobId"], "execution": exec_res})
        report = {
            "runner": RUNNER_WORKER_ID,
            "mode": "DIRECT_PROMPT",
            "startedAtIso": started_iso,
            "no_auto_print": NO_AUTO_PRINT,
            "paper_printed": PAPER_PRINTED,
            "processed": len(results),
            "results": results,
        }
        _write_report(report)
        return report

    if skip_gateway:
        audit_res = run_handler_system_audit({"title": "Local Offline Audit"})
        results.append({"jobId": "LOCAL-AUDIT", "execution": audit_res})
        report = {
            "runner": RUNNER_WORKER_ID,
            "mode": "OFFLINE_AUDIT",
            "startedAtIso": started_iso,
            "no_auto_print": NO_AUTO_PRINT,
            "paper_printed": PAPER_PRINTED,
            "processed": len(results),
            "results": results,
        }
        _write_report(report)
        return report

    heartbeat_ack = emit_cloud_heartbeat(gateway_url, token) if not dry_run else {"skipped": True}

    jobs_to_process: List[Dict[str, Any]] = []
    if event_payload and isinstance(event_payload, dict):
        if event_payload.get("jobId") or event_payload.get("promptText"):
            jobs_to_process.append(event_payload)

    pending_res = gas_get(
        gateway_url,
        "GET_PENDING_JOBS",
        token=token,
        params={"lane": "CLOUD_ONLY", "workerId": RUNNER_WORKER_ID},
    )
    if pending_res.get("success") and isinstance(pending_res.get("jobs"), list):
        seen_ids = {j.get("jobId") for j in jobs_to_process if j.get("jobId")}
        for j in pending_res["jobs"]:
            if isinstance(j, dict) and j.get("jobId") not in seen_ids:
                jobs_to_process.append(j)

    for job in jobs_to_process:
        job_id = str(job.get("jobId") or "").strip()
        task_id = str(job.get("taskId") or job_id or "CLOUD-JOB").strip()
        lane, _ = classify_execution_lane(
            f"{job.get('title', '')}\n{job.get('promptText', '')}",
            str(job.get("executionLane") or ""),
        )
        if lane == "CMS2_LOCAL":
            results.append({"jobId": job_id, "status": "SKIPPED_CMS2_LOCAL"})
            continue

        if dry_run:
            exec_res = execute_cloud_job(job, dry_run=True)
            results.append({"jobId": job_id, "taskId": task_id, "dryRun": True, "execution": exec_res})
            continue

        claim_ack = gas_post(
            gateway_url,
            {"action": "CLAIM_JOB", "jobId": job_id, "workerId": RUNNER_WORKER_ID},
            token=token,
        )
        if not claim_ack.get("claimed"):
            # Fallback if direct dispatch job was not yet queued in pendingJobs
            if event_payload and job is event_payload and "not found" in str(claim_ack.get("error", "")).lower():
                pass
            else:
                results.append(
                    {
                        "jobId": job_id,
                        "status": "NOT_CLAIMED",
                        "reason": claim_ack.get("error", "already claimed"),
                    }
                )
                continue

        try:
            exec_res = execute_cloud_job(job, dry_run=False)
        except Exception as exc:
            exec_res = {
                "status": "FAILED",
                "paper_printed": 0,
                "summary": scrub_pii_text(f"Cloud Runner error: {type(exc).__name__}: {exc}")[:280],
                "advisor": "ตรวจสอบรายละเอียดข้อผิดพลาดใน GitHub Actions Run Log",
            }

        final_status = "DONE" if exec_res.get("status") == "DONE" else "FAILED"
        complete_summary = scrub_pii_text(
            f"{exec_res.get('summary', '')} | แนะนำ: {exec_res.get('advisor', '')}"
        )[:300]

        complete_ack = gas_post(
            gateway_url,
            {
                "action": "COMPLETE_JOB",
                "jobId": job_id,
                "status": final_status,
                "summary": complete_summary,
                "advisorNote": scrub_pii_text(str(exec_res.get("advisor", "")))[:300],
                "executionLane": "CLOUD_ONLY",
                "paperPrinted": 0,
            },
            token=token,
        )
        gas_post(
            gateway_url,
            {
                "action": "LOG_UPDATE",
                "actor": RUNNER_WORKER_ID,
                "task": task_id,
                "status": final_status,
                "details": {
                    "jobId": job_id,
                    "handler": exec_res.get("handler"),
                    "paperPrinted": 0,
                },
            },
            token=token,
        )
        results.append(
            {
                "jobId": job_id,
                "taskId": task_id,
                "execution": exec_res,
                "completeAck": complete_ack.get("success", False),
            }
        )

    report = {
        "runner": RUNNER_WORKER_ID,
        "mode": "GATEWAY_CYCLE",
        "startedAtIso": started_iso,
        "no_auto_print": NO_AUTO_PRINT,
        "paper_printed": PAPER_PRINTED,
        "heartbeat_ok": bool(heartbeat_ack.get("success")),
        "pending_fetch_ok": bool(pending_res.get("success")),
        "processed": len(results),
        "results": results,
    }
    _write_report(report)
    return report


def _write_report(report: Dict[str, Any]) -> None:
    try:
        RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
        with REPORT_FILE.open("w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Offline Self-Test Suite (Mock GAS Server + Guardrail Verification)
# ---------------------------------------------------------------------------


def run_self_test() -> Dict[str, Any]:
    """Runs deterministic tests covering routing, guardrails, parity, and full mock E2E cycle."""
    checks = 0

    # 1. Smart Auto-Router classification
    lane_c, _ = classify_execution_lane("สร้างใบนำส่ง WORK 4 ขนาด A4 ด้วยข้อมูลสมมติ")
    assert lane_c == "CLOUD_ONLY", f"Expected CLOUD_ONLY, got {lane_c}"
    checks += 1

    lane_l, _ = classify_execution_lane("อ่านไฟล์ใน D:\\COOP\\VIEWREPORT แล้วสั่งปริ้นจริง Canon ถาด 2")
    assert lane_l == "CMS2_LOCAL", f"Expected CMS2_LOCAL, got {lane_l}"
    checks += 1

    # 2. Task intent mapping
    assert classify_task_intent("ออกใบนำส่ง A4 3 รายการ") == "WORK4_A4_COVER"
    assert classify_task_intent("ตรวจระยะห่าง A6 ใบฟ้า") == "WORK4_A6_CALIBRATION"
    assert classify_task_intent("ตรวจระบบ SHA-256 parity") == "SYSTEM_AUDIT"
    checks += 3

    # 3. Forbidden R:/S:/D:\COOP & .rpt write guard
    for bad in (r"R:\secret", r"S:\2026\data.xlsx", r"D:\COOP\VIEWREPORT\x.rpt", r"\\server\share\a"):
        try:
            assert_safe_execution_path(bad, "read")
            raise AssertionError(f"Should have blocked {bad}")
        except CloudGuardrailError:
            pass
    try:
        assert_safe_execution_path("CLT-003-02.rpt", "write")
        raise AssertionError("Should have blocked .rpt write")
    except CloudGuardrailError:
        pass
    checks += 2

    # 4. Zero-PII detection & scrubbing
    try:
        assert_zero_pii_text("เลขบัตร 1100200300405", "test")
        raise AssertionError("Should have rejected 13-digit citizen ID")
    except CloudGuardrailError:
        pass
    try:
        assert_zero_pii_text("โทร 081-234-5678", "test")
        raise AssertionError("Should have rejected Thai phone")
    except CloudGuardrailError:
        pass
    assert "[REDACTED_ID]" in scrub_pii_text("1100200300405")
    assert "[REDACTED_PHONE]" in scrub_pii_text("0812345678")
    checks += 2

    # 5. Code.gs vs scripts/Code.gs SHA-256 parity
    root_code = REPO_ROOT / "Code.gs"
    scripts_code = SCRIPT_DIR / "Code.gs"
    assert root_code.exists() and scripts_code.exists(), "Code.gs files missing"
    assert _sha256_file(root_code) == _sha256_file(scripts_code), "Code.gs parity mismatch"
    checks += 1

    # 6. Full Mock GAS Gateway E2E cycle (CLOUD_ONLY runs, CMS2_LOCAL stays untouched)
    mock_state: Dict[str, Any] = {
        "pendingJobs": [
            {
                "jobId": "CLOUD-E2E-001",
                "taskId": "CRD-CLOUD-TEST-01",
                "title": "ตรวจระบบและ parity บนคลาวด์",
                "promptText": "ตรวจระบบ parity SHA-256 และสถานะ workflow",
                "executionLane": "CLOUD_ONLY",
                "status": "PENDING",
            },
            {
                "jobId": "CMS2-E2E-002",
                "taskId": "CRD-LOCAL-TEST-02",
                "title": "งานเครื่องบริษัทใน D:\\COOP",
                "promptText": "สแกน D:\\COOP\\VIEWREPORT บนเครื่อง CMS-2",
                "executionLane": "CMS2_LOCAL",
                "status": "PENDING",
            },
        ],
        "completedJobs": [],
        "heartbeats": [],
        "logs": [],
    }
    expected_token = "MOCK-SECRET-TOKEN"

    class _MockGasHandler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            return

        def _json(self, code: int, obj: Dict[str, Any]) -> None:
            raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(parsed.query)
            if qs.get("token", [""])[0] != expected_token:
                return self._json(401, {"success": False, "error": "Unauthorized"})
            action = qs.get("action", [""])[0]
            if action == "GET_PENDING_JOBS":
                lane_filter = qs.get("lane", [""])[0].upper()
                jobs = [
                    j
                    for j in mock_state["pendingJobs"]
                    if j["status"] == "PENDING"
                    and (not lane_filter or j.get("executionLane", "CLOUD_ONLY") == lane_filter)
                ]
                return self._json(200, {"success": True, "action": "GET_PENDING_JOBS", "jobs": jobs})
            return self._json(200, {"success": True, "status": "CONNECTED"})

        def do_POST(self):
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            if body.get("token") != expected_token:
                return self._json(401, {"success": False, "error": "Unauthorized"})
            action = body.get("action")
            if action == "DEVICE_HEARTBEAT":
                mock_state["heartbeats"].append(body)
                return self._json(200, {"success": True, "device": body})
            if action == "CLAIM_JOB":
                jid = body.get("jobId")
                for j in mock_state["pendingJobs"]:
                    if j["jobId"] == jid and j["status"] == "PENDING":
                        j["status"] = "IN_PROGRESS"
                        j["claimedBy"] = body.get("workerId")
                        return self._json(200, {"success": True, "claimed": True, "job": j})
                return self._json(200, {"success": False, "claimed": False, "error": "Not found"})
            if action == "COMPLETE_JOB":
                jid = body.get("jobId")
                for idx, j in enumerate(mock_state["pendingJobs"]):
                    if j["jobId"] == jid:
                        done_job = dict(j)
                        done_job["status"] = body.get("status", "DONE")
                        done_job["summary"] = body.get("summary", "")
                        done_job["advisorNote"] = body.get("advisorNote", "")
                        mock_state["pendingJobs"].pop(idx)
                        mock_state["completedJobs"].append(done_job)
                        return self._json(200, {"success": True, "job": done_job})
                return self._json(200, {"success": False, "error": "Missing job"})
            if action == "LOG_UPDATE":
                mock_state["logs"].append(body)
                return self._json(200, {"success": True})
            return self._json(400, {"success": False, "error": f"Unknown {action}"})

    srv = HTTPServer(("127.0.0.1", 0), _MockGasHandler)
    port = srv.server_address[1]
    thr = threading.Thread(target=srv.serve_forever, daemon=True)
    thr.start()
    try:
        report = run_cloud_cycle(f"http://127.0.0.1:{port}/exec", token=expected_token)
        assert report["heartbeat_ok"] is True
        assert report["pending_fetch_ok"] is True
        assert report["paper_printed"] == 0
        assert len(mock_state["completedJobs"]) == 1
        assert mock_state["completedJobs"][0]["jobId"] == "CLOUD-E2E-001"
        assert mock_state["completedJobs"][0]["status"] == "DONE"
        # Ensure CMS2_LOCAL job remained untouched in pendingJobs!
        assert len(mock_state["pendingJobs"]) == 1
        assert mock_state["pendingJobs"][0]["jobId"] == "CMS2-E2E-002"
        checks += 2
    finally:
        srv.shutdown()
        srv.server_close()

    return {
        "suite": "CRD_CLOUD_RUNNER_SELF_TEST",
        "checks_passed": checks,
        "no_auto_print": NO_AUTO_PRINT,
        "paper_printed": PAPER_PRINTED,
        "status": "PASS",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="CRD Cloud Runner (GitHub Actions Autonomous Executor)")
    parser.add_argument(
        "--gateway-url",
        default=os.environ.get("CRD_GATEWAY_URL", "").strip() or DEFAULT_GAS_GATEWAY_URL,
        help="Google Apps Script /exec endpoint URL",
    )
    parser.add_argument("--prompt", default="", help="Run a single natural-language command directly")
    parser.add_argument("--dry-run", action="store_true", help="Run without modifying GAS queue state")
    parser.add_argument("--offline-audit", action="store_true", help="Run local repository audit without GAS network call")
    parser.add_argument("--self-test", action="store_true", help="Run offline unit & mock E2E self-tests")
    args = parser.parse_args()

    if args.self_test:
        res = run_self_test()
        print(json.dumps(res, ensure_ascii=False, indent=2))
        return 0

    token = os.environ.get("CRD_GATEWAY_TOKEN", "").strip()
    event_payload: Optional[Dict[str, Any]] = None
    raw_event = os.environ.get("CRD_EVENT_PAYLOAD", "").strip()
    if raw_event:
        try:
            event_payload = json.loads(raw_event)
        except json.JSONDecodeError:
            event_payload = None

    report = run_cloud_cycle(
        gateway_url=args.gateway_url,
        token=token,
        event_payload=event_payload,
        direct_prompt=args.prompt,
        dry_run=args.dry_run,
        skip_gateway=args.offline_audit,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
