# Project: Work-space-aap Real GAS Endpoint & Manifest Integration

## Architecture
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS.
- **Backend / Integration Target**: Google Apps Script Web App Endpoint (configured via `GAS_GATEWAY_URL` / `VITE_GAS_GATEWAY_URL`; never hardcoded in public repo).
- **Cloud Storage**: Google Drive folder `1RvGehvlDrPTaR9JvQgCcFPqiQbRE8_yn` (`AI_Project_Workspace`) containing `00_Project_Manifest.json`.
- **Communication Protocol**: CORS-friendly HTTP POST / GET with `Content-Type: text/plain;charset=utf-8` and NO custom headers to avoid unsupported OPTIONS preflight on Google Apps Script. Single-stream consumption pattern reading `response.text()` before `JSON.parse()`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Git Baseline Verification | Check commit history against njnatee99-ops/Work-space-aap; preserve local commits ahead. | M1 | ORIGINAL_REQUEST §1 |
| 2 | Real Backend Gateway & Manifest Reading | Remove `no-cors` mock, drop preflight-triggering custom headers, enforce parsing real JSON response (`success: true, manifestUpdated: true, syncedAt, eventId`), implement `readManifest()`. | M1 | ORIGINAL_REQUEST §1, §3 |
| 3 | Additive Merge for Code.gs | Preserve all existing actions (`PING`, `DEPLOY_EVOLVED_UI_DESIGN`), add `GET_MANIFEST` / `READ_MANIFEST`, add status/result per module, protect against corrupted JSON overwrite with LockService. Synchronize `Code.gs`, `scripts/Code.gs`, `GasCodeModal.tsx`, `GasCodeSection.tsx`. | M1 | ORIGINAL_REQUEST §5 |
| 4 | SelfEvolvingDesignStudio Full Spec Persistence | Fix "บันทึกสเปกลง Drive" button: send complete spec fields (`componentId`, `title`, `category`, `gate`, `summary`, `rule`, `actionPrompt`, `uiPreviewData` with metrics, actions, demoDataRows), set saved state ONLY when `res.success && res.log.response?.manifestUpdated === true`. | M1 | ORIGINAL_REQUEST §2 |
| 5 | PayloadLogsModal & App Live Manifest Display | Fetch live modules from `00_Project_Manifest.json` via gateway (`readManifest()`), render real module IDs (e.g. `UI-CRD-218`, `UI-CRD-394`), compute live payload counts from reality. | M1 | ORIGINAL_REQUEST §3 |
| 6 | Work4PrintStudio Real Queue Connection | Wire WORK 4 trigger button to dispatch `WORK4_QUEUE_PRINT_JOB` to gateway with status `PENDING` instead of offline mock only. | M1 | ORIGINAL_REQUEST §4 |
| 7 | Build, Lint & E2E Live Roundtrip Verification | Run `npm run lint` (`tsc --noEmit`), `npm run build`, and live automated integration test writing a test module to `00_Project_Manifest.json` and reading it back. | M1 | ORIGINAL_REQUEST §6 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Real GAS Integration & Manifest Sync | backendGateway.ts, Code.gs, SelfEvolvingDesignStudio.tsx, PayloadLogsModal.tsx, App.tsx, Work4PrintStudio.tsx, live roundtrip tests | none | DONE |

## Interface Contracts
### Web Client (`backendGateway.ts`) ↔ Google Apps Script (`Code.gs`)
- **Transport**: `fetch(GAS_ENDPOINT, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' } })` or GET with query params.
- **GET Request**: `GET ?action=GET_MANIFEST` -> returns `{ success: true, manifest: { ... }, fetchedAt: string }`.
- **POST Request Actions**:
  - `PING`: `{ action: 'PING', timestamp: string }` -> `{ success: true, message: 'PONG', serverTime: string }`.
  - `DEPLOY_EVOLVED_UI_DESIGN`: `{ action: 'DEPLOY_EVOLVED_UI_DESIGN', componentId: string, spec: object, timestamp: string }` -> `{ success: true, manifestUpdated: true, syncedAt: string, eventId: string }`.
  - `GET_MANIFEST` / `READ_MANIFEST`: `{ action: 'GET_MANIFEST' }` -> `{ success: true, manifest: { ... }, fetchedAt: string }`.
  - `WORK4_QUEUE_PRINT_JOB`: `{ action: 'WORK4_QUEUE_PRINT_JOB', jobPayload: object }` -> `{ success: true, queued: true, status: 'PENDING', eventId: string }`.
- **Response Format**: Always valid JSON parsed from response text; never fabricated by client unless genuine network failure occurs (in which case error is thrown or returned with `success: false`).

## Code Layout
- `src/services/backendGateway.ts`: Gateway service for Google Apps Script integration and manifest fetching.
- `Code.gs`: Google Apps Script source (root).
- `scripts/Code.gs`: Duplicate copy of Code.gs for deployment scripts.
- `src/components/SelfEvolvingDesignStudio.tsx`: Self-evolving UI studio component with Drive save button.
- `src/components/PayloadLogsModal.tsx`: Modal displaying live payloads and modules from manifest.
- `src/components/Work4PrintStudio.tsx`: Studio for WORK 4 print operations with gateway queue connection.
- `src/components/GasCodeModal.tsx`: Modal presenting updated Code.gs to user.
- `src/components/GasCodeSection.tsx`: In-page section presenting updated Code.gs to user.
- `src/App.tsx`: Top-level application component coordinating live manifest state and payload counts.
- `tests/manifest_gateway.test.ts`: Integration test verifying live GAS endpoint, real manifest read, write, and read-back.
- `tests/backend_gateway_robustness.test.ts`: Robustness tests verifying stream reading, error status preservation, and non-JSON resilience.
