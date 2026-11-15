// --- ส่วนที่เพิ่มใหม่สำหรับรับคำสั่ง POST จาก iPhone Shortcuts และเว็บ CRD CENTER V2 ---
// วางโค้ดนี้ใน Google Apps Script (Code.gs) แล้วกด Deploy > Manage deployments > Edit (New version)

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
}
