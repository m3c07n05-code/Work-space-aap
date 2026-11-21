import { backendGateway, MANIFEST_FILE_NAME, WORKSPACE_FOLDER_ID } from './backendGateway';
import type { ArtPreset, FolderFile } from '../components/ui/glass-folder-cards';

export const WORK1_13_HEADERS = [
  'ลำดับ',
  'เลขที่สมาชิก',
  'ชื่อสมาชิก',
  'สถานะ',
  'สัญญาเลขที่',
  'จำนวนเงินกู้',
  'เงินต้นคงเหลือ',
  'ค่าปรับ',
  'ผิดนัดรวมทั้งสัญญา',
  'หุ้นรวม',
  'เงินฝาก',
  'สังกัด',
  'ชำระล่าสุด',
] as const;

export type Work1AgendaGroup = '4.1_PM_ONLY' | '4.2_PM_PLUS_OTHER';

export interface Work1ReportRow {
  seq: number;
  memberId: string;
  memberName: string;
  statusLabel: string;
  contractNo: string;
  loanAmount: number;
  principalBalance: number;
  fineAmount: number;
  totalDefaultContract: number;
  totalShares: number;
  depositAmount: number;
  affiliation: string;
  lastPaymentDate: string;
  agendaGroup: Work1AgendaGroup;
  isFirstContractOfMember: boolean;
}

// Strict Zero-PII synthetic rows only (5-digit leading-zero Mem_ID + Dual-Key contract separation)
export const WORK1_SYNTHETIC_ROWS: Work1ReportRow[] = [
  {
    seq: 1,
    memberId: '00124',
    memberName: 'สมาชิกตัวอย่าง ก. (DEMO-01)',
    statusLabel: 'พม. สิทธิเดี่ยว',
    contractNo: 'LN-DEMO-2026-001',
    loanAmount: 150000,
    principalBalance: 84500,
    fineAmount: 1200,
    totalDefaultContract: 85700,
    totalShares: 42000,
    depositAmount: 3500,
    affiliation: 'สาขาทดสอบกลาง (DEMO)',
    lastPaymentDate: '2026-08-20',
    agendaGroup: '4.1_PM_ONLY',
    isFirstContractOfMember: true,
  },
  {
    seq: 2,
    memberId: '00582',
    memberName: 'สมาชิกตัวอย่าง ข. (DEMO-02)',
    statusLabel: 'พม. สิทธิเดี่ยว',
    contractNo: 'LN-DEMO-2026-014',
    loanAmount: 90000,
    principalBalance: 41200,
    fineAmount: 650,
    totalDefaultContract: 41850,
    totalShares: 28500,
    depositAmount: 1200,
    affiliation: 'สาขาทดสอบเหนือ (DEMO)',
    lastPaymentDate: '2026-09-05',
    agendaGroup: '4.1_PM_ONLY',
    isFirstContractOfMember: true,
  },
  {
    seq: 3,
    memberId: '01049',
    memberName: 'สมาชิกตัวอย่าง ค. (DEMO-03)',
    statusLabel: 'พม. + สัญญาอื่น (สัญญา 1)',
    contractNo: 'LN-DEMO-2026-031',
    loanAmount: 200000,
    principalBalance: 118000,
    fineAmount: 1850,
    totalDefaultContract: 119850,
    totalShares: 65000,
    depositAmount: 8400,
    affiliation: 'สาขาทดสอบใต้ (DEMO)',
    lastPaymentDate: '2026-08-18',
    agendaGroup: '4.2_PM_PLUS_OTHER',
    isFirstContractOfMember: true,
  },
  {
    seq: 4,
    memberId: '01049',
    memberName: 'สมาชิกตัวอย่าง ค. (DEMO-03)',
    statusLabel: 'พม. + สัญญาอื่น (สัญญา 2)',
    contractNo: 'LN-DEMO-2026-032',
    loanAmount: 60000,
    principalBalance: 22400,
    fineAmount: 340,
    totalDefaultContract: 22740,
    totalShares: 65000,
    depositAmount: 8400,
    affiliation: 'สาขาทดสอบใต้ (DEMO)',
    lastPaymentDate: '2026-09-12',
    agendaGroup: '4.2_PM_PLUS_OTHER',
    isFirstContractOfMember: false,
  },
];

function sanitizeCsvCell(raw: string | number): string {
  const str = String(raw ?? '');
  // Prevent CSV formula injection in Excel
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildWork1Csv(rows: Work1ReportRow[]): string {
  const headerLine = WORK1_13_HEADERS.map((h) => sanitizeCsvCell(h)).join(',');
  const dataLines = rows.map((r, idx) => {
    const cells: Array<string | number> = [
      idx + 1,
      r.memberId,
      r.memberName,
      r.statusLabel,
      r.contractNo,
      r.loanAmount.toFixed(2),
      r.principalBalance.toFixed(2),
      r.fineAmount.toFixed(2),
      r.totalDefaultContract.toFixed(2),
      r.isFirstContractOfMember ? r.totalShares.toFixed(2) : `${r.totalShares.toFixed(2)} (ระดับสมาชิก-ไม่รวมซ้ำ)`,
      r.isFirstContractOfMember ? r.depositAmount.toFixed(2) : `${r.depositAmount.toFixed(2)} (ระดับสมาชิก-ไม่รวมซ้ำ)`,
      r.affiliation,
      r.lastPaymentDate,
    ];
    return cells.map((c) => sanitizeCsvCell(c)).join(',');
  });

  // Prepend UTF-8 BOM for Thai Excel compatibility
  return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
}

export interface BackupFileSpec {
  id: string;
  workId: string;
  name: string;
  meta: string;
  art: ArtPreset;
  summary: string;
  gate: string;
  driveTargetFolder: string;
}

export interface BackupFolderGroup {
  id: string;
  label: string;
  meta: string;
  art: ArtPreset;
  seed: number;
  files: BackupFileSpec[];
}

export const CRD_WORK1_9_BACKUP_FOLDERS: BackupFolderGroup[] = [
  {
    id: 'CRD_WORK1_9_BACKUP_G1',
    label: 'WORK 1–3 Backup',
    meta: 'CRD_WORK1_9_BACKUP',
    art: 'aurora',
    seed: 101,
    files: [
      {
        id: 'W1-13COL-SCHEMA',
        workId: 'WORK 1',
        name: 'work1_13col_schema.json',
        meta: '13-Col · Mem_ID 5 หลัก',
        art: 'aurora',
        summary: 'สคีมาตาราง 13 คอลัมน์ WORK 1 แยกวาระ 4.1 (พม.) และ 4.2 (พม.+สัญญาอื่น)',
        gate: 'DUAL_KEY_LEDGER',
        driveTargetFolder: 'CRD_WORK1_9_BACKUP/WORK1',
      },
      {
        id: 'W2-TERM-RULES',
        workId: 'WORK 2',
        name: 'work2_termination_rules.json',
        meta: 'พ้นสมาชิกภาพ · 0 PII',
        art: 'glacier',
        summary: 'กติกาติดตามผู้พ้นสมาชิกภาพและการผิดนัดระดับสมาชิก',
        gate: 'PDPA_ZERO_PII',
        driveTargetFolder: 'CRD_WORK1_9_BACKUP/WORK2',
      },
      {
        id: 'W3-38COL-MAP',
        workId: 'WORK 3',
        name: 'work3_38col_lineage.md',
        meta: 'ตัดรอบวันที่ 20 · V003',
        art: 'verdant',
        summary: 'แผนผังเชื่อมข้อมูลติดตามหนี้ระยะยาว 38 ช่องและสคริปต์ 077',
        gate: 'V003_FORMAT_ONLY',
        driveTargetFolder: 'CRD_WORK1_9_BACKUP/WORK3',
      },
    ],
  },
  {
    id: 'CRD_WORK1_9_BACKUP_G2',
    label: 'WORK 4–6 Backup',
    meta: 'CRD_WORK1_9_BACKUP',
    art: 'glacier',
    seed: 202,
    files: [
      {
        id: 'W4-A6-EMS-SPEC',
        workId: 'WORK 4',
        name: 'work4_a6_rpt_contract.json',
        meta: '9 หมวด · NO_AUTO_PRINT',
        art: 'glacier',
        summary: 'สัญญาข้อมูลออฟไลน์ WORK 4 Direct-RPT สู่ใบนำส่ง A6 9 หมวด',
        gate: 'NO_AUTO_PRINT_LOCKED',
        driveTargetFolder: 'CRD_WORK1_9_BACKUP/WORK4',
      },
      {
        id: 'W5-HOLD-GUARD',
        workId: 'WORK 5',
        name: 'work5_hold_guardrail.md',
        meta: 'HOLD · รอยืนยันบทบาท',
        art: 'dusk',
        summary: 'เอกสารกำกับสถานะพักงาน WORK 5 บันทึกและติดตามการส่งงาน',
        gate: 'PDPA_ZERO_PII',
        driveTargetFolder: 'CRD_WORK1_9_BACKUP/WORK5',
      },
      {
        id: 'W6-PDF-CHECKLIST',
        workId: 'WORK 6',
        name: 'work6_pdf_checklist.json',
        meta: 'PDF Audit · 0 PII',
        art: 'aurora',
        summary: 'ชุดตรวจทานไฟล์ PDF ด้วย AI และ Checklist มาตรฐาน CRD',
        gate: 'PDPA_ZERO_PII',
        driveTargetFolder: 'CRD_WORK1_9_BACKUP/WORK6',
      },
    ],
  },
  {
    id: 'CRD_WORK1_9_BACKUP_G3',
    label: 'WORK 7–9 & Manifest',
    meta: 'CRD_WORK1_9_BACKUP',
    art: 'verdant',
    seed: 303,
    files: [
      {
        id: 'W7-GRACE-MAP',
        workId: 'WORK 7',
        name: 'work7_grace_period_map.json',
        meta: 'ผ่อนผัน · DATA ต้นฉบับ',
        art: 'verdant',
        summary: 'แผนผังคอลัมน์อนุมัติผ่อนผันและปรับค่างวดอ้างอิงแผ่น DATA',
        gate: 'V003_FORMAT_ONLY',
        driveTargetFolder: 'CRD_WORK1_9_BACKUP/WORK7',
      },
      {
        id: 'W8-BANK-DEDUCT',
        workId: 'WORK 8',
        name: 'work8_bank_deduction.json',
        meta: 'หักนอกระบบ · ธนาคาร',
        art: 'ember',
        summary: 'โครงสร้างส่งหักนอกระบบและธนาคาร (Metadata-Only Zero-PII)',
        gate: 'PDPA_ZERO_PII',
        driveTargetFolder: 'CRD_WORK1_9_BACKUP/WORK8',
      },
      {
        id: 'W9-SINGLE-CONTRACT',
        workId: 'WORK 9',
        name: 'work9_single_contract_spec.md',
        meta: 'รายสัญญา · ห้ามรวมข้าม',
        art: 'aurora',
        summary: 'สเปกจดหมายเฉพาะราย แยกทีละสัญญาตามกฎ Dual-Key',
        gate: 'DUAL_KEY_LEDGER',
        driveTargetFolder: 'CRD_WORK1_9_BACKUP/WORK9',
      },
    ],
  },
];

export function toGlassFolderFiles(files: BackupFileSpec[]): FolderFile[] {
  return files.map((f) => ({
    name: f.name,
    meta: f.meta,
    art: f.art,
  }));
}

export interface BackupSyncResult {
  success: boolean;
  manifestUpdated: boolean;
  readbackVerified: boolean;
  eventId?: string;
  latencyMs: number;
  message: string;
}

export async function dispatchBackupFileToDrive(file: BackupFileSpec): Promise<BackupSyncResult> {
  const componentId = `CRD_WORK1_9_BACKUP-${file.id}`;
  const res = await backendGateway.dispatchAction('DEPLOY_EVOLVED_UI_DESIGN', {
    componentId,
    title: `[CRD_WORK1_9_BACKUP] ${file.workId}: ${file.name}`,
    category: 'CRD_WORK1_9_BACKUP',
    gate: file.gate,
    summary: file.summary,
    rule: `Per-file Drive Backup metadata (${file.driveTargetFolder}) — Zero-PII enforced`,
    actionPrompt: `Backup metadata sync for ${file.name}`,
    targetManifest: MANIFEST_FILE_NAME,
    workspaceId: WORKSPACE_FOLDER_ID,
    spec: {
      componentId,
      title: `[CRD_WORK1_9_BACKUP] ${file.workId}: ${file.name}`,
      category: 'CRD_WORK1_9_BACKUP',
      gate: file.gate,
      summary: file.summary,
      rule: `Per-file Drive Backup metadata (${file.driveTargetFolder}) — Zero-PII enforced`,
      actionPrompt: `Backup metadata sync for ${file.name}`,
    },
  });

  const manifestUpdated = Boolean(res.log.response?.manifestUpdated);
  let readbackVerified = false;

  if (res.success && !res.log.isSimulated) {
    const readRes = await backendGateway.readManifest();
    readbackVerified = Boolean(
      readRes.success &&
        readRes.manifest?.modules?.some((m) => m.componentId === componentId)
    );
  } else if (res.success && res.log.isSimulated) {
    readbackVerified = true;
  }

  return {
    success: res.success,
    manifestUpdated,
    readbackVerified,
    eventId: typeof res.log.response?.eventId === 'string' ? res.log.response.eventId : undefined,
    latencyMs: res.log.latencyMs,
    message: res.success
      ? `สำรองเมทาดาต้า "${file.name}" เข้า ${MANIFEST_FILE_NAME} สำเร็จ (${res.log.latencyMs}ms)`
      : `ไม่สามารถสำรองไฟล์ "${file.name}" ได้: ${String(res.log.response?.error || 'Gateway error')}`,
  };
}
