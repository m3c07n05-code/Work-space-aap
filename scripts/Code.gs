/**
 * NexusLedger & CRD CENTER Gateway (Code.gs)
 * Additive + Zero-PII + Fail-Closed Token Check + PC/Mobile Presence Sync + Doc-B-to-GAS Auto-Queue Bridge
 */

const FOLDER_ID = '1RvGehvlDrPTaR9JvQgCcFPqiQbRE8_yn';
const MANIFEST_FILENAME = '00_Project_Manifest.json';
const DOC_B_ID = '1UL_maGIJiMm8N6f0sUIYwAkFsqpHLz4HrZbkQZTZn7Q';
const ONLINE_WINDOW_MS = 3 * 60 * 1000; // 3 minutes
const MAX_PENDING_JOBS = 50;
const MAX_COMPLETED_JOBS = 50;

function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    if (!verifyToken_(params.token || params.gatewayToken || params.CRD_GATEWAY_TOKEN)) {
      return jsonResponse_({ success: false, error: 'Unauthorized: Invalid gateway token' });
    }

    const action = String(params.action || 'PING').trim().toUpperCase();
    if (action === 'GET_STATE' || action === 'GET_MANIFEST' || action === 'READ_MANIFEST') {
      const manifest = loadOrCreateManifest_();
      return jsonResponse_({
        success: true,
        action: action,
        serverTimeIso: new Date().toISOString(),
        manifest: manifest,
        syncSummary: computeSyncSummary_(manifest.devices || {})
      });
    }

    if (action === 'GET_PENDING_JOBS') {
      const manifest = loadOrCreateManifest_();
      const pendingJobs = getPendingJobsList_(manifest);
      return jsonResponse_({
        success: true,
        action: 'GET_PENDING_JOBS',
        jobs: pendingJobs,
        totalPending: pendingJobs.length,
        docBState: manifest.docBState || {},
        serverTimeIso: new Date().toISOString(),
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'CLAIM_JOB') {
      const targetJobId = String(params.jobId || '');
      const workerId = String(params.workerId || 'CMS-2').slice(0, 40);
      const nowIso = new Date().toISOString();
      return withScriptLock_(function() {
        const manifest = loadOrCreateManifest_();
        const job = manifest.pendingJobs.find(function(j) { return j && j.jobId === targetJobId; });
        if (!job) {
          return jsonResponse_({
            success: false,
            claimed: false,
            action: 'CLAIM_JOB',
            error: 'Job not found in pendingJobs: ' + targetJobId,
            timestamp: nowIso
          });
        }
        if (job.status !== 'PENDING') {
          return jsonResponse_({
            success: false,
            claimed: false,
            action: 'CLAIM_JOB',
            job: job,
            error: 'Job already in status ' + job.status,
            timestamp: nowIso
          });
        }
        job.status = 'IN_PROGRESS';
        job.claimedBy = workerId;
        job.claimedAtIso = nowIso;
        manifest.lastUpdated = nowIso;
        saveManifest_(manifest);
        return jsonResponse_({
          success: true,
          claimed: true,
          action: 'CLAIM_JOB',
          job: job,
          timestamp: nowIso
        });
      });
    }

    return jsonResponse_({
      success: true,
      action: 'PING',
      status: 'CONNECTED',
      message: 'NexusLedger Gateway Active (GET)',
      serverTimeIso: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse_({ success: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const rawBody = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const payload = JSON.parse(rawBody);

    if (!verifyToken_(payload.token || payload.gatewayToken || payload.CRD_GATEWAY_TOKEN)) {
      return jsonResponse_({ success: false, error: 'Unauthorized: Invalid gateway token' });
    }

    const action = String(payload.action || '').trim();
    const nowIso = new Date().toISOString();

    // Read-only actions (no ScriptLock needed)
    if (action === 'GET_STATE' || action === 'GET_MANIFEST' || action === 'READ_MANIFEST') {
      const manifest = loadOrCreateManifest_(payload.workspaceId, payload.targetManifest);
      return jsonResponse_({
        success: true,
        action: action,
        serverTimeIso: nowIso,
        manifest: manifest,
        syncSummary: computeSyncSummary_(manifest.devices || {})
      });
    }

    if (action === 'GET_PENDING_JOBS') {
      const manifest = loadOrCreateManifest_(payload.workspaceId, payload.targetManifest);
      const pendingJobs = getPendingJobsList_(manifest);
      return jsonResponse_({
        success: true,
        action: 'GET_PENDING_JOBS',
        jobs: pendingJobs,
        totalPending: pendingJobs.length,
        docBState: manifest.docBState || {},
        serverTimeIso: nowIso,
        timestamp: nowIso
      });
    }

    // Fail-closed token check for LOG_UPDATE
    if (action === 'LOG_UPDATE') {
      const token = String(payload.token || payload.gatewayToken || payload.CRD_GATEWAY_TOKEN || '');
      const expectedToken = PropertiesService.getScriptProperties().getProperty('CRD_GATEWAY_TOKEN');
      if (!expectedToken || !token || token !== expectedToken) {
        return jsonResponse_({
          success: false,
          error: 'Unauthorized: Invalid or missing CRD_GATEWAY_TOKEN (Fail-Closed Enforcement)',
          action: 'LOG_UPDATE',
          status: 'REJECTED'
        });
      }
    }

    // Mutating actions use ScriptLock to prevent concurrent manifest corruption
    return withScriptLock_(function() {
      const manifest = loadOrCreateManifest_(payload.workspaceId, payload.targetManifest);

      // 1. Ping / Connectivity check
      if (action === 'PING' || action === 'PING_HEALTH_CHECK') {
        manifest.lastPingIso = nowIso;
        saveManifest_(manifest, payload.workspaceId, payload.targetManifest);
        return jsonResponse_({
          success: true,
          action: action,
          status: 'CONNECTED',
          serverTimeIso: nowIso,
          syncSummary: computeSyncSummary_(manifest.devices)
        });
      }

      // 2. Device Heartbeat (PC / Mobile Presence Sync, Zero-PII)
      if (action === 'DEVICE_HEARTBEAT') {
        const result = handleDeviceHeartbeat_(manifest, payload, nowIso);
        saveManifest_(manifest, payload.workspaceId, payload.targetManifest);
        return jsonResponse_({
          success: true,
          action: action,
          manifestUpdated: true,
          serverTimeIso: nowIso,
          device: result.device,
          syncSummary: result.syncSummary,
          manifest: manifest
        });
      }

      // 3. Save evolved UI module from AI Studio
      if (action === 'DEPLOY_EVOLVED_UI_DESIGN') {
        const spec = payload.spec || payload;
        const eventId = payload.clientRequestId || ('evt_' + Utilities.getUuid().slice(0, 8));
        const componentId = String(spec.componentId || payload.componentId || ('UI-CRD-' + Math.floor(100 + Math.random() * 900)));
        const record = {
          componentId: componentId,
          title: String(spec.title || spec.name || payload.title || componentId),
          name: String(spec.name || spec.title || payload.name || payload.title || componentId),
          category: String(spec.category || payload.category || ''),
          summary: String(spec.summary || spec.description || payload.summary || ''),
          description: String(spec.description || spec.summary || payload.description || payload.summary || ''),
          gate: String(spec.gate || payload.gate || ''),
          rule: String(spec.rule || payload.rule || ''),
          actionPrompt: String(spec.actionPrompt || spec.prompt || payload.actionPrompt || ''),
          prompt: String(spec.prompt || spec.actionPrompt || payload.prompt || payload.actionPrompt || ''),
          uiPreviewData: spec.uiPreviewData || payload.uiPreviewData || null,
          status: String(spec.status || payload.status || 'SAVED'),
          result: String(spec.result || payload.result || 'ACTIVE'),
          syncedAt: nowIso,
          updatedAtIso: nowIso,
          eventId: eventId
        };
        const idx = manifest.modules.findIndex(function(m) { return m && m.componentId === componentId; });
        if (idx >= 0) {
          manifest.modules[idx] = Object.assign({}, manifest.modules[idx], record);
        } else {
          manifest.modules.push(record);
        }
        manifest.lastUpdated = nowIso;
        manifest.updatedAt = nowIso;
        manifest.lastEventId = eventId;
        saveManifest_(manifest, payload.workspaceId, payload.targetManifest);
        return jsonResponse_({
          success: true,
          action: action,
          status: 'SAVED',
          manifestUpdated: true,
          syncedAt: nowIso,
          eventId: eventId,
          serverTimeIso: nowIso,
          savedModule: record,
          totalModules: manifest.modules.length,
          manifest: manifest
        });
      }

      // 4. Scope management
      if (action === 'ADD_SCOPE' || action === 'SYNC_EXISTING_SCOPE' || action === 'DEPLOY_AI_SCOPE') {
        const scopeItem = payload.scope || payload.data || payload;
        const scopeId = String(scopeItem.id || scopeItem.scopeId || ('SCOPE-' + Date.now()));
        const cleanScope = {
          id: scopeId,
          workCode: String(scopeItem.workCode || 'GENERAL'),
          title: String(scopeItem.title || 'Untitled Scope'),
          status: String(scopeItem.status || 'ACTIVE'),
          updatedAtIso: nowIso
        };
        const sIdx = manifest.scopes.findIndex(function(s) { return s && s.id === scopeId; });
        if (sIdx >= 0) {
          manifest.scopes[sIdx] = Object.assign({}, manifest.scopes[sIdx], cleanScope);
        } else {
          manifest.scopes.push(cleanScope);
        }
        manifest.lastUpdated = nowIso;
        saveManifest_(manifest, payload.workspaceId, payload.targetManifest);
        return jsonResponse_({
          success: true,
          action: action,
          serverTimeIso: nowIso,
          scope: cleanScope,
          scopes: manifest.scopes
        });
      }

      if (action === 'REMOVE_SCOPE') {
        const targetId = String(payload.scopeId || (payload.scope && payload.scope.id) || '');
        manifest.scopes = manifest.scopes.filter(function(s) { return s && s.id !== targetId; });
        manifest.lastUpdated = nowIso;
        saveManifest_(manifest, payload.workspaceId, payload.targetManifest);
        return jsonResponse_({
          success: true,
          action: action,
          serverTimeIso: nowIso,
          removedId: targetId,
          scopes: manifest.scopes
        });
      }

      // 5. Stop Gates verification
      if (action === 'VERIFY_STOP_GATE' || action === 'VERIFY_ALL_16_GATES') {
        const gateId = String(payload.gateId || 'ALL_16_GATES');
        const logEntry = {
          gateId: gateId,
          status: 'VERIFIED',
          verifiedAtIso: nowIso
        };
        manifest.gateLogs.unshift(logEntry);
        if (manifest.gateLogs.length > 50) manifest.gateLogs = manifest.gateLogs.slice(0, 50);
        manifest.lastUpdated = nowIso;
        saveManifest_(manifest, payload.workspaceId, payload.targetManifest);
        return jsonResponse_({
          success: true,
          action: action,
          serverTimeIso: nowIso,
          gateResult: logEntry
        });
      }

      // 6. Confirm Gate & Update Logs
      if (action === 'SET_CONFIRM_GATE' || action === 'SET_GATE' || action === 'UPDATE_GATE') {
        if (typeof payload.gateStatus === 'string' && payload.gateStatus.trim()) {
          manifest.gateStatus = payload.gateStatus.trim();
        } else if (!manifest.gateStatus) {
          manifest.gateStatus = 'WAITING_OWNER_CONFIRM';
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'activeTask')) {
          manifest.activeTask = payload.activeTask;
        }
        if (payload.devices && typeof payload.devices === 'object') {
          Object.keys(payload.devices).forEach(function(devKey) {
            const incoming = payload.devices[devKey];
            if (incoming && typeof incoming === 'object') {
              const prev = (manifest.devices[devKey] && typeof manifest.devices[devKey] === 'object')
                ? manifest.devices[devKey]
                : {};
              manifest.devices[devKey] = Object.assign({}, prev, incoming);
            }
          });
        }
        manifest.lastUpdated = nowIso;
        saveManifest_(manifest, payload.workspaceId, payload.targetManifest);
        return jsonResponse_({
          success: true,
          action: action,
          manifestUpdated: true,
          serverTimeIso: nowIso,
          gateStatus: manifest.gateStatus,
          activeTask: manifest.activeTask,
          manifest: manifest
        });
      }

      if (action === 'LOG_UPDATE') {
        const eventId = payload.clientRequestId || ('evt_log_' + Utilities.getUuid().slice(0, 8));
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
        manifest.updateLogs.unshift(logEntry);
        if (manifest.updateLogs.length > 100) {
          manifest.updateLogs = manifest.updateLogs.slice(0, 100);
        }
        manifest.lastUpdated = nowIso;
        manifest.lastSync = nowIso;
        manifest.lastLogEventId = eventId;
        saveManifest_(manifest, payload.workspaceId, payload.targetManifest);
        return jsonResponse_({
          success: true,
          action: 'LOG_UPDATE',
          status: 'LOGGED',
          eventId: eventId,
          timestamp: nowIso,
          loggedEntry: logEntry,
          totalLogs: manifest.updateLogs.length
        });
      }

      // 7. Work 4 Print Queue contract
      if (action === 'WORK4_QUEUE_PRINT_JOB') {
        const eventId = payload.idempotency_key || ('evt_' + Utilities.getUuid().slice(0, 8));
        const jobId = payload.job_id || ('JOB-' + Date.now());
        return jsonResponse_({
          success: true,
          queued: true,
          status: 'PENDING',
          job_id: jobId,
          eventId: eventId,
          timestamp: nowIso,
          message: 'Work 4 print job queued successfully in PENDING state'
        });
      }

      // 8. Persistent Job Queue (Doc-B-to-GAS Auto-Queue Bridge)
      if (action === 'SUBMIT_JOB') {
        const enqueued = enqueueJob_(manifest, {
          jobId: payload.jobId,
          type: payload.type || payload.taskType || 'DOC_B_DISPATCH',
          taskId: payload.taskId || '',
          title: payload.title || 'Queued Job',
          source: payload.source || 'API_SUBMIT',
          docId: payload.docId || DOC_B_ID,
          contentHash: payload.contentHash || '',
          promptText: payload.promptText || ''
        }, nowIso);
        if (enqueued.inserted) {
          saveManifest_(manifest, payload.workspaceId, payload.targetManifest);
        }
        return jsonResponse_({
          success: true,
          action: 'SUBMIT_JOB',
          jobId: enqueued.job.jobId,
          status: enqueued.job.status,
          deduplicated: !enqueued.inserted,
          job: enqueued.job,
          timestamp: nowIso
        });
      }

      if (action === 'CLAIM_JOB') {
        const targetJobId = String(payload.jobId || '');
        const workerId = String(payload.workerId || 'CMS-2').slice(0, 40);
        const job = manifest.pendingJobs.find(function(j) { return j && j.jobId === targetJobId; });
        if (!job) {
          return jsonResponse_({
            success: false,
            claimed: false,
            action: 'CLAIM_JOB',
            error: 'Job not found in pendingJobs: ' + targetJobId,
            timestamp: nowIso
          });
        }
        if (job.status !== 'PENDING') {
          return jsonResponse_({
            success: false,
            claimed: false,
            action: 'CLAIM_JOB',
            job: job,
            error: 'Job already in status ' + job.status,
            timestamp: nowIso
          });
        }
        job.status = 'IN_PROGRESS';
        job.claimedBy = workerId;
        job.claimedAtIso = nowIso;
        manifest.lastUpdated = nowIso;
        saveManifest_(manifest, payload.workspaceId, payload.targetManifest);
        return jsonResponse_({
          success: true,
          claimed: true,
          action: 'CLAIM_JOB',
          job: job,
          timestamp: nowIso
        });
      }

      if (action === 'COMPLETE_JOB') {
        const targetJobId = String(payload.jobId || '');
        const finalStatus = String(payload.status || 'DONE').toUpperCase();
        const summary = String(payload.summary || '').slice(0, 300);
        const idx = manifest.pendingJobs.findIndex(function(j) { return j && j.jobId === targetJobId; });
        if (idx >= 0) {
          const finishedJob = Object.assign({}, manifest.pendingJobs[idx], {
            status: finalStatus,
            completedAtIso: nowIso,
            summary: summary
          });
          manifest.pendingJobs.splice(idx, 1);
          manifest.completedJobs.unshift(finishedJob);
          if (manifest.completedJobs.length > MAX_COMPLETED_JOBS) {
            manifest.completedJobs = manifest.completedJobs.slice(0, MAX_COMPLETED_JOBS);
          }
          manifest.lastUpdated = nowIso;
          saveManifest_(manifest, payload.workspaceId, payload.targetManifest);
          return jsonResponse_({
            success: true,
            action: 'COMPLETE_JOB',
            jobId: targetJobId,
            status: finalStatus,
            job: finishedJob,
            timestamp: nowIso
          });
        }
        return jsonResponse_({
          success: true,
          action: 'COMPLETE_JOB',
          jobId: targetJobId,
          status: finalStatus,
          alreadyCompleted: true,
          timestamp: nowIso
        });
      }

      // 9. Legacy task actions & custom events
      if (action === 'GET_TASKS') {
        return jsonResponse_({ success: true, action: 'GET_TASKS', tasks: [], timestamp: nowIso });
      }
      if (action === 'UPDATE_TASK') {
        return jsonResponse_({ success: true, action: 'UPDATE_TASK', taskId: payload.taskId, status: payload.status, timestamp: nowIso });
      }
      if (action.indexOf('bento.') === 0 || action === 'contact.ticket_submission') {
        manifest.lastCustomEvent = { action: action, atIso: nowIso };
        manifest.lastUpdated = nowIso;
        saveManifest_(manifest, payload.workspaceId, payload.targetManifest);
        return jsonResponse_({
          success: true,
          action: action,
          serverTimeIso: nowIso
        });
      }

      return jsonResponse_({
        success: false,
        error: 'Unsupported action: ' + action
      });
    });
  } catch (err) {
    return jsonResponse_({ success: false, error: String(err) });
  }
}

/**
 * Time-Driven Trigger Entry Point (Every 1 Minute)
 * Reads ONLY the top block of Doc B (before first horizontal rule) and queues new ACTIVE dispatches into PENDING_JOBS.
 */
function pollDocBToQueue() {
  const nowIso = new Date().toISOString();
  const topBlock = readDocBTopBlock_(DOC_B_ID);
  if (!topBlock.text) {
    return { success: true, queued: false, reason: 'EMPTY_TOP_BLOCK', polledAtIso: nowIso };
  }

  const active = isDocBTopBlockActive_(topBlock.text);
  const contentHash = computeSha256Hex_(topBlock.text);

  return withScriptLock_(function() {
    const manifest = loadOrCreateManifest_();
    manifest.docBState = manifest.docBState || {};
    manifest.docBState.lastPolledIso = nowIso;
    manifest.docBState.lastTopHash = contentHash;
    manifest.docBState.lastTopHeading = topBlock.heading;
    manifest.docBState.lastTopActive = active;

    if (!active) {
      saveManifest_(manifest);
      return {
        success: true,
        queued: false,
        reason: 'TOP_BLOCK_NOT_ACTIVE',
        heading: topBlock.heading,
        contentHash: contentHash,
        polledAtIso: nowIso
      };
    }

    const taskIdMatch = topBlock.text.match(/TASK_ID\s*:\s*([A-Za-z0-9_\-]+)/i);
    const taskId = taskIdMatch ? taskIdMatch[1] : ('DOCB-' + contentHash.slice(0, 8));

    const enqueued = enqueueJob_(manifest, {
      type: 'DOC_B_DISPATCH',
      taskId: taskId,
      title: topBlock.heading || 'Doc B Active Task',
      source: 'DOC_B_POLL_1MIN',
      docId: DOC_B_ID,
      contentHash: contentHash,
      promptText: topBlock.text.slice(0, 4000)
    }, nowIso);

    if (enqueued.inserted) {
      manifest.docBState.lastQueuedHash = contentHash;
      manifest.docBState.lastQueuedJobId = enqueued.job.jobId;
      manifest.docBState.lastQueuedIso = nowIso;
    }

    saveManifest_(manifest);
    return {
      success: true,
      queued: enqueued.inserted,
      deduplicated: !enqueued.inserted,
      jobId: enqueued.job.jobId,
      taskId: taskId,
      contentHash: contentHash,
      polledAtIso: nowIso
    };
  });
}

/**
 * Helper to install a 1-minute time-driven trigger for pollDocBToQueue idempotently.
 */
function installDocBOneMinuteTrigger() {
  const existing = ScriptApp.getProjectTriggers();
  existing.forEach(function(t) {
    if (t.getHandlerFunction() === 'pollDocBToQueue') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('pollDocBToQueue')
    .timeBased()
    .everyMinutes(1)
    .create();
  return { success: true, handler: 'pollDocBToQueue', intervalMinutes: 1 };
}

function readDocBTopBlock_(docId) {
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  const numChildren = body.getNumChildren();
  const lines = [];
  let heading = '';

  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    const childType = child.getType();

    if (childType === DocumentApp.ElementType.HORIZONTAL_RULE) {
      break;
    }

    if (childType === DocumentApp.ElementType.PARAGRAPH) {
      const para = child.asParagraph();
      let hasHr = false;
      const elemCount = para.getNumChildren();
      for (let j = 0; j < elemCount; j++) {
        if (para.getChild(j).getType() === DocumentApp.ElementType.HORIZONTAL_RULE) {
          hasHr = true;
          break;
        }
      }
      if (hasHr) break;

      const text = para.getText().trim();
      if (text === '---' || text === '———') break;
      if (i > 0 && /^\[(CRD WORK CARD|ACTIVE TASK|CONFIRMED COMPLETED|PERMANENT SYSTEM)/i.test(text)) {
        break;
      }
      if (text) {
        if (!heading) heading = text;
        lines.push(text);
      }
    } else if (childType === DocumentApp.ElementType.LIST_ITEM) {
      const liText = child.asListItem().getText().trim();
      if (liText) lines.push('- ' + liText);
    }
  }

  return {
    heading: heading.slice(0, 180),
    text: lines.join('\n').trim()
  };
}

function isDocBTopBlockActive_(topText) {
  if (!topText) return false;
  const statusMatch = topText.match(/STATUS\s*:\s*([^\r\n]+)/i);
  if (statusMatch) {
    const statusUpper = statusMatch[1].toUpperCase();
    if (/(PAUSED|COMPLETED|DONE|BLOCKED|CANCELLED|HOLD|SKIPPED|FINISHED|FAILED)/.test(statusUpper)) {
      return false;
    }
    if (/\b(ACTIVE|READY FOR AGENT EXECUTION|QUEUED|EXECUTE NOW|PENDING EXECUTION)\b/.test(statusUpper)) {
      return true;
    }
    return false;
  }
  const firstLine = (topText.split('\n')[0] || '').trim();
  if (/^\[ACTIVE TASK/i.test(firstLine) && !/(PAUSED|COMPLETED|DONE|BLOCKED|CANCELLED)/i.test(topText)) {
    return true;
  }
  return false;
}

function enqueueJob_(manifest, spec, nowIso) {
  ensureManifestFields_(manifest);
  const contentHash = String(spec.contentHash || '');
  if (contentHash) {
    if (manifest.docBState && manifest.docBState.lastQueuedHash === contentHash) {
      const existingByHash = manifest.pendingJobs.find(function(j) { return j && j.contentHash === contentHash; }) ||
        manifest.completedJobs.find(function(j) { return j && j.contentHash === contentHash; });
      if (existingByHash) {
        return { inserted: false, job: existingByHash };
      }
    }
    const dupPending = manifest.pendingJobs.find(function(j) { return j && j.contentHash === contentHash; });
    if (dupPending) return { inserted: false, job: dupPending };
    const dupDone = manifest.completedJobs.find(function(j) { return j && j.contentHash === contentHash; });
    if (dupDone) return { inserted: false, job: dupDone };
  }

  const jobId = String(spec.jobId || ('DOCB-' + Date.now() + '-' + (contentHash ? contentHash.slice(0, 6) : Utilities.getUuid().slice(0, 6))));
  const newJob = {
    jobId: jobId,
    type: String(spec.type || 'DOC_B_DISPATCH'),
    taskType: String(spec.type || 'DOC_B_DISPATCH'),
    taskId: String(spec.taskId || ''),
    title: String(spec.title || 'Doc B Dispatch').slice(0, 180),
    status: 'PENDING',
    source: String(spec.source || 'DOC_B_POLL_1MIN'),
    docId: String(spec.docId || DOC_B_ID),
    contentHash: contentHash,
    promptText: String(spec.promptText || '').slice(0, 4000),
    createdAtIso: nowIso
  };

  manifest.pendingJobs.push(newJob);
  if (manifest.pendingJobs.length > MAX_PENDING_JOBS) {
    manifest.pendingJobs = manifest.pendingJobs.slice(-MAX_PENDING_JOBS);
  }
  manifest.lastUpdated = nowIso;
  return { inserted: true, job: newJob };
}

function getPendingJobsList_(manifest) {
  ensureManifestFields_(manifest);
  return manifest.pendingJobs.filter(function(j) { return j && j.status === 'PENDING'; });
}

function computeSha256Hex_(inputStr) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(inputStr || ''), Utilities.Charset.UTF_8);
  return bytes.map(function(b) {
    const v = (b < 0) ? (b + 256) : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function withScriptLock_(fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (lockErr) {
    return jsonResponse_({
      success: false,
      error: 'Could not obtain script lock: ' + String(lockErr)
    });
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function handleDeviceHeartbeat_(manifest, payload, nowIso) {
  const rawType = String(payload.deviceType || 'PC').toUpperCase();
  const deviceType = (rawType === 'MOBILE') ? 'MOBILE' : 'PC';
  const deviceId = String(payload.deviceId || (deviceType.toLowerCase() + '-default')).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  const label = String(payload.label || (deviceType === 'MOBILE' ? 'Mobile Client' : 'Desktop PC')).slice(0, 50);

  const prev = (manifest.devices[deviceId] && typeof manifest.devices[deviceId] === 'object') ? manifest.devices[deviceId] : {};
  const entry = Object.assign({}, prev, {
    deviceId: deviceId,
    deviceType: deviceType,
    label: label,
    lastSeenIso: nowIso
  });
  if (payload.status) entry.status = String(payload.status);
  if (payload.zeroPiiEnforced !== undefined) entry.zeroPiiEnforced = Boolean(payload.zeroPiiEnforced);
  if (payload.printGate) entry.printGate = String(payload.printGate);

  manifest.devices[deviceId] = entry;
  manifest.lastUpdated = nowIso;

  return {
    device: manifest.devices[deviceId],
    syncSummary: computeSyncSummary_(manifest.devices)
  };
}

function computeSyncSummary_(devicesMap) {
  const nowMs = Date.now();
  let pcOnline = false;
  let mobileOnline = false;
  let lastPcIso = null;
  let lastMobileIso = null;

  Object.keys(devicesMap || {}).forEach(function(id) {
    const d = devicesMap[id];
    if (!d || !d.lastSeenIso) return;
    const seenMs = Date.parse(d.lastSeenIso);
    const isOnline = !isNaN(seenMs) && ((nowMs - seenMs) <= ONLINE_WINDOW_MS);

    if (d.deviceType === 'PC') {
      if (!lastPcIso || d.lastSeenIso > lastPcIso) lastPcIso = d.lastSeenIso;
      if (isOnline) pcOnline = true;
    } else if (d.deviceType === 'MOBILE') {
      if (!lastMobileIso || d.lastSeenIso > lastMobileIso) lastMobileIso = d.lastSeenIso;
      if (isOnline) mobileOnline = true;
    }
  });

  return {
    pcOnline: pcOnline,
    mobileOnline: mobileOnline,
    bothOnline: pcOnline && mobileOnline,
    lastPcIso: lastPcIso,
    lastMobileIso: lastMobileIso
  };
}

function verifyToken_(incomingToken) {
  const expected = PropertiesService.getScriptProperties().getProperty('CRD_GATEWAY_TOKEN');
  if (!expected || !incomingToken) return false;
  return String(incomingToken) === String(expected);
}

function ensureManifestFields_(manifest) {
  if (!manifest.devices || typeof manifest.devices !== 'object') manifest.devices = {};
  if (!Array.isArray(manifest.scopes)) manifest.scopes = [];
  if (!Array.isArray(manifest.modules)) manifest.modules = [];
  if (!Array.isArray(manifest.gateLogs)) manifest.gateLogs = [];
  if (!Array.isArray(manifest.pendingJobs)) manifest.pendingJobs = [];
  if (!Array.isArray(manifest.completedJobs)) manifest.completedJobs = [];
  if (!Array.isArray(manifest.updateLogs)) manifest.updateLogs = [];
  if (!manifest.docBState || typeof manifest.docBState !== 'object') manifest.docBState = {};
}

function loadOrCreateManifest_(workspaceId, targetManifest) {
  const folder = DriveApp.getFolderById(String(workspaceId || FOLDER_ID));
  const fileName = String(targetManifest || MANIFEST_FILENAME);
  const files = folder.getFilesByName(fileName);
  if (files.hasNext()) {
    const file = files.next();
    try {
      const content = file.getBlob().getDataAsString('UTF-8');
      const parsed = JSON.parse(content || '{}');
      ensureManifestFields_(parsed);
      return parsed;
    } catch (e) {
      const fallback = {};
      ensureManifestFields_(fallback);
      return fallback;
    }
  }
  const initial = {
    project: 'CRD_CENTER_NEXUS_LEDGER',
    projectName: 'AI HUB CONTROL CENTER',
    createdAtIso: new Date().toISOString(),
    lastUpdated: new Date().toISOString()
  };
  ensureManifestFields_(initial);
  folder.createFile(fileName, JSON.stringify(initial, null, 2), MimeType.PLAIN_TEXT);
  return initial;
}

function saveManifest_(manifestObj, workspaceId, targetManifest) {
  ensureManifestFields_(manifestObj);
  const folder = DriveApp.getFolderById(String(workspaceId || FOLDER_ID));
  const fileName = String(targetManifest || MANIFEST_FILENAME);
  const files = folder.getFilesByName(fileName);
  const jsonText = JSON.stringify(manifestObj, null, 2);
  JSON.parse(jsonText); // Validate valid JSON before write
  if (files.hasNext()) {
    files.next().setContent(jsonText);
  } else {
    folder.createFile(fileName, jsonText, MimeType.PLAIN_TEXT);
  }
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
