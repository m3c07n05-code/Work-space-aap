import http from 'http';
import { backendGateway } from '../src/services/backendGateway';

async function runRobustnessTests() {
  console.log('===============================================================');
  console.log('🧪 backendGateway Robustness & Stream Consumption Test');
  console.log('===============================================================\n');

  let serverMode: 'HTML_500' | 'EMPTY_404' | 'VALID_JSON' = 'HTML_500';

  const server = http.createServer((req, res) => {
    if (serverMode === 'HTML_500') {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<html><body>500 Internal Server Error</body></html>');
    } else if (serverMode === 'EMPTY_404') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
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

    console.log('===============================================================');
    console.log('🎉 ALL 4 ROBUSTNESS TESTS PASSED CLEANLY (Zero TypeError / Stream Reuse)');
    console.log('===============================================================');
  } finally {
    server.close();
  }
}

runRobustnessTests().catch((err) => {
  console.error('Robustness test failed:', err);
  process.exit(1);
});
