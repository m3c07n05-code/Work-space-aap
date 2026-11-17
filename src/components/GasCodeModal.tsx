import React, { useState } from 'react';
import { X, Code2, Copy, Check, ExternalLink, FolderGit2 } from 'lucide-react';
import { LiquidButton } from './ui/liquid-glass-button';

interface GasCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GAS_BACKEND_CODE = `// วางโค้ดนี้ใน Google Apps Script (Code.gs) แล้วกด Deploy > Manage deployments > Edit (New version)
// --- ส่วนที่เพิ่มใหม่สำหรับรับคำสั่ง POST จาก iPhone Shortcuts และเว็บ CRD CENTER V2 ---

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : '';
    if (action === 'GET_MANIFEST' || action === 'READ_MANIFEST') {
      return handleGetManifest(e.parameter);
    }
    if (action === 'PING') {
      return jsonResponse({
        success: true,
        action: 'PING',
        status: 'CONNECTED',
        message: 'NexusLedger Gateway Active (GET)',
        serverTimeIso: new Date().toISOString()
      });
    }
    return jsonResponse({
      status: 'ONLINE',
      service: 'CRD CENTER V2 × NexusLedger Manifest Gateway',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, manifestUpdated: false, error: 'Empty POST body' });
    }
    const payload = JSON.parse(e.postData.contents);
    const action = String(payload.action || '');

    if (action === 'PING' || action === 'PING_HEALTH_CHECK') {
      return jsonResponse({
        success: true,
        action: 'PING',
        status: 'CONNECTED',
        serverTimeIso: new Date().toISOString()
      });
    }
    if (action === 'GET_MANIFEST' || action === 'READ_MANIFEST') {
      return handleGetManifest(payload);
    }
    if (action === 'DEPLOY_EVOLVED_UI_DESIGN') {
      return handleDeployEvolvedUiDesign(payload);
    }
    if (action === 'WORK4_QUEUE_PRINT_JOB') {
      return handleWork4QueuePrintJob(payload);
    }
    return jsonResponse({ success: false, manifestUpdated: false, error: 'Unsupported action: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, manifestUpdated: false, error: String(err) });
  }
}

function handleGetManifest(params) {
  const workspaceId = String((params && params.workspaceId) || '1RvGehvlDrPTaR9JvQgCcFPqiQbRE8_yn');
  const targetManifest = String((params && params.targetManifest) || '00_Project_Manifest.json');
  const folder = DriveApp.getFolderById(workspaceId);
  const files = folder.getFilesByName(targetManifest);

  if (!files.hasNext()) {
    return jsonResponse({
      success: true,
      action: 'GET_MANIFEST',
      serverTimeIso: new Date().toISOString(),
      manifest: {
        projectName: 'AI HUB CONTROL CENTER',
        modules: []
      }
    });
  }

  const manifestFile = files.next();
  const raw = manifestFile.getBlob().getDataAsString('UTF-8');
  let manifestData;
  try {
    manifestData = JSON.parse(raw);
  } catch (parseErr) {
    return jsonResponse({
      success: false,
      error: 'Corrupted JSON manifest in Drive: ' + String(parseErr)
    });
  }

  return jsonResponse({
    success: true,
    action: 'GET_MANIFEST',
    serverTimeIso: new Date().toISOString(),
    manifest: manifestData
  });
}

function handleDeployEvolvedUiDesign(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (lockErr) {
    return jsonResponse({
      success: false,
      manifestUpdated: false,
      error: 'Could not obtain script lock: ' + String(lockErr)
    });
  }

  try {
    const spec = payload.spec || {
      componentId: payload.componentId || 'UI-SHORTCUT-TEST',
      title: payload.title || 'ทดสอบยิงจาก iPhone Shortcuts',
      category: payload.category || 'MOBILE_SHORTCUT',
      summary: payload.summary || 'บันทึกผ่าน iOS Shortcuts'
    };

    const workspaceId = String(payload.workspaceId || '1RvGehvlDrPTaR9JvQgCcFPqiQbRE8_yn');
    const targetManifest = String(payload.targetManifest || '00_Project_Manifest.json');
    const nowIso = new Date().toISOString();
    const eventId = payload.clientRequestId || ('evt_' + Utilities.getUuid().slice(0, 8));

    const folder = DriveApp.getFolderById(workspaceId);
    const files = folder.getFilesByName(targetManifest);

    let manifestFile;
    let manifestData;

    if (files.hasNext()) {
      manifestFile = files.next();
      const raw = manifestFile.getBlob().getDataAsString('UTF-8');
      if (!raw || !raw.trim()) {
        return jsonResponse({ success: false, manifestUpdated: false, error: 'Existing manifest file is empty' });
      }
      try {
        manifestData = JSON.parse(raw);
      } catch (parseErr) {
        return jsonResponse({ success: false, manifestUpdated: false, error: 'Corrupted JSON manifest' });
      }
    } else {
      manifestData = { projectName: 'AI HUB CONTROL CENTER', lastUpdated: nowIso, modules: [] };
      manifestFile = folder.createFile(targetManifest, JSON.stringify(manifestData, null, 2), MimeType.PLAIN_TEXT);
    }

    if (!Array.isArray(manifestData.modules)) manifestData.modules = [];

    const newEntry = {
      componentId: String(spec.componentId || payload.componentId || 'UI-MODULE-' + Date.now()),
      title: String(spec.title || payload.title || ''),
      name: String(spec.name || spec.title || payload.name || payload.title || ''),
      category: String(spec.category || payload.category || ''),
      summary: String(spec.summary || payload.summary || ''),
      description: String(spec.description || spec.summary || payload.description || payload.summary || ''),
      gate: String(spec.gate || payload.gate || ''),
      rule: String(spec.rule || payload.rule || ''),
      actionPrompt: String(spec.actionPrompt || payload.actionPrompt || ''),
      prompt: String(spec.prompt || spec.actionPrompt || payload.prompt || payload.actionPrompt || ''),
      uiPreviewData: spec.uiPreviewData || payload.uiPreviewData || null,
      status: String(spec.status || payload.status || 'SAVED'),
      result: String(spec.result || payload.result || 'ACTIVE'),
      syncedAt: nowIso,
      updatedAtIso: nowIso,
      eventId: eventId
    };

    const existingIdx = manifestData.modules.findIndex(m => m && m.componentId === newEntry.componentId);
    if (existingIdx >= 0) {
      manifestData.modules[existingIdx] = Object.assign({}, manifestData.modules[existingIdx], newEntry);
    } else {
      manifestData.modules.push(newEntry);
    }

    manifestData.lastUpdated = nowIso;
    manifestData.updatedAt = nowIso;
    manifestData.lastEventId = eventId;

    // Safety validation before write
    const serialized = JSON.stringify(manifestData, null, 2);
    JSON.parse(serialized); // Verify valid JSON parse

    manifestFile.setContent(serialized);

    return jsonResponse({
      success: true,
      status: 'SAVED',
      manifestUpdated: true,
      syncedAt: nowIso,
      targetManifest: targetManifest,
      eventId: eventId,
      savedModule: newEntry,
      totalModules: manifestData.modules.length,
      manifest: manifestData
    });
  } catch (writeErr) {
    return jsonResponse({ success: false, manifestUpdated: false, error: String(writeErr) });
  } finally {
    lock.releaseLock();
  }
}

function handleWork4QueuePrintJob(payload) {
  const nowIso = new Date().toISOString();
  const eventId = payload.idempotency_key || ('evt_' + Utilities.getUuid().slice(0, 8));
  const jobId = payload.job_id || ('JOB-' + Date.now());

  return jsonResponse({
    success: true,
    queued: true,
    status: 'PENDING',
    job_id: jobId,
    eventId: eventId,
    timestamp: nowIso,
    message: 'Work 4 print job queued successfully in PENDING state'
  });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}`;

export const GasCodeModal: React.FC<GasCodeModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(GAS_BACKEND_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-3xl rounded-3xl bg-white/92 dark:bg-slate-900/90 backdrop-blur-3xl border border-white/90 dark:border-slate-800 shadow-[0_24px_60px_-12px_rgba(20,50,110,0.22)] p-6 sm:p-8 overflow-hidden space-y-5 text-[#14243A] dark:text-white">
        <div className="flex items-center justify-between pb-4 border-b border-blue-100 dark:border-slate-800">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-100 dark:bg-amber-500/15 border border-amber-200 flex items-center justify-center text-amber-700 dark:text-amber-300 shadow-inner">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-[#14243A] dark:text-white">โค้ดหลังบ้าน Google Apps Script (Code.gs)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">ซิงก์ตรงกับ AI_Project_Workspace (ID: 1RvGehvlDrPTaR9JvQgCcFPqiQbRE8_yn)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-blue-50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-100 flex items-center gap-2.5 text-slate-700">
            <FolderGit2 className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              โฟลเดอร์ Drive: <code className="font-bold text-blue-900">AI_Project_Workspace</code>
            </span>
          </div>
          <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-100 flex items-center gap-2.5 text-slate-700">
            <Code2 className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              ไฟล์ Manifest: <code className="font-bold text-blue-900">00_Project_Manifest.json</code>
            </span>
          </div>
        </div>

        <pre className="p-5 rounded-2xl bg-slate-900 border border-slate-800 text-xs font-mono text-blue-100 overflow-x-auto max-h-[380px] leading-relaxed shadow-inner">
          {GAS_BACKEND_CODE}
        </pre>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-blue-100 dark:border-slate-800">
          <span className="text-xs text-slate-500">
            Deploy เป็น Web App โดยตั้งค่า "Execute as: Me" และ "Who has access: Anyone"
          </span>
          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-full bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-blue-200 cursor-pointer transition shadow-2xs"
            >
              ปิดหน้าต่าง
            </button>
            <LiquidButton
              variant="glowing"
              glow={true}
              size="default"
              onClick={handleCopy}
              className="text-xs font-bold shadow-md cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'คัดลอกโค้ดเรียบร้อย!' : 'คัดลอก Code.gs (1-Click)'}</span>
            </LiquidButton>
          </div>
        </div>
      </div>
    </div>
  );
};
