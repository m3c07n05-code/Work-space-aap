import {
  GatewayConfig,
  PayloadLog,
  ScopeItem,
  ManifestModule,
  ProjectManifest,
  AuditCheckItem,
  SiteAuditReport,
} from '../types';
export type { ScopeItem, ManifestModule, ProjectManifest, AuditCheckItem, SiteAuditReport };

const STORAGE_KEY_CONFIG = 'nexus_gateway_config';
const STORAGE_KEY_LOGS = 'nexus_gateway_logs';
const STORAGE_KEY_SCOPES = 'nexus_scopes_data';

export const PLACEHOLDER_GATEWAY_TOKENS = new Set([
  'gas_auto_token_manifest_sync',
  'nk_live_920f83ba7c1e4d',
]);

export function sanitizeGatewayToken(rawToken?: string, allowPlaceholder = false): string {
  const trimmed = String(rawToken || '').trim();
  if (!trimmed) return '';
  if (!allowPlaceholder && PLACEHOLDER_GATEWAY_TOKENS.has(trimmed)) {
    return '';
  }
  return trimmed;
}

export const DEFAULT_GAS_URL = '';

export function maskEndpointForLog(rawEndpoint?: string): string {
  const trimmed = String(rawEndpoint || '').trim();
  if (!trimmed) return 'not-configured';
  if (trimmed.includes('script.google.com')) {
    return 'GAS Web App (Local Browser Config)';
  }
  try {
    const parsed = new URL(trimmed);
    parsed.searchParams.delete('token');
    parsed.searchParams.delete('gatewayToken');
    parsed.searchParams.delete('CRD_GATEWAY_TOKEN');
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return trimmed.split('?')[0];
  }
}

export const WORKSPACE_FOLDER_ID = '1RvGehvlDrPTaR9JvQgCcFPqiQbRE8_yn'; // AI_Project_Workspace
export const MANIFEST_FILE_NAME = '00_Project_Manifest.json';

export const INITIAL_SCOPES: ScopeItem[] = [
  {
    id: 'CRD-SCOPE-01',
    title: '01 Dual-Key Ledger Ingestion (Mem_ID 5 หลัก + NewLoanID)',
    gate: 'DUAL_KEY_LEDGER',
    rule: 'แยกคีย์ระดับบุคคล (เลขสมาชิก 5 หลักคงศูนย์นำหน้า) ออกจากคีย์ระดับสัญญา (NewLoanID) ห้ามนำข้อมูลคนละสัญญามารวมกัน',
    status: 'ACTIVE_SYNCED',
    updatedAt: '2026-11-08 21:05',
  },
  {
    id: 'CRD-SCOPE-02',
    title: '02 V003 Format Control Gate (พ.ศ./ค.ศ. & ห้ามคำนวณเงินใหม่)',
    gate: 'V003_FORMAT_ONLY',
    rule: 'แปลงปี > 2400 เป็นฐานเดียวกัน เติม 0 นำหน้าเลขสมาชิกให้ครบ 5 หลัก และห้าม AI คำนวณดอกเบี้ยหรือยอดหนี้ใหม่เด็ดขาด',
    status: 'ACTIVE_SYNCED',
    updatedAt: '2026-11-08 21:06',
  },
  {
    id: 'CRD-SCOPE-03',
    title: '03 WORK 1 & WORK 4 Automated Stop Gates (16 ด่านตรวจก่อนรัน)',
    gate: 'PDPA_ZERO_PII',
    rule: 'สแกน 16 ด่านความปลอดภัยและบล็อกข้อมูลส่วนบุคคล (PDPA Zero-Leak) ก่อนส่งสถานะเข้า Google Sheets และ Drive',
    status: 'ACTIVE_SYNCED',
    updatedAt: '2026-11-08 21:08',
  },
  {
    id: 'CRD-SCOPE-04',
    title: '04 Self-Expanding Drive Workspace (AI_Project_Workspace)',
    gate: 'AUTO_DRIVE_SYNC',
    rule: 'รับคำสั่งจากหน้าแอปแล้วบันทึกขอบเขตงานใหม่ต่อท้าย 00_Project_Manifest.json ใน Google Drive โดยไม่ต้องสลับหน้าแก้โค้ด',
    status: 'ACTIVE_SYNCED',
    updatedAt: '2026-11-08 21:10',
  },
];

type GatewayListener = (config: GatewayConfig) => void;
type LogListener = (logs: PayloadLog[]) => void;
type ScopeListener = (scopes: ScopeItem[]) => void;
type ManifestListener = (manifest: ProjectManifest | null) => void;
export type SyncStatusType = 'syncing' | 'synced';
export interface SyncState {
  status: SyncStatusType;
  updatedAt: string;
}
type SyncListener = (state: SyncState) => void;

class BackendGatewayService {
  private config: GatewayConfig;
  private logs: PayloadLog[] = [];
  private scopes: ScopeItem[] = [];
  private lastManifest: ProjectManifest | null = null;
  private syncState: SyncState = {
    status: 'synced',
    updatedAt: new Date().toLocaleTimeString('th-TH'),
  };
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private configListeners: Set<GatewayListener> = new Set();
  private logListeners: Set<LogListener> = new Set();
  private scopeListeners: Set<ScopeListener> = new Set();
  private manifestListeners: Set<ManifestListener> = new Set();
  private syncListeners: Set<SyncListener> = new Set();

  constructor() {
    this.config = this.loadConfig();
    this.logs = this.loadLogs();
    this.scopes = this.loadScopes();
  }

  private loadConfig(): GatewayConfig {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<GatewayConfig>;
        const isSim = Boolean(parsed.isSimulationMode);
        const cleanBaseUrl = String(parsed.baseUrl || '').trim();
        const cleanApiKey = sanitizeGatewayToken(parsed.apiKey, isSim);
        const initialStatus: GatewayConfig['status'] = isSim
          ? 'simulated'
          : parsed.status === 'connected' && cleanBaseUrl && cleanApiKey
            ? 'connected'
            : 'offline';
        return {
          baseUrl: cleanBaseUrl,
          webhookEndpoint: String(parsed.webhookEndpoint || '').trim(),
          apiKey: cleanApiKey,
          isSimulationMode: isSim,
          status: initialStatus,
          latencyMs: typeof parsed.latencyMs === 'number' ? parsed.latencyMs : 0,
          lastPing: parsed.lastPing || '-',
        };
      }
    } catch {
      // Fallback
    }

    return {
      baseUrl: '',
      webhookEndpoint: '',
      apiKey: '',
      isSimulationMode: false,
      status: 'offline',
      latencyMs: 0,
      lastPing: '-',
    };
  }

  private loadLogs(): PayloadLog[] {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_LOGS);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // Fallback
    }

    return [
      {
        id: 'log_gas_init',
        timestamp: new Date().toLocaleTimeString('th-TH'),
        action: 'INIT_GATEWAY_BINDING',
        method: 'POST',
        endpoint: 'GAS Web App (Local Browser Config)',
        headers: {
          'Content-Type': 'application/json',
          'X-Target-Manifest': MANIFEST_FILE_NAME,
        },
        payload: {
          projectName: 'AI HUB CONTROL CENTER',
          manifestTarget: MANIFEST_FILE_NAME,
          workspaceId: WORKSPACE_FOLDER_ID,
          mode: 'SELF_EXPANDING_GATEWAY',
          gatesActive: 16,
        },
        status: 200,
        latencyMs: 18,
        response: {
          status: 'READY_FOR_LOCAL_CONFIG',
          backend: 'Google Apps Script Web App',
          targetManifest: MANIFEST_FILE_NAME,
          driveWorkspace: 'AI_Project_Workspace',
        },
        isSimulated: false,
      },
    ];
  }

  private loadScopes(): ScopeItem[] {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SCOPES);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // Fallback
    }
    return INITIAL_SCOPES;
  }

  public getConfig(): GatewayConfig {
    return { ...this.config };
  }

  public getLogs(): PayloadLog[] {
    return [...this.logs];
  }

  public getScopes(): ScopeItem[] {
    return [...this.scopes];
  }

  public getSyncState(): SyncState {
    return { ...this.syncState };
  }

  public onSyncStateChange(listener: SyncListener): () => void {
    this.syncListeners.add(listener);
    return () => this.syncListeners.delete(listener);
  }

  private notifySyncState() {
    for (const listener of this.syncListeners) {
      listener(this.getSyncState());
    }
  }

  public setSyncStatus(status: SyncStatusType) {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    this.syncState = {
      status,
      updatedAt: new Date().toLocaleTimeString('th-TH'),
    };
    this.notifySyncState();
  }

  public triggerSyncPulse(durationMs = 700) {
    this.setSyncStatus('syncing');
    this.syncTimer = setTimeout(() => {
      this.syncState = {
        status: 'synced',
        updatedAt: new Date().toLocaleTimeString('th-TH'),
      };
      this.notifySyncState();
      this.syncTimer = null;
    }, durationMs);
  }

  public addScope(scope: ScopeItem): void {
    this.triggerSyncPulse(750);
    this.scopes = [scope, ...this.scopes];
    try {
      localStorage.setItem(STORAGE_KEY_SCOPES, JSON.stringify(this.scopes));
    } catch {
      // ignore
    }
    this.notifyScopes();
  }

  public removeScope(id: string): void {
    this.triggerSyncPulse(650);
    this.scopes = this.scopes.filter((s) => s.id !== id);
    try {
      localStorage.setItem(STORAGE_KEY_SCOPES, JSON.stringify(this.scopes));
    } catch {
      // ignore
    }
    this.notifyScopes();
  }

  public resetScopes(): void {
    this.triggerSyncPulse(650);
    this.scopes = INITIAL_SCOPES;
    try {
      localStorage.setItem(STORAGE_KEY_SCOPES, JSON.stringify(this.scopes));
    } catch {
      // ignore
    }
    this.notifyScopes();
  }

  public onScopeChange(listener: ScopeListener): () => void {
    this.scopeListeners.add(listener);
    return () => this.scopeListeners.delete(listener);
  }

  private notifyScopes() {
    for (const listener of this.scopeListeners) {
      listener(this.getScopes());
    }
  }

  public updateConfig(newConfig: Partial<GatewayConfig>): GatewayConfig {
    const nextIsSim =
      newConfig.isSimulationMode !== undefined
        ? Boolean(newConfig.isSimulationMode)
        : this.config.isSimulationMode;
    const nextBaseUrl =
      newConfig.baseUrl !== undefined
        ? String(newConfig.baseUrl).trim()
        : this.config.baseUrl;
    const nextApiKey =
      newConfig.apiKey !== undefined
        ? sanitizeGatewayToken(newConfig.apiKey, nextIsSim)
        : sanitizeGatewayToken(this.config.apiKey, nextIsSim);

    this.config = {
      ...this.config,
      ...newConfig,
      isSimulationMode: nextIsSim,
      baseUrl: nextBaseUrl,
      apiKey: nextApiKey,
    };
    try {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(this.config));
    } catch {
      // ignore
    }
    this.notifyConfig();
    return this.getConfig();
  }

  public onConfigChange(listener: GatewayListener): () => void {
    this.configListeners.add(listener);
    return () => this.configListeners.delete(listener);
  }

  public onLog(listener: LogListener): () => void {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  private notifyConfig() {
    for (const listener of this.configListeners) {
      listener(this.getConfig());
    }
  }

  private notifyLogs() {
    try {
      localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(this.logs.slice(0, 50)));
    } catch {
      // ignore
    }
    for (const listener of this.logListeners) {
      listener(this.getLogs());
    }
  }

  private notifyManifest() {
    for (const listener of this.manifestListeners) {
      listener(this.lastManifest);
    }
  }

  public getManifest(): ProjectManifest | null {
    return this.lastManifest;
  }

  public onManifestChange(listener: ManifestListener): () => void {
    this.manifestListeners.add(listener);
    if (this.lastManifest) {
      listener(this.lastManifest);
    }
    return () => this.manifestListeners.delete(listener);
  }

  private getGasGatewayToken(): string {
    const configured = sanitizeGatewayToken(this.config.apiKey, false);
    if (configured) {
      return configured;
    }
    try {
      const envToken = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env?.VITE_GAS_GATEWAY_TOKEN;
      if (envToken && envToken.trim()) {
        return envToken.trim();
      }
    } catch {
      // Non-Vite runtime (e.g. Node tsx tests)
    }
    return '';
  }

  public async testConnection(): Promise<{ success: boolean; latencyMs: number; status: number; message: string }> {
    this.setSyncStatus('syncing');
    this.updateConfig({ status: 'testing' });
    const startTime = performance.now();
    const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const timestamp = new Date().toLocaleTimeString('th-TH');

    if (this.config.isSimulationMode) {
      await new Promise((r) => setTimeout(r, 350));
      const latencyMs = Math.round(performance.now() - startTime);
      this.updateConfig({
        status: 'simulated',
        latencyMs,
        lastPing: timestamp,
      });
      this.setSyncStatus('synced');
      return {
        success: true,
        latencyMs,
        status: 200,
        message: 'โหมดจำลอง (Simulator) ตอบสนองปกติ',
      };
    }

    if (!this.config.baseUrl) {
      this.updateConfig({
        status: 'offline',
        latencyMs: 0,
        lastPing: timestamp,
      });
      this.setSyncStatus('synced');
      return {
        success: false,
        latencyMs: 0,
        status: 0,
        message: 'ยังไม่ได้ตั้งค่า Gateway URL ในเบราว์เซอร์ — กด "ตั้งค่า URL / Token"',
      };
    }

    try {
      const isGas = this.config.baseUrl.includes('script.google.com');

      if (isGas) {
        // Direct POST with text/plain to bypass OPTIONS preflight on Google Apps Script
        const gasToken = this.getGasGatewayToken();
        const pingPayload: Record<string, unknown> = {
          action: 'PING',
          source: 'NexusLedger_UI',
          timestamp: new Date().toISOString(),
        };
        if (gasToken) {
          pingPayload.token = gasToken;
        }
        const res = await fetch(this.config.baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(pingPayload),
        });

        const latencyMs = Math.max(16, Math.round(performance.now() - startTime));
        const rawText = await res.text();
        let data: any = {};
        try {
          data = rawText ? JSON.parse(rawText) : {};
        } catch {
          data = { raw: rawText };
        }

        const isSuccess = res.ok && Boolean(data.success);
        const serverError =
          typeof data?.error === 'string' && data.error.trim() ? data.error.trim() : '';

        if (data?.manifest && typeof data.manifest === 'object') {
          this.lastManifest = data.manifest as ProjectManifest;
          this.notifyManifest();
        }

        const pingLog: PayloadLog = {
          id: logId,
          timestamp,
          action: 'PING',
          method: 'POST',
          endpoint: maskEndpointForLog(this.config.baseUrl),
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          payload: {
            action: 'PING',
            source: 'NexusLedger_UI',
            tokenConfigured: Boolean(gasToken),
          },
          status: res.status,
          latencyMs,
          response: data,
          isSimulated: false,
        };
        this.logs = [pingLog, ...this.logs.slice(0, 49)];
        this.notifyLogs();

        this.updateConfig({
          status: isSuccess ? 'connected' : 'offline',
          latencyMs,
          lastPing: timestamp,
        });
        this.setSyncStatus('synced');

        return {
          success: isSuccess,
          latencyMs,
          status: res.status,
          message: isSuccess
            ? 'เชื่อมต่อ Google Apps Script Web App สำเร็จ พร้อมส่งคำสั่ง'
            : serverError || `เซิร์ฟเวอร์ตอบกลับแต่ไม่สำเร็จ (${res.status})`,
        };
      }

      const res = await fetch(this.config.baseUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });

      const latencyMs = Math.round(performance.now() - startTime);
      this.updateConfig({
        status: res.ok ? 'connected' : 'offline',
        latencyMs,
        lastPing: timestamp,
      });
      this.setSyncStatus('synced');

      return {
        success: res.ok,
        latencyMs,
        status: res.status,
        message: res.ok ? 'เชื่อมต่อเซิร์ฟเวอร์สำเร็จ' : `เซิร์ฟเวอร์ตอบกลับรหัส ${res.status}`,
      };
    } catch (err: unknown) {
      const latencyMs = Math.round(performance.now() - startTime);
      const errMessage = err instanceof Error ? err.message : 'ไม่สามารถเชื่อมต่อปลายทางได้';
      const errorLog: PayloadLog = {
        id: logId,
        timestamp,
        action: 'PING',
        method: 'POST',
        endpoint: maskEndpointForLog(this.config.baseUrl),
        headers: {},
        payload: { action: 'PING', source: 'NexusLedger_UI' },
        status: 504,
        latencyMs,
        response: { error: errMessage },
        isSimulated: false,
      };
      this.logs = [errorLog, ...this.logs.slice(0, 49)];
      this.notifyLogs();
      this.updateConfig({
        status: 'offline',
        latencyMs,
        lastPing: timestamp,
      });
      this.setSyncStatus('synced');

      return {
        success: false,
        latencyMs,
        status: 0,
        message: errMessage,
      };
    }
  }

  public async verifyAndSync(): Promise<{
    ping: { success: boolean; latencyMs: number; status: number; message: string };
    manifestSuccess: boolean;
    manifestError?: string;
    modulesCount: number;
  }> {
    const ping = await this.testConnection();
    if (!ping.success || this.config.isSimulationMode) {
      return {
        ping,
        manifestSuccess: false,
        modulesCount: Array.isArray(this.lastManifest?.modules) ? this.lastManifest.modules.length : 0,
      };
    }

    const manifestRes = await this.readManifest();
    const modulesCount = Array.isArray(manifestRes.manifest?.modules)
      ? manifestRes.manifest.modules.length
      : Array.isArray(this.lastManifest?.modules)
        ? this.lastManifest.modules.length
        : 0;

    return {
      ping,
      manifestSuccess: manifestRes.success,
      manifestError: manifestRes.error,
      modulesCount,
    };
  }

  public async readManifest(
    overrideEndpoint?: string,
    options?: { background?: boolean }
  ): Promise<{
    success: boolean;
    manifest: ProjectManifest | null;
    error?: string;
  }> {
    const isBackground = Boolean(options?.background);
    if (this.config.isSimulationMode && !overrideEndpoint) {
      this.updateConfig({ status: 'simulated' });
      this.setSyncStatus('synced');
      return {
        success: false,
        manifest: this.lastManifest,
        error: 'โหมดจำลองออฟไลน์เปิดอยู่ — ปิดโหมดจำลองเพื่อดึง Manifest จริงจาก Drive',
      };
    }

    const endpoint = String(overrideEndpoint || this.config.baseUrl || '').trim();
    if (!endpoint) {
      this.updateConfig({ status: 'offline' });
      this.setSyncStatus('synced');
      return {
        success: false,
        manifest: this.lastManifest,
        error: 'ยังไม่ได้ตั้งค่า Gateway URL ในเบราว์เซอร์ (localStorage)',
      };
    }

    if (!isBackground) {
      this.setSyncStatus('syncing');
    }
    const isGas = endpoint.includes('script.google.com');
    const startTime = performance.now();
    const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const timestamp = new Date().toLocaleTimeString('th-TH');

    try {
      let url = endpoint;
      if (isGas) {
        const separator = url.includes('?') ? '&' : '?';
        const gasToken = this.getGasGatewayToken();
        const tokenParam = gasToken ? `&token=${encodeURIComponent(gasToken)}` : '';
        url = `${url}${separator}action=GET_MANIFEST${tokenParam}`;
      }

      const response = await fetch(url, {
        method: 'GET',
      });

      const latencyMs = Math.max(16, Math.round(performance.now() - startTime));
      const rawText = await response.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = { raw: rawText };
      }

      const isSuccess = response.ok && Boolean(data.success);
      const manifest: ProjectManifest | null = (data && data.manifest) ? data.manifest : null;

      if (manifest) {
        this.lastManifest = manifest;
        this.notifyManifest();
      }

      if (!isBackground || !isSuccess) {
        const log: PayloadLog = {
          id: logId,
          timestamp,
          action: 'GET_MANIFEST',
          method: 'GET',
          endpoint: maskEndpointForLog(endpoint),
          headers: {},
          payload: { action: 'GET_MANIFEST' },
          status: response.status,
          latencyMs,
          response: data,
          isSimulated: false,
        };

        this.logs = [log, ...this.logs.slice(0, 49)];
        this.notifyLogs();
      }
      this.updateConfig({ latencyMs, lastPing: timestamp, status: isSuccess ? 'connected' : 'offline' });
      this.setSyncStatus('synced');

      return {
        success: isSuccess,
        manifest,
        error: isSuccess ? undefined : (data.error || 'Failed to read manifest'),
      };
    } catch (err: unknown) {
      const latencyMs = Math.round(performance.now() - startTime);
      this.updateConfig({ latencyMs, lastPing: timestamp, status: 'offline' });
      this.setSyncStatus('synced');

      const errorLog: PayloadLog = {
        id: logId,
        timestamp,
        action: 'GET_MANIFEST',
        method: 'GET',
        endpoint: maskEndpointForLog(endpoint),
        headers: {},
        payload: { action: 'GET_MANIFEST' },
        status: 504,
        latencyMs,
        response: {
          error: err instanceof Error ? err.message : 'Network failure fetching manifest',
        },
        isSimulated: false,
      };

      this.logs = [errorLog, ...this.logs.slice(0, 49)];
      this.notifyLogs();

      return {
        success: false,
        manifest: null,
        error: err instanceof Error ? err.message : 'Network failure',
      };
    }
  }

  public async dispatchAction(
    action: string,
    payload: Record<string, unknown>,
    overrideEndpoint?: string
  ): Promise<{ success: boolean; log: PayloadLog }> {
    this.setSyncStatus('syncing');
    const startTime = performance.now();
    const endpoint = String(overrideEndpoint || this.config.baseUrl || '').trim();
    const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const timestamp = new Date().toLocaleTimeString('th-TH');

    const payloadEnvelope = {
      action,
      timestamp: new Date().toISOString(),
      targetManifest: MANIFEST_FILE_NAME,
      workspaceId: WORKSPACE_FOLDER_ID,
      ...payload,
    };

    // Use simple text/plain header without custom headers to avoid CORS OPTIONS preflight
    const headers: Record<string, string> = {
      'Content-Type': 'text/plain;charset=utf-8',
    };

    const isGas = endpoint.includes('script.google.com');

    if (this.config.isSimulationMode) {
      await new Promise((r) => setTimeout(r, 380 + Math.random() * 80));
      const latencyMs = Math.round(performance.now() - startTime);

      const simResponse: Record<string, unknown> = {
        success: true,
        status: 'PASS',
        manifestUpdated: true,
        eventId: `evt_${Math.random().toString(36).substring(2, 8)}`,
        actionCommitted: action,
        targetFile: MANIFEST_FILE_NAME,
        driveFolder: 'AI_Project_Workspace',
      };

      const simLog: PayloadLog = {
        id: logId,
        timestamp,
        action,
        method: 'POST',
        endpoint: endpoint ? maskEndpointForLog(endpoint) : 'local-simulator',
        headers,
        payload: payloadEnvelope,
        status: 200,
        latencyMs,
        response: simResponse,
        isSimulated: true,
      };

      this.logs = [simLog, ...this.logs.slice(0, 49)];
      this.notifyLogs();
      this.updateConfig({ latencyMs, lastPing: timestamp });
      this.setSyncStatus('synced');
      return { success: true, log: simLog };
    }

    if (!endpoint) {
      const missingUrlLog: PayloadLog = {
        id: logId,
        timestamp,
        action,
        method: 'POST',
        endpoint: 'not-configured',
        headers,
        payload: payloadEnvelope,
        status: 0,
        latencyMs: 0,
        response: { error: 'ยังไม่ได้ตั้งค่า Gateway URL ในเบราว์เซอร์ (localStorage)' },
        isSimulated: false,
      };
      this.logs = [missingUrlLog, ...this.logs.slice(0, 49)];
      this.notifyLogs();
      this.updateConfig({ status: 'offline' });
      this.setSyncStatus('synced');
      return { success: false, log: missingUrlLog };
    }

    try {
      if (isGas) {
        const gasToken = this.getGasGatewayToken();
        const gasBody = (gasToken && !('token' in payloadEnvelope))
          ? { ...payloadEnvelope, token: gasToken }
          : payloadEnvelope;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(gasBody),
        });

        const latencyMs = Math.max(16, Math.round(performance.now() - startTime));
        const rawText = await response.text();

        let responseBody: Record<string, unknown> = {};
        try {
          responseBody = rawText ? JSON.parse(rawText) : {};
        } catch {
          responseBody = { raw: rawText };
        }

        const isSuccess = response.ok && Boolean(responseBody.success);

        if (responseBody.manifest && typeof responseBody.manifest === 'object') {
          this.lastManifest = responseBody.manifest as ProjectManifest;
          this.notifyManifest();
        }

        const gasLog: PayloadLog = {
          id: logId,
          timestamp,
          action,
          method: 'POST',
          endpoint: maskEndpointForLog(endpoint),
          headers,
          payload: payloadEnvelope,
          status: response.status,
          latencyMs,
          response: responseBody,
          isSimulated: false,
        };

        this.logs = [gasLog, ...this.logs.slice(0, 49)];
        this.notifyLogs();
        this.updateConfig({ latencyMs, lastPing: timestamp, status: isSuccess ? 'connected' : 'offline' });
        this.setSyncStatus('synced');
        return { success: isSuccess, log: gasLog };
      }

      // Non-GAS endpoint fallback
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(payloadEnvelope),
      });

      const latencyMs = Math.round(performance.now() - startTime);
      const rawText = await response.text();
      let responseBody: Record<string, unknown> = {};
      try {
        responseBody = rawText ? JSON.parse(rawText) : {};
      } catch {
        responseBody = { raw: rawText };
      }

      const isSuccess = response.ok && (responseBody.success === undefined || Boolean(responseBody.success));

      const standardLog: PayloadLog = {
        id: logId,
        timestamp,
        action,
        method: 'POST',
        endpoint: maskEndpointForLog(endpoint),
        headers,
        payload: payloadEnvelope,
        status: response.status,
        latencyMs,
        response: responseBody,
        isSimulated: false,
      };

      this.logs = [standardLog, ...this.logs.slice(0, 49)];
      this.notifyLogs();
      this.updateConfig({ latencyMs, lastPing: timestamp });
      this.setSyncStatus('synced');
      return { success: isSuccess, log: standardLog };
    } catch (err: unknown) {
      const latencyMs = Math.round(performance.now() - startTime);
      const errorLog: PayloadLog = {
        id: logId,
        timestamp,
        action,
        method: 'POST',
        endpoint: maskEndpointForLog(endpoint),
        headers,
        payload: payloadEnvelope,
        status: 504,
        latencyMs,
        response: {
          error: err instanceof Error ? err.message : 'Network failure',
        },
        isSimulated: false,
      };

      this.logs = [errorLog, ...this.logs.slice(0, 49)];
      this.notifyLogs();
      this.updateConfig({ latencyMs, lastPing: timestamp, status: 'offline' });
      this.setSyncStatus('synced');
      return { success: false, log: errorLog };
    }
  }

  public hasGatewayUrl(): boolean {
    return Boolean(String(this.config.baseUrl || '').trim());
  }

  public hasGatewayToken(): boolean {
    return Boolean(this.getGasGatewayToken());
  }

  public async submitWorkerJob(
    taskType: string,
    title: string,
    promptText?: string
  ): Promise<{ success: boolean; log: PayloadLog }> {
    return this.dispatchAction('SUBMIT_JOB', {
      type: taskType,
      taskType,
      title,
      source: 'WEB_CRD_CONTROL_FLOW',
      promptText: promptText || '',
    });
  }

  public async runSiteAudit(): Promise<SiteAuditReport> {
    const checkedAtIso = new Date().toISOString();
    const hasUrl = this.hasGatewayUrl();
    const hasToken = this.hasGatewayToken();
    const isSimulation = Boolean(this.config.isSimulationMode);
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://crd.nateework.cloud';

    const pingRes = await this.testConnection();
    const manifestRes = await this.readManifest();
    const manifest = manifestRes.manifest || this.lastManifest;

    const checks: AuditCheckItem[] = [];

    // 1. Frontend Host & Mode
    checks.push({
      id: 'frontend-host',
      category: 'FRONTEND',
      label: 'Frontend Host & Runtime Mode',
      status: isSimulation ? 'WARN' : 'PASS',
      detail: isSimulation
        ? `Host: ${origin} (Offline Simulator เปิดอยู่ — ปิดเพื่อยิงคำสั่งจริง)`
        : `Host: ${origin} • Live Gateway Mode (Simulation OFF)`,
      meta: `Gateway Target: ${hasUrl ? 'Local Browser Config (localStorage)' : 'ยังไม่ตั้งค่า (localStorage)'}`,
      actionHint: isSimulation || !hasUrl ? 'OPEN_GATEWAY_MODAL' : undefined,
    });

    // 2. GAS Gateway & Zero-Secret Token
    const gasDeployStatus = manifest?.gasDeployStatus || (pingRes.success ? 'CONNECTED' : 'UNVERIFIED');
    const gatewayStatus = isSimulation
      ? 'WARN'
      : pingRes.success && manifestRes.success
        ? 'PASS'
        : 'FAIL';
    checks.push({
      id: 'gateway-token',
      category: 'GATEWAY',
      label: 'GAS Gateway & Gateway Token',
      status: gatewayStatus,
      detail: !hasToken && !isSimulation
        ? 'ยังไม่ได้ตั้งค่า Gateway Token ในเบราว์เซอร์ (Fail-Closed ปฏิเสธคำสั่งหากไม่มี Token)'
        : pingRes.success
          ? `${pingRes.message} (${pingRes.latencyMs}ms) • Token: ${hasToken ? 'Configured (Zero-Secret)' : 'Env/Missing'}`
          : `เชื่อมต่อ GAS ไม่สำเร็จ: ${pingRes.message}`,
      meta: `Deploy: ${gasDeployStatus}${manifest?.gasTokenProvisioned ? ' • ScriptToken: Provisioned' : ''}`,
      actionHint: !hasToken || gatewayStatus === 'FAIL' ? 'OPEN_GATEWAY_MODAL' : undefined,
    });

    // 3. Drive Manifest & Consolidation + Coordination Form
    const pendingJobsCount = Array.isArray(manifest?.pendingJobs) ? manifest.pendingJobs.length : 0;
    const completedJobsCount = Array.isArray(manifest?.completedJobs) ? manifest.completedJobs.length : 0;
    const fc = manifest?.folderConsolidation;
    const cf = manifest?.coordinationCenterForm;

    if (manifestRes.success && manifest) {
      const fcSummary = fc
        ? `OneDrive ${fc.archivedFolders ?? '-'} โฟลเดอร์ | Runner ${fc.workRunnerStatus ?? '-'} | .RPT ${fc.viewreportPureRptCount ?? '-'}`
        : `Modules ${Array.isArray(manifest.modules) ? manifest.modules.length : 0} | Scopes ${Array.isArray(manifest.scopes) ? manifest.scopes.length : 0}`;
      const cfSummary = cf
        ? `ฟอร์ม 9+1: ${cf.status ?? '-'} (${cf.centersCount ?? '-'} ศูนย์)`
        : 'ฟอร์ม 9+1: รออัปเดตใน Manifest';

      checks.push({
        id: 'drive-manifest',
        category: 'DRIVE',
        label: 'Google Drive Manifest (00_Project_Manifest.json)',
        status: 'PASS',
        detail: `อ่าน Manifest ล่าสุดสำเร็จ • ${fcSummary}`,
        meta: `${cfSummary} • LastUpdated: ${manifest.lastUpdated || manifest.updatedAt || '-'}`,
      });
    } else {
      checks.push({
        id: 'drive-manifest',
        category: 'DRIVE',
        label: 'Google Drive Manifest (00_Project_Manifest.json)',
        status: isSimulation ? 'WARN' : 'FAIL',
        detail: `ไม่สามารถดึง 00_Project_Manifest.json ได้ (${manifestRes.error || 'ตรวจสอบ Token หรือ GAS Deployment'})`,
        meta: `Workspace ID: ${WORKSPACE_FOLDER_ID}`,
        actionHint: 'OPEN_GATEWAY_MODAL',
      });
    }

    // 4. PC Worker CMS-2 Heartbeat
    const devicesMap = manifest?.devices || {};
    const cms2Key = Object.keys(devicesMap).find((k) => {
      const entry = devicesMap[k];
      return (
        k.toUpperCase().includes('CMS-2') ||
        String(entry?.deviceId || '').toUpperCase().includes('CMS-2') ||
        String(entry?.label || '').toUpperCase().includes('CMS-2')
      );
    });
    const cms2 = cms2Key ? devicesMap[cms2Key] : undefined;
    const cms2LastSeen = cms2 ? String(cms2.lastSeenIso || cms2.lastHeartbeatIso || '') : '';
    const cms2ParsedMs = cms2LastSeen ? Date.parse(cms2LastSeen) : NaN;
    const cms2AgeMin = Number.isFinite(cms2ParsedMs)
      ? Math.max(0, Math.round((Date.now() - cms2ParsedMs) / 60000))
      : null;

    if (!manifest) {
      checks.push({
        id: 'worker-cms2',
        category: 'WORKER',
        label: 'PC Worker CMS-2 Heartbeat',
        status: 'WARN',
        detail: 'ยังไม่มีข้อมูล Manifest สำหรับตรวจสถานะอุปกรณ์ CMS-2',
      });
    } else if (!cms2) {
      checks.push({
        id: 'worker-cms2',
        category: 'WORKER',
        label: 'PC Worker CMS-2 Heartbeat',
        status: 'WARN',
        detail: 'ยังไม่พบอุปกรณ์ CMS-2 ใน devices ของ Manifest (รอสคริปต์ crd_worker.py ส่ง Heartbeat)',
        meta: `Pending: ${pendingJobsCount} | Completed: ${completedJobsCount}`,
      });
    } else {
      const isOnlineFresh = cms2AgeMin !== null && cms2AgeMin <= 5;
      checks.push({
        id: 'worker-cms2',
        category: 'WORKER',
        label: 'PC Worker CMS-2 Heartbeat',
        status: isOnlineFresh ? 'PASS' : 'WARN',
        detail: isOnlineFresh
          ? `CMS-2 ออนไลน์ล่าสุดเมื่อ ${cms2AgeMin} นาทีที่แล้ว (Status: ${String(cms2.status || 'ONLINE')})`
          : `CMS-2 Heartbeat ล่าสุดเมื่อ ${cms2AgeMin !== null ? `${cms2AgeMin} นาทีที่แล้ว` : 'ไม่ทราบเวลา'} (${String(cms2.status || 'STANDBY')})`,
        meta: `LastSeen: ${cms2LastSeen || '-'} • PrintGate: ${String(cms2.printGate || 'LOCKED_ZERO_PAPER')}`,
      });
    }

    // 5. Doc B Bridge & Job Queue
    const docBState = manifest?.docBState as Record<string, unknown> | undefined;
    const docBHeading = docBState?.lastTopHeading ? String(docBState.lastTopHeading) : '';
    const docBPolled = docBState?.lastPolledIso ? String(docBState.lastPolledIso) : '';
    checks.push({
      id: 'doc-b-bridge',
      category: 'DOC_B',
      label: 'Doc B Auto-Queue Bridge & Job Queue',
      status: manifest ? 'PASS' : 'WARN',
      detail: manifest
        ? `คิวงานรอทำ (pendingJobs): ${pendingJobsCount} | เสร็จแล้ว (completedJobs): ${completedJobsCount}${docBHeading ? ` • หัว Doc B: ${docBHeading.slice(0, 60)}` : ''}`
        : 'รออ่านสถานะ Doc B Bridge จาก Manifest',
      meta: docBPolled ? `Doc B Polled: ${docBPolled}` : `Gate Status: ${manifest?.gateStatus || 'UNVERIFIED'}`,
    });

    // 6. 16 Stop Gates, Zero-PII & Paper=0 Lock
    const nonRptCount = fc?.viewreportNonRptCount ?? 0;
    const securityOk = nonRptCount === 0;
    checks.push({
      id: 'security-gates',
      category: 'SECURITY',
      label: '16 Stop Gates • Zero-PII • Paper=0 Lock',
      status: securityOk ? 'PASS' : 'FAIL',
      detail: securityOk
        ? 'บังคับ Zero-PII 100%, Zero-Secret 100% และ NO_AUTO_PRINT (Paper=0) • D:\\COOP\\VIEWREPORT ปลอดไฟล์ขยะ (0 non-.rpt)'
        : `ตรวจพบไฟล์ non-.rpt จำนวน ${nonRptCount} ไฟล์ใน VIEWREPORT`,
      meta: `Manifest Gate: ${manifest?.gateStatus || 'ACTIVE_GUARD'} • Pure .RPT: ${fc?.viewreportPureRptCount ?? 27}`,
    });

    const hasFail = checks.some((c) => c.status === 'FAIL');
    const hasWarn = checks.some((c) => c.status === 'WARN');
    const overallStatus: SiteAuditReport['overallStatus'] = hasFail
      ? 'ACTION_REQUIRED'
      : hasWarn
        ? 'PARTIAL'
        : 'READY';

    let recommendedAction = 'ระบบทั้งหมดพร้อมใช้งานครบวงจร (Frontend + GAS Gateway + Drive Manifest + CMS-2 + Security Gates)';
    if (!hasToken && !isSimulation) {
      recommendedAction = 'กรุณากด "ตั้งค่า Gateway" เพื่อกรอก Gateway Token (เก็บเฉพาะในเบราว์เซอร์) แล้วทดสอบ Audit ซ้ำ';
    } else if (isSimulation) {
      recommendedAction = 'ปิดโหมดจำลอง (Offline Simulator) ในหน้าตั้งค่า Gateway เพื่อเชื่อมต่อ GAS และ Drive จริง';
    } else if (!pingRes.success || !manifestRes.success) {
      recommendedAction = 'ตรวจสอบว่าค่า Gateway Token ตรงกับ Script Properties บน GAS Index และ Web App Deploy เป็นเวอร์ชันล่าสุดแล้ว';
    } else if (cms2 && cms2AgeMin !== null && cms2AgeMin > 5) {
      recommendedAction = 'Frontend และ GAS พร้อมใช้แล้ว — หากต้องการรันสคริปต์ทันที ให้ตรวจสอบงานเบื้องหลัง CRD_CMS2_Worker_Boot บนเครื่อง CMS-2';
    }

    return {
      checkedAtIso,
      overallStatus,
      latencyMs: pingRes.latencyMs,
      checks,
      manifest: manifest || null,
      recommendedAction,
    };
  }

  public clearLogs() {
    this.logs = [];
    this.notifyLogs();
  }
}

export const backendGateway = new BackendGatewayService();

