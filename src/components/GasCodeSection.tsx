import React, { useState } from 'react';
import { Code2, Copy, Check, ExternalLink, FolderGit2 } from 'lucide-react';
import { WORKSPACE_FOLDER_ID, MANIFEST_FILE_NAME } from '../services/backendGateway';
import { LiquidButton } from './ui/liquid-glass-button';

const GAS_BACKEND_CODE = `// วางโค้ดนี้ใน Google Apps Script (Code.gs) แล้วกด Deploy > Manage deployments > Edit (New version)
// --- ส่วนที่เพิ่มใหม่สำหรับรับคำสั่ง POST จาก iPhone Shortcuts และเว็บ CRD CENTER V2 ---

function doGet(e) {
  return jsonResponse({
    status: 'ONLINE',
    service: 'CRD CENTER V2 × NexusLedger Manifest Gateway',
    timestamp: new Date().toISOString()
  });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, manifestUpdated: false, error: 'Empty POST body' });
    }
    const payload = JSON.parse(e.postData.contents);
    const action = String(payload.action || '');

    if (action === 'PING') {
      return jsonResponse({ success: true, status: 'PONG', time: new Date().toISOString() });
    }
    if (action === 'DEPLOY_EVOLVED_UI_DESIGN') {
      return handleDeployEvolvedUiDesign(payload);
    }
    return jsonResponse({ success: false, manifestUpdated: false, error: 'Unsupported action: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, manifestUpdated: false, error: String(err) });
  }
}

function handleDeployEvolvedUiDesign(payload) {
  const spec = payload.spec || {
    componentId: payload.componentId || 'UI-SHORTCUT-TEST',
    title: payload.title || 'ทดสอบยิงจาก iPhone Shortcuts',
    category: payload.category || 'MOBILE_SHORTCUT',
    summary: payload.summary || 'บันทึกผ่าน iOS Shortcuts'
  };

  const workspaceId = String(payload.workspaceId || '${WORKSPACE_FOLDER_ID}');
  const targetManifest = String(payload.targetManifest || '${MANIFEST_FILE_NAME}');
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
    manifestData = { project: 'CRD CENTER V2', updatedAt: nowIso, modules: [] };
    manifestFile = folder.createFile(targetManifest, JSON.stringify(manifestData, null, 2), MimeType.PLAIN_TEXT);
  }

  if (!Array.isArray(manifestData.modules)) manifestData.modules = [];

  const newEntry = {
    componentId: String(spec.componentId),
    title: String(spec.title || ''),
    category: String(spec.category || ''),
    summary: String(spec.summary || ''),
    syncedAt: nowIso,
    eventId: eventId
  };

  const existingIdx = manifestData.modules.findIndex(m => m && m.componentId === newEntry.componentId);
  if (existingIdx >= 0) {
    manifestData.modules[existingIdx] = newEntry;
  } else {
    manifestData.modules.push(newEntry);
  }

  manifestData.updatedAt = nowIso;
  manifestData.lastEventId = eventId;
  manifestFile.setContent(JSON.stringify(manifestData, null, 2));

  return jsonResponse({
    success: true,
    status: 'SAVED',
    manifestUpdated: true,
    syncedAt: nowIso,
    targetManifest: targetManifest,
    eventId: eventId,
    totalModules: manifestData.modules.length
  });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}`;

export const GasCodeSection: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(GAS_BACKEND_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <section className="card-glass rounded-3xl p-6 sm:p-8 space-y-6 border border-blue-200/90 shadow-[0_16px_40px_-16px_rgba(20,50,90,0.1)]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-blue-100 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-[#14243A] dark:text-white flex items-center gap-2.5">
            <Code2 className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            <span>โค้ดหลังบ้าน Google Apps Script (Code.gs)</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
            นำโค้ดนี้ไปวางใน Google Apps Script ของคุณเพื่อรองรับการรับคำสั่งเพิ่มขอบเขตงานและบันทึกลง Google Drive อัตโนมัติ
          </p>
        </div>

        <LiquidButton
          size="default"
          onClick={handleCopy}
          className="text-xs font-bold shadow-md cursor-pointer"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-blue-600" />}
          <span>{copied ? 'คัดลอกโค้ดเรียบร้อย!' : 'คัดลอก Code.gs (1-Click)'}</span>
        </LiquidButton>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
        <div className="p-4 rounded-2xl bg-white/90 dark:bg-slate-950 border border-blue-200/80 dark:border-slate-800 flex items-center gap-2.5 text-slate-700 dark:text-slate-300 shadow-2xs">
          <FolderGit2 className="w-5 h-5 text-blue-600 dark:text-teal-400 shrink-0" />
          <span>
            โฟลเดอร์ Drive ปลายทาง: <code className="mono text-blue-800 dark:text-teal-300 font-bold">AI_Project_Workspace</code>
          </span>
        </div>
        <div className="p-4 rounded-2xl bg-white/90 dark:bg-slate-950 border border-blue-200/80 dark:border-slate-800 flex items-center gap-2.5 text-slate-700 dark:text-slate-300 shadow-2xs">
          <Code2 className="w-5 h-5 text-blue-600 dark:text-teal-400 shrink-0" />
          <span>
            ไฟล์ Manifest: <code className="mono text-blue-800 dark:text-teal-300 font-bold">00_Project_Manifest.json</code>
          </span>
        </div>
      </div>

      <pre className="p-5 rounded-2xl bg-slate-900 border border-slate-800 text-xs font-mono text-blue-100 overflow-x-auto max-h-[420px] leading-relaxed shadow-inner">
        {GAS_BACKEND_CODE}
      </pre>
    </section>
  );
};
