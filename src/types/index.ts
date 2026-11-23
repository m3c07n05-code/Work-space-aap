export interface GatewayConfig {
  baseUrl: string;
  webhookEndpoint: string;
  apiKey: string;
  isSimulationMode: boolean;
  status: 'connected' | 'testing' | 'offline' | 'simulated';
  latencyMs: number;
  lastPing?: string;
}

export interface PayloadLog {
  id: string;
  timestamp: string;
  action: string;
  method: 'POST' | 'GET';
  endpoint: string;
  headers: Record<string, string>;
  payload: Record<string, unknown>;
  status: number;
  latencyMs: number;
  response: Record<string, unknown>;
  isSimulated: boolean;
}

export interface ScopeItem {
  id: string;
  title: string;
  gate: string;
  rule: string;
  status: string;
  updatedAt: string;
}

export interface StopGateItem {
  code: string;
  name: string;
  status: 'PASS' | 'PENDING' | 'SCANNING';
  detail: string;
  category: string;
}

export interface Work4Category {
  code: string;
  rpt_prefix: string;
  name: string;
  form_type: string;
  status: 'FOUND' | 'SKIPPED_EMPTY' | 'ERROR';
  record_count: number;
  pdf_pages: number;
  mock_preview_url?: string | null;
  error_code?: string;
}

export interface Work4PrinterStatus {
  host: string;
  printer_name: string;
  is_ready: boolean;
  message: string;
}

export interface Work4StatusResponse {
  mode: 'OFFLINE_MOCK' | 'CMS2_LIVE';
  task_id: string;
  selected_year: string;
  selected_month: string;
  month_label: string;
  printer_status: Work4PrinterStatus;
  categories: Work4Category[];
}

export interface Work4PreviewRequest {
  year: string;
  month: string;
  category_code: string;
  margin_top_mm: number;
  margin_left_mm: number;
}

export interface Work4PreviewResponse {
  status: 'PREVIEW_READY' | 'ERROR';
  page_size: string;
  total_pages: number;
  pdf_blob_url: string;
  message?: string;
}

export interface Work4PrintRequest {
  job_id: string;
  idempotency_key: string;
  category_code: string;
  confirmed_by_owner: boolean;
}

export interface Work4PrintResponse {
  job_id: string;
  status: 'QUEUED' | 'BLOCKED_CMS2_OFFLINE' | 'ERROR' | 'DUPLICATE_IGNORED';
  spooler_state?: string;
  message?: string;
}

export interface ManifestModule {
  componentId: string;
  title?: string;
  name?: string;
  category?: string;
  summary?: string;
  description?: string;
  gate?: string;
  rule?: string;
  prompt?: string;
  actionPrompt?: string;
  status?: string;
  result?: string;
  syncedAt?: string;
  updatedAtIso?: string;
  eventId?: string;
  uiPreviewData?: Record<string, unknown>;
}

export interface ManifestJobRecord {
  jobId: string;
  type?: string;
  taskType?: string;
  taskId?: string;
  title?: string;
  status?: string;
  source?: string;
  docId?: string;
  contentHash?: string;
  promptText?: string;
  createdAtIso?: string;
  claimedBy?: string;
  claimedAtIso?: string;
  completedAtIso?: string;
  summary?: string;
  [key: string]: unknown;
}

export interface ManifestDeviceRecord {
  deviceId?: string;
  deviceType?: string;
  label?: string;
  lastSeenIso?: string;
  lastHeartbeatIso?: string;
  status?: string;
  zeroPiiEnforced?: boolean;
  printGate?: string;
  lastStageAlert?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface FolderConsolidationInfo {
  status?: string;
  date?: string;
  archivedFolders?: number;
  archivedFiles?: number;
  workRunnerStatus?: string;
  viewreportPureRptCount?: number;
  viewreportNonRptCount?: number;
  [key: string]: unknown;
}

export interface CoordinationCenterFormInfo {
  status?: string;
  verifiedAt?: string;
  centersCount?: number;
  formId?: string;
  responderUrl?: string;
  sheetId?: string;
  sheetName?: string;
  [key: string]: unknown;
}

export interface ProjectManifest {
  projectName?: string;
  project?: string;
  lastUpdated?: string;
  updatedAt?: string;
  currentStatus?: string;
  gateStatus?: string;
  activeTask?: Record<string, unknown> | null;
  modules: ManifestModule[];
  history_logs?: string[];
  devices?: Record<string, ManifestDeviceRecord>;
  scopes?: any[];
  gateLogs?: any[];
  pendingJobs?: ManifestJobRecord[];
  completedJobs?: ManifestJobRecord[];
  docBState?: Record<string, unknown>;
  updateLogs?: Array<Record<string, unknown>>;
  gasScriptProjectId?: string;
  gasTokenProvisioned?: boolean;
  gasDeployStatus?: string;
  webCrdHost?: string;
  webCrdPlatform?: string;
  folderConsolidation?: FolderConsolidationInfo;
  coordinationCenterForm?: CoordinationCenterFormInfo;
  lastPingIso?: string;
  lastEventId?: string;
}

export type AuditCheckStatus = 'PASS' | 'WARN' | 'FAIL' | 'INFO';

export interface AuditCheckItem {
  id: string;
  category: 'FRONTEND' | 'GATEWAY' | 'DRIVE' | 'WORKER' | 'DOC_B' | 'SECURITY';
  label: string;
  status: AuditCheckStatus;
  detail: string;
  meta?: string;
  actionHint?: string;
}

export interface SiteAuditReport {
  checkedAtIso: string;
  overallStatus: 'READY' | 'PARTIAL' | 'ACTION_REQUIRED';
  latencyMs: number;
  checks: AuditCheckItem[];
  manifest: ProjectManifest | null;
  recommendedAction: string;
}

export interface WorkerTaskSpec {
  taskType: string;
  label: string;
  category: 'SYSTEM' | 'WORK1_9' | 'WORK4_PRINT' | 'V003_DATA';
  description: string;
  zeroPii: boolean;
  paperZero: boolean;
  defaultTitle: string;
}


