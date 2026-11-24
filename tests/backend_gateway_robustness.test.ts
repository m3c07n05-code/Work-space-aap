import http from 'http';
import { backendGateway } from '../src/services/backendGateway';

async function runRobustnessTests() {
  console.log('===============================================================');
  console.log('🧪 backendGateway Robustness & Stream Consumption Test');
  console.log('===============================================================\n');

  let serverMode: 'HTML_500' | 'EMPTY_404' | 'VALID_JSON' | 'GAS_UNAUTHORIZED' | 'GAS_AUTHORIZED' = 'HTML_500';

  const server = http.createServer((req, res) => {
    if (serverMode === 'HTML_500') {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<html><body>500 Internal Server Error</body></html>');
    } else if (serverMode === 'EMPTY_404') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } else if (serverMode === 'GAS_UNAUTHORIZED') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Unauthorized: Invalid gateway token' }));
    } else if (serverMode === 'GAS_AUTHORIZED') {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            manifest: {
              modules: [
                { componentId: 'MOD-1', title: 'Mock Module 1' },
                { componentId: 'MOD-2', title: 'Mock Module 2' },
              ],
            },
          })
        );
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, action: 'PING', status: 'CONNECTED' }));
      }
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, manifest: { modules: [] } }));
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as { port: number };
  const mockUrl = `http://127.0.0.1:${address.port}/exec?script.google.com=true`;

  try {
    // Test 1: readManifest with HTML 500
    console.log('[Test 1/4] Probing readManifest with HTTP 500 HTML error...');
    serverMode = 'HTML_500';
    const manifestRes = await backendGateway.readManifest(mockUrl);
    if (manifestRes.success !== false) {
      throw new Error(`Expected success: false, got: ${manifestRes.success}`);
    }
    const lastLog = backendGateway.getLogs()[0];
    if (lastLog.status !== 500) {
      throw new Error(`Expected log.status to be 500, got: ${lastLog.status}`);
    }
    if (typeof (lastLog.response as any)?.raw !== 'string' || !(lastLog.response as any).raw.includes('500 Internal Server Error')) {
      throw new Error(`Expected raw HTML preserved in log.response, got: ${JSON.stringify(lastLog.response)}`);
    }
    console.log('  ✓ Test 1 Passed: readManifest preserved HTTP 500 and captured raw HTML without stream TypeError.\n');

    // Test 2: dispatchAction (GAS mode) with HTML 500
    console.log('[Test 2/4] Probing dispatchAction (GAS mode) with HTTP 500 HTML error...');
    backendGateway.updateConfig({ baseUrl: mockUrl });
    const dispatchRes = await backendGateway.dispatchAction('TEST_ACTION', { foo: 'bar' });
    if (dispatchRes.success !== false) {
      throw new Error(`Expected success: false, got: ${dispatchRes.success}`);
    }
    if (dispatchRes.log.status !== 500) {
      throw new Error(`Expected dispatchRes.log.status to be 500 (not masked as 504), got: ${dispatchRes.log.status}`);
    }
    if (typeof (dispatchRes.log.response as any)?.raw !== 'string' || !(dispatchRes.log.response as any).raw.includes('500 Internal Server Error')) {
      throw new Error(`Expected raw HTML in response, got: ${JSON.stringify(dispatchRes.log.response)}`);
    }
    console.log('  ✓ Test 2 Passed: dispatchAction correctly preserved status 500 without masking as 504.\n');

    // Test 3: testConnection with HTTP 500
    console.log('[Test 3/4] Probing testConnection with HTTP 500 error...');
    const connRes = await backendGateway.testConnection();
    if (connRes.success !== false) {
      throw new Error(`Expected connRes.success: false, got: ${connRes.success}`);
    }
    if (connRes.status !== 500) {
      throw new Error(`Expected connRes.status: 500, got: ${connRes.status}`);
    }
    console.log('  ✓ Test 3 Passed: testConnection cleanly reported status 500.\n');

    // Test 4: dispatchAction with non-GAS mode HTTP 404
    console.log('[Test 4/4] Probing dispatchAction (non-GAS mode) with HTTP 404...');
    const nonGasUrl = `http://127.0.0.1:${address.port}/api/endpoint`;
    backendGateway.updateConfig({ baseUrl: nonGasUrl });
    serverMode = 'EMPTY_404';
    const nonGasDispatch = await backendGateway.dispatchAction('TEST_NON_GAS', {});
    if (nonGasDispatch.log.status !== 404) {
      throw new Error(`Expected nonGasDispatch.log.status to be 404, got: ${nonGasDispatch.log.status}`);
    }
    if ((nonGasDispatch.log.response as any)?.raw !== 'Not Found') {
      throw new Error(`Expected raw: "Not Found", got: ${JSON.stringify(nonGasDispatch.log.response)}`);
    }
    console.log('  ✓ Test 4 Passed: non-GAS dispatchAction preserved HTTP 404 and raw text.\n');

    // Test 5: Placeholder token stripping and whitespace trimming
    console.log('[Test 5/8] Verifying placeholder token stripping & whitespace trimming...');
    backendGateway.updateConfig({
      baseUrl: `  ${mockUrl}  `,
      apiKey: 'gas_auto_token_manifest_sync',
      isSimulationMode: false,
    });
    if (backendGateway.getConfig().apiKey !== '') {
      throw new Error(`Expected placeholder token stripped, got: ${backendGateway.getConfig().apiKey}`);
    }
    if (backendGateway.getConfig().baseUrl !== mockUrl) {
      throw new Error(`Expected trimmed baseUrl, got: "${backendGateway.getConfig().baseUrl}"`);
    }
    if (backendGateway.hasGatewayToken() !== false) {
      throw new Error('Expected hasGatewayToken() to be false when placeholder is stripped');
    }
    backendGateway.updateConfig({ apiKey: '  real_secret_token_123  ' });
    if (backendGateway.getConfig().apiKey !== 'real_secret_token_123') {
      throw new Error(`Expected trimmed apiKey, got: "${backendGateway.getConfig().apiKey}"`);
    }
    console.log('  ✓ Test 5 Passed: Placeholder stripped and whitespace trimmed.\n');

    // Test 6: GAS Unauthorized error surfacing & Zero-Secret PING log
    console.log('[Test 6/8] Probing testConnection with GAS Unauthorized response...');
    serverMode = 'GAS_UNAUTHORIZED';
    const unauthRes = await backendGateway.testConnection();
    if (unauthRes.success !== false) {
      throw new Error(`Expected unauthRes.success: false, got: ${unauthRes.success}`);
    }
    if (!unauthRes.message.includes('Unauthorized: Invalid gateway token')) {
      throw new Error(`Expected Unauthorized message surfaced, got: ${unauthRes.message}`);
    }
    const pingLog = backendGateway.getLogs()[0];
    if (pingLog.action !== 'PING' || 'token' in pingLog.payload) {
      throw new Error(`Expected Zero-Secret PING log without raw token, got: ${JSON.stringify(pingLog)}`);
    }
    console.log('  ✓ Test 6 Passed: Unauthorized error surfaced cleanly and Zero-Secret maintained.\n');

    // Test 7: verifyAndSync refreshes status & Live Payloads modules
    console.log('[Test 7/8] Verifying verifyAndSync updates status to connected and syncs modules...');
    serverMode = 'GAS_AUTHORIZED';
    const syncRes = await backendGateway.verifyAndSync();
    if (!syncRes.ping.success || !syncRes.manifestSuccess || syncRes.modulesCount !== 2) {
      throw new Error(`Expected verifyAndSync to succeed with 2 modules, got: ${JSON.stringify(syncRes)}`);
    }
    if (backendGateway.getConfig().status !== 'connected') {
      throw new Error(`Expected status connected, got: ${backendGateway.getConfig().status}`);
    }
    console.log('  ✓ Test 7 Passed: verifyAndSync transitioned to connected and synced 2 modules.\n');

    // Test 8: readManifest guard when in Simulation Mode
    console.log('[Test 8/10] Verifying readManifest returns early cleanly in Simulation Mode...');
    backendGateway.updateConfig({ isSimulationMode: true });
    const simManifestRes = await backendGateway.readManifest();
    if (simManifestRes.success !== false || !simManifestRes.error?.includes('โหมดจำลอง')) {
      throw new Error(`Expected simulation guard error, got: ${JSON.stringify(simManifestRes)}`);
    }
    console.log('  ✓ Test 8 Passed: readManifest cleanly guarded in Simulation Mode.\n');

    // Test 9: Zero-Hardcoded-URL default & missing URL guard
    console.log('[Test 9/10] Verifying no hardcoded GAS URL default and empty URL fails closed...');
    const { DEFAULT_GAS_URL } = await import('../src/services/backendGateway');
    if (DEFAULT_GAS_URL !== '') {
      throw new Error(`Expected DEFAULT_GAS_URL to be empty string, got: "${DEFAULT_GAS_URL}"`);
    }
    backendGateway.updateConfig({ isSimulationMode: false, baseUrl: '', apiKey: 'real_secret_token_123' });
    const emptyUrlConn = await backendGateway.testConnection();
    if (emptyUrlConn.success !== false || backendGateway.getConfig().status !== 'offline') {
      throw new Error(`Expected empty URL to fail closed as offline, got: ${JSON.stringify(emptyUrlConn)}`);
    }
    console.log('  ✓ Test 9 Passed: Zero hardcoded GAS URL and empty URL fails closed cleanly.\n');

    // Test 10: work4Service resolves CMS2_LIVE / OFFLINE_MOCK from Manifest devices["CMS-2"]
    console.log('[Test 10/10] Verifying work4Service resolves CMS-2 online status from Manifest devices["CMS-2"]...');
    const { work4Service, resolveCms2StatusFromManifest } = await import('../src/services/work4Service');
    const freshIso = new Date(Date.now() - 30_000).toISOString();
    const staleIso = new Date(Date.now() - 8 * 60_000).toISOString();
    const freshCheck = resolveCms2StatusFromManifest({
      modules: [],
      devices: { 'CMS-2': { deviceId: 'CMS-2', status: 'ONLINE', lastSeenIso: freshIso, printGate: 'LOCKED_ZERO_PAPER' } },
    });
    const staleCheck = resolveCms2StatusFromManifest({
      modules: [],
      devices: { 'CMS-2': { deviceId: 'CMS-2', status: 'ONLINE', lastSeenIso: staleIso } },
    });
    if (!freshCheck.isOnline || staleCheck.isOnline) {
      throw new Error(`Unexpected CMS-2 freshness check: fresh=${JSON.stringify(freshCheck)}, stale=${JSON.stringify(staleCheck)}`);
    }
    // Feed live manifest containing CMS-2 through mock GAS server and verify work4Service.getStatus()
    let cms2ManifestIso = freshIso;
    const cms2Server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        manifest: {
          devices: {
            'CMS-2': { deviceId: 'CMS-2', status: 'ONLINE', lastSeenIso: cms2ManifestIso, printGate: 'LOCKED_ZERO_PAPER' },
          },
          modules: [],
        },
      }));
    });
    await new Promise<void>((resolve) => cms2Server.listen(0, '127.0.0.1', () => resolve()));
    try {
      const cms2Port = (cms2Server.address() as { port: number }).port;
      backendGateway.updateConfig({
        isSimulationMode: false,
        baseUrl: `http://127.0.0.1:${cms2Port}/exec?script.google.com=true`,
        apiKey: 'real_secret_token_123',
      });
      await backendGateway.readManifest(undefined, { background: true });
      work4Service.clearManualOverride();
      const liveStatus = await work4Service.getStatus('2026', '11');
      if (liveStatus.mode !== 'CMS2_LIVE' || !liveStatus.printer_status.is_ready) {
        throw new Error(`Expected CMS2_LIVE from fresh Manifest, got: ${JSON.stringify(liveStatus)}`);
      }
      cms2ManifestIso = staleIso;
      await backendGateway.readManifest(undefined, { background: true });
      const offlineStatus = await work4Service.getStatus('2026', '11');
      if (offlineStatus.mode !== 'OFFLINE_MOCK' || offlineStatus.printer_status.is_ready) {
        throw new Error(`Expected OFFLINE_MOCK from stale Manifest, got: ${JSON.stringify(offlineStatus)}`);
      }
    } finally {
      cms2Server.close();
    }
    console.log('  ✓ Test 10 Passed: work4Service dynamically switches CMS2_LIVE/OFFLINE_MOCK from Manifest devices["CMS-2"].\n');

    console.log('===============================================================');
    console.log('🎉 ALL 10 ROBUSTNESS TESTS PASSED CLEANLY (Zero TypeError / Stream Reuse)');
    console.log('===============================================================');
  } finally {
    server.close();
  }
}

runRobustnessTests().catch((err) => {
  console.error('Robustness test failed:', err);
  process.exit(1);
});
