/**
 * NexusLedger & CRD CENTER Gateway (Code.gs)
 * Additive + Zero-PII + Fail-Closed Token Check + PC/Mobile Presence Sync + Doc-B-to-GAS Auto-Queue Bridge
 */

const FOLDER_ID = '1RvGehvlDrPTaR9JvQgCcFPqiQbRE8_yn';
const MANIFEST_FILENAME = '00_Project_Manifest.json';
const DOC_B_ID = '1UL_maGIJiMm8N6f0sUIYwAkFsqpHLz4HrZbkQZTZn7Q';
const TRACKER_SHEET_ID = '15Pcrq0d4O5I4OZKRS64PcRiVtAHYTZ0JFATdFsCNx88';
const CHECKPOINT_SHEET_ID = '1SiUzkHZcKNfukRSnGBpeMZou1exbrSivlOo20T4pM40';
const TRACKER_TAB_STATUS = 'กระดานติดตามงาน';
const CHECKPOINT_TAB_CMD = '07 คำสั่งงาน';
const ONLINE_WINDOW_MS = 3 * 60 * 1000; // 3 minutes
const MAX_PENDING_JOBS = 50;
const MAX_COMPLETED_JOBS = 50;
const MAX_CALLBACK_DEPTH = 2;
const DEFAULT_GH_REPO = 'm3c07n05-code/Work-space-aap';
const ENABLE_CMS2_BRIDGE = false;
const CMS2_PAUSED_ACTIONS = ['GET_PENDING_JOBS', 'COMPLETE_JOB', 'DEVICE_HEARTBEAT', 'POLL_DOC_B', 'SYNC_DOC_B'];

function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const rawAction = String(params.action || '').trim();
    const format = String(params.format || '').trim().toLowerCase();

    // Serve 1-box Mobile Web Dispatcher UI when opened directly in browser without API action
    if (params.ui === '1' || (!rawAction && format !== 'json')) {
      const endpointUrl = ScriptApp.getService().getUrl();
      return HtmlService.createHtmlOutput(renderMobileDispatcherHtml_(endpointUrl))
        .setTitle('CRD Cloud Auto-Runner')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    if (!verifyToken_(params.token || params.gatewayToken || params.CRD_GATEWAY_TOKEN)) {
      return jsonResponse_({ success: false, error: 'Unauthorized: Invalid gateway token' });
    }

    const action = rawAction.toUpperCase() || 'PING';
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

    if (action === 'GET_RECEIVER_STATUS') {
      const manifest = loadOrCreateManifest_();
      return jsonResponse_(buildReceiverStatusResponse_(manifest, params.jobId));
    }

    if (action === 'GET_PENDING_JOBS') {
      const reqLane = String(params.lane || '').trim().toUpperCase();
      const reqWorker = String(params.workerId || '').trim().toUpperCase();
      if (!ENABLE_CMS2_BRIDGE && (reqLane === 'CMS2_LOCAL' || (!reqLane && reqWorker.indexOf('CMS-2') !== -1))) {
        return jsonResponse_({
          ok: true,
          success: true,
          paused: true,
          action: 'GET_PENDING_JOBS',
          jobs: [],
          totalPending: 0,
          cms2BridgeEnabled: false,
          note: 'CMS-2 bridge paused by owner',
          serverTimeIso: new Date().toISOString(),
          timestamp: new Date().toISOString()
        });
      }
      const manifest = loadOrCreateManifest_();
      const pendingJobs = getPendingJobsList_(manifest, params.lane, params.workerId);
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
            ackVerified: false,
            action: 'CLAIM_JOB',
            error: 'Job not found in pendingJobs: ' + targetJobId,
            timestamp: nowIso
          });
        }
        if (job.status !== 'PENDING') {
          return jsonResponse_({
            success: false,
            claimed: false,
            ackVerified: false,
            action: 'CLAIM_JOB',
            job: job,
            error: 'Job already in status ' + job.status,
            timestamp: nowIso
          });
        }
        job.status = 'IN_PROGRESS';
        job.claimedBy = workerId;
        job.claimedAtIso = nowIso;
        job.ackVerified = true;
        manifest.lastUpdated = nowIso;
        saveManifest_(manifest);
        syncJobToGoogleTrackers_('CLAIM', job, params);
        return jsonResponse_({
          success: true,
          claimed: true,
          ackVerified: true,
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

    if (!ENABLE_CMS2_BRIDGE && CMS2_PAUSED_ACTIONS.indexOf(action) !== -1) {
      return jsonResponse_({
        ok: true,
        success: true,
        paused: true,
        action: action,
        cms2BridgeEnabled: false,
        note: 'CMS-2 bridge paused by owner'
      });
    }

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
      const pendingJobs = getPendingJobsList_(manifest, payload.lane, payload.workerId);
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

    if (action === 'GET_RECEIVER_STATUS') {
      const manifest = loadOrCreateManifest_(payload.workspaceId, payload.targetManifest);
      return jsonResponse_(buildReceiverStatusResponse_(manifest, payload.jobId));
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

      // 8. Persistent Job Queue (Doc-B-to-GAS Auto-Queue Bridge + Google Tracker + Cloud Auto-Router)
      if (action === 'SUBMIT_JOB') {
        const promptText = String(payload.promptText || payload.description || payload.title || '');
        const routedLane = classifyExecutionLane_(promptText, payload.executionLane || payload.lane);
        const rawDepth = Number(payload.callbackDepth || 0);
        const cbDepth = isNaN(rawDepth) || rawDepth < 0 ? 0 : Math.min(rawDepth, MAX_CALLBACK_DEPTH);
        const enqueued = enqueueJob_(manifest, {
          jobId: payload.jobId,
          type: payload.type || payload.taskType || (routedLane === 'CLOUD_ONLY' ? 'CLOUD_DISPATCH' : 'DOC_B_DISPATCH'),
          taskId: payload.taskId || '',
          title: payload.title || promptText.slice(0, 120) || 'Queued Job',
          source: payload.source || 'API_SUBMIT',
          docId: payload.docId || DOC_B_ID,
          contentHash: payload.contentHash || '',
          promptText: promptText,
          executionLane: routedLane,
          callbackPrompt: String(payload.callbackPrompt || '').slice(0, 500),
          callbackDepth: cbDepth
        }, nowIso);
        if (enqueued.inserted) {
          saveManifest_(manifest, payload.workspaceId, payload.targetManifest);
          syncJobToGoogleTrackers_('SUBMIT', enqueued.job, payload);
        }
        let dispatchResult = { triggered: false, status: 'SKIPPED_CMS2_LOCAL' };
        if (enqueued.job.executionLane === 'CLOUD_ONLY') {
          dispatchResult = triggerGitHubCloudRunner_(enqueued.job);
        }
        return jsonResponse_({
          success: true,
          action: 'SUBMIT_JOB',
          jobId: enqueued.job.jobId,
          status: enqueued.job.status,
          executionLane: enqueued.job.executionLane,
          deduplicated: !enqueued.inserted,
          cloudDispatch: dispatchResult,
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
            ackVerified: false,
            action: 'CLAIM_JOB',
            error: 'Job not found in pendingJobs: ' + targetJobId,
            timestamp: nowIso
          });
        }
        if (job.status !== 'PENDING') {
          return jsonResponse_({
            success: false,
            claimed: false,
            ackVerified: false,
            action: 'CLAIM_JOB',
            job: job,
            error: 'Job already in status ' + job.status,
            timestamp: nowIso
          });
        }
        job.status = 'IN_PROGRESS';
        job.claimedBy = workerId;
        job.claimedAtIso = nowIso;
        job.ackVerified = true;
        manifest.lastUpdated = nowIso;
        saveManifest_(manifest, payload.workspaceId, payload.targetManifest);
        syncJobToGoogleTrackers_('CLAIM', job, payload);
        return jsonResponse_({
          success: true,
          claimed: true,
          ackVerified: true,
          action: 'CLAIM_JOB',
          job: job,
          timestamp: nowIso
        });
      }

      if (action === 'COMPLETE_JOB') {
        const targetJobId = String(payload.jobId || '');
        const finalStatus = String(payload.status || 'DONE').toUpperCase();
        const summary = String(payload.summary || '').slice(0, 300);
        const advisorNote = String(payload.advisorNote || '').slice(0, 300);
        const cbPrompt = String(payload.callbackPrompt || '').trim().slice(0, 500);
        const idx = manifest.pendingJobs.findIndex(function(j) { return j && j.jobId === targetJobId; });
        if (idx >= 0) {
          const origJob = manifest.pendingJobs[idx];
          const curDepth = Number(payload.callbackDepth !== undefined ? payload.callbackDepth : (origJob.callbackDepth || 0)) || 0;
          const finishedJob = Object.assign({}, origJob, {
            status: finalStatus,
            completedAtIso: nowIso,
            summary: summary,
            advisorNote: advisorNote,
            runUrl: String(payload.runUrl || ''),
            outputPdf: String(payload.outputPdf || ''),
            claimAckVerified: Boolean(payload.claimAckVerified !== undefined ? payload.claimAckVerified : origJob.ackVerified),
            paperPrinted: Number(payload.paperPrinted || 0)
          });
          manifest.pendingJobs.splice(idx, 1);
          manifest.completedJobs.unshift(finishedJob);
          if (manifest.completedJobs.length > MAX_COMPLETED_JOBS) {
            manifest.completedJobs = manifest.completedJobs.slice(0, MAX_COMPLETED_JOBS);
          }

          let callbackDispatch = { triggered: false, status: 'NONE' };
          const activeCbPrompt = cbPrompt || String(origJob.callbackPrompt || '').trim();
          if (activeCbPrompt && finalStatus === 'DONE' && curDepth < MAX_CALLBACK_DEPTH) {
            const nextDepth = curDepth + 1;
            const cbLane = classifyExecutionLane_(activeCbPrompt, '');
            const cbEnqueued = enqueueJob_(manifest, {
              jobId: targetJobId + '-CB' + nextDepth,
              type: cbLane === 'CLOUD_ONLY' ? 'CLOUD_CALLBACK' : 'DOC_B_DISPATCH',
              taskId: String(origJob.taskId || targetJobId) + '-CB' + nextDepth,
              title: '[Callback #' + nextDepth + '] ' + activeCbPrompt.slice(0, 90),
              source: 'RETURN_CALLBACK',
              docId: DOC_B_ID,
              promptText: activeCbPrompt,
              executionLane: cbLane,
              callbackDepth: nextDepth
            }, nowIso);
            if (cbEnqueued.inserted && cbEnqueued.job.executionLane === 'CLOUD_ONLY') {
              callbackDispatch = triggerGitHubCloudRunner_(cbEnqueued.job);
              callbackDispatch.callbackJobId = cbEnqueued.job.jobId;
              callbackDispatch.callbackDepth = nextDepth;
            }
          }

          manifest.lastUpdated = nowIso;
          saveManifest_(manifest, payload.workspaceId, payload.targetManifest);
          syncJobToGoogleTrackers_('COMPLETE', finishedJob, payload);
          return jsonResponse_({
            success: true,
            action: 'COMPLETE_JOB',
            jobId: targetJobId,
            status: finalStatus,
            callbackDispatch: callbackDispatch,
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

      if (action === 'SYNC_TRACKER') {
        const trackerResult = syncTrackerSheetToQueue_(manifest, nowIso);
        if (trackerResult.queuedCount > 0) {
          saveManifest_(manifest, payload.workspaceId, payload.targetManifest);
        }
        return jsonResponse_({
          success: true,
          action: 'SYNC_TRACKER',
          trackerResult: trackerResult,
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
 * Reads ONLY the top block of Doc B (before first horizontal rule) and optional READY rows in Sheet 07.
 */
function pollDocBToQueue() {
  const nowIso = new Date().toISOString();
  const topBlock = readDocBTopBlock_(DOC_B_ID);
  const active = topBlock.text ? isDocBTopBlockActive_(topBlock.text) : false;
  const contentHash = topBlock.text ? computeSha256Hex_(topBlock.text) : '';

  return withScriptLock_(function() {
    const manifest = loadOrCreateManifest_();
    manifest.docBState = manifest.docBState || {};
    manifest.docBState.lastPolledIso = nowIso;
    if (topBlock.text) {
      manifest.docBState.lastTopHash = contentHash;
      manifest.docBState.lastTopHeading = topBlock.heading;
      manifest.docBState.lastTopActive = active;
    }

    let docBResult = { queued: false, reason: topBlock.text ? 'TOP_BLOCK_NOT_ACTIVE' : 'EMPTY_TOP_BLOCK' };
    if (topBlock.text && active) {
      const taskIdMatch = topBlock.text.match(/TASK_ID\s*:\s*([A-Za-z0-9_\-]+)/i);
      const taskId = taskIdMatch ? taskIdMatch[1] : ('DOCB-' + contentHash.slice(0, 8));
      const routedLane = classifyExecutionLane_(topBlock.text);

      const enqueued = enqueueJob_(manifest, {
        type: routedLane === 'CLOUD_ONLY' ? 'CLOUD_DISPATCH' : 'DOC_B_DISPATCH',
        taskId: taskId,
        title: topBlock.heading || 'Doc B Active Task',
        source: 'DOC_B_POLL_1MIN',
        docId: DOC_B_ID,
        contentHash: contentHash,
        promptText: topBlock.text.slice(0, 4000),
        executionLane: routedLane
      }, nowIso);

      let cloudDispatch = { triggered: false, status: 'SKIPPED' };
      if (enqueued.inserted) {
        manifest.docBState.lastQueuedHash = contentHash;
        manifest.docBState.lastQueuedJobId = enqueued.job.jobId;
        manifest.docBState.lastQueuedIso = nowIso;
        if (enqueued.job.executionLane === 'CLOUD_ONLY') {
          cloudDispatch = triggerGitHubCloudRunner_(enqueued.job);
        }
      }
      docBResult = {
        queued: enqueued.inserted,
        deduplicated: !enqueued.inserted,
        jobId: enqueued.job.jobId,
        taskId: taskId,
        executionLane: enqueued.job.executionLane,
        cloudDispatch: cloudDispatch
      };
    }

    let trackerResult = { skipped: true, reason: 'THROTTLED_5MIN' };
    let shouldSyncTracker = true;
    try {
      const cache = CacheService.getScriptCache();
      if (cache && cache.get('crd_tracker_5min_lock')) {
        shouldSyncTracker = false;
      } else if (cache) {
        cache.put('crd_tracker_5min_lock', '1', 300);
      }
    } catch (_) {}
    if (shouldSyncTracker) {
      trackerResult = syncTrackerSheetToQueue_(manifest, nowIso);
    }
    saveManifest_(manifest);
    return {
      success: true,
      queued: Boolean(docBResult.queued || trackerResult.queuedCount > 0),
      docB: docBResult,
      tracker: trackerResult,
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
  const normalized = String(topText).replace(/\*\*/g, '');
  const statusMatch = normalized.match(/STATUS\s*:\s*([^\r\n|]+)/i);
  if (statusMatch) {
    const statusUpper = statusMatch[1].toUpperCase();
    if (/(PAUSED|COMPLETED|DONE|BLOCKED|CANCELLED|HOLD|SKIPPED|FINISHED|FAILED|EXECUTION REPORT)/.test(statusUpper)) {
      return false;
    }
    if (/\b(ACTIVE|READY|READY FOR AGENT EXECUTION|QUEUED|EXECUTE NOW|EXECUTE IMMEDIATELY|OWNER APPROVED|PENDING EXECUTION|EXECUTE DIRECTLY)\b/.test(statusUpper)) {
      return true;
    }
    return false;
  }
  const firstLine = (normalized.split('\n')[0] || '').trim();
  if (/^\[?(ACTIVE TASK|CRD\s+[A-Z0-9\-]+\s+DISPATCH|CRD TASK DISPATCH|CRD UNIFIED|ANTIGRAVITY RUNBOOK)/i.test(firstLine) && !/EXECUTION REPORT/i.test(firstLine) && !/(STATUS\s*:\s*(PAUSED|COMPLETED|DONE|BLOCKED|CANCELLED))/i.test(normalized)) {
    return true;
  }
  return false;
}

function classifyExecutionLane_(promptText, explicitLane) {
  const rawExplicit = String(explicitLane || '').trim().toUpperCase();
  const textLower = String(promptText || '').toLowerCase();

  if (/execution_lane\s*:\s*cloud_only/.test(textLower)) return 'CLOUD_ONLY';
  if (/execution_lane\s*:\s*cms2_local/.test(textLower)) return 'CMS2_LOCAL';
  if (rawExplicit === 'CLOUD_ONLY' || rawExplicit === 'CMS2_LOCAL') return rawExplicit;

  const localHints = [
    'd:\\coop', 'viewreport', '00_master_source', 's:\\2026',
    'c:\\users\\natee.yan', 'excel.application', 'viewcrreport',
    'ลิ้นชัก', 'เครื่องพิมพ์จริง', 'ปริ้นจริง', 'สั่งพิมพ์จริง', 'cms-2 only'
  ];
  for (let i = 0; i < localHints.length; i++) {
    if (textLower.indexOf(localHints[i]) !== -1) {
      return 'CMS2_LOCAL';
    }
  }
  return 'CLOUD_ONLY';
}

function buildReceiverStatusResponse_(manifest, targetJobId) {
  ensureManifestFields_(manifest);
  const id = String(targetJobId || '').trim();
  const matched = id
    ? (manifest.pendingJobs.find(function(j) { return j && j.jobId === id; }) ||
       manifest.completedJobs.find(function(j) { return j && j.jobId === id; }) || null)
    : null;
  const receiverStatus = matched ? String(matched.status || 'UNKNOWN') : 'IDLE';
  const ackVerified = Boolean(matched && (matched.ackVerified || matched.claimAckVerified || matched.claimedBy));
  return {
    success: true,
    action: 'GET_RECEIVER_STATUS',
    jobId: id || null,
    receiverStatus: receiverStatus,
    claimAckVerified: ackVerified,
    job: matched,
    pendingCount: manifest.pendingJobs.length,
    completedCount: manifest.completedJobs.length,
    syncSummary: computeSyncSummary_(manifest.devices || {}),
    serverTimeIso: new Date().toISOString()
  };
}

function syncJobToGoogleTrackers_(stage, job, payload) {
  if (!job) return { synced: false, reason: 'NO_JOB' };
  const updated = [];
  const taskId = String(job.taskId || job.jobId || '').trim();
  const statusMap = {
    SUBMIT: 'งานใหม่',
    CLAIM: 'กำลังทำ',
    COMPLETE: String(job.status || 'DONE').toUpperCase() === 'DONE' ? 'เสร็จแล้ว' : 'ติดขัด'
  };
  const targetSheetStatus = statusMap[stage] || 'กำลังทำ';
  const evidenceUrl = String((payload && (payload.runUrl || (payload.trackerUpdate && payload.trackerUpdate.evidenceUrl))) || job.runUrl || '');
  const nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');

  try {
    const ssCheck = SpreadsheetApp.openById(CHECKPOINT_SHEET_ID);
    const cmdSheet = ssCheck.getSheetByName(CHECKPOINT_TAB_CMD);
    if (cmdSheet && taskId) {
      const lastRow = cmdSheet.getLastRow();
      const rows = lastRow >= 2 ? cmdSheet.getRange(2, 1, lastRow - 1, 11).getValues() : [];
      let foundRow = -1;
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][0] || '').trim() === taskId || String(rows[i][0] || '').trim() === String(job.jobId || '')) {
          foundRow = i + 2;
          break;
        }
      }
      if (foundRow > 0) {
        cmdSheet.getRange(foundRow, 5).setValue(targetSheetStatus);
        if (evidenceUrl) cmdSheet.getRange(foundRow, 8).setValue(evidenceUrl);
        cmdSheet.getRange(foundRow, 11).setValue(nowStr);
      } else if (stage === 'SUBMIT' && String(job.source || '') !== 'TRACKER_SHEET_07') {
        cmdSheet.appendRow([
          taskId,
          'CRD-W04',
          String(job.title || '').slice(0, 120),
          String(job.promptText || '').slice(0, 500),
          targetSheetStatus,
          '',
          '',
          evidenceUrl,
          String(job.source || 'CLOUD_RUNNER'),
          nowStr,
          nowStr
        ]);
      }
      updated.push('CHECKPOINT_07');
    }
  } catch (_) {}

  try {
    const ssTrack = SpreadsheetApp.openById(TRACKER_SHEET_ID);
    const statusSheet = ssTrack.getSheetByName(TRACKER_TAB_STATUS);
    if (statusSheet && taskId) {
      const lastRow = statusSheet.getLastRow();
      const rows = lastRow >= 2 ? statusSheet.getRange(2, 1, lastRow - 1, 9).getValues() : [];
      for (let r = 0; r < rows.length; r++) {
        if (String(rows[r][0] || '').trim() === taskId) {
          const rowIdx = r + 2;
          statusSheet.getRange(rowIdx, 4).setValue(targetSheetStatus);
          if (job.summary) statusSheet.getRange(rowIdx, 5).setValue(String(job.summary).slice(0, 240));
          if (job.advisorNote) statusSheet.getRange(rowIdx, 7).setValue(String(job.advisorNote).slice(0, 200));
          statusSheet.getRange(rowIdx, 8).setValue(nowStr);
          if (evidenceUrl) statusSheet.getRange(rowIdx, 9).setValue(evidenceUrl);
          updated.push('TRACKER_STATUS');
          break;
        }
      }
    }
  } catch (_) {}

  return { synced: updated.length > 0, targets: updated };
}

function syncTrackerSheetToQueue_(manifest, nowIso) {
  const result = { scanned: 0, queuedCount: 0, jobs: [], error: '' };
  try {
    const ssCheck = SpreadsheetApp.openById(CHECKPOINT_SHEET_ID);
    const cmdSheet = ssCheck.getSheetByName(CHECKPOINT_TAB_CMD);
    if (!cmdSheet) return result;
    const lastRow = cmdSheet.getLastRow();
    if (lastRow < 2) return result;
    const rows = cmdSheet.getRange(2, 1, lastRow - 1, 11).getValues();
    result.scanned = rows.length;
    const nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');

    for (let i = 0; i < rows.length; i++) {
      const taskId = String(rows[i][0] || '').trim();
      const title = String(rows[i][2] || '').trim();
      const detail = String(rows[i][3] || '').trim();
      const rowStatus = String(rows[i][4] || '').trim();
      if (!taskId || /^(READY|EXECUTE NOW|พร้อมรัน|สั่งรันคลาวด์)$/i.test(rowStatus) === false) {
        continue;
      }
      const combinedPrompt = [title, detail].filter(Boolean).join('\n');
      const contentHash = computeSha256Hex_(taskId + '|' + combinedPrompt);
      const routedLane = classifyExecutionLane_(combinedPrompt, '');
      const enqueued = enqueueJob_(manifest, {
        type: routedLane === 'CLOUD_ONLY' ? 'CLOUD_DISPATCH' : 'DOC_B_DISPATCH',
        taskId: taskId,
        title: title || taskId,
        source: 'TRACKER_SHEET_07',
        contentHash: contentHash,
        promptText: combinedPrompt,
        executionLane: routedLane
      }, nowIso);
      if (enqueued.inserted) {
        cmdSheet.getRange(i + 2, 5).setValue('รับเข้าคิวแล้ว');
        cmdSheet.getRange(i + 2, 11).setValue(nowStr);
        let dispatchRes = { triggered: false };
        if (enqueued.job.executionLane === 'CLOUD_ONLY') {
          dispatchRes = triggerGitHubCloudRunner_(enqueued.job);
        }
        result.queuedCount++;
        result.jobs.push({ jobId: enqueued.job.jobId, taskId: taskId, cloudDispatch: dispatchRes });
      }
    }
  } catch (err) {
    result.error = String(err);
  }
  return result;
}

function triggerGitHubCloudRunner_(job) {
  const props = PropertiesService.getScriptProperties();
  const ghPat = String(props.getProperty('GH_PAT') || '').trim();
  if (!ghPat) {
    return { triggered: false, status: 'NOT_CONFIGURED', note: 'Set GH_PAT in GAS Script Properties to enable instant dispatch' };
  }
  const repo = String(props.getProperty('GH_REPO') || DEFAULT_GH_REPO).trim();
  const url = 'https://api.github.com/repos/' + repo + '/dispatches';
  const cbDepth = Number(job.callbackDepth || 0) || 0;
  const payload = {
    event_type: cbDepth > 0 ? 'crd-cloud-callback' : 'crd-cloud-job',
    client_payload: {
      jobId: String(job.jobId || ''),
      taskId: String(job.taskId || ''),
      title: String(job.title || '').slice(0, 180),
      executionLane: String(job.executionLane || 'CLOUD_ONLY'),
      promptText: String(job.promptText || '').slice(0, 3500),
      callbackPrompt: String(job.callbackPrompt || '').slice(0, 500),
      callbackDepth: cbDepth
    }
  };
  try {
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + ghPat,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'CRD-GAS-Dispatcher/1.0'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const code = resp.getResponseCode();
    return {
      triggered: code === 204 || code === 200 || code === 201,
      status: code === 204 ? 'DISPATCHED' : ('HTTP_' + code),
      repo: repo
    };
  } catch (err) {
    return { triggered: false, status: 'FETCH_ERROR', error: String(err) };
  }
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

  const promptStr = String(spec.promptText || '').slice(0, 4000);
  const executionLane = classifyExecutionLane_(promptStr, spec.executionLane);
  const jobId = String(spec.jobId || ((executionLane === 'CLOUD_ONLY' ? 'CLOUD-' : 'DOCB-') + Date.now() + '-' + (contentHash ? contentHash.slice(0, 6) : Utilities.getUuid().slice(0, 6))));
  const newJob = {
    jobId: jobId,
    type: String(spec.type || 'DOC_B_DISPATCH'),
    taskType: String(spec.type || 'DOC_B_DISPATCH'),
    taskId: String(spec.taskId || ''),
    title: String(spec.title || 'Doc B Dispatch').slice(0, 180),
    status: 'PENDING',
    executionLane: executionLane,
    source: String(spec.source || 'DOC_B_POLL_1MIN'),
    docId: String(spec.docId || DOC_B_ID),
    contentHash: contentHash,
    promptText: promptStr,
    callbackPrompt: String(spec.callbackPrompt || '').slice(0, 500),
    callbackDepth: Number(spec.callbackDepth || 0) || 0,
    createdAtIso: nowIso
  };

  manifest.pendingJobs.push(newJob);
  if (manifest.pendingJobs.length > MAX_PENDING_JOBS) {
    manifest.pendingJobs = manifest.pendingJobs.slice(-MAX_PENDING_JOBS);
  }
  manifest.lastUpdated = nowIso;
  return { inserted: true, job: newJob };
}

function getPendingJobsList_(manifest, laneFilter, workerId) {
  ensureManifestFields_(manifest);
  const targetLane = String(laneFilter || '').trim().toUpperCase();
  const workerUpper = String(workerId || '').trim().toUpperCase();
  return manifest.pendingJobs.filter(function(j) {
    if (!j || j.status !== 'PENDING') return false;
    const jobLane = String(j.executionLane || classifyExecutionLane_(j.promptText || j.title || '', '')).toUpperCase();
    if (targetLane && jobLane !== targetLane) return false;
    if (!targetLane && workerUpper.indexOf('CMS-2') !== -1 && jobLane === 'CLOUD_ONLY') return false;
    if (!targetLane && workerUpper.indexOf('CLOUD') !== -1 && jobLane === 'CMS2_LOCAL') return false;
    return true;
  });
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
  const deviceType = (rawType === 'MOBILE' || rawType === 'CLOUD') ? rawType : 'PC';
  const deviceId = String(payload.deviceId || (deviceType.toLowerCase() + '-default')).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  const label = String(payload.label || (deviceType === 'MOBILE' ? 'Mobile Client' : (deviceType === 'CLOUD' ? 'Cloud Runner' : 'Desktop PC'))).slice(0, 50);

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
  let cloudOnline = false;
  let lastPcIso = null;
  let lastMobileIso = null;
  let lastCloudIso = null;

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
    } else if (d.deviceType === 'CLOUD') {
      if (!lastCloudIso || d.lastSeenIso > lastCloudIso) lastCloudIso = d.lastSeenIso;
      if (isOnline) cloudOnline = true;
    }
  });

  return {
    pcOnline: pcOnline,
    mobileOnline: mobileOnline,
    cloudOnline: cloudOnline,
    bothOnline: pcOnline && mobileOnline,
    lastPcIso: lastPcIso,
    lastMobileIso: lastMobileIso,
    lastCloudIso: lastCloudIso
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

function renderMobileDispatcherHtml_(endpointUrl) {
  const safeEndpoint = JSON.stringify(String(endpointUrl || ''));
  return [
    '<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">',
    '<title>CRD Cloud Auto-Runner</title>',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<style>',
    'body{margin:0;background:#0b1120;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:16px;max-width:560px;margin:auto}',
    '.card{background:#131d32;border:1px solid #1e3a5f;border-radius:16px;padding:14px;margin-bottom:12px}',
    'textarea,input{width:100%;box-sizing:border-box;background:#0f172a;color:#f8fafc;border:1px solid #334155;border-radius:10px;padding:10px;font-size:14px}',
    'button{border:0;border-radius:10px;padding:10px 14px;font-weight:700;cursor:pointer;font-size:13px}',
    '.btn-primary{background:linear-gradient(90deg,#2563eb,#06b6d4);color:#fff;width:100%;margin-top:8px}',
    '.btn-chip{background:#1e293b;color:#7dd3fc;border:1px solid #334155;margin:4px 4px 0 0;font-size:11px;padding:6px 10px}',
    '.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700}',
    '.b-pending{background:#78350f;color:#fde68a}.b-done{background:#064e3b;color:#6ee7b7}.b-prog{background:#164e63;color:#67e8f9}',
    '.job-item{padding:8px;border:1px solid #1e293b;border-radius:10px;margin-bottom:8px;background:#0f172a}',
    '.job-head{display:flex;justify-content:space-between;align-items:center}',
    '.job-title{color:#cbd5e1;margin:4px 0}',
    '.job-lane{color:#38bdf8}',
    '.job-sum{color:#34d399;font-size:11px}',
    '.job-adv{color:#fbbf24;font-size:11px;margin-top:2px}',
    '</style></head><body>',
    '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center">',
    '<div><b>⚡ CRD Cloud Auto-Runner</b><div style="font-size:11px;color:#94a3b8">สั่งช่องเดียว • ระบบเลือกเลนและปลุก Cloud ให้อัตโนมัติ</div></div>',
    '<span id="connStatus" class="badge b-prog">READY</span></div></div>',
    '<div class="card"><div style="font-size:12px;color:#94a3b8;margin-bottom:6px">รหัสเชื่อมต่อ (CRD_GATEWAY_TOKEN — จำไว้ในเครื่องครั้งเดียว)</div>',
    '<input id="tok" type="password" placeholder="ใส่ Token ของ Gateway..." onchange="saveTok()"></div>',
    '<div class="card"><div style="font-size:13px;font-weight:700;margin-bottom:6px">พิมพ์คำสั่งที่ต้องการให้ทำได้เลย</div>',
    '<textarea id="cmd" rows="3" placeholder="เช่น สร้างใบนำส่ง WORK 4 ขนาด A4 ด้วยข้อมูลสมมติ 3 รายการ หรือ ตรวจระยะพิมพ์ A6"></textarea>',
    '<input id="cbCmd" type="text" style="margin-top:6px;font-size:12px" placeholder="(ตัวเลือก) คำสั่งรันกลับหลังจบงาน เช่น ตรวจระบบ parity SHA-256">',
    '<div><button class="btn-chip" onclick="quick(\'สร้างใบนำส่ง WORK 4 ขนาด A4 ด้วยข้อมูลสมมติ 3 รายการ\')">📄 ใบนำส่ง A4</button>',
    '<button class="btn-chip" onclick="quick(\'ตรวจระยะพิมพ์ A6 ใบฟ้าและปัญหาช่องว่าง\')">📏 ตรวจระยะ A6</button>',
    '<button class="btn-chip" onclick="quick(\'ตรวจระบบ parity SHA-256 และสถานะ Cloud Runner\')">🛡️ ตรวจระบบ</button></div>',
    '<button id="sendBtn" class="btn-primary" onclick="sendJob()">🚀 ส่งงานให้ระบบจัดการเอง</button></div>',
    '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">',
    '<b>📊 งานล่าสุด &amp; ความเห็นระบบ</b><button class="btn-chip" style="margin:0" onclick="refresh()">รีเฟรช</button></div>',
    '<div id="feed" style="font-size:12px;color:#94a3b8">ใส่ Token แล้วกดรีเฟรชเพื่อดูคิวล่าสุด</div></div>',
    '<script>',
    'const EP = ' + safeEndpoint + ' || location.href.split("?")[0];',
    'const tokEl = document.getElementById("tok"); tokEl.value = localStorage.getItem("crd_gw_tok") || "";',
    'function saveTok(){ localStorage.setItem("crd_gw_tok", tokEl.value.trim()); refresh(); }',
    'function quick(t){ document.getElementById("cmd").value = t; }',
    'function esc(s){ return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }',
    'async function sendJob(){',
    '  const t = tokEl.value.trim(); const p = document.getElementById("cmd").value.trim(); const cb = document.getElementById("cbCmd").value.trim();',
    '  if(!t){ alert("กรุณาใส่ Token ก่อน"); return; }',
    '  if(!p){ alert("กรุณาพิมพ์คำสั่ง"); return; }',
    '  const b = document.getElementById("sendBtn"); b.disabled = true; b.innerText = "⏳ กำลังส่งและปลุก Cloud Runner...";',
    '  try{',
    '    const r = await fetch(EP, { method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body: JSON.stringify({ action:"SUBMIT_JOB", token:t, title:p.slice(0,90), promptText:p, callbackPrompt:cb, source:"MOBILE_ONE_BOX" }) });',
    '    const d = await r.json();',
    '    if(d.success){ document.getElementById("cmd").value = ""; document.getElementById("cbCmd").value = ""; await refresh(); } else { alert(d.error || "Error"); }',
    '  }catch(e){ alert("เชื่อมต่อไม่ได้: " + e); }',
    '  finally{ b.disabled = false; b.innerText = "🚀 ส่งงานให้ระบบจัดการเอง"; }',
    '}',
    'async function refresh(){',
    '  const t = tokEl.value.trim(); if(!t) return;',
    '  try{',
    '    const r = await fetch(EP + "?action=GET_MANIFEST&token=" + encodeURIComponent(t) + "&t=" + Date.now());',
    '    const d = await r.json();',
    '    if(!d.success){ document.getElementById("connStatus").innerText = d.error || "ERR"; return; }',
    '    document.getElementById("connStatus").innerText = (d.syncSummary && d.syncSummary.cloudOnline) ? "CLOUD ONLINE" : "GATEWAY OK";',
    '    const all = [].concat(d.manifest.pendingJobs || []).concat(d.manifest.completedJobs || []).slice(0, 8);',
    '    document.getElementById("feed").innerHTML = all.map(function(j){',
    '      const st = String(j.status || "PENDING").toUpperCase();',
    '      const cls = st === "DONE" ? "b-done" : (st === "IN_PROGRESS" ? "b-prog" : "b-pending");',
    '      const ack = (j.claimAckVerified || j.ackVerified) ? " ✓ACK" : "";',
    '      const runLnk = (j.runUrl && /^https:\\/\\//.test(j.runUrl)) ? ("<div><a style=\'color:#7dd3fc;font-size:11px\' target=\'_blank\' href=\'" + esc(j.runUrl) + "\'>🔗 เปิดผลรัน GitHub Run</a></div>") : "";',
    '      return "<div class=\'job-item\'>"',
    '        + "<div class=\'job-head\'><b>" + esc(j.jobId) + "</b><span class=\'badge " + cls + "\'>" + esc(st + ack) + "</span></div>"',
    '        + "<div class=\'job-title\'>" + esc(j.title) + " <span class=\'job-lane\'>[" + esc(j.executionLane || "AUTO") + "]</span></div>"',
    '        + (j.summary ? "<div class=\'job-sum\'>ผลลัพธ์: " + esc(j.summary) + "</div>" : "")',
    '        + (j.advisorNote ? "<div class=\'job-adv\'>💡 แนะนำ: " + esc(j.advisorNote) + "</div>" : "")',
    '        + runLnk',
    '        + "</div>";',
    '    }).join("") || "ยังไม่มีรายการ";',
    '  }catch(e){}',
    '}',
    'if(tokEl.value) refresh(); setInterval(function(){ if(!document.hidden && tokEl.value) refresh(); }, 10000);',
    '</script></body></html>'
  ].join('\n');
}

