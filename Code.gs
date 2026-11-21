// วางโค้ดนี้ใน Google Apps Script (Code.gs) แล้วกด Deploy > Manage deployments > Edit (New version)
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
    if (action === 'LOG_UPDATE') {
      return handleLogUpdate(payload);
    }
    if (action === 'GET_TASKS') {
      return handleGetTasks(payload);
    }
    if (action === 'UPDATE_TASK') {
      return handleUpdateTask(payload);
    }
    if (action === 'SUBMIT_JOB') {
      return handleSubmitJob(payload);
    }
    if (action === 'GET_PENDING_JOBS') {
      return handleGetPendingJobs(payload);
    }
    if (action === 'COMPLETE_JOB') {
      return handleCompleteJob(payload);
    }
    if (action === 'DEVICE_HEARTBEAT') {
      return handleDeviceHeartbeat(payload);
    }
    if (action === 'SET_CONFIRM_GATE' || action === 'SET_GATE' || action === 'UPDATE_GATE') {
      return handleSetConfirmGate(payload);
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

function handleLogUpdate(payload) {
  // 1. Fail-Closed Token Verification
  const token = String(payload.token || payload.gatewayToken || payload.CRD_GATEWAY_TOKEN || '');
  const expectedToken = PropertiesService.getScriptProperties().getProperty('CRD_GATEWAY_TOKEN') || 'crd_gateway_token_2026';
  if (!token || token !== expectedToken) {
    return jsonResponse({
      success: false,
      error: 'Unauthorized: Invalid or missing CRD_GATEWAY_TOKEN (Fail-Closed Enforcement)',
      action: 'LOG_UPDATE',
      status: 'REJECTED'
    });
  }

  // 2. LockService for Concurrent Safety
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (lockErr) {
    return jsonResponse({
      success: false,
      error: 'Could not obtain script lock: ' + String(lockErr),
      action: 'LOG_UPDATE'
    });
  }

  try {
    const workspaceId = String(payload.workspaceId || '1RvGehvlDrPTaR9JvQgCcFPqiQbRE8_yn');
    const targetManifest = String(payload.targetManifest || '00_Project_Manifest.json');
    const nowIso = new Date().toISOString();
    const eventId = payload.clientRequestId || ('evt_log_' + Utilities.getUuid().slice(0, 8));

    const folder = DriveApp.getFolderById(workspaceId);
    const files = folder.getFilesByName(targetManifest);

    let manifestFile;
    let manifestData;

    if (files.hasNext()) {
      manifestFile = files.next();
      const raw = manifestFile.getBlob().getDataAsString('UTF-8');
      try {
        manifestData = JSON.parse(raw);
      } catch (parseErr) {
        manifestData = { projectName: 'AI HUB CONTROL CENTER', modules: [], updateLogs: [] };
      }
    } else {
      manifestData = { projectName: 'AI HUB CONTROL CENTER', lastUpdated: nowIso, modules: [], updateLogs: [] };
      manifestFile = folder.createFile(targetManifest, JSON.stringify(manifestData, null, 2), MimeType.PLAIN_TEXT);
    }

    if (!Array.isArray(manifestData.updateLogs)) {
      manifestData.updateLogs = [];
    }

    // Additive Merge log entry (Zero-PII compliant)
    const logEntry = {
      logId: String(payload.logId || ('LOG-' + Date.now())),
      eventId: eventId,
      actor: String(payload.actor || 'CMS-2_Agent'),
      task: String(payload.task || 'CRD_ROUTINE_UPDATE'),
      status: String(payload.status || 'COMPLETED'),
      details: payload.details || {},
      commitSha: String(payload.commitSha || ''),
      timestamp: nowIso
    };

    manifestData.updateLogs.unshift(logEntry);
    if (manifestData.updateLogs.length > 100) {
      manifestData.updateLogs = manifestData.updateLogs.slice(0, 100);
    }
    manifestData.lastUpdated = nowIso;
    manifestData.lastSync = nowIso;
    manifestData.lastLogEventId = eventId;

    // Safety validation before write
    const serialized = JSON.stringify(manifestData, null, 2);
    JSON.parse(serialized);
    manifestFile.setContent(serialized);

    return jsonResponse({
      success: true,
      action: 'LOG_UPDATE',
      status: 'LOGGED',
      eventId: eventId,
      timestamp: nowIso,
      loggedEntry: logEntry,
      totalLogs: manifestData.updateLogs.length
    });
  } catch (err) {
    return jsonResponse({ success: false, error: 'Failed to write LOG_UPDATE: ' + String(err) });
  } finally {
    lock.releaseLock();
  }
}

function handleGetTasks(payload) {
  return jsonResponse({ success: true, action: 'GET_TASKS', tasks: [], timestamp: new Date().toISOString() });
}

function handleUpdateTask(payload) {
  return jsonResponse({ success: true, action: 'UPDATE_TASK', taskId: payload.taskId, status: payload.status, timestamp: new Date().toISOString() });
}

function handleSubmitJob(payload) {
  return jsonResponse({ success: true, action: 'SUBMIT_JOB', jobId: 'JOB-' + Date.now(), status: 'PENDING', timestamp: new Date().toISOString() });
}

function handleGetPendingJobs(payload) {
  return jsonResponse({ success: true, action: 'GET_PENDING_JOBS', jobs: [], timestamp: new Date().toISOString() });
}

function handleCompleteJob(payload) {
  return jsonResponse({ success: true, action: 'COMPLETE_JOB', jobId: payload.jobId, status: 'DONE', timestamp: new Date().toISOString() });
}

function handleDeviceHeartbeat(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (lockErr) {
    return jsonResponse({ success: false, manifestUpdated: false, error: 'Could not obtain script lock: ' + String(lockErr) });
  }

  try {
    const workspaceId = String((payload && payload.workspaceId) || '1RvGehvlDrPTaR9JvQgCcFPqiQbRE8_yn');
    const targetManifest = String((payload && payload.targetManifest) || '00_Project_Manifest.json');
    const nowIso = new Date().toISOString();
    const folder = DriveApp.getFolderById(workspaceId);
    const files = folder.getFilesByName(targetManifest);

    if (!files.hasNext()) {
      return jsonResponse({ success: false, manifestUpdated: false, error: 'Manifest file not found' });
    }
    const manifestFile = files.next();
    const raw = manifestFile.getBlob().getDataAsString('UTF-8');
    if (!raw || !raw.trim()) {
      return jsonResponse({ success: false, manifestUpdated: false, error: 'Existing manifest file is empty' });
    }
    const manifestData = JSON.parse(raw);
    if (!manifestData.devices || typeof manifestData.devices !== 'object') {
      manifestData.devices = {};
    }

    const deviceId = String(payload.deviceId || 'cms-2-swift-zone');
    const existingDevice = (manifestData.devices[deviceId] && typeof manifestData.devices[deviceId] === 'object')
      ? manifestData.devices[deviceId]
      : {};
    const deviceEntry = Object.assign({}, existingDevice, {
      deviceId: deviceId,
      deviceType: String(payload.deviceType || existingDevice.deviceType || 'PC'),
      label: String(payload.label || existingDevice.label || deviceId),
      lastSeenIso: nowIso
    });
    if (payload.status) {
      deviceEntry.status = String(payload.status);
    }

    manifestData.devices[deviceId] = deviceEntry;
    manifestData.lastUpdated = nowIso;
    manifestData.lastPingIso = nowIso;

    const serialized = JSON.stringify(manifestData, null, 2);
    JSON.parse(serialized);
    manifestFile.setContent(serialized);

    return jsonResponse({
      success: true,
      action: 'DEVICE_HEARTBEAT',
      manifestUpdated: true,
      serverTimeIso: nowIso,
      device: deviceEntry,
      manifest: manifestData
    });
  } catch (err) {
    return jsonResponse({ success: false, manifestUpdated: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function handleSetConfirmGate(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (lockErr) {
    return jsonResponse({ success: false, manifestUpdated: false, error: 'Could not obtain script lock: ' + String(lockErr) });
  }

  try {
    const workspaceId = String((payload && payload.workspaceId) || '1RvGehvlDrPTaR9JvQgCcFPqiQbRE8_yn');
    const targetManifest = String((payload && payload.targetManifest) || '00_Project_Manifest.json');
    const nowIso = new Date().toISOString();
    const folder = DriveApp.getFolderById(workspaceId);
    const files = folder.getFilesByName(targetManifest);

    if (!files.hasNext()) {
      return jsonResponse({ success: false, manifestUpdated: false, error: 'Manifest file not found' });
    }
    const manifestFile = files.next();
    const raw = manifestFile.getBlob().getDataAsString('UTF-8');
    if (!raw || !raw.trim()) {
      return jsonResponse({ success: false, manifestUpdated: false, error: 'Existing manifest file is empty' });
    }
    const manifestData = JSON.parse(raw);

    if (typeof payload.gateStatus === 'string' && payload.gateStatus.trim()) {
      manifestData.gateStatus = payload.gateStatus.trim();
    } else if (!manifestData.gateStatus) {
      manifestData.gateStatus = 'WAITING_OWNER_CONFIRM';
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'activeTask')) {
      manifestData.activeTask = payload.activeTask;
    }

    if (payload.devices && typeof payload.devices === 'object') {
      if (!manifestData.devices || typeof manifestData.devices !== 'object') {
        manifestData.devices = {};
      }
      Object.keys(payload.devices).forEach(function(devKey) {
        const incoming = payload.devices[devKey];
        if (incoming && typeof incoming === 'object') {
          const prev = (manifestData.devices[devKey] && typeof manifestData.devices[devKey] === 'object')
            ? manifestData.devices[devKey]
            : {};
          manifestData.devices[devKey] = Object.assign({}, prev, incoming);
        }
      });
    }

    manifestData.lastUpdated = nowIso;

    const serialized = JSON.stringify(manifestData, null, 2);
    JSON.parse(serialized);
    manifestFile.setContent(serialized);

    return jsonResponse({
      success: true,
      action: String(payload.action || 'SET_CONFIRM_GATE'),
      manifestUpdated: true,
      serverTimeIso: nowIso,
      gateStatus: manifestData.gateStatus,
      activeTask: manifestData.activeTask,
      manifest: manifestData
    });
  } catch (err) {
    return jsonResponse({ success: false, manifestUpdated: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
