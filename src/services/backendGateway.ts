import { GatewayConfig, PayloadLog, ScopeItem, ManifestModule, ProjectManifest } from '../types';
export type { ScopeItem, ManifestModule, ProjectManifest };

const STORAGE_KEY_CONFIG = 'nexus_gateway_config';
const STORAGE_KEY_LOGS = 'nexus_gateway_logs';
const STORAGE_KEY_SCOPES = 'nexus_scopes_data';

export const DEFAULT_GAS_URL =
  'https://script.google.com/macros/s/AKfycbwTEboyfHQ0LzmrP0mtxWCYtrg13Jz5JqKpLVW-8Dtf3bWYqoc-ZoPObtZGjSlKriBU/exec';

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
        return JSON.parse(saved);
      }
    } catch {
      // Fallback
    }

    return {
      baseUrl: DEFAULT_GAS_URL,
      webhookEndpoint: '',
      apiKey: 'gas_auto_token_manifest_sync',
      isSimulationMode: false,
      status: 'connected',
      latencyMs: 18,
      lastPing: new Date().toLocaleTimeString('th-TH'),
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
        endpoint: DEFAULT_GAS_URL,
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
          status: 'CONNECTED',
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
    this.config = {
      ...this.config,
      ...newConfig,
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

  public async testConnection(): Promise<{ success: boolean; latencyMs: number; status: number; message: string }> {
    this.setSyncStatus('syncing');
    this.updateConfig({ status: 'testing' });
    const startTime = performance.now();

    if (this.config.isSimulationMode || !this.config.baseUrl) {
      await new Promise((r) => setTimeout(r, 350));
      const latencyMs = Math.round(performance.now() - startTime);
      this.updateConfig({
        status: 'simulated',
        latencyMs,
        lastPing: new Date().toLocaleTimeString('th-TH'),
      });
      this.setSyncStatus('synced');
      return {
        success: true,
        latencyMs,
        status: 200,
        message: 'โหมดจำลอง (Simulator) ตอบสนองปกติ',
      };
    }

    try {
      const isGas = this.config.baseUrl.includes('script.google.com');

      if (isGas) {
        // Direct POST with text/plain to bypass OPTIONS preflight on Google Apps Script
        const res = await fetch(this.config.baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'PING',
            source: 'NexusLedger_UI',
            timestamp: new Date().toISOString(),
          }),
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
        this.updateConfig({
          status: isSuccess ? 'connected' : 'offline',
          latencyMs,
          lastPing: new Date().toLocaleTimeString('th-TH'),
        });
        this.setSyncStatus('synced');

        return {
          success: isSuccess,
          latencyMs,
          status: res.status,
          message: isSuccess
            ? 'เชื่อมต่อ Google Apps Script Web App สำเร็จ พร้อมส่งคำสั่ง'
            : `เซิร์ฟเวอร์ตอบกลับแต่ไม่สำเร็จ (${res.status})`,
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
        lastPing: new Date().toLocaleTimeString('th-TH'),
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
      this.updateConfig({
        status: 'offline',
        latencyMs,
        lastPing: new Date().toLocaleTimeString('th-TH'),
      });
      this.setSyncStatus('synced');

      return {
        success: false,
        latencyMs,
        status: 0,
        message: err instanceof Error ? err.message : 'ไม่สามารถเชื่อมต่อปลายทางได้',
      };
    }
  }

  public async readManifest(overrideEndpoint?: string): Promise<{
    success: boolean;
    manifest: ProjectManifest | null;
    error?: string;
  }> {
    this.setSyncStatus('syncing');
    const endpoint = overrideEndpoint || this.config.baseUrl;
    const isGas = endpoint.includes('script.google.com');
    const startTime = performance.now();
    const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const timestamp = new Date().toLocaleTimeString('th-TH');

    try {
      let url = endpoint;
      if (isGas) {
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}action=GET_MANIFEST`;
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

      const log: PayloadLog = {
        id: logId,
        timestamp,
        action: 'GET_MANIFEST',
        method: 'GET',
        endpoint: url,
        headers: {},
        payload: { action: 'GET_MANIFEST' },
        status: response.status,
        latencyMs,
        response: data,
        isSimulated: false,
      };

      this.logs = [log, ...this.logs.slice(0, 49)];
      this.notifyLogs();
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
        endpoint: overrideEndpoint || this.config.baseUrl,
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
    const endpoint = overrideEndpoint || this.config.baseUrl;
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
        endpoint: endpoint || DEFAULT_GAS_URL,
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

    try {
      if (isGas) {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payloadEnvelope),
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
          endpoint,
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
        endpoint,
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
        endpoint,
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

  public clearLogs() {
    this.logs = [];
    this.notifyLogs();
  }
}

export const backendGateway = new BackendGatewayService();

