#!/usr/bin/env python3
"""
CRD CMS-2 Task Inbox 10-Minute Watcher Daemon
=============================================
TASK_ID: CRD-CMS2-AUTO-WATCHER-10MIN
Target Doc: CRD — Task Inbox & Remote Communication (ID: 1UL_maGIJiMm8N6f0sUIYwAkFsqpHLz4HrZbkQZTZn7Q)
Interval: 10 minutes (600 seconds)
Safe mode: Read-Only inspection, Zero-PII, Append-Only state tracking & logging.
"""

import os
import sys
import time
import json
import hashlib
import subprocess
import signal
import re
from datetime import datetime

DOC_ID = "1UL_maGIJiMm8N6f0sUIYwAkFsqpHLz4HrZbkQZTZn7Q"
POLL_INTERVAL_SECONDS = 600  # 10 minutes

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME_DIR = os.path.join(BASE_DIR, "runtime")
STATE_FILE = os.path.join(RUNTIME_DIR, "crd_watcher_state.json")
LOCK_FILE = os.path.join(RUNTIME_DIR, "crd_watcher.lock")
LOG_FILE = os.path.join(RUNTIME_DIR, "crd_watcher.log")


def log_msg(msg: str):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] [CRD-WATCHER-10MIN] {msg}"
    print(line, flush=True)
    try:
        os.makedirs(RUNTIME_DIR, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def acquire_lock() -> bool:
    os.makedirs(RUNTIME_DIR, exist_ok=True)
    if os.path.exists(LOCK_FILE):
        try:
            with open(LOCK_FILE, "r") as f:
                pid = int(f.read().strip())
            # Check if pid is alive
            if pid != os.getpid():
                try:
                    os.kill(pid, 0)
                    log_msg(f"Lock active by PID {pid}. Skipping duplicate cycle.")
                    return False
                except OSError:
                    log_msg(f"Stale lock found from dead PID {pid}. Overwriting.")
        except Exception:
            pass

    with open(LOCK_FILE, "w") as f:
        f.write(str(os.getpid()))
    return True


def release_lock():
    try:
        if os.path.exists(LOCK_FILE):
            os.remove(LOCK_FILE)
    except Exception:
        pass


def fetch_doc_content() -> str:
    """Reads latest document text via gdocs CLI."""
    native_exe = os.path.expanduser(r"~\.gemini\antigravity\plugin_data\gdocs\bin\gdocs-986250228.exe")
    permanent_cmd = os.path.expanduser(r"~\.gemini\config\plugins\gdocs\skills\gdocs\scripts\gdocs.cmd")
    
    use_shell = False
    if sys.platform == "win32" and os.path.exists(permanent_cmd):
        bin_name = permanent_cmd
        use_shell = True
    elif sys.platform == "win32" and os.path.exists(native_exe):
        bin_name = native_exe
    else:
        bin_name = "gdocs.cmd" if sys.platform == "win32" else "gdocs"
        use_shell = (sys.platform == "win32")
        
    cmd = [bin_name, "readonly", "read", DOC_ID]
    custom_env = os.environ.copy()
    app_data_dir = os.path.expanduser(r"~\.gemini\antigravity")
    if "ANTIGRAVITY_APP_DATA_DIR" not in custom_env and os.path.exists(app_data_dir):
        custom_env["ANTIGRAVITY_APP_DATA_DIR"] = app_data_dir

    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=45,
            shell=use_shell,
            env=custom_env,
            creationflags=(subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
        )
        if proc.returncode == 0:
            if not proc.stdout:
                log_msg(f"gdocs read succeeded (code 0) but stdout was empty. stderr: {proc.stderr[:150]}")
            return proc.stdout
        else:
            log_msg(f"Warning: gdocs read returned non-zero code {proc.returncode}: {proc.stderr[:200]}")
            return ""
    except Exception as e:
        log_msg(f"Error executing gdocs read ({type(e).__name__}): {e}")
        return ""


def parse_ready_tasks(content: str):
    """
    Scans for active dispatch blocks (READY FOR AGENT EXECUTION / EXECUTE IMMEDIATELY / EXECUTE ALL STAGES / EXECUTE DIRECTLY).
    Returns structured list of pending tasks.
    """
    tasks = []
    blocks = re.split(r'\n(?=##\s+|\s*\\?\[[A-Z0-9_\-\s\|]+)', content)
    for b in blocks:
        if "EXECUTION REPORT" in b[:200] or "PERMANENT SYSTEM GUARDRAILS" in b[:200]:
            continue
        if re.search(r'(READY FOR AGENT EXECUTION|EXECUTE IMMEDIATELY|EXECUTE ALL STAGES|EXECUTE DIRECTLY|ACTIVE TASK)', b, re.IGNORECASE):
            if re.search(r'STATUS\s*:\s*(COMPLETED|DONE|PAUSED|BLOCKED|CANCELLED)', b, re.IGNORECASE):
                continue
            task_id_m = re.search(r'TASK\\?_ID:\s*([A-Za-z0-9_\-]+)', b)
            task_id = task_id_m.group(1).replace('\\', '') if task_id_m else "DOCB-ACTIVE-DISPATCH"
            
            header_m = re.search(r'\\?\[([A-Z0-9_\-\s\|:—\.\(\)\/]+)\\?\]', b)
            title = header_m.group(1).strip() if header_m else "Task Command"

            status_m = re.search(r'STATUS:\s*([^\r\n]+)', b)
            status_val = status_m.group(1).strip() if status_m else "ACTIVE_DISPATCH"

            tasks.append({
                "task_id": task_id,
                "title": title,
                "status": status_val,
                "snippet": b[:250].strip()
            })
    return tasks


def run_cycle():
    """Runs a single 10-minute check cycle."""
    if not acquire_lock():
        return {"status": "SKIPPED_LOCKED"}

    try:
        now_iso = datetime.now().isoformat()
        log_msg("--- Starting 10-minute inbox inspection cycle ---")

        content = fetch_doc_content()
        if not content:
            log_msg("Cycle completed with empty/unreachable doc content.")
            return {"status": "FETCH_FAILED", "timestamp": now_iso}

        doc_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
        ready_tasks = parse_ready_tasks(content)

        # Read previous state
        prev_state = {}
        if os.path.exists(STATE_FILE):
            try:
                with open(STATE_FILE, "r", encoding="utf-8") as f:
                    prev_state = json.load(f)
            except Exception:
                pass

        run_count = prev_state.get("run_count", 0) + 1
        hash_changed = prev_state.get("last_doc_sha256") != doc_hash

        state = {
            "watcher_id": "CRD-CMS2-AUTO-WATCHER-10MIN",
            "interval_minutes": 10,
            "target_doc_id": DOC_ID,
            "last_run_iso": now_iso,
            "run_count": run_count,
            "last_doc_sha256": doc_hash,
            "hash_changed": hash_changed,
            "ready_tasks_count": len(ready_tasks),
            "ready_tasks": ready_tasks,
            "status": "TASKS_DETECTED" if ready_tasks else "IDLE_MONITORING"
        }

        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)

        log_msg(f"Cycle {run_count} completed. Doc hash: {doc_hash[:12]}... Ready tasks found: {len(ready_tasks)}")
        for t in ready_tasks:
            log_msg(f"  * Detected: [{t['task_id']}] {t['title']} -> {t['status']}")

        return state
    finally:
        release_lock()


def daemon_loop():
    log_msg(f"CRD 10-Minute Inbox Watcher Daemon STARTED (PID: {os.getpid()})")
    
    def handle_signal(sig, frame):
        log_msg(f"Received exit signal {sig}. Terminating daemon.")
        release_lock()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    while True:
        try:
            run_cycle()
        except Exception as e:
            log_msg(f"Exception during cycle: {e}")
        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    if "--daemon" in sys.argv:
        daemon_loop()
    else:
        # Single cycle execution mode (for testing or Task Scheduler invocation)
        res = run_cycle()
        print(json.dumps(res, ensure_ascii=False, indent=2))
