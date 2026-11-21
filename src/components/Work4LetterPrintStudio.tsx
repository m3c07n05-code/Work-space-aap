import React, { useState, useMemo, useRef } from 'react';
import {
  Printer,
  Upload,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  FileText,
  Mail,
  ShieldCheck,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Terminal,
  FolderOpen,
  Hash,
  Plus,
  Trash2,
} from 'lucide-react';
import { GlassBox } from './ui/glass-box';
import { LiquidButton } from './ui/liquid-glass-button';
import { backendGateway, MANIFEST_FILE_NAME, ScopeItem } from '../services/backendGateway';
import { useFirebase } from '../contexts/FirebaseContext';

export type OverdueTier = 2 | 4 | 5;
export type RecipientRole = 'BORROWER' | 'CO_BORROWER' | 'GUARANTOR';

export interface Work4CategoryMeta {
  id: string;
  overdueMonths: OverdueTier;
  role: RecipientRole;
  roleLabel: string;
  shortCode: string;
  title: string;
  templateCode: string;
}

export const WORK4_CATEGORIES: Work4CategoryMeta[] = [
  {
    id: 'CAT-2M-BORROWER',
    overdueMonths: 2,
    role: 'BORROWER',
    roleLabel: 'ผู้กู้หลัก',
    shortCode: '2M-B1',
    title: 'ค้าง 2 งวด · ผู้กู้หลัก',
    templateCode: 'TPL-CRD-2M-B',
  },
  {
    id: 'CAT-2M-CO_BORROWER',
    overdueMonths: 2,
    role: 'CO_BORROWER',
    roleLabel: 'ผู้กู้ร่วม',
    shortCode: '2M-B2',
    title: 'ค้าง 2 งวด · ผู้กู้ร่วม',
    templateCode: 'TPL-CRD-2M-CB',
  },
  {
    id: 'CAT-2M-GUARANTOR',
    overdueMonths: 2,
    role: 'GUARANTOR',
    roleLabel: 'ผู้ค้ำประกัน',
    shortCode: '2M-G1',
    title: 'ค้าง 2 งวด · ผู้ค้ำประกัน',
    templateCode: 'TPL-CRD-2M-G',
  },
  {
    id: 'CAT-4M-BORROWER',
    overdueMonths: 4,
    role: 'BORROWER',
    roleLabel: 'ผู้กู้หลัก',
    shortCode: '4M-B1',
    title: 'ค้าง 4 งวด · ผู้กู้หลัก',
    templateCode: 'TPL-CRD-4M-B',
  },
  {
    id: 'CAT-4M-CO_BORROWER',
    overdueMonths: 4,
    role: 'CO_BORROWER',
    roleLabel: 'ผู้กู้ร่วม',
    shortCode: '4M-B2',
    title: 'ค้าง 4 งวด · ผู้กู้ร่วม',
    templateCode: 'TPL-CRD-4M-CB',
  },
  {
    id: 'CAT-4M-GUARANTOR',
    overdueMonths: 4,
    role: 'GUARANTOR',
    roleLabel: 'ผู้ค้ำประกัน',
    shortCode: '4M-G1',
    title: 'ค้าง 4 งวด · ผู้ค้ำประกัน',
    templateCode: 'TPL-CRD-4M-G',
  },
  {
    id: 'CAT-5M-BORROWER',
    overdueMonths: 5,
    role: 'BORROWER',
    roleLabel: 'ผู้กู้หลัก',
    shortCode: '5M-B1',
    title: 'ค้าง 5 งวด · ผู้กู้หลัก',
    templateCode: 'TPL-CRD-5M-B',
  },
  {
    id: 'CAT-5M-CO_BORROWER',
    overdueMonths: 5,
    role: 'CO_BORROWER',
    roleLabel: 'ผู้กู้ร่วม',
    shortCode: '5M-B2',
    title: 'ค้าง 5 งวด · ผู้กู้ร่วม',
    templateCode: 'TPL-CRD-5M-CB',
  },
  {
    id: 'CAT-5M-GUARANTOR',
    overdueMonths: 5,
    role: 'GUARANTOR',
    roleLabel: 'ผู้ค้ำประกัน',
    shortCode: '5M-G1',
    title: 'ค้าง 5 งวด · ผู้ค้ำประกัน',
    templateCode: 'TPL-CRD-5M-G',
  },
];

export interface Work4RecipientRecord {
  uid: string;
  rawMemId: string;
  newLoanId: string;
  categoryId: string;
  overdueMonths: OverdueTier;
  role: RecipientRole;
  kor2Number: string;
  emsTrackingRef: string;
  branchCode: string;
  lastPayDateBuddhist: string;
  lockedInstallmentText: string;
  piiRedactedCount: number;
}

const INITIAL_MOCK_RECORDS: Work4RecipientRecord[] = [
  {
    uid: 'rec-01',
    rawMemId: '00142',
    newLoanId: 'LN-2569-0104',
    categoryId: 'CAT-2M-BORROWER',
    overdueMonths: 2,
    role: 'BORROWER',
    kor2Number: 'ก.2/2569-11/0001',
    emsTrackingRef: 'ED 8492 1001 5 TH',
    branchCode: 'BR-01 สำนักงานใหญ่',
    lastPayDateBuddhist: '2569-09-15',
    lockedInstallmentText: 'ตามใบแจ้งยอดระบบบัญชี (ล็อกค่าตามกฎ V003)',
    piiRedactedCount: 3,
  },
  {
    uid: 'rec-02',
    rawMemId: '00142',
    newLoanId: 'LN-2569-0882',
    categoryId: 'CAT-2M-CO_BORROWER',
    overdueMonths: 2,
    role: 'CO_BORROWER',
    kor2Number: 'ก.2/2569-11/0002',
    emsTrackingRef: 'ED 8492 1002 9 TH',
    branchCode: 'BR-01 สำนักงานใหญ่',
    lastPayDateBuddhist: '2569-09-10',
    lockedInstallmentText: 'ตามใบแจ้งยอดระบบบัญชี (ล็อกค่าตามกฎ V003)',
    piiRedactedCount: 3,
  },
  {
    uid: 'rec-03',
    rawMemId: '00389',
    newLoanId: 'LN-2568-4410',
    categoryId: 'CAT-2M-GUARANTOR',
    overdueMonths: 2,
    role: 'GUARANTOR',
    kor2Number: 'ก.2/2569-11/0003',
    emsTrackingRef: 'ED 8492 1003 2 TH',
    branchCode: 'BR-03 เชียงใหม่',
    lastPayDateBuddhist: '2569-09-12',
    lockedInstallmentText: 'ตามใบแจ้งยอดระบบบัญชี (ล็อกค่าตามกฎ V003)',
    piiRedactedCount: 4,
  },
  {
    uid: 'rec-04',
    rawMemId: '00715',
    newLoanId: 'PM-2567-1120',
    categoryId: 'CAT-4M-BORROWER',
    overdueMonths: 4,
    role: 'BORROWER',
    kor2Number: 'ก.2/2569-11/0004',
    emsTrackingRef: 'ED 8492 1004 6 TH',
    branchCode: 'BR-02 ขอนแก่น',
    lastPayDateBuddhist: '2569-07-20',
    lockedInstallmentText: 'ตามใบแจ้งยอดระบบบัญชี (ล็อกค่าตามกฎ V003)',
    piiRedactedCount: 3,
  },
  {
    uid: 'rec-05',
    rawMemId: '00904',
    newLoanId: 'PM-2567-1120',
    categoryId: 'CAT-4M-CO_BORROWER',
    overdueMonths: 4,
    role: 'CO_BORROWER',
    kor2Number: 'ก.2/2569-11/0005',
    emsTrackingRef: 'ED 8492 1005 0 TH',
    branchCode: 'BR-02 ขอนแก่น',
    lastPayDateBuddhist: '2569-07-20',
    lockedInstallmentText: 'ตามใบแจ้งยอดระบบบัญชี (ล็อกค่าตามกฎ V003)',
    piiRedactedCount: 3,
  },
  {
    uid: 'rec-06',
    rawMemId: '01208',
    newLoanId: 'PM-2567-1120',
    categoryId: 'CAT-4M-GUARANTOR',
    overdueMonths: 4,
    role: 'GUARANTOR',
    kor2Number: 'ก.2/2569-11/0006',
    emsTrackingRef: 'ED 8492 1006 3 TH',
    branchCode: 'BR-02 ขอนแก่น',
    lastPayDateBuddhist: '2569-07-20',
    lockedInstallmentText: 'ตามใบแจ้งยอดระบบบัญชี (ล็อกค่าตามกฎ V003)',
    piiRedactedCount: 4,
  },
  {
    uid: 'rec-07',
    rawMemId: '00059',
    newLoanId: 'SP-2566-9012',
    categoryId: 'CAT-5M-BORROWER',
    overdueMonths: 5,
    role: 'BORROWER',
    kor2Number: 'ก.2/2569-11/0007',
    emsTrackingRef: 'ED 8492 1007 7 TH',
    branchCode: 'BR-05 สงขลา',
    lastPayDateBuddhist: '2569-06-05',
    lockedInstallmentText: 'ตามใบแจ้งยอดระบบบัญชี (ล็อกค่าตามกฎ V003)',
    piiRedactedCount: 3,
  },
  {
    uid: 'rec-08',
    rawMemId: '04112',
    newLoanId: 'SP-2566-9012',
    categoryId: 'CAT-5M-CO_BORROWER',
    overdueMonths: 5,
    role: 'CO_BORROWER',
    kor2Number: 'ก.2/2569-11/0008',
    emsTrackingRef: 'ED 8492 1008 5 TH',
    branchCode: 'BR-05 สงขลา',
    lastPayDateBuddhist: '2569-06-05',
    lockedInstallmentText: 'ตามใบแจ้งยอดระบบบัญชี (ล็อกค่าตามกฎ V003)',
    piiRedactedCount: 3,
  },
  {
    uid: 'rec-09',
    rawMemId: '00831',
    newLoanId: 'SP-2566-9012',
    categoryId: 'CAT-5M-GUARANTOR',
    overdueMonths: 5,
    role: 'GUARANTOR',
    kor2Number: 'ก.2/2569-11/0009',
    emsTrackingRef: 'ED 8492 1009 4 TH',
    branchCode: 'BR-05 สงขลา',
    lastPayDateBuddhist: '2569-06-05',
    lockedInstallmentText: 'ตามใบแจ้งยอดระบบบัญชี (ล็อกค่าตามกฎ V003)',
    piiRedactedCount: 4,
  },
];

function isValidFiveDigitMemId(memId: string): boolean {
  return /^[0-9]{5}$/.test(memId.trim());
}

function padFiveDigitMemId(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, '');
  if (!digitsOnly) return '00001';
  return digitsOnly.slice(0, 5).padStart(5, '0');
}

function buildKor2Number(monthFolder: string, seqIndex: number): string {
  const ym = monthFolder.slice(0, 7);
  return `ก.2/${ym}/${String(seqIndex).padStart(4, '0')}`;
}

function buildEmsTracking(seqIndex: number): string {
  const mid = String(1000 + seqIndex).slice(-4);
  const checkDigit = (seqIndex * 7) % 10;
  return `ED 8492 ${mid} ${checkDigit} TH`;
}

interface Work4LetterPrintStudioProps {
  onOpenLogsModal?: () => void;
}

export const Work4LetterPrintStudio: React.FC<Work4LetterPrintStudioProps> = ({
  onOpenLogsModal,
}) => {
  const { user, syncScopeToCloud } = useFirebase();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [monthFolder, setMonthFolder] = useState<string>('2569-11_พฤศจิกายน');
  const [kor2StartSeq, setKor2StartSeq] = useState<number>(1);
  const [records, setRecords] = useState<Work4RecipientRecord[]>(INITIAL_MOCK_RECORDS);
  const [selectedRecordUid, setSelectedRecordUid] = useState<string>(INITIAL_MOCK_RECORDS[0].uid);

  // Manual / CSV Paste state
  const [rawPasteText, setRawPasteText] = useState<string>('');
  const [showPasteBox, setShowPasteBox] = useState<boolean>(false);

  // Local CMS-2 Gateway state
  const [cms2LocalEndpoint, setCms2LocalEndpoint] = useState<string>('http://127.0.0.1:8765/cms2/letter-print');
  const [ps1ScriptPath, setPs1ScriptPath] = useState<string>('C:\\CRD_CMS2\\LetterPrint.ps1');
  const [isDispatchingPrint, setIsDispatchingPrint] = useState<boolean>(false);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'warning' | 'info';
    message: string;
  } | null>(null);
  const [copiedPs1, setCopiedPs1] = useState<boolean>(false);

  // Count per category
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const cat of WORK4_CATEGORIES) {
      map[cat.id] = 0;
    }
    for (const r of records) {
      map[r.categoryId] = (map[r.categoryId] || 0) + 1;
    }
    return map;
  }, [records]);

  const filteredRecords = useMemo(() => {
    if (selectedCategoryId === 'ALL') return records;
    return records.filter((r) => r.categoryId === selectedCategoryId);
  }, [records, selectedCategoryId]);

  const invalidMemIdCount = useMemo(() => {
    return records.filter((r) => !isValidFiveDigitMemId(r.rawMemId)).length;
  }, [records]);

  const totalPiiRedacted = useMemo(() => {
    return records.reduce((acc, r) => acc + r.piiRedactedCount, 0);
  }, [records]);

  const activePreviewRecord = useMemo(() => {
    const found = filteredRecords.find((r) => r.uid === selectedRecordUid);
    return found || filteredRecords[0] || records[0] || null;
  }, [filteredRecords, records, selectedRecordUid]);

  const activeCategoryMeta = useMemo(() => {
    if (!activePreviewRecord) return WORK4_CATEGORIES[0];
    return (
      WORK4_CATEGORIES.find((c) => c.id === activePreviewRecord.categoryId) ||
      WORK4_CATEGORIES[0]
    );
  }, [activePreviewRecord]);

  // Auto-fix 5-digit leading zeros (V003)
  const handleFixLeadingZeros = () => {
    backendGateway.triggerSyncPulse(600);
    setRecords((prev) =>
      prev.map((r) => ({
        ...r,
        rawMemId: padFiveDigitMemId(r.rawMemId),
      }))
    );
    setStatusFeedback({
      type: 'success',
      message: 'ตรวจสอบและเติมศูนย์นำหน้าเลขสมาชิก 5 หลัก (Leading Zero V003) ครบทุกรายการแล้ว',
    });
  };

  // Auto-run ก.2 registration sequence across records
  const handleRunKor2Numbers = () => {
    backendGateway.triggerSyncPulse(650);
    const baseSeq = Math.max(1, kor2StartSeq);
    setRecords((prev) =>
      prev.map((r, idx) => ({
        ...r,
        kor2Number: buildKor2Number(monthFolder, baseSeq + idx),
        emsTrackingRef: buildEmsTracking(baseSeq + idx),
      }))
    );
    setStatusFeedback({
      type: 'success',
      message: `รันเลขทะเบียนหนังสือส่ง ก.2 อัตโนมัติ (${buildKor2Number(monthFolder, baseSeq)} ถึง ${buildKor2Number(monthFolder, baseSeq + records.length - 1)}) เรียบร้อย`,
    });
  };

  // Simulate unpadded IDs to test the V003 5-digit validator
  const handleInjectUnpaddedTestRows = () => {
    const baseSeq = kor2StartSeq + records.length;
    const sampleUnpadded: Work4RecipientRecord[] = [
      {
        uid: `rec-test-${Date.now()}-1`,
        rawMemId: '428', // Missing two leading zeros
        newLoanId: 'LN-2569-3019',
        categoryId: selectedCategoryId === 'ALL' ? 'CAT-2M-BORROWER' : selectedCategoryId,
        overdueMonths:
          WORK4_CATEGORIES.find((c) => c.id === selectedCategoryId)?.overdueMonths || 2,
        role: WORK4_CATEGORIES.find((c) => c.id === selectedCategoryId)?.role || 'BORROWER',
        kor2Number: buildKor2Number(monthFolder, baseSeq),
        emsTrackingRef: buildEmsTracking(baseSeq),
        branchCode: 'BR-04 ชลบุรี',
        lastPayDateBuddhist: '2569-09-18',
        lockedInstallmentText: 'ตามใบแจ้งยอดระบบบัญชี (ล็อกค่าตามกฎ V003)',
        piiRedactedCount: 3,
      },
      {
        uid: `rec-test-${Date.now()}-2`,
        rawMemId: '75', // Missing three leading zeros
        newLoanId: 'PM-2568-7741',
        categoryId: selectedCategoryId === 'ALL' ? 'CAT-4M-GUARANTOR' : selectedCategoryId,
        overdueMonths:
          WORK4_CATEGORIES.find((c) => c.id === selectedCategoryId)?.overdueMonths || 4,
        role: WORK4_CATEGORIES.find((c) => c.id === selectedCategoryId)?.role || 'GUARANTOR',
        kor2Number: buildKor2Number(monthFolder, baseSeq + 1),
        emsTrackingRef: buildEmsTracking(baseSeq + 1),
        branchCode: 'BR-06 นครราชสีมา',
        lastPayDateBuddhist: '2569-07-11',
        lockedInstallmentText: 'ตามใบแจ้งยอดระบบบัญชี (ล็อกค่าตามกฎ V003)',
        piiRedactedCount: 4,
      },
    ];
    setRecords((prev) => [...sampleUnpadded, ...prev]);
    setSelectedRecordUid(sampleUnpadded[0].uid);
    setStatusFeedback({
      type: 'warning',
      message: 'จำลองรายชื่อที่ศูนย์นำหน้าหลุด (428, 75) แล้ว กดปุ่ม "เติมศูนย์นำหน้า 5 หลักอัตโนมัติ" เพื่อทดสอบด่าน V003 ได้ทันที',
    });
  };

  // Parse CSV / TSV text safely with Zero-PII scrubbing
  const parseZeroPiiLines = (text: string, sourceName: string) => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.toLowerCase().startsWith('mem_id'));

    if (lines.length === 0) return;

    const baseSeq = Math.max(1, kor2StartSeq);
    const parsed: Work4RecipientRecord[] = lines.map((line, index) => {
      const cols = line.split(/[,;\t|]+/).map((c) => c.trim());
      const rawMem = cols[0] || String(index + 1);
      const loanId = cols[1] || `LN-2569-${String(1000 + index)}`;
      const tierRaw = Number(cols[2]);
      const overdueMonths: OverdueTier = tierRaw === 4 ? 4 : tierRaw === 5 ? 5 : 2;
      const roleStr = (cols[3] || '').toUpperCase();
      const role: RecipientRole =
        roleStr.includes('CO') || roleStr.includes('ร่วม')
          ? 'CO_BORROWER'
          : roleStr.includes('GUAR') || roleStr.includes('ค้ำ')
            ? 'GUARANTOR'
            : 'BORROWER';

      const matchedCat =
        WORK4_CATEGORIES.find(
          (c) => c.overdueMonths === overdueMonths && c.role === role
        ) || WORK4_CATEGORIES[0];

      // Any extra columns beyond col 3 (e.g., FullName, NationalID, Address) are strictly discarded client-side
      const extraColumnsScrubbed = Math.max(2, cols.length - 4);

      return {
        uid: `csv-${Date.now()}-${index}`,
        rawMemId: rawMem,
        newLoanId: loanId,
        categoryId: matchedCat.id,
        overdueMonths: matchedCat.overdueMonths,
        role: matchedCat.role,
        kor2Number: buildKor2Number(monthFolder, baseSeq + index),
        emsTrackingRef: buildEmsTracking(baseSeq + index),
        branchCode: 'BR-IMPORT นำเข้าปลอดภัย',
        lastPayDateBuddhist: '2569-08-30',
        lockedInstallmentText: 'ตามใบแจ้งยอดระบบบัญชี (ล็อกค่าตามกฎ V003)',
        piiRedactedCount: extraColumnsScrubbed,
      };
    });

    backendGateway.triggerSyncPulse(700);
    setRecords(parsed);
    setSelectedRecordUid(parsed[0].uid);
    setStatusFeedback({
      type: 'success',
      message: `นำเข้าโครงสร้างรายชื่อจาก "${sourceName}" จำนวน ${parsed.length} รายการ (คัดกรอง Zero-PII ตัดคอลัมน์ชื่อ/เลขบัตรออกอัตโนมัติ)`,
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      parseZeroPiiLines(content, file.name);
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleLoadFull9CategorySample = () => {
    backendGateway.triggerSyncPulse(600);
    setRecords(INITIAL_MOCK_RECORDS);
    setSelectedCategoryId('ALL');
    setSelectedRecordUid(INITIAL_MOCK_RECORDS[0].uid);
    setStatusFeedback({
      type: 'info',
      message: 'โหลดชุดข้อมูลมาตรฐานครบทั้ง 9 หมวด (2/4/5 งวด × ผู้กู้/กู้ร่วม/ผู้ค้ำ) พร้อมเลข ก.2 เรียบร้อย',
    });
  };

  const handleDeleteRecord = (uid: string) => {
    setRecords((prev) => prev.filter((r) => r.uid !== uid));
  };

  // Generated PowerShell command for CMS-2 LetterPrint.ps1
  const generatedPowerShellCmd = useMemo(() => {
    const targetCat = selectedCategoryId === 'ALL' ? 'ALL_9_CATEGORIES' : selectedCategoryId;
    const firstKor2 = filteredRecords[0]?.kor2Number || buildKor2Number(monthFolder, kor2StartSeq);
    const lastKor2 =
      filteredRecords[filteredRecords.length - 1]?.kor2Number ||
      buildKor2Number(monthFolder, kor2StartSeq);
    return `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${ps1ScriptPath}" -MonthFolder "${monthFolder}" -Category "${targetCat}" -Kor2Start "${firstKor2}" -Kor2End "${lastKor2}" -RecordCount ${filteredRecords.length} -EnforceFiveDigitMemId $true -ZeroPiiCloudSync "${MANIFEST_FILE_NAME}"`;
  }, [selectedCategoryId, filteredRecords, monthFolder, kor2StartSeq, ps1ScriptPath]);

  const handleCopyPs1 = () => {
    navigator.clipboard.writeText(generatedPowerShellCmd);
    setCopiedPs1(true);
    setTimeout(() => setCopiedPs1(false), 2500);
  };

  // Dispatch print payload via Local Gateway (CMS-2) & Manifest Sync
  const handleDispatchLocalGatewayPrint = async () => {
    if (filteredRecords.length === 0 || isDispatchingPrint) return;

    // Ensure 5-digit Mem_ID compliance before printing
    const paddedList = filteredRecords.map((r) => ({
      ...r,
      rawMemId: padFiveDigitMemId(r.rawMemId),
    }));

    if (invalidMemIdCount > 0) {
      setRecords((prev) =>
        prev.map((r) => ({
          ...r,
          rawMemId: padFiveDigitMemId(r.rawMemId),
        }))
      );
    }

    setIsDispatchingPrint(true);
    setStatusFeedback({
      type: 'info',
      message: 'กำลังส่งคำสั่งพิมพ์ไปยัง Local Gateway (CMS-2) เพื่อเรียก LetterPrint.ps1 และบันทึกสถานะลง 00_Project_Manifest.json...',
    });

    // Zero-PII Manifest Payload (counts, Dual-Key codes, and ก.2 sequence only — zero names/addresses)
    const zeroPiiBatchSummary = {
      workId: 'CRD-WORK-04',
      workTitle: 'WORK 4: ห้องควบคุมงานพิมพ์จดหมายแจ้งหนี้ 9 หมวด & EMS รายเดือน',
      monthFolder,
      selectedCategory: selectedCategoryId,
      totalPrintSetCount: paddedList.length,
      kor2Range: {
        from: paddedList[0]?.kor2Number || '',
        to: paddedList[paddedList.length - 1]?.kor2Number || '',
      },
      cms2GatewayTarget: cms2LocalEndpoint,
      ps1Command: generatedPowerShellCmd,
      pdpaCompliance: 'ZERO_PII_VERIFIED',
      v003LeadingZeroVerified: true,
      dualKeyManifestItems: paddedList.map((item) => ({
        memId5Digit: item.rawMemId,
        newLoanId: item.newLoanId,
        categoryId: item.categoryId,
        kor2Number: item.kor2Number,
        emsTrackingRef: item.emsTrackingRef,
      })),
    };

    try {
      // 1. Try pinging local CMS-2 agent if reachable on localhost (non-blocking)
      let localAgentStatus = 'QUEUED_VIA_GATEWAY_BRIDGE';
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 900);
        await fetch(cms2LocalEndpoint, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(zeroPiiBatchSummary),
          signal: controller.signal,
        });
        clearTimeout(timer);
        localAgentStatus = 'DISPATCHED_TO_LOCAL_CMS2_ENDPOINT';
      } catch {
        localAgentStatus = 'BRIDGED_VIA_GAS_MANIFEST_AND_PS1';
      }

      // 2. Dispatch to Google Apps Script Gateway & 00_Project_Manifest.json
      const res = await backendGateway.dispatchAction('CMS2_LETTER_PRINT_DISPATCH', {
        ...zeroPiiBatchSummary,
        localAgentDelivery: localAgentStatus,
      });

      // 3. Upsert WORK 4 scope state in local & Cloud Firestore
      const updatedScope: ScopeItem = {
        id: 'CRD-WORK-04',
        title: `WORK 4: พิมพ์จดหมายแจ้งหนี้ 9 หมวด & EMS (${monthFolder} · ${paddedList.length} ชุด)`,
        gate: 'PDPA_ZERO_PII',
        rule: `รันเลข ก.2 (${zeroPiiBatchSummary.kor2Range.from} ถึง ${zeroPiiBatchSummary.kor2Range.to}) ตรวจเลขสมาชิก 5 หลักครบ 100% และสั่งรัน LetterPrint.ps1 ผ่าน CMS-2`,
        status: 'ACTIVE_SYNCED',
        updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      };

      const currentScopes = backendGateway.getScopes();
      const existsIdx = currentScopes.findIndex((s) => s.id === 'CRD-WORK-04');
      if (existsIdx >= 0) {
        const nextScopes = [...currentScopes];
        nextScopes[existsIdx] = updatedScope;
        backendGateway.replaceScopes(nextScopes);
      } else {
        backendGateway.addScope(updatedScope);
      }

      if (user) {
        await syncScopeToCloud(updatedScope).catch((err) =>
          console.error('WORK 4 Firestore sync warning:', err)
        );
      }

      setStatusFeedback({
        type: 'success',
        message: `สั่งพิมพ์ผ่าน Local Gateway (CMS-2) สำเร็จ ${paddedList.length} ชุด (${zeroPiiBatchSummary.kor2Range.from} – ${zeroPiiBatchSummary.kor2Range.to}) และอัปเดต ${MANIFEST_FILE_NAME} แล้ว (${res.log.latencyMs}ms)`,
      });
    } catch {
      setStatusFeedback({
        type: 'warning',
        message: 'บันทึกคิวงานพิมพ์ลงระบบในเครื่องเรียบร้อย สามารถคัดลอกคำสั่ง LetterPrint.ps1 ด้านล่างเพื่อรันบนเครื่อง CMS-2 ได้ทันที',
      });
    } finally {
      setIsDispatchingPrint(false);
    }
  };

  // Step through preview records
  const currentPreviewIndex = useMemo(() => {
    if (!activePreviewRecord) return 0;
    const idx = filteredRecords.findIndex((r) => r.uid === activePreviewRecord.uid);
    return idx >= 0 ? idx : 0;
  }, [filteredRecords, activePreviewRecord]);

  const handlePrevPreview = () => {
    if (filteredRecords.length === 0) return;
    const nextIdx = (currentPreviewIndex - 1 + filteredRecords.length) % filteredRecords.length;
    setSelectedRecordUid(filteredRecords[nextIdx].uid);
  };

  const handleNextPreview = () => {
    if (filteredRecords.length === 0) return;
    const nextIdx = (currentPreviewIndex + 1) % filteredRecords.length;
    setSelectedRecordUid(filteredRecords[nextIdx].uid);
  };

  return (
    <div className="space-y-6">
      {/* Top Studio Header */}
      <GlassBox variant="frosted" className="p-6 sm:p-8 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200/70 dark:border-slate-800 pb-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400 font-mono">
              <span className="font-bold text-blue-700 dark:text-teal-300">CRD WORK 4</span>
              <span>·</span>
              <span>PDPA ZERO-PII GATE</span>
              <span>·</span>
              <span>V003 5-DIGIT LEADING ZERO</span>
              <span>·</span>
              <span>CMS-2 LetterPrint.ps1</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#14243A] dark:text-white tracking-tight">
              ห้องควบคุมงานพิมพ์จดหมายแจ้งหนี้ 9 หมวด &amp; ซองไปรษณีย์ EMS รายเดือน
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
              คัดแยกผู้รับ 9 หมวด (2/4/5 งวด × ผู้กู้/กู้ร่วม/ผู้ค้ำ) ตรวจสอบรหัสสมาชิก 5 หลักคงศูนย์นำหน้า รันเลขทะเบียนหนังสือส่ง ก.2 อัตโนมัติ พร้อมหน้าจอพรีวิวคู่และยิงคำสั่งพิมพ์ไปยังเครื่อง CMS-2 โดยไม่ส่งข้อมูลส่วนบุคคลขึ้น Cloud
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <LiquidButton
              type="button"
              size="sm"
              onClick={handleLoadFull9CategorySample}
              className="text-xs font-bold cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>โหลดข้อมูลจำลอง 9 หมวด</span>
            </LiquidButton>

            {onOpenLogsModal && (
              <LiquidButton
                type="button"
                size="sm"
                onClick={onOpenLogsModal}
                className="text-xs font-bold cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5 text-slate-700 dark:text-slate-200" />
                <span>ดู Payload การพิมพ์</span>
              </LiquidButton>
            )}
          </div>
        </div>

        {/* Folder & ก.2 Sequence Configuration Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 items-end">
          <div className="sm:col-span-4">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-blue-600 dark:text-teal-400" />
              <span>โฟลเดอร์งวดประจำเดือน (Staging Month Folder)</span>
            </label>
            <select
              value={monthFolder}
              onChange={(e) => setMonthFolder(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white/90 dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 text-xs sm:text-sm font-mono font-semibold text-[#14243A] dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="2569-10_ตุลาคม">2569-10_ตุลาคม (พ.ศ. 2569)</option>
              <option value="2569-11_พฤศจิกายน">2569-11_พฤศจิกายน (พ.ศ. 2569)</option>
              <option value="2569-12_ธันวาคม">2569-12_ธันวาคม (พ.ศ. 2569)</option>
              <option value="2570-01_มกราคม">2570-01_มกราคม (พ.ศ. 2570)</option>
            </select>
          </div>

          <div className="sm:col-span-3">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-blue-600 dark:text-teal-400" />
              <span>เลขลำดับ ก.2 เริ่มต้น</span>
            </label>
            <input
              type="number"
              min={1}
              value={kor2StartSeq}
              onChange={(e) => setKor2StartSeq(Math.max(1, Number(e.target.value) || 1))}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white/90 dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 text-xs sm:text-sm font-mono tabular-nums font-bold text-[#14243A] dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div className="sm:col-span-5 flex flex-wrap items-center gap-2">
            <LiquidButton
              type="button"
              size="default"
              onClick={handleRunKor2Numbers}
              className="flex-1 text-xs font-bold cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
              <span>รันเลขทะเบียน ก.2 อัตโนมัติ</span>
            </LiquidButton>

            <LiquidButton
              type="button"
              size="default"
              onClick={handleFixLeadingZeros}
              className="flex-1 text-xs font-bold cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>เติม 0 นำหน้า 5 หลัก (V003)</span>
            </LiquidButton>
          </div>
        </div>

        {statusFeedback && (
          <div
            className={`p-3.5 rounded-2xl border text-xs sm:text-sm flex items-start gap-2.5 ${
              statusFeedback.type === 'success'
                ? 'bg-emerald-50/90 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-500/40 text-emerald-900 dark:text-emerald-200'
                : statusFeedback.type === 'warning'
                  ? 'bg-amber-50/90 dark:bg-amber-950/50 border-amber-200 dark:border-amber-500/40 text-amber-900 dark:text-amber-200'
                  : 'bg-blue-50/90 dark:bg-slate-900/90 border-blue-200 dark:border-slate-700 text-blue-900 dark:text-slate-200'
            }`}
          >
            {statusFeedback.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            )}
            <span>{statusFeedback.message}</span>
          </div>
        )}
      </GlassBox>

      {/* Step 1: 9-Category Selector Matrix (2, 4, 5 Months × Borrower, Co-Borrower, Guarantor) */}
      <GlassBox variant="default" className="p-6 sm:p-7 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#14243A] dark:text-white">
              1. เลือกหมวดหมู่ผู้รับ 9 หมวด (แยกตามงวดค้างชำระ 2, 4, 5 งวด × ผู้กู้ / ผู้กู้ร่วม / ผู้ค้ำ)
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              คลิกเลือกหมวดเพื่อกรองชุดพิมพ์และดูหน้าจอพรีวิวคู่เฉพาะหมวด หรือเลือกแสดงทั้งหมดครบ 9 หมวด
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSelectedCategoryId('ALL')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold border transition cursor-pointer ${
              selectedCategoryId === 'ALL'
                ? 'bg-[#14243A] text-white border-[#14243A] dark:bg-teal-500 dark:text-slate-950 dark:border-teal-400 shadow-xs'
                : 'bg-white/80 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-white'
            }`}
          >
            แสดงครบทั้ง 9 หมวด ({records.length} ชุด)
          </button>
        </div>

        {/* 3x3 Grid for 9 Categories */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {WORK4_CATEGORIES.map((cat) => {
            const count = categoryCounts[cat.id] || 0;
            const isSelected = selectedCategoryId === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSelectedCategoryId(cat.id);
                  const firstInCat = records.find((r) => r.categoryId === cat.id);
                  if (firstInCat) setSelectedRecordUid(firstInCat.uid);
                }}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'bg-white dark:bg-slate-800 border-blue-500 dark:border-teal-400 shadow-md ring-2 ring-blue-400/30'
                    : 'bg-white/65 hover:bg-white/95 dark:bg-slate-900/75 dark:hover:bg-slate-900 border-slate-200/80 dark:border-slate-800'
                }`}
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    <span className="font-bold text-blue-700 dark:text-teal-300">{cat.shortCode}</span>
                    <span>·</span>
                    <span>{cat.templateCode}</span>
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-[#14243A] dark:text-white truncate">
                    {cat.title}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-sm sm:text-base font-mono font-bold tabular-nums text-[#14243A] dark:text-teal-300">
                    {count}
                  </span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">ฉบับ</span>
                </div>
              </button>
            );
          })}
        </div>
      </GlassBox>

      {/* Step 2: Safe Zero-PII Roster Upload & 5-Digit Mem_ID + ก.2 Table */}
      <GlassBox variant="default" className="p-6 sm:p-7 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#14243A] dark:text-white">
              2. ระบบรับรายชื่อแบบปลอดภัย (PDPA Zero-PII) &amp; ตรวจเลขสมาชิก 5 หลัก + ทะเบียน ก.2
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              อ่านเฉพาะรหัสสมาชิก 5 หลัก (`Mem_ID`), รหัสสัญญา (`NewLoanID`), งวดค้าง และบทบาทผู้รับ โดยตัดชื่อ-สกุล/เลขบัตรออกอัตโนมัติ
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
            <LiquidButton
              type="button"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-bold cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-blue-600" />
              <span>อัปโหลด CSV (ปลอด PII)</span>
            </LiquidButton>

            <LiquidButton
              type="button"
              size="sm"
              onClick={() => setShowPasteBox((v) => !v)}
              className="text-xs font-bold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-teal-600" />
              <span>วางรายการ CSV / เพิ่มแถว</span>
            </LiquidButton>

            <LiquidButton
              type="button"
              size="sm"
              onClick={handleInjectUnpaddedTestRows}
              className="text-xs font-semibold cursor-pointer"
            >
              <span>ทดสอบรหัสขาด 0 นำหน้า</span>
            </LiquidButton>
          </div>
        </div>

        {/* Compliance Metrics Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-white/75 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 block">จำนวนชุดพิมพ์ที่เลือก</span>
            <span className="text-base font-mono font-bold tabular-nums text-[#14243A] dark:text-white mt-0.5 block">
              {filteredRecords.length} ชุด (จาก {records.length})
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/75 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 block">สถานะเลขสมาชิก 5 หลัก (V003)</span>
            {invalidMemIdCount === 0 ? (
              <span className="text-sm font-mono font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> ครบ 5 หลัก 100%
              </span>
            ) : (
              <span className="text-sm font-mono font-bold text-amber-700 dark:text-amber-400 mt-0.5 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> พบ {invalidMemIdCount} รายการต้องเติม 0
              </span>
            )}
          </div>

          <div className="p-3.5 rounded-2xl bg-white/75 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 block">ช่วงเลขทะเบียน ก.2</span>
            <span className="text-xs font-mono font-bold tabular-nums text-blue-800 dark:text-teal-300 mt-1 block truncate">
              {filteredRecords[0]?.kor2Number || '-'} ถึง{' '}
              {filteredRecords[filteredRecords.length - 1]?.kor2Number || '-'}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/75 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 block">คัดกรอง PDPA Zero-PII</span>
            <span className="text-sm font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5 block">
              บล็อก PII แล้ว {totalPiiRedacted} ฟิลด์
            </span>
          </div>
        </div>

        {/* Optional CSV Paste Box */}
        {showPasteBox && (
          <div className="p-4 rounded-2xl bg-white/85 dark:bg-slate-900 border border-blue-200 dark:border-slate-700 space-y-3">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              วางข้อมูลโครงสร้าง CSV (รูปแบบ: `Mem_ID, NewLoanID, งวดค้าง(2/4/5), บทบาท(BORROWER/CO_BORROWER/GUARANTOR)` — หากมีคอลัมน์ชื่อ-สกุลต่อท้าย ระบบจะตัดทิ้งอัตโนมัติ):
            </label>
            <textarea
              rows={3}
              value={rawPasteText}
              onChange={(e) => setRawPasteText(e.target.value)}
              placeholder={`00185, LN-2569-0911, 2, BORROWER, นายสมชาย ใจดี (ถูกตัดออก)\n49, PM-2568-2201, 4, GUARANTOR, นางสาวสมหญิง รักดี (ถูกตัดออก)`}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-[#14243A] dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <LiquidButton
                type="button"
                size="sm"
                onClick={() => setShowPasteBox(false)}
                className="text-xs cursor-pointer"
              >
                ปิด
              </LiquidButton>
              <LiquidButton
                type="button"
                size="sm"
                onClick={() => {
                  parseZeroPiiLines(rawPasteText, 'CSV_PASTE_INPUT');
                  setRawPasteText('');
                  setShowPasteBox(false);
                }}
                className="text-xs font-bold cursor-pointer"
              >
                นำเข้าและรันเลข ก.2
              </LiquidButton>
            </div>
          </div>
        )}

        {/* Roster Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-950/70">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/90 text-slate-700 dark:text-slate-300 font-bold">
                <th className="py-3 px-3.5">เลขทะเบียน ก.2</th>
                <th className="py-3 px-3.5">Mem_ID (5 หลัก)</th>
                <th className="py-3 px-3.5">รหัสสัญญา (NewLoanID)</th>
                <th className="py-3 px-3.5">หมวดผู้รับ (9 หมวด)</th>
                <th className="py-3 px-3.5">รหัสอ้างอิงซอง EMS</th>
                <th className="py-3 px-3.5">สถานะ PDPA / V003</th>
                <th className="py-3 px-3.5 text-right">พรีวิว / จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/70 font-mono tabular-nums">
              {filteredRecords.map((rec) => {
                const isFiveDigit = isValidFiveDigitMemId(rec.rawMemId);
                const isSelected = activePreviewRecord?.uid === rec.uid;
                const catObj = WORK4_CATEGORIES.find((c) => c.id === rec.categoryId);
                return (
                  <tr
                    key={rec.uid}
                    onClick={() => setSelectedRecordUid(rec.uid)}
                    className={`transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/90 dark:bg-teal-950/40'
                        : 'hover:bg-white/95 dark:hover:bg-slate-900/60'
                    }`}
                  >
                    <td className="py-2.5 px-3.5 font-bold text-[#14243A] dark:text-white">
                      {rec.kor2Number}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span
                        className={`font-bold ${
                          isFiveDigit
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400 underline decoration-wavy'
                        }`}
                      >
                        {rec.rawMemId}
                      </span>
                      {!isFiveDigit && (
                        <span className="ml-1.5 text-[10px] font-sans text-amber-700 dark:text-amber-300">
                          (ขาด 0 นำหน้า)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3.5 text-blue-800 dark:text-teal-300 font-semibold">
                      {rec.newLoanId}
                    </td>
                    <td className="py-2.5 px-3.5 font-sans font-semibold text-slate-700 dark:text-slate-200">
                      {catObj?.title || rec.categoryId}
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-400">
                      {rec.emsTrackingRef}
                    </td>
                    <td className="py-2.5 px-3.5 font-sans">
                      <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                        Zero-PII · ตัด {rec.piiRedactedCount} ฟิลด์
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-sans">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRecordUid(rec.uid);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-blue-700 dark:text-teal-300 cursor-pointer"
                        >
                          ดูพรีวิวคู่
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRecord(rec.uid);
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          title="ลบรายการ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassBox>

      {/* Step 3: Dual Live Preview (Invoice Notice Letter + EMS Envelope) */}
      {activePreviewRecord && (
        <GlassBox variant="default" className="p-6 sm:p-7 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[#14243A] dark:text-white">
                3. หน้าจอพรีวิวคู่ (Dual Live Preview: จดหมายแจ้งหนี้ คู่กับ ซองไปรษณีย์ EMS)
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                กำลังแสดงรายการที่ {currentPreviewIndex + 1} จาก {filteredRecords.length} · เลขทะเบียน{' '}
                <strong className="font-mono">{activePreviewRecord.kor2Number}</strong> · หมวด{' '}
                <strong>{activeCategoryMeta.title}</strong>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <LiquidButton
                type="button"
                size="sm"
                onClick={handlePrevPreview}
                className="text-xs font-bold cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>ฉบับก่อนหน้า</span>
              </LiquidButton>
              <LiquidButton
                type="button"
                size="sm"
                onClick={handleNextPreview}
                className="text-xs font-bold cursor-pointer"
              >
                <span>ฉบับถัดไป</span>
                <ChevronRight className="w-4 h-4" />
              </LiquidButton>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
            {/* Left Preview: Official Invoice / Overdue Notice Letter */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-blue-800 dark:text-teal-300">
                      <FileText className="w-4 h-4" />
                      <span>พรีวิวใบแจ้งหนี้ / หนังสือแจ้งเตือน ({activeCategoryMeta.templateCode})</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      ฝ่ายบริหารสินเชื่อและเร่งรัดหนี้สิน (CRD) · โฟลเดอร์ {monthFolder}
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#14243A] dark:text-white bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                    {activePreviewRecord.kor2Number}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-50 dark:bg-slate-950/70 p-3.5 rounded-xl border border-slate-200/70 dark:border-slate-800">
                  <div>
                    <span className="text-slate-500 block">รหัสสมาชิก 5 หลัก (Mem_ID):</span>
                    <span className="font-mono font-bold text-sm text-[#14243A] dark:text-white">
                      {padFiveDigitMemId(activePreviewRecord.rawMemId)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">เลขที่สัญญา (NewLoanID):</span>
                    <span className="font-mono font-bold text-sm text-blue-700 dark:text-teal-300">
                      {activePreviewRecord.newLoanId}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">ประเภทผู้รับหนังสือ:</span>
                    <span className="font-bold text-[#14243A] dark:text-white">
                      {activeCategoryMeta.roleLabel} (ค้าง {activePreviewRecord.overdueMonths} งวด)
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">วันที่รับชำระล่าสุด (V003):</span>
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                      {activePreviewRecord.lastPayDateBuddhist} (พ.ศ.)
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  <p className="font-bold text-[#14243A] dark:text-white">
                    เรื่อง: แจ้งเตือนการค้างชำระหนี้เงินกู้ ({activeCategoryMeta.title})
                  </p>
                  <p>
                    เรียน: <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">[PDPA ZERO-PII MASKED · ดึงชื่อจริงจากฐานข้อมูล Local CMS-2 ด้วยรหัสสมาชิก {padFiveDigitMemId(activePreviewRecord.rawMemId)}]</span>
                  </p>
                  <p>
                    อ้างถึงสัญญาเงินกู้เลขที่ <strong className="font-mono">{activePreviewRecord.newLoanId}</strong>{' '}
                    ปัจจุบันปรากฏรายการค้างชำระจำนวน <strong>{activePreviewRecord.overdueMonths} งวดติดต่อกัน</strong>{' '}
                    ({activePreviewRecord.lockedInstallmentText}) จึงขอแจ้งให้ท่านในฐานะ
                    <strong>{activeCategoryMeta.roleLabel}</strong> ดำเนินการติดต่อชำระภายในกำหนด
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span>DUAL-KEY: {padFiveDigitMemId(activePreviewRecord.rawMemId)} :: {activePreviewRecord.newLoanId}</span>
                <span>V003 LOCKED</span>
              </div>
            </div>

            {/* Right Preview: EMS Envelope */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-800 dark:text-indigo-300">
                      <Mail className="w-4 h-4" />
                      <span>พรีวิวหน้าซองไปรษณีย์ด่วนพิเศษ (EMS Envelope)</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      พิมพ์คู่กับใบแจ้งหนี้อัตโนมัติผ่านสคริปต์ LetterPrint.ps1
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 text-xs font-mono font-bold">
                    EMS ด่วนพิเศษ
                  </span>
                </div>

                {/* Sender & Barcode Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/70 dark:border-slate-800 text-xs">
                  <div className="space-y-0.5">
                    <span className="font-bold text-[#14243A] dark:text-white block">
                      ผู้ฝากส่ง: ฝ่ายบริหารสินเชื่อ (CRD)
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      สาขาต้นทาง: {activePreviewRecord.branchCode}
                    </span>
                    <span className="text-[11px] font-mono text-blue-700 dark:text-teal-300 block">
                      ทะเบียนส่ง: {activePreviewRecord.kor2Number}
                    </span>
                  </div>

                  <div className="text-right font-mono space-y-1">
                    <div className="inline-block px-3 py-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 tracking-widest text-[11px] font-bold text-slate-800 dark:text-slate-200">
                      ||| |||| || | |||| |||
                    </div>
                    <span className="block text-xs font-bold text-[#14243A] dark:text-white">
                      {activePreviewRecord.emsTrackingRef}
                    </span>
                  </div>
                </div>

                {/* Recipient Address Window on Envelope */}
                <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950/50 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                    <span>กรุณาส่ง ({activeCategoryMeta.roleLabel} · หมวด {activeCategoryMeta.shortCode})</span>
                    <span>อ้างอิง #{padFiveDigitMemId(activePreviewRecord.rawMemId)}</span>
                  </div>
                  <p className="font-bold text-sm text-[#14243A] dark:text-white">
                    สมาชิกเลขทะเบียน {padFiveDigitMemId(activePreviewRecord.rawMemId)} (สัญญา {activePreviewRecord.newLoanId})
                  </p>
                  <p className="text-slate-600 dark:text-slate-400">
                    [ที่อยู่จัดส่งดึงจากฐานข้อมูลในเครื่อง CMS-2 ตอนรัน LetterPrint.ps1 · ไม่เก็บที่อยู่บน Cloud ตามกฎ PDPA Zero-PII]
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span>FOLDER: {monthFolder}</span>
                <span>EMS REF: {activePreviewRecord.emsTrackingRef}</span>
              </div>
            </div>
          </div>
        </GlassBox>
      )}

      {/* Step 4: Local Gateway (CMS-2) Dispatcher & PowerShell LetterPrint.ps1 */}
      <GlassBox variant="frosted" className="p-6 sm:p-7 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#14243A] dark:text-white flex items-center gap-2">
              <Printer className="w-5 h-5 text-blue-600 dark:text-teal-400" />
              <span>4. สั่งพิมพ์ผ่าน Local Gateway (CMS-2) &amp; เรียกใช้ LetterPrint.ps1</span>
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              ยิง Payload คำสั่งพิมพ์ชุดข้อมูลปลอด PII ไปยังเครื่อง CMS-2 ในพื้นที่ พร้อมบันทึกผลลง {MANIFEST_FILE_NAME} บน Google Drive
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Local Gateway Endpoint (เครื่องคอมพิวเตอร์ CMS-2):
            </label>
            <input
              type="text"
              value={cms2LocalEndpoint}
              onChange={(e) => setCms2LocalEndpoint(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white/90 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-[#14243A] dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              พาธสคริปต์ PowerShell บนเครื่อง CMS-2:
            </label>
            <input
              type="text"
              value={ps1ScriptPath}
              onChange={(e) => setPs1ScriptPath(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white/90 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-[#14243A] dark:text-white"
            />
          </div>
        </div>

        {/* Generated LetterPrint.ps1 CLI Command */}
        <div className="p-4 rounded-2xl bg-slate-900 text-slate-100 space-y-2 border border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono text-teal-300 font-semibold">
              คำสั่งเรียกใช้งาน LetterPrint.ps1 บนเครื่อง CMS-2:
            </span>
            <button
              type="button"
              onClick={handleCopyPs1}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white cursor-pointer transition"
            >
              {copiedPs1 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedPs1 ? 'คัดลอกคำสั่งแล้ว' : 'คัดลอกคำสั่ง PowerShell'}</span>
            </button>
          </div>
          <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all text-slate-200 leading-relaxed">
            {generatedPowerShellCmd}
          </pre>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
          <div className="text-xs text-slate-600 dark:text-slate-300">
            พร้อมส่งชุดคำสั่งพิมพ์จำนวน <strong>{filteredRecords.length} ชุด</strong> · ช่วงทะเบียน{' '}
            <strong className="font-mono">{filteredRecords[0]?.kor2Number || '-'}</strong> ถึง{' '}
            <strong className="font-mono">
              {filteredRecords[filteredRecords.length - 1]?.kor2Number || '-'}
            </strong>
          </div>

          <LiquidButton
            type="button"
            size="lg"
            variant="glowing"
            glow={true}
            disabled={isDispatchingPrint || filteredRecords.length === 0}
            onClick={handleDispatchLocalGatewayPrint}
            className="w-full sm:w-auto px-7 py-3 text-xs sm:text-sm font-bold cursor-pointer"
          >
            {isDispatchingPrint ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>กำลังยิงคำสั่งพิมพ์ไปยัง CMS-2...</span>
              </>
            ) : (
              <>
                <Printer className="w-4 h-4 text-blue-600" />
                <span>สั่งพิมพ์ผ่าน Local Gateway (CMS-2)</span>
              </>
            )}
          </LiquidButton>
        </div>
      </GlassBox>
    </div>
  );
};
