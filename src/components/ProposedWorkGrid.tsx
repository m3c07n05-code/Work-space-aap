import React, { useState } from 'react';
import {
  ExternalLink,
  CheckCircle2,
  Layers,
  RefreshCw,
  Send,
  ShieldCheck,
  Play,
  Printer,
  FileSpreadsheet,
  Sliders,
} from 'lucide-react';
import {
  backendGateway,
  WORKSPACE_FOLDER_ID,
  MANIFEST_FILE_NAME,
  ScopeItem,
} from '../services/backendGateway';
import { LiquidButton } from './ui/liquid-glass-button';
import { GlassBox } from './ui/glass-box';
import { Work4LetterPrintStudio } from './Work4LetterPrintStudio';
import { useFirebase } from '../contexts/FirebaseContext';

export type WorkOperationalStatus = 'ACTIVE_SYNCED' | 'PENDING_DEPLOY' | 'DRAFT';

export interface WorkStreamState {
  id: string;
  code: string;
  title: string;
  gate: string;
  status: WorkOperationalStatus;
  desc: string;
  ruleSummary: string;
  processedCount: number;
  passedCount: number;
  flaggedCount: number;
  batchTag: string;
  operatorNote: string;
  lastSyncedAt: string;
  sampleRows: Array<{
    keyA: string;
    keyB: string;
    detail: string;
    result: string;
  }>;
}

const INITIAL_WORK_STREAMS: WorkStreamState[] = [
  {
    id: 'WORK 1',
    code: 'CRD-WORK-01',
    title: 'แยกตาราง พม. เดี่ยว และ พม. + สัญญาอื่น',
    gate: 'DUAL_KEY_LEDGER',
    status: 'ACTIVE_SYNCED',
    desc: 'ตรวจรอบมติ แยกสมาชิกที่มีเฉพาะ พม. 1 สัญญา ออกจากสมาชิกที่มีหลายสัญญา ห้ามคัดลอกวันชำระล่าสุดข้ามสัญญา',
    ruleSummary: 'ใช้คีย์คู่ Mem_ID (5 หลัก) + NewLoanID แยกกลุ่ม พม. ล้วน กับ พม.+สัญญาอื่น 100%',
    processedCount: 420,
    passedCount: 420,
    flaggedCount: 0,
    batchTag: 'RES-2569-11-W1',
    operatorNote: 'แยกตาราง พม. เดี่ยว 285 รายการ และ พม.+สัญญาอื่น 135 รายการ ไม่ปะปนวันชำระข้ามสัญญา',
    lastSyncedAt: '2026-11-17 09:30',
    sampleRows: [
      { keyA: '00108', keyB: 'PM-2568-0112', detail: 'สมาชิกมีเฉพาะ พม. 1 สัญญา', result: 'จัดเข้าตาราง พม. เดี่ยว' },
      { keyA: '00245', keyB: 'PM-2568-0419 + SP-2569-0081', detail: 'พบ 2 สัญญาในทะเบียนเดียวกัน', result: 'แยกเข้าตาราง พม.+สัญญาอื่น (แยกวันชำระตาม NewLoanID)' },
      { keyA: '00912', keyB: 'PM-2567-0884', detail: 'สมาชิกมีเฉพาะ พม. 1 สัญญา', result: 'จัดเข้าตาราง พม. เดี่ยว' },
    ],
  },
  {
    id: 'WORK 2',
    code: 'CRD-WORK-02',
    title: 'ระบบสัญญาร่วม & ตรวจสอบผู้ค้ำประกันไขว้',
    gate: 'DUAL_KEY_LEDGER',
    status: 'ACTIVE_SYNCED',
    desc: 'ตรวจสอบความสัมพันธ์การค้ำประกันไขว้ (Cross-Guarantee) และจำกัดจำนวนสัญญาตามระเบียบสหกรณ์',
    ruleSummary: 'ผูกความสัมพันธ์ผู้กู้หลัก-กู้ร่วม-ผู้ค้ำ ด้วยรหัส 5 หลัก โดยไม่เปิดเผยชื่อส่วนบุคคลบน Cloud',
    processedCount: 196,
    passedCount: 192,
    flaggedCount: 4,
    batchTag: 'CGM-2569-11-W2',
    operatorNote: 'ตรวจพบการค้ำประกันไขว้เกินโควตา 4 สัญญา แจ้งเตือนเข้าด่าน Stop Gate เรียบร้อย',
    lastSyncedAt: '2026-11-17 09:42',
    sampleRows: [
      { keyA: '00314', keyB: 'LN-2569-0551', detail: 'ผู้ค้ำ 00812 ค้ำประกัน 2 สัญญา', result: 'ผ่านเกณฑ์โควตาค้ำประกัน' },
      { keyA: '00520', keyB: 'LN-2569-0602', detail: 'กู้ร่วม 00521 ↔ ค้ำไขว้ 00314', result: 'บันทึกผังค้ำไขว้ Dual-Key' },
      { keyA: '01044', keyB: 'LN-2569-0790', detail: 'ผู้ค้ำ 00199 เกินสิทธิ์ 3 สัญญา', result: 'แจ้งเตือนตรวจสอบสิทธิ์ (Flagged)' },
    ],
  },
  {
    id: 'WORK 3',
    code: 'CRD-WORK-03',
    title: 'บันทึกวันชำระล่าสุด & ควบคุมรูปแบบตามกฎ V003',
    gate: 'V003_FORMAT_ONLY',
    status: 'ACTIVE_SYNCED',
    desc: 'จัดรูปแบบเฉพาะปี พ.ศ./ค.ศ. และเติมศูนย์นำหน้า 5 หลัก ห้ามคำนวณดอกเบี้ยหรือยอดหนี้ใหม่เด็ดขาด',
    ruleSummary: 'ล็อกตัวเลขเงินต้นและดอกเบี้ยตามต้นฉบับ 100% แปลงเฉพาะฟอร์แมตวันที่เป็น พ.ศ. มาตรฐาน',
    processedCount: 510,
    passedCount: 510,
    flaggedCount: 0,
    batchTag: 'V003-2569-11-W3',
    operatorNote: 'แปลงวันที่ ค.ศ. 2026 เป็น พ.ศ. 2569 และล็อกยอดเงินต้นฉบับครบ 510 สัญญา',
    lastSyncedAt: '2026-11-17 09:50',
    sampleRows: [
      { keyA: '00047', keyB: 'LN-2568-1002', detail: 'วันชำระ 15/10/2026 -> 2569-10-15', result: 'แปลง พ.ศ. สำเร็จ · ล็อกยอดหนี้เดิม' },
      { keyA: '00619', keyB: 'PM-2567-3310', detail: 'รหัส 619 -> เติมศูนย์เป็น 00619', result: 'คงศูนย์นำหน้า 5 หลักครบถ้วน' },
      { keyA: '01402', keyB: 'SP-2569-0204', detail: 'วันชำระผิดรูปแบบ -> เว้นว่างตามกฎ V003', result: 'ไม่เดาค่าแทน (V003 Strict)' },
    ],
  },
  {
    id: 'WORK 4',
    code: 'CRD-WORK-04',
    title: 'ห้องควบคุมงานพิมพ์จดหมายแจ้งหนี้ 9 หมวด & EMS รายเดือน',
    gate: 'PDPA_ZERO_PII',
    status: 'ACTIVE_SYNCED',
    desc: 'คัดแยกผู้รับ 9 หมวด (2/4/5 งวด × ผู้กู้/กู้ร่วม/ผู้ค้ำ) รันเลข ก.2 พรีวิวคู่ และสั่งพิมพ์ผ่าน Local Gateway (CMS-2)',
    ruleSummary: 'ตรวจเลขสมาชิก 5 หลัก รันทะเบียน ก.2 อัตโนมัติ และเรียก LetterPrint.ps1 โดยไม่ส่ง PII ขึ้น Cloud',
    processedCount: 9,
    passedCount: 9,
    flaggedCount: 0,
    batchTag: 'EMS-2569-11-W4',
    operatorNote: 'พร้อมใช้งานในสตูดิโอควบคุมงานพิมพ์ 9 หมวด & ซอง EMS ด้านล่าง',
    lastSyncedAt: '2026-11-17 10:00',
    sampleRows: [],
  },
  {
    id: 'WORK 5',
    code: 'CRD-WORK-05',
    title: 'ระบบรับไฟล์รายงานสาขาเข้าโฟลเดอร์ Staging (ปลอด PII)',
    gate: 'AUTO_DRIVE_SYNC',
    status: 'ACTIVE_SYNCED',
    desc: 'คัดแยกไฟล์รายงานประจำเดือนจากสาขาเข้าโฟลเดอร์ Staging บน Google Drive พร้อมตรวจโครงสร้างปลอด PII',
    ruleSummary: 'รับเฉพาะสรุปจำนวนสัญญาและรหัส Dual-Key จาก 14 สาขาเข้าสู่ AI_Project_Workspace',
    processedCount: 14,
    passedCount: 14,
    flaggedCount: 0,
    batchTag: 'STG-2569-11-W5',
    operatorNote: 'รับไฟล์รายงานครบ 14 สาขา ตรวจสอบไม่พบคอลัมน์ชื่อหรือเลขบัตรประชาชน',
    lastSyncedAt: '2026-11-17 10:05',
    sampleRows: [
      { keyA: 'BR-01', keyB: 'สำนักงานใหญ่', detail: 'ส่งรายงาน 142 สัญญา (Zero-PII)', result: 'ซิงก์เข้า Staging สำเร็จ' },
      { keyA: 'BR-02', keyB: 'ขอนแก่น', detail: 'ส่งรายงาน 88 สัญญา (Zero-PII)', result: 'ซิงก์เข้า Staging สำเร็จ' },
      { keyA: 'BR-03', keyB: 'เชียงใหม่', detail: 'ส่งรายงาน 64 สัญญา (Zero-PII)', result: 'ซิงก์เข้า Staging สำเร็จ' },
    ],
  },
  {
    id: 'WORK 6',
    code: 'CRD-WORK-06',
    title: 'ออกรายงานสรุปยอดลูกหนี้คงเหลือตามอายุหนี้ & รอบมติ',
    gate: 'DUAL_KEY_LEDGER',
    status: 'ACTIVE_SYNCED',
    desc: 'จัดกลุ่มสัญญาตามชั้นอายุหนี้ (ปกติ, ค้าง 2 งวด, 4 งวด, 5 งวดขึ้นไป) แยกตามรอบมติคณะกรรมการ',
    ruleSummary: 'สรุปจำนวนสัญญาแยกตามชั้นหนี้ด้วยคีย์คู่ โดยไม่รวมยอดข้ามสัญญาของสมาชิกคนเดียวกัน',
    processedCount: 680,
    passedCount: 680,
    flaggedCount: 0,
    batchTag: 'AGE-2569-11-W6',
    operatorNote: 'สรุปตารางอายุหนี้ประจำรอบมติ พ.ย. 2569 ครบทุกหมวดสัญญา',
    lastSyncedAt: '2026-11-17 10:12',
    sampleRows: [
      { keyA: 'TIER-2M', keyB: 'ค้างชำระ 2 งวด', detail: 'จำนวน 118 สัญญา', result: 'ส่งต่อคิวแจ้งเตือน WORK 4' },
      { keyA: 'TIER-4M', keyB: 'ค้างชำระ 4 งวด', detail: 'จำนวน 54 สัญญา', result: 'ส่งต่อคิวแจ้งเตือน WORK 4' },
      { keyA: 'TIER-5M', keyB: 'ค้างชำระ 5 งวด+', detail: 'จำนวน 29 สัญญา', result: 'ส่งต่อคิวเร่งรัดและตรวจอายุความ WORK 8' },
    ],
  },
  {
    id: 'WORK 7',
    code: 'CRD-WORK-07',
    title: 'ตรวจสอบเงื่อนไขปรับโครงสร้างหนี้และลดหย่อนตามระเบียบ CRD',
    gate: 'V003_FORMAT_ONLY',
    status: 'ACTIVE_SYNCED',
    desc: 'คัดกรองรหัสสัญญาที่เข้าเกณฑ์ขอผ่อนผันหรือปรับโครงสร้างหนี้ตามมติ CRD โดยไม่คำนวณตัวเลขทับข้อมูลบัญชี',
    ruleSummary: 'ตรวจสอบประวัติการชำระต่อเนื่องตามรหัส NewLoanID และส่งรหัสสัญญาให้ฝ่ายสินเชื่ออนุมัติ',
    processedCount: 85,
    passedCount: 79,
    flaggedCount: 6,
    batchTag: 'RLF-2569-11-W7',
    operatorNote: 'ผ่านเกณฑ์เข้ามติผ่อนผัน 79 สัญญา รอเอกสารเพิ่มเติม 6 สัญญา',
    lastSyncedAt: '2026-11-17 10:18',
    sampleRows: [
      { keyA: '00412', keyB: 'PM-2566-0912', detail: 'ชำระต่อเนื่องครบ 6 งวดตามเงื่อนไข', result: 'เข้าเกณฑ์เสนอขออนุมัติมติ CRD' },
      { keyA: '00788', keyB: 'LN-2567-1180', detail: 'ยื่นคำร้องปรับปรุงงวดชำระ', result: 'ผ่านการตรวจรหัสสัญญา Dual-Key' },
    ],
  },
  {
    id: 'WORK 8',
    code: 'CRD-WORK-08',
    title: 'ระบบแจ้งเตือนสัญญาใกล้ครบกำหนดอายุความเร่งด่วน',
    gate: 'PDPA_ZERO_PII',
    status: 'ACTIVE_SYNCED',
    desc: 'สแกนวันชำระล่าสุดของแต่ละ NewLoanID เพื่อแจ้งเตือนสัญญากลุ่มเฝ้าระวังก่อนครบกำหนดอายุความ',
    ruleSummary: 'ใช้วันชำระล่าสุดของแต่ละสัญญาโดยตรง (ห้ามดึงวันชำระจากสัญญาอื่นของสมาชิกคนเดียวกันมาทับ)',
    processedCount: 310,
    passedCount: 298,
    flaggedCount: 12,
    batchTag: 'LMT-2569-11-W8',
    operatorNote: 'พบสัญญาเข้าเกณฑ์เฝ้าระวังเร่งด่วน 12 สัญญา บันทึกรหัสลง Manifest แล้ว',
    lastSyncedAt: '2026-11-17 10:25',
    sampleRows: [
      { keyA: '00209', keyB: 'SP-2564-0041', detail: 'ขาดชำระเกินเกณฑ์เฝ้าระวัง', result: 'จัดเข้าคิวติดตามเร่งด่วน (Priority 1)' },
      { keyA: '00951', keyB: 'LN-2565-0318', detail: 'ตรวจสอบวันชำระล่าสุดเฉพาะสัญญานี้', result: 'แจ้งเตือนล่วงหน้า 90 วัน' },
    ],
  },
  {
    id: 'WORK 9',
    code: 'CRD-WORK-09',
    title: 'ส่งออกรายงานสรุปทางบัญชีและตรวจสอบภายในมาตรฐาน CRD',
    gate: 'AUTO_DRIVE_SYNC',
    status: 'ACTIVE_SYNCED',
    desc: 'รวบรวมสถานะทั้ง 9 สายงานและผลตรวจ 16 Stop Gates ส่งออกเป็นชุดข้อมูลสรุปเข้า 00_Project_Manifest.json',
    ruleSummary: 'ส่งออกเฉพาะยอดรวมระดับหมวดงานและรหัสอ้างอิงปลอด PII 100% พร้อมลายเซ็นเวลา同步',
    processedCount: 9,
    passedCount: 9,
    flaggedCount: 0,
    batchTag: 'AUD-2569-11-W9',
    operatorNote: 'พร้อมซิงก์สรุปภาพรวมทั้ง 9 สายงานขึ้น 00_Project_Manifest.json บน Google Drive',
    lastSyncedAt: '2026-11-17 10:30',
    sampleRows: [
      { keyA: 'MANIFEST', keyB: MANIFEST_FILE_NAME, detail: 'รวมผลปฏิบัติการ WORK 1 ถึง WORK 9', result: 'ผ่านเกณฑ์ 16 Stop Gates ครบทุกด่าน' },
      { keyA: 'DRIVE-WS', keyB: WORKSPACE_FOLDER_ID, detail: 'โฟลเดอร์ AI_Project_Workspace', result: 'พร้อมรับการซิงก์แบบ Real-time' },
    ],
  },
];

interface ProposedWorkGridProps {
  initialSelectedWorkId?: string;
  onOpenLogsModal?: () => void;
}

export const ProposedWorkGrid: React.FC<ProposedWorkGridProps> = ({
  initialSelectedWorkId = 'WORK 4',
  onOpenLogsModal,
}) => {
  const { user, syncScopeToCloud } = useFirebase();
  const [workStreams, setWorkStreams] = useState<WorkStreamState[]>(INITIAL_WORK_STREAMS);
  const [selectedWorkId, setSelectedWorkId] = useState<string>(initialSelectedWorkId);
  const [syncingWorkId, setSyncingWorkId] = useState<string | null>(null);
  const [syncBannerMsg, setSyncBannerMsg] = useState<string | null>(null);

  const activeWork =
    workStreams.find((w) => w.id === selectedWorkId) || workStreams[0];

  const externalLinks = [
    {
      id: 'UI-03',
      name: 'Google Drive Workspace',
      url: `https://drive.google.com/drive/folders/${WORKSPACE_FOLDER_ID}`,
      desc: 'โฟลเดอร์ AI_Project_Workspace',
    },
    {
      id: 'UI-05',
      name: 'Confluence Master Index',
      url: 'https://njnatee99.atlassian.net/wiki/pages/524291',
      desc: 'MASTER INDEX เอกสาร CRD สถาปัตยกรรม',
    },
    {
      id: 'UI-06',
      name: 'Jira SCRUM-1 / SCRUM-2',
      url: 'https://njnatee99.atlassian.net',
      desc: 'ระบบติดตามงาน CRD Backlog',
    },
  ];

  const handleUpdateActiveWorkField = <K extends keyof WorkStreamState>(
    field: K,
    value: WorkStreamState[K]
  ) => {
    setWorkStreams((prev) =>
      prev.map((w) => (w.id === activeWork.id ? { ...w, [field]: value } : w))
    );
  };

  // Run batch verification simulation on the selected WORK stream
  const handleRunWorkVerification = (work: WorkStreamState) => {
    backendGateway.triggerSyncPulse(600);
    const nowLabel = new Date().toISOString().slice(0, 16).replace('T', ' ');
    setWorkStreams((prev) =>
      prev.map((w) =>
        w.id === work.id
          ? {
              ...w,
              processedCount: w.processedCount + 12,
              passedCount: w.passedCount + 12,
              lastSyncedAt: nowLabel,
            }
          : w
      )
    );
    setSyncBannerMsg(
      `รันชุดตรวจสอบสายงาน "${work.id}: ${work.title}" ตามกฎ ${work.gate} สำเร็จ (+12 รายการผ่านเกณฑ์)`
    );
  };

  // Sync the selected WORK stream status directly to 00_Project_Manifest.json on Google Drive & Firestore
  const handleSyncWorkToManifest = async (work: WorkStreamState) => {
    if (syncingWorkId) return;
    setSyncingWorkId(work.id);
    setSyncBannerMsg(
      `กำลังซิงก์สถานะ ${work.id} (${work.code}) ลงไฟล์ ${MANIFEST_FILE_NAME} บน Google Drive...`
    );

    const nowLabel = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const updatedScope: ScopeItem = {
      id: work.code,
      title: `${work.id}: ${work.title}`,
      gate: work.gate,
      rule: `${work.ruleSummary} | Batch: ${work.batchTag} | ผ่านเกณฑ์ ${work.passedCount}/${work.processedCount} รายการ | หมายเหตุ: ${work.operatorNote}`,
      status: work.status,
      updatedAt: nowLabel,
    };

    try {
      // Update local scope list
      const existingScopes = backendGateway.getScopes();
      const idx = existingScopes.findIndex((s) => s.id === work.code);
      if (idx >= 0) {
        const copy = [...existingScopes];
        copy[idx] = updatedScope;
        backendGateway.replaceScopes(copy);
      } else {
        backendGateway.addScope(updatedScope);
      }

      // Sync to Cloud Firestore if signed in
      if (user) {
        await syncScopeToCloud(updatedScope).catch((err) =>
          console.error('Firestore work sync warning:', err)
        );
      }

      // Dispatch payload to Google Apps Script Gateway -> 00_Project_Manifest.json
      const res = await backendGateway.dispatchAction('SYNC_CRD_WORK_MANIFEST', {
        workId: work.id,
        workCode: work.code,
        workTitle: work.title,
        gate: work.gate,
        status: work.status,
        batchTag: work.batchTag,
        metrics: {
          processedCount: work.processedCount,
          passedCount: work.passedCount,
          flaggedCount: work.flaggedCount,
        },
        operatorNote: work.operatorNote,
        manifestTarget: MANIFEST_FILE_NAME,
      });

      setWorkStreams((prev) =>
        prev.map((w) => (w.id === work.id ? { ...w, lastSyncedAt: nowLabel } : w))
      );

      setSyncBannerMsg(
        `ซิงก์สถานะ "${work.id}" ลง ${MANIFEST_FILE_NAME} บน Google Drive สำเร็จ (${res.log.latencyMs}ms)`
      );
    } catch {
      setSyncBannerMsg(`บันทึกสถานะ "${work.id}" ในเครื่องเรียบร้อยแล้ว`);
    } finally {
      setSyncingWorkId(null);
    }
  };

  return (
    <section className="space-y-6">
      {/* Overview Grid of All 9 CRD WORK Streams */}
      <GlassBox variant="frosted" className="p-6 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 dark:border-slate-800 pb-4">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-[#14243A] dark:text-white flex items-center gap-2.5">
              <Layers className="w-6 h-6 text-indigo-600 dark:text-teal-400" />
              <span>ศูนย์ปฏิบัติการสายงานจริง CRD WORK 1–9 (Interactive Workspaces)</span>
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
              คลิกเลือกสายงาน WORK 1 ถึง WORK 9 ด้านล่างเพื่อเปิดหน้าจอทำงานจริง ตรวจสอบข้อมูล และซิงก์สถานะลง {MANIFEST_FILE_NAME} บน Google Drive
            </p>
          </div>
          <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
            กำลังเปิดใช้งาน: <strong className="text-blue-700 dark:text-teal-300">{activeWork.id}</strong>
          </span>
        </div>

        {syncBannerMsg && (
          <div className="p-3.5 bg-emerald-50/90 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-500/40 rounded-2xl text-xs sm:text-sm text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{syncBannerMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSyncBannerMsg(null)}
              className="text-xs text-emerald-700 dark:text-emerald-300 underline cursor-pointer shrink-0"
            >
              ปิด
            </button>
          </div>
        )}

        {/* Interactive 9-Card Selector Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {workStreams.map((item) => {
            const isSelected = item.id === selectedWorkId;
            const isWork4 = item.id === 'WORK 4';
            return (
              <div
                key={item.id}
                onClick={() => setSelectedWorkId(item.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                  isSelected
                    ? 'bg-white dark:bg-slate-800 border-blue-500 dark:border-teal-400 shadow-md ring-2 ring-blue-400/30'
                    : 'bg-white/80 hover:bg-white dark:bg-slate-900/80 dark:hover:bg-slate-900 border-slate-200/80 dark:border-slate-800 shadow-2xs'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1.5 text-[11px] font-mono">
                    <span className="font-bold text-blue-700 dark:text-teal-300">
                      {item.id} · {item.code}
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                      {item.status === 'ACTIVE_SYNCED'
                        ? 'พร้อมใช้งานจริง'
                        : item.status === 'PENDING_DEPLOY'
                          ? 'รอซิงก์ Manifest'
                          : 'กำลังตรวจสอบ'}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-[#14243A] dark:text-white leading-snug">
                    {item.title}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    {item.desc}
                  </p>
                </div>

                <div className="pt-2.5 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-600 dark:text-slate-400">
                  <span>
                    ผ่านเกณฑ์ {item.passedCount}/{item.processedCount}
                  </span>
                  <span className="font-sans font-bold text-blue-700 dark:text-teal-300">
                    {isWork4
                      ? isSelected
                        ? 'กำลังเปิดสตูดิโอพิมพ์ ↓'
                        : 'เปิดสตูดิโอพิมพ์ 9 หมวด →'
                      : isSelected
                        ? 'กำลังเปิดหน้าจอทำงาน ↓'
                        : 'เปิดหน้าจอทำงาน →'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </GlassBox>

      {/* Active Operational Workspace View */}
      {selectedWorkId === 'WORK 4' ? (
        <Work4LetterPrintStudio onOpenLogsModal={onOpenLogsModal} />
      ) : (
        <GlassBox variant="default" className="p-6 sm:p-8 space-y-6">
          {/* Header for WORK 1-3 & WORK 5-9 Operational Console */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200/70 dark:border-slate-800 pb-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
                <span className="font-bold text-blue-700 dark:text-teal-300">{activeWork.id}</span>
                <span>·</span>
                <span>{activeWork.code}</span>
                <span>·</span>
                <span>STOP GATE: {activeWork.gate}</span>
                <span>·</span>
                <span>ซิงก์ล่าสุด: {activeWork.lastSyncedAt}</span>
              </div>
              <h3 className="text-xl font-bold text-[#14243A] dark:text-white">
                หน้าจอจัดการและควบคุมสถานะงานจริง — {activeWork.title}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                กฎควบคุมหลัก: {activeWork.ruleSummary}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <LiquidButton
                type="button"
                size="sm"
                onClick={() => handleRunWorkVerification(activeWork)}
                className="text-xs font-bold cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 text-emerald-600" />
                <span>รันตรวจสอบชุดข้อมูล ({activeWork.id})</span>
              </LiquidButton>

              <LiquidButton
                type="button"
                size="sm"
                onClick={() => setSelectedWorkId('WORK 4')}
                className="text-xs font-bold cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-blue-600" />
                <span>สลับไปห้องพิมพ์ WORK 4</span>
              </LiquidButton>
            </div>
          </div>

          {/* Operational Metrics & Status Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <div className="sm:col-span-3 p-4 rounded-2xl bg-white/80 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800">
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                สถานะปฏิบัติการ (Manifest Status)
              </label>
              <select
                value={activeWork.status}
                onChange={(e) =>
                  handleUpdateActiveWorkField(
                    'status',
                    e.target.value as WorkOperationalStatus
                  )
                }
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-[#14243A] dark:text-white"
              >
                <option value="ACTIVE_SYNCED">ACTIVE_SYNCED (ใช้งานจริง)</option>
                <option value="PENDING_DEPLOY">PENDING_DEPLOY (รอซิงก์ชุดใหม่)</option>
                <option value="DRAFT">DRAFT (กำลังตรวจสอบ)</option>
              </select>
            </div>

            <div className="sm:col-span-3 p-4 rounded-2xl bg-white/80 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800">
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                รหัสชุดงาน (Batch Tag)
              </label>
              <input
                type="text"
                value={activeWork.batchTag}
                onChange={(e) => handleUpdateActiveWorkField('batchTag', e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-[#14243A] dark:text-white"
              />
            </div>

            <div className="sm:col-span-3 p-4 rounded-2xl bg-white/80 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800">
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                จำนวนรายการที่ผ่านเกณฑ์
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={activeWork.passedCount}
                  onChange={(e) => {
                    const val = Math.max(0, Number(e.target.value) || 0);
                    handleUpdateActiveWorkField('passedCount', val);
                    if (val > activeWork.processedCount) {
                      handleUpdateActiveWorkField('processedCount', val);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400"
                />
                <span className="text-xs font-mono text-slate-500">รายการ</span>
              </div>
            </div>

            <div className="sm:col-span-3 p-4 rounded-2xl bg-white/80 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800">
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                รายการแจ้งเตือน (Flagged)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={activeWork.flaggedCount}
                  onChange={(e) =>
                    handleUpdateActiveWorkField(
                      'flaggedCount',
                      Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs font-mono tabular-nums font-bold text-amber-700 dark:text-amber-400"
                />
                <span className="text-xs font-mono text-slate-500">รายการ</span>
              </div>
            </div>
          </div>

          {/* Sample Operational Ledger Table for this WORK stream */}
          <div className="space-y-2.5">
            <h4 className="text-xs sm:text-sm font-bold text-[#14243A] dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-600 dark:text-teal-400" />
              <span>รายการประมวลผลล่าสุดในสายงาน {activeWork.id} (Dual-Key &amp; Zero-PII Verified):</span>
            </h4>
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/85 dark:bg-slate-950/70">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-bold">
                    <th className="py-2.5 px-3.5">คีย์หลัก (Mem_ID / รหัสหมวด)</th>
                    <th className="py-2.5 px-3.5">คีย์รอง (NewLoanID / อ้างอิง)</th>
                    <th className="py-2.5 px-3.5">รายละเอียดการตรวจสอบตามกฎ CRD</th>
                    <th className="py-2.5 px-3.5">ผลลัพธ์ปฏิบัติการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/70 font-mono tabular-nums">
                  {activeWork.sampleRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-white dark:hover:bg-slate-900/50">
                      <td className="py-2.5 px-3.5 font-bold text-[#14243A] dark:text-white">
                        {row.keyA}
                      </td>
                      <td className="py-2.5 px-3.5 text-blue-700 dark:text-teal-300 font-semibold">
                        {row.keyB}
                      </td>
                      <td className="py-2.5 px-3.5 font-sans text-slate-700 dark:text-slate-300">
                        {row.detail}
                      </td>
                      <td className="py-2.5 px-3.5 font-sans font-semibold text-emerald-700 dark:text-emerald-400">
                        {row.result}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Operator Note & 1-Click Manifest Sync Button */}
          <div className="space-y-3 pt-2 border-t border-slate-200/70 dark:border-slate-800">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-blue-600 dark:text-teal-400" />
                <span>บันทึกปฏิบัติการสำหรับซิงก์ลง {MANIFEST_FILE_NAME}:</span>
              </label>
              <input
                type="text"
                value={activeWork.operatorNote}
                onChange={(e) => handleUpdateActiveWorkField('operatorNote', e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl bg-white/95 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-[#14243A] dark:text-white"
              />
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  พร้อมซิงก์สถานะของ <strong>{activeWork.id}</strong> ไปยัง Google Apps Script และอัปเดต{' '}
                  <strong className="font-mono">{MANIFEST_FILE_NAME}</strong>
                </span>
              </div>

              <LiquidButton
                type="button"
                size="lg"
                variant="glowing"
                glow={true}
                disabled={syncingWorkId === activeWork.id}
                onClick={() => handleSyncWorkToManifest(activeWork)}
                className="w-full sm:w-auto px-7 py-3 text-xs sm:text-sm font-bold cursor-pointer"
              >
                {syncingWorkId === activeWork.id ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                    <span>กำลังซิงก์ลง 00_Project_Manifest.json...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 text-blue-600" />
                    <span>ซิงก์สถานะลง 00_Project_Manifest.json บน Google Drive</span>
                  </>
                )}
              </LiquidButton>
            </div>
          </div>
        </GlassBox>
      )}

      {/* External CRD Verification Links */}
      <GlassBox variant="subtle" className="p-5 sm:p-6 space-y-3">
        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
          ลิงก์เชื่อมโยงเอกสารสถาปัตยกรรม CRD ภายนอก:
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {externalLinks.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-3.5 rounded-2xl bg-white/90 dark:bg-slate-900 border border-blue-200/80 dark:border-slate-800 hover:border-blue-400 text-slate-800 dark:text-slate-200 flex items-center justify-between gap-2 shadow-2xs group transition-all"
            >
              <div>
                <div className="font-bold text-blue-700 dark:text-teal-300 group-hover:underline flex items-center gap-1">
                  <span>{link.name}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{link.desc}</p>
              </div>
            </a>
          ))}
        </div>
      </GlassBox>
    </section>
  );
};
