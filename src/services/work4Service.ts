import {
  Work4StatusResponse,
  Work4PreviewRequest,
  Work4PreviewResponse,
  Work4PrintRequest,
  Work4PrintResponse,
  ProjectManifest,
} from '../types';
import { backendGateway } from './backendGateway';

const CMS2_ONLINE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// Default mock payload from OFFLINE DATA CONTRACT specification
export const DEFAULT_OFFLINE_MOCK_DATA: Work4StatusResponse = {
  mode: "OFFLINE_MOCK",
  task_id: "CRD-WORK4-PRINT-FORMAT-NEW-20261112",
  selected_year: "2026",
  selected_month: "11",
  month_label: "พฤศจิกายน 2026",
  printer_status: {
    host: "CMS-2 (OFFLINE_SIMULATED)",
    printer_name: "Default Windows A6 Printer (Simulated)",
    is_ready: false,
    message: "CMS-2 ออฟไลน์ — เปิดโหมดพรีวิวและทดสอบ UI จำลอง (ล็อกปุ่มสั่งพิมพ์จริง)"
  },
  categories: [
    { code: "C01", rpt_prefix: "CLT-003-02", name: "ผู้กู้ 2 งวด", form_type: "ก.2/ค.2 + EMS A6", status: "FOUND", record_count: 12, pdf_pages: 12, mock_preview_url: "mock://a6-preview/C01" },
    { code: "C02", rpt_prefix: "CLT-004-02", name: "ผู้กู้ร่วม 2 งวด", form_type: "ก.2/ค.2 + EMS A6", status: "FOUND", record_count: 5, pdf_pages: 5, mock_preview_url: "mock://a6-preview/C02" },
    { code: "C03", rpt_prefix: "CLT-004-02", name: "ผู้ค้ำ 2 งวด", form_type: "ก.2/ค.2 + EMS A6", status: "SKIPPED_EMPTY", record_count: 0, pdf_pages: 0, mock_preview_url: null },
    { code: "C04", rpt_prefix: "CLT-005-02", name: "ผู้กู้ 4 งวด", form_type: "ก.2/ค.2 + EMS A6", status: "FOUND", record_count: 8, pdf_pages: 8, mock_preview_url: "mock://a6-preview/C04" },
    { code: "C05", rpt_prefix: "CLT-006-02", name: "ผู้กู้ร่วม 4 งวด", form_type: "ก.2/ค.2 + EMS A6", status: "SKIPPED_EMPTY", record_count: 0, pdf_pages: 0, mock_preview_url: null },
    { code: "C06", rpt_prefix: "CLT-006-02", name: "ผู้ค้ำ 4 งวด", form_type: "ก.2/ค.2 + EMS A6", status: "FOUND", record_count: 3, pdf_pages: 3, mock_preview_url: "mock://a6-preview/C06" },
    { code: "C07", rpt_prefix: "CLT-007-02", name: "ผู้กู้ 5 งวด", form_type: "ใบฟ้า EMS A6", status: "FOUND", record_count: 15, pdf_pages: 15, mock_preview_url: "mock://a6-preview/C07" },
    { code: "C08", rpt_prefix: "CLT-008-02", name: "ผู้กู้ร่วม 5 งวด", form_type: "ใบฟ้า EMS A6", status: "FOUND", record_count: 4, pdf_pages: 4, mock_preview_url: "mock://a6-preview/C08" },
    { code: "C09", rpt_prefix: "CLT-008-02", name: "ผู้ค้ำ 5 งวด", form_type: "ใบฟ้า EMS A6", status: "ERROR", record_count: 0, pdf_pages: 0, error_code: "MOCK_TEST_READ_ERROR", mock_preview_url: null }
  ]
};

// Generate UUID v4 for Idempotency Key
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function resolveCms2StatusFromManifest(
  manifest: ProjectManifest | null,
  nowMs = Date.now()
): {
  isOnline: boolean;
  ageMin: number | null;
  statusLabel: string;
  printGate: string;
  lastSeenIso: string;
  hasDevice: boolean;
} {
  const devicesMap = manifest?.devices || {};
  const cms2Key =
    'CMS-2' in devicesMap
      ? 'CMS-2'
      : Object.keys(devicesMap).find((k) => {
          const entry = devicesMap[k];
          return (
            k.toUpperCase().includes('CMS-2') ||
            String(entry?.deviceId || '').toUpperCase().includes('CMS-2') ||
            String(entry?.label || '').toUpperCase().includes('CMS-2')
          );
        });
  const cms2 = cms2Key ? devicesMap[cms2Key] : undefined;
  const lastSeenIso = cms2 ? String(cms2.lastSeenIso || cms2.lastHeartbeatIso || '') : '';
  const parsedMs = lastSeenIso ? Date.parse(lastSeenIso) : NaN;
  const ageMs = Number.isFinite(parsedMs) ? Math.max(0, nowMs - parsedMs) : null;
  const ageMin = ageMs !== null ? Math.round(ageMs / 60000) : null;
  const isOnline = Boolean(cms2 && ageMs !== null && ageMs <= CMS2_ONLINE_WINDOW_MS);

  return {
    isOnline,
    ageMin,
    statusLabel: String(cms2?.status || (isOnline ? 'ONLINE' : 'OFFLINE')),
    printGate: String(cms2?.printGate || 'LOCKED_ZERO_PAPER'),
    lastSeenIso,
    hasDevice: Boolean(cms2),
  };
}

class Work4Service {
  private inFlightPrint = false;
  private currentMode: 'OFFLINE_MOCK' | 'CMS2_LIVE' = 'OFFLINE_MOCK';
  private manualModeOverride: 'OFFLINE_MOCK' | 'CMS2_LIVE' | null = null;

  // Endpoint 1: Resolve 9-category status & CMS-2 health from live Manifest devices["CMS-2"]
  async getStatus(year = '2026', month = '11'): Promise<Work4StatusResponse> {
    let manifest = backendGateway.getManifest();
    const cfg = backendGateway.getConfig();
    if (!manifest && !cfg.isSimulationMode && backendGateway.hasGatewayUrl() && backendGateway.hasGatewayToken()) {
      const res = await backendGateway.readManifest(undefined, { background: true });
      if (res.manifest) {
        manifest = res.manifest;
      }
    }

    const cms2State = resolveCms2StatusFromManifest(manifest);
    const resolvedMode: 'OFFLINE_MOCK' | 'CMS2_LIVE' =
      this.manualModeOverride !== null
        ? this.manualModeOverride
        : cms2State.isOnline
          ? 'CMS2_LIVE'
          : 'OFFLINE_MOCK';

    this.currentMode = resolvedMode;

    const printerStatus =
      resolvedMode === 'CMS2_LIVE'
        ? {
            host: 'CMS-2 (ONLINE_LIVE)',
            printer_name: `CMS-2 Worker (${cms2State.printGate})`,
            is_ready: true,
            message: cms2State.isOnline
              ? `CMS-2 ออนไลน์จาก Manifest (Heartbeat ล่าสุด ${cms2State.ageMin ?? 0} นาทีที่แล้ว • ${cms2State.statusLabel})`
              : 'CMS-2 ออนไลน์ — ระบบ Spooler พร้อมรับงานพิมพ์จริง',
          }
        : {
            ...DEFAULT_OFFLINE_MOCK_DATA.printer_status,
            message: cms2State.hasDevice
              ? `CMS-2 ออฟไลน์ — Heartbeat ล่าสุดเมื่อ ${cms2State.ageMin !== null ? `${cms2State.ageMin} นาทีที่แล้ว` : 'ไม่ทราบเวลา'} (เปิดโหมดพรีวิวจำลอง)`
              : DEFAULT_OFFLINE_MOCK_DATA.printer_status.message,
          };

    return {
      ...DEFAULT_OFFLINE_MOCK_DATA,
      mode: resolvedMode,
      selected_year: year,
      selected_month: month,
      printer_status: printerStatus,
    };
  }

  // Endpoint 2: Generate A6 preview
  async getPreview(params: Work4PreviewRequest): Promise<Work4PreviewResponse> {
    const cat = DEFAULT_OFFLINE_MOCK_DATA.categories.find(c => c.code === params.category_code);
    return {
      status: 'PREVIEW_READY',
      page_size: 'A6 (105x148mm)',
      total_pages: cat?.pdf_pages || 1,
      pdf_blob_url: `mock://a6-preview/${params.category_code}?top=${params.margin_top_mm}&left=${params.margin_left_mm}`
    };
  }

  // Endpoint 3: Print request with double-click guard & idempotency key
  async sendPrint(req: Work4PrintRequest): Promise<Work4PrintResponse> {
    if (this.inFlightPrint) {
      return {
        job_id: req.job_id,
        status: 'DUPLICATE_IGNORED',
        message: 'มีคำสั่งพิมพ์ที่กำลังประมวลผลอยู่ กรุณารอสักครู่ (ป้องกันการกดเบิ้ล)'
      };
    }

    this.inFlightPrint = true;
    try {
      const cms2State = resolveCms2StatusFromManifest(backendGateway.getManifest());
      const effectiveMode =
        this.manualModeOverride !== null
          ? this.manualModeOverride
          : cms2State.isOnline
            ? 'CMS2_LIVE'
            : this.currentMode;

      if (effectiveMode === 'OFFLINE_MOCK') {
        return {
          job_id: req.job_id,
          status: 'BLOCKED_CMS2_OFFLINE',
          message: 'เครื่อง CMS-2 ออฟไลน์ ไม่สามารถส่งคิวพิมพ์จริงได้'
        };
      }

      return {
        job_id: req.job_id,
        status: 'QUEUED',
        spooler_state: 'SUBMITTED',
        message: 'ส่งงานพิมพ์เข้า Spooler บนเครื่อง CMS-2 สำเร็จ'
      };
    } finally {
      setTimeout(() => {
        this.inFlightPrint = false;
      }, 800);
    }
  }

  // Toggle Mode for local testing/simulation
  async toggleMode(): Promise<Work4StatusResponse> {
    this.manualModeOverride = this.currentMode === 'OFFLINE_MOCK' ? 'CMS2_LIVE' : 'OFFLINE_MOCK';
    this.currentMode = this.manualModeOverride;
    return this.getStatus();
  }

  clearManualOverride(): void {
    this.manualModeOverride = null;
  }

  getCurrentMode(): 'OFFLINE_MOCK' | 'CMS2_LIVE' {
    return this.currentMode;
  }
}

export const work4Service = new Work4Service();
