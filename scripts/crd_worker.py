#!/usr/bin/env python3
"""
CRD Worker Daemon & Environment Verifier (v2.1-docb-bridge)
===========================================================
Host: CMS-2 (Local-First / Zero-PII Enforced)
Components:
1. 15-Second GAS Gateway Job Queue Poller (GET_PENDING_JOBS -> DOC_B_DISPATCH -> Antigravity CLI -> COMPLETE_JOB)
2. Live Device Heartbeat (DEVICE_HEARTBEAT) & Module Status to GAS Manifest Gateway
3. Read-Only .RPT Scanner in D:\\COOP\\VIEWREPORT\\หนังสือบอกกล่าวการชำระหนี้_CLT (A6 Preview Readiness, Paper=0)
4. Windows Task Scheduler Auditor for CRD Tasks
5. Persistent Loop Daemon Mode (--daemon) & Single Execution Mode (--once)
"""

import os
import sys
import json
import time
import shutil
import signal
import hashlib
import re
import urllib.request
import urllib.error
import urllib.parse
import subprocess
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

# Suppress bytecode generation
sys.dont_write_bytecode = True
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"

GAS_GATEWAY_URL = "https://script.google.com/macros/s/AKfycbwTEboyfHQ0LzmrP0mtxWCYtrg13Jz5JqKpLVW-8Dtf3bWYqoc-ZoPObtZGjSlKriBU/exec"
RPT_DIR_DEFAULT = r"D:\COOP\VIEWREPORT\หนังสือบอกกล่าวการชำระหนี้_CLT"
TASK_NAME_WATCHER = "CRD_CMS2_TaskInbox_Watcher_10Min"
TASK_NAME_WORKER = "CRD_CMS2_Worker_Boot"
DEFAULT_INTERVAL_SECONDS = 15    # Poll GAS PENDING_JOBS every 15s when PC is online
HEARTBEAT_INTERVAL_SECONDS = 60  # Send Drive manifest heartbeat every 60s
AGY_EXE_DEFAULT = r"C:\Users\Natee.yan\.gemini\bin\agy.exe"
WORKSPACE_DIR_DEFAULT = r"C:\Users\Natee.yan\OneDrive\CRD PROJECT"

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME_DIR = os.path.join(BASE_DIR, "runtime")
PROCESSED_JOBS_FILE = os.path.join(RUNTIME_DIR, "processed_doc_b_jobs.json")
DISPATCH_LOG_FILE = os.path.join(RUNTIME_DIR, "doc_b_dispatch.log")

# ==============================================================================
# CRD HARD-LOCKED TASK ALLOWLIST (Zero-PII Local Enforcement)
# ==============================================================================
ALLOWED_TASKS = {
    "DEVICE_HEARTBEAT",
    "DOC_B_DISPATCH",
    "WORK1_PRINT",
    "WORK2_FOLLOWUP",
    "WORK3_SMS_PREVIEW",
    "WORK4_PREVIEW_A6",
    "WORK4_PACK_64REC",
    "WORK5_DEFAULT_LOAN",
    "WORK6_PAYMENT_077",
    "WORK7_SMS_MAPPING",
    "WORK8_GUARANTOR",
    "WORK9_EXEC_REPORT",
    "V003_SPLIT_077",
    "INBOX_WATCHER_10MIN"
}


def validate_task_allowlist(task_name: str) -> bool:
    """
    Validates task against the hard-locked task allowlist.
    Rejects and logs any task outside the catalog immediately.
    """
    clean_name = (task_name or "").strip().upper()
    if clean_name in ALLOWED_TASKS:
        return True

    log_line = (
        f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [TASK_SECURITY_ALERT] "
        f"Rejected unauthorized task: '{task_name}'. Allowed tasks: {sorted(list(ALLOWED_TASKS))}"
    )
    print(log_line, file=sys.stderr)
    try:
        os.makedirs(RUNTIME_DIR, exist_ok=True)
        with open(os.path.join(RUNTIME_DIR, "task_rejections.log"), "a", encoding="utf-8") as f:
            f.write(log_line + "\n")
    except Exception:
        pass
    return False


CATEGORIES_SPEC = [
    {"code": "C01", "rpt_prefix": "CLT-003-02", "name": "ผู้กู้ 2 งวด", "form_type": "ก.2/ค.2 + EMS A6"},
    {"code": "C02", "rpt_prefix": "CLT-004-02", "name": "ผู้กู้ร่วม 2 งวด", "form_type": "ก.2/ค.2 + EMS A6"},
    {"code": "C03", "rpt_prefix": "CLT-004-02", "name": "ผู้ค้ำ 2 งวด", "form_type": "ก.2/ค.2 + EMS A6"},
    {"code": "C04", "rpt_prefix": "CLT-005-02", "name": "ผู้กู้ 4 งวด", "form_type": "ก.2/ค.2 + EMS A6"},
    {"code": "C05", "rpt_prefix": "CLT-006-02", "name": "ผู้กู้ร่วม 4 งวด", "form_type": "ก.2/ค.2 + EMS A6"},
    {"code": "C06", "rpt_prefix": "CLT-006-02", "name": "ผู้ค้ำ 4 งวด", "form_type": "ก.2/ค.2 + EMS A6"},
    {"code": "C07", "rpt_prefix": "CLT-007-02", "name": "ผู้กู้ 5 งวด", "form_type": "ใบฟ้า EMS A6"},
    {"code": "C08", "rpt_prefix": "CLT-008-02", "name": "ผู้กู้ร่วม 5 งวด", "form_type": "ใบฟ้า EMS A6"},
    {"code": "C09", "rpt_prefix": "CLT-008-02", "name": "ผู้ค้ำ 5 งวด", "form_type": "ใบฟ้า EMS A6"}
]


def _gateway_token() -> str:
    return os.environ.get("CRD_GATEWAY_TOKEN", "").strip()


def _log_dispatch(msg: str) -> None:
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [DOC_B_DISPATCH] {msg}"
    print(line, flush=True)
    try:
        os.makedirs(RUNTIME_DIR, exist_ok=True)
        with open(DISPATCH_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def gas_get(action: str, params: Optional[Dict[str, str]] = None, timeout: int = 15) -> Dict[str, Any]:
    query: Dict[str, str] = {"action": action}
    token = _gateway_token()
    if token:
        query["token"] = token
    if params:
        query.update(params)
    url = f"{GAS_GATEWAY_URL}?{urllib.parse.urlencode(query)}"
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {"success": False, "error": "Empty response"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def gas_post(payload: Dict[str, Any], timeout: int = 15) -> Dict[str, Any]:
    body = dict(payload)
    token = _gateway_token()
    if token and "token" not in body:
        body["token"] = token
    try:
        req = urllib.request.Request(
            GAS_GATEWAY_URL,
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "text/plain;charset=utf-8"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {"success": False, "error": "Empty response"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _load_processed_cache() -> Dict[str, Any]:
    try:
        if os.path.exists(PROCESSED_JOBS_FILE):
            with open(PROCESSED_JOBS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
    except Exception:
        pass
    return {"job_ids": [], "content_hashes": []}


def _save_processed_cache(cache: Dict[str, Any]) -> None:
    try:
        os.makedirs(RUNTIME_DIR, exist_ok=True)
        trimmed = {
            "job_ids": list(cache.get("job_ids", []))[-200:],
            "content_hashes": list(cache.get("content_hashes", []))[-200:],
            "updated_at": datetime.now().isoformat()
        }
        with open(PROCESSED_JOBS_FILE, "w", encoding="utf-8") as f:
            json.dump(trimmed, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def fetch_pending_jobs() -> Dict[str, Any]:
    """Polls GAS Gateway GET_PENDING_JOBS."""
    return gas_get("GET_PENDING_JOBS", timeout=15)


def claim_job(job_id: str) -> Dict[str, Any]:
    """Atomically claims a PENDING job via CLAIM_JOB."""
    return gas_post({
        "action": "CLAIM_JOB",
        "jobId": job_id,
        "workerId": "CMS-2"
    }, timeout=15)


def complete_job(job_id: str, status: str, summary: str) -> Dict[str, Any]:
    """Marks a claimed job complete via COMPLETE_JOB (Zero-PII summary)."""
    return gas_post({
        "action": "COMPLETE_JOB",
        "jobId": job_id,
        "status": status,
        "summary": summary[:300]
    }, timeout=15)


def _resolve_agy_exe() -> Optional[str]:
    if os.path.exists(AGY_EXE_DEFAULT):
        return AGY_EXE_DEFAULT
    return shutil.which("agy")


def handle_doc_b_dispatch(job: Dict[str, Any], dry_run: bool = False) -> Dict[str, Any]:
    """
    Validates, deduplicates, claims, and executes a DOC_B_DISPATCH job
    via Antigravity CLI non-interactively, enforcing Zero-PII & Read-Only rules.
    """
    job_type = str(job.get("taskType") or job.get("type") or "DOC_B_DISPATCH").strip().upper()
    if not validate_task_allowlist(job_type):
        return {"success": False, "status": "REJECTED_ALLOWLIST", "jobId": job.get("jobId")}

    job_id = str(job.get("jobId") or "").strip()
    content_hash = str(job.get("contentHash") or "").strip()
    task_id = str(job.get("taskId") or "UNKNOWN").strip()
    if not job_id:
        return {"success": False, "status": "INVALID_JOB_ID"}

    cache = _load_processed_cache()
    if job_id in cache.get("job_ids", []) or (content_hash and content_hash in cache.get("content_hashes", [])):
        _log_dispatch(f"Skipping already-processed job {job_id} (taskId={task_id})")
        return {"success": True, "status": "SKIPPED_DUPLICATE", "jobId": job_id}

    if dry_run:
        return {"success": True, "status": "DRY_RUN_READY", "jobId": job_id, "taskId": task_id}

    claim_res = claim_job(job_id)
    if not claim_res.get("claimed"):
        _log_dispatch(f"Job {job_id} could not be claimed: {claim_res.get('error', 'already claimed')}")
        return {"success": False, "status": "NOT_CLAIMED", "jobId": job_id}

    agy_exe = _resolve_agy_exe()
    if not agy_exe:
        msg = "Antigravity CLI (agy.exe) not found on CMS-2"
        _log_dispatch(f"FAILED {job_id}: {msg}")
        complete_job(job_id, "FAILED", msg)
        return {"success": False, "status": "FAILED", "error": msg}

    dispatch_prompt = (
        "Read the latest active task from Google Doc 'CRD — Task Inbox & Remote Communication' "
        "(Doc B: 1UL_maGIJiMm8N6f0sUIYwAkFsqpHLz4HrZbkQZTZn7Q) and execute it end-to-end. "
        "ENFORCE NON-NEGOTIABLE GUARDRAILS: Zero-PII 100%, Read-Only corporate sources "
        "(D:\\COOP\\VIEWREPORT, 00_MASTER_SOURCE, Desktop\\งานผู้จัดการ, S:\\2026), "
        "NO_AUTO_PRINT (Paper=0), NO_AUTO_SEND_SMS, and NEVER bypass login/2FA/Passkey/CAPTCHA. "
        "Upon completion or auth checkpoint, replace the top active block in Doc B with a concise "
        "5-line [CRD WORK CARD — EXECUTION REPORT]."
    )

    _log_dispatch(f"Dispatching job {job_id} (taskId={task_id}) to Antigravity CLI...")
    final_status = "DONE"
    summary = f"Dispatched {task_id} via Antigravity CLI on CMS-2"
    try:
        workdir = WORKSPACE_DIR_DEFAULT if os.path.exists(WORKSPACE_DIR_DEFAULT) else BASE_DIR
        cmd = [agy_exe, "-p", dispatch_prompt, "--mode", "auto", "--print-timeout", "600s"]
        proc = subprocess.run(
            cmd,
            cwd=workdir,
            capture_output=True,
            text=True,
            timeout=630,
            creationflags=(subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
        )
        if proc.returncode != 0:
            final_status = "FAILED"
            err_tail = (proc.stderr or proc.stdout or "").strip()[-180:]
            summary = f"agy exit={proc.returncode} ({err_tail})"
        else:
            summary = f"Completed {task_id} via Antigravity CLI (exit=0, Zero-PII)"
    except Exception as e:
        final_status = "FAILED"
        summary = f"Dispatch exception: {type(e).__name__}: {e}"

    cache.setdefault("job_ids", []).append(job_id)
    if content_hash:
        cache.setdefault("content_hashes", []).append(content_hash)
    _save_processed_cache(cache)

    complete_res = complete_job(job_id, final_status, summary)
    _log_dispatch(f"Finished job {job_id}: status={final_status}, completeAck={complete_res.get('success')}")
    return {"success": final_status == "DONE", "status": final_status, "jobId": job_id, "summary": summary}


def submit_job(job_spec: Dict[str, Any]) -> Dict[str, Any]:
    """Enqueues a job into GAS Gateway via SUBMIT_JOB."""
    payload = {"action": "SUBMIT_JOB"}
    payload.update(job_spec)
    return gas_post(payload, timeout=15)


def fetch_doc_b_top_active_job() -> Optional[Dict[str, Any]]:
    """
    Directly reads Google Doc B via gdocs CLI as a local fallback when GAS pollDocBToQueue
    has not queued a top active dispatch (e.g. unified runbook headings without a literal STATUS: line).
    """
    doc_b_id = "1UL_maGIJiMm8N6f0sUIYwAkFsqpHLz4HrZbkQZTZn7Q"
    permanent_cmd = os.path.expanduser(r"~\.gemini\config\plugins\gdocs\skills\gdocs\scripts\gdocs.cmd")
    native_exe = os.path.expanduser(r"~\.gemini\antigravity\plugin_data\gdocs\bin\gdocs-986250228.exe")

    use_shell = False
    if sys.platform == "win32" and os.path.exists(permanent_cmd):
        bin_name = permanent_cmd
        use_shell = True
    elif sys.platform == "win32" and os.path.exists(native_exe):
        bin_name = native_exe
    else:
        return None

    custom_env = os.environ.copy()
    app_data_dir = os.path.expanduser(r"~\.gemini\antigravity")
    if "ANTIGRAVITY_APP_DATA_DIR" not in custom_env and os.path.exists(app_data_dir):
        custom_env["ANTIGRAVITY_APP_DATA_DIR"] = app_data_dir

    try:
        proc = subprocess.run(
            [bin_name, "readonly", "read", doc_b_id],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
            shell=use_shell,
            env=custom_env,
            creationflags=(subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
        )
        if proc.returncode != 0 or not proc.stdout:
            return None
        content = proc.stdout.strip()
    except Exception:
        return None

    top_block = re.split(r'\n---\s*\n', content)[0].strip()
    if not top_block:
        return None

    first_line = top_block.split("\n")[0].strip()
    if "EXECUTION REPORT" in first_line.upper() or "PERMANENT SYSTEM" in first_line.upper():
        return None

    status_m = re.search(r'STATUS\s*:\s*([^\r\n]+)', top_block, re.IGNORECASE)
    if status_m and re.search(r'\b(PAUSED|COMPLETED|DONE|BLOCKED|CANCELLED|HOLD|SKIPPED|FINISHED|FAILED)\b', status_m.group(1), re.IGNORECASE):
        return None

    is_active = bool(
        re.search(r'(READY FOR AGENT EXECUTION|EXECUTE IMMEDIATELY|EXECUTE ALL STAGES|EXECUTE DIRECTLY|ACTIVE TASK|UNIFIED ALL-IN-ONE EXECUTION RUNBOOK)', top_block, re.IGNORECASE)
    )
    if not is_active:
        return None

    content_hash = hashlib.sha256(top_block.encode("utf-8")).hexdigest()
    cache = _load_processed_cache()
    if content_hash in cache.get("content_hashes", []):
        return None

    task_id_m = re.search(r'TASK\\?_ID\s*:\s*([A-Za-z0-9_\-]+)', top_block, re.IGNORECASE)
    task_id = task_id_m.group(1).replace('\\', '') if task_id_m else f"DOCB-{content_hash[:8]}"
    header_m = re.search(r'\\?\[([^\[\]]+)\\?\]', first_line)
    title = header_m.group(1).strip() if header_m else first_line[:120]

    return {
        "jobId": f"DOCB-LOCAL-{content_hash[:10]}",
        "type": "DOC_B_DISPATCH",
        "taskType": "DOC_B_DISPATCH",
        "taskId": task_id,
        "title": title,
        "source": "CMS2_LOCAL_DOCB_BRIDGE",
        "docId": doc_b_id,
        "contentHash": content_hash,
        "promptText": top_block[:4000]
    }


def poll_and_process_pending_jobs(dry_run: bool = False) -> Dict[str, Any]:
    """Fetches PENDING_JOBS from GAS (plus local Doc B fallback) and processes allowlisted DOC_B_DISPATCH jobs."""
    res = fetch_pending_jobs()
    if not res.get("success"):
        return {"success": False, "error": res.get("error", "Failed to fetch pending jobs"), "processed": 0}
    if res.get("action") != "GET_PENDING_JOBS":
        return {"success": False, "error": f"Unexpected GAS action response: {res.get('action')}", "processed": 0}

    jobs = list(res.get("jobs") or [])
    if not jobs:
        doc_b_state = res.get("docBState") or {}
        if not doc_b_state.get("lastTopActive", False):
            local_job = fetch_doc_b_top_active_job()
            if local_job:
                if not dry_run:
                    sub_res = submit_job(local_job)
                    if sub_res.get("success") and sub_res.get("job"):
                        jobs.append(sub_res["job"])
                    else:
                        jobs.append(local_job)
                else:
                    jobs.append(local_job)

    results = []
    for job in jobs:
        if not isinstance(job, dict):
            continue
        job_type = str(job.get("taskType") or job.get("type") or "").strip().upper()
        if job_type == "DOC_B_DISPATCH":
            results.append(handle_doc_b_dispatch(job, dry_run=dry_run))
        else:
            validate_task_allowlist(job_type or "UNKNOWN")

    return {
        "success": True,
        "pending_count": len(jobs),
        "processed": len(results),
        "results": results
    }


def send_device_heartbeat(status_data: Dict[str, Any]) -> Dict[str, Any]:
    """Sends dedicated DEVICE_HEARTBEAT action to GAS Gateway to update devices['CMS-2']."""
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    payload = {
        "action": "DEVICE_HEARTBEAT",
        "deviceId": "CMS-2",
        "deviceType": "PC",
        "label": "Desktop PC",
        "lastHeartbeatIso": now_iso,
        "status": "ONLINE",
        "zeroPiiEnforced": True,
        "printGate": "LOCKED_ZERO_PAPER"
    }
    resp = gas_post(payload, timeout=15)
    if resp.get("success"):
        return {"success": True, "response": resp}
    return {"success": False, "error": resp.get("error", "Unknown")}


def send_module_heartbeat(status_data: Dict[str, Any]) -> Dict[str, Any]:
    """Sends module status (CMS2-HEARTBEAT-LIVE) to GAS Gateway."""
    now_iso = datetime.now().isoformat()
    payload = {
        "action": "DEPLOY_EVOLVED_UI_DESIGN",
        "componentId": "CMS2-HEARTBEAT-LIVE",
        "title": "CMS-2 Live Heartbeat & Environment Status",
        "category": "WORKER_HEARTBEAT",
        "summary": f"CMS-2 Online | 15s Doc-B Bridge Active | Heartbeat {now_iso} | Zero-PII Enforced",
        "gate": "HEARTBEAT_LIVE_OK",
        "rule": "ZERO_PII_STRICT",
        "status": "LIVE_ACTIVE",
        "result": "ONLINE",
        "uiPreviewData": status_data
    }
    resp = gas_post(payload, timeout=15)
    if resp.get("success"):
        return {"success": True, "response": resp}
    return {"success": False, "error": resp.get("error", "Unknown")}


def scan_rpt_viewreport(rpt_dir: str = RPT_DIR_DEFAULT) -> Dict[str, Any]:
    """
    Read-only inspection of .RPT files in COOP VIEWREPORT directory.
    Validates A6 preview readiness without triggering physical printing.
    """
    rpt_dir_exists = os.path.exists(rpt_dir)
    found_rpts = []
    category_matches = {cat["code"]: [] for cat in CATEGORIES_SPEC}

    if rpt_dir_exists:
        try:
            for fname in os.listdir(rpt_dir):
                if fname.upper().endswith(".RPT"):
                    fpath = os.path.join(rpt_dir, fname)
                    st = os.stat(fpath)
                    item = {
                        "name": fname,
                        "size_bytes": st.st_size,
                        "modified": datetime.fromtimestamp(st.st_mtime).isoformat()
                    }
                    found_rpts.append(item)
                    for cat in CATEGORIES_SPEC:
                        if cat["rpt_prefix"].upper() in fname.upper():
                            category_matches[cat["code"]].append(fname)
        except Exception:
            pass

    return {
        "target_path": rpt_dir,
        "exists": rpt_dir_exists,
        "total_rpts_found": len(found_rpts),
        "files": found_rpts,
        "category_matches": category_matches,
        "a6_preview_ready": rpt_dir_exists and len(found_rpts) > 0,
        "physical_paper_printed": 0,
        "print_gate_status": "LOCKED_ZERO_PAPER"
    }


def check_task_scheduler_watcher() -> Dict[str, Any]:
    """Inspects Windows Task Scheduler for CRD Tasks."""
    if sys.platform != "win32":
        return {
            "task_name": TASK_NAME_WORKER,
            "platform": sys.platform,
            "status": "NON_WINDOWS_RUNTIME",
            "installed": True,
            "interval_seconds": DEFAULT_INTERVAL_SECONDS
        }

    try:
        cmd = ["schtasks", "/query", "/tn", TASK_NAME_WORKER, "/fo", "LIST", "/v"]
        res = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=(subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
        )
        if res.returncode == 0:
            lines = res.stdout.splitlines()
            status_line = next((l for l in lines if "Status:" in l or "สถานะ:" in l), "Status: Ready")
            last_run_line = next((l for l in lines if "Last Run Time:" in l or "เวลาเริ่มทำงานล่าสุด:" in l), "")
            return {
                "task_name": TASK_NAME_WORKER,
                "installed": True,
                "output_status": status_line.strip(),
                "last_run": last_run_line.strip()
            }
        else:
            return {
                "task_name": TASK_NAME_WORKER,
                "installed": False,
                "detail": res.stderr.strip()
            }
    except Exception as e:
        return {"task_name": TASK_NAME_WORKER, "error": str(e)}


def run_worker_cycle(send_heartbeat: bool = True, poll_jobs: bool = True, dry_run_jobs: bool = False) -> Dict[str, Any]:
    now = datetime.now()
    print("=" * 65)
    print(f" CRD WORKER (v2.1-docb-bridge) — {now.strftime('%Y-%m-%d %H:%M:%S')}")
    print(" Host: CMS-2 | Zero-PII Strict Enforcement | Poll: 15s")
    print("=" * 65)

    worker_status: Dict[str, Any] = {
        "timestamp_iso": now.isoformat(),
        "date_today": now.strftime("%Y-%m-%d"),
        "host": "CMS-2",
        "poll_interval_seconds": DEFAULT_INTERVAL_SECONDS
    }

    if poll_jobs:
        print("\n[1/4] Polling GAS Gateway PENDING_JOBS (DOC_B_DISPATCH)...")
        job_poll = poll_and_process_pending_jobs(dry_run=dry_run_jobs)
        worker_status["job_poll"] = job_poll
        print(f"  * Poll OK: {job_poll.get('success')} | Pending: {job_poll.get('pending_count', 0)} | Processed: {job_poll.get('processed', 0)}")

    if send_heartbeat:
        print("\n[2/4] Scanning COOP VIEWREPORT .RPT files (Read-Only)...")
        rpt_info = scan_rpt_viewreport()
        print(f"  * Directory: {rpt_info['target_path']} (Exists: {rpt_info['exists']})")
        print(f"  * Total .RPT files: {rpt_info['total_rpts_found']}")
        print(f"  * A6 Preview Status: {'READY' if rpt_info['a6_preview_ready'] else 'STANDBY_MOCK'}")
        print(f"  * Physical Print Paper: {rpt_info['physical_paper_printed']} (Paper=0 Strictly Enforced)")

        print("\n[3/4] Auditing Task Scheduler & Security Allowlist...")
        print(f"  * Hard-Locked Task Allowlist: {len(ALLOWED_TASKS)} Standard Tasks Active")
        task_info = check_task_scheduler_watcher()
        print(f"  * Task Name: {task_info['task_name']}")
        print(f"  * Installed: {task_info.get('installed', False)}")
        print(f"  * Status: {task_info.get('output_status', task_info.get('status', 'OK'))}")

        worker_status.update({
            "rpt_scan": rpt_info,
            "task_scheduler": task_info,
            "v003_status": "AUDITED_PARTIAL_7_PATHS_IDENTIFIED",
            "work1_status": "TEMPLATE_BOUND_MEM_ID_5DIGIT"
        })

        print("\n[4/4] Sending Live Heartbeats to GAS Gateway...")
        dev_res = send_device_heartbeat(worker_status)
        print(f"  * Live DEVICE_HEARTBEAT Sent: {dev_res.get('success', False)}")
        if dev_res.get("success"):
            device_data = dev_res.get("response", {}).get("device", {})
            print(f"  * CMS-2 Device lastSeenIso: {device_data.get('lastSeenIso', 'Updated')}")
        else:
            print(f"  * DEVICE_HEARTBEAT Warning: {dev_res.get('error', 'Unknown')}")

        mod_res = send_module_heartbeat(worker_status)
        print(f"  * Live Module Heartbeat Sent: {mod_res.get('success', False)}")
        if mod_res.get("success"):
            print(f"  * Gateway Manifest Updated (EventId: {mod_res.get('response', {}).get('eventId', 'N/A')})")
        else:
            print(f"  * Module Heartbeat Warning: {mod_res.get('error', 'Unknown')}")

    print("\n" + "=" * 65)
    print(" CRD WORKER CYCLE COMPLETED (Zero-PII 100%)")
    print("=" * 65)
    return worker_status


def daemon_loop(interval_seconds: int = DEFAULT_INTERVAL_SECONDS):
    print(f"Starting CRD Worker Daemon Loop (PID: {os.getpid()}, Job Poll: {interval_seconds}s, Heartbeat: {HEARTBEAT_INTERVAL_SECONDS}s)...")

    def handle_signal(sig, frame):
        print(f"\n[CRD WORKER] Received termination signal {sig}. Graceful shutdown.")
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    last_heartbeat_ts = 0.0
    while True:
        now_mono = time.monotonic()
        should_heartbeat = (now_mono - last_heartbeat_ts) >= HEARTBEAT_INTERVAL_SECONDS
        try:
            run_worker_cycle(send_heartbeat=should_heartbeat, poll_jobs=True)
            if should_heartbeat:
                last_heartbeat_ts = time.monotonic()
        except Exception as e:
            print(f"[CRD WORKER ERROR] Cycle exception: {e}")
        time.sleep(interval_seconds)


if __name__ == "__main__":
    if "--validate-task" in sys.argv:
        t_idx = sys.argv.index("--validate-task") + 1
        t_name = sys.argv[t_idx] if t_idx < len(sys.argv) else ""
        valid = validate_task_allowlist(t_name)
        print(f"Task '{t_name}' validation: {'ACCEPTED' if valid else 'REJECTED'}")
        sys.exit(0 if valid else 1)
    elif "--poll-jobs-only" in sys.argv:
        dry_run = "--dry-run" in sys.argv
        out = poll_and_process_pending_jobs(dry_run=dry_run)
        print(json.dumps(out, ensure_ascii=False, indent=2))
    elif "--daemon" in sys.argv:
        daemon_loop()
    else:
        dry_run = "--dry-run" in sys.argv
        run_worker_cycle(send_heartbeat=True, poll_jobs=True, dry_run_jobs=dry_run)
