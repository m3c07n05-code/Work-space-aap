import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Code2,
  Copy,
  Cpu,
  Database,
  Download,
  ExternalLink,
  FileCode,
  FileSpreadsheet,
  FileText,
  FolderGit2,
  Github,
  Globe,
  Key,
  Layers,
  Lock,
  Play,
  Printer,
  RefreshCw,
  Send,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wifi,
  Zap,
} from 'lucide-react';
import {
  backendGateway,
  DEFAULT_GAS_URL,
  MANIFEST_FILE_NAME,
  WORKSPACE_FOLDER_ID,
} from '../services/backendGateway';
import {
  AuditCheckItem,
  ProjectManifest,
  SiteAuditReport,
  WorkerTaskSpec,
} from '../types';
import { GlassBox } from './ui/glass-box';
import { LiquidButton } from './ui/liquid-glass-button';

interface UnifiedControlFlowStudioProps {
  onNavigate: (
    view:
      | 'overview'
      | 'control-flow'
      | 'work1'
      | 'work4'
      | 'scope-builder'
      | 'ai-studio'
      | 'stop-gates'
      | 'gascode'
      | 'proposed-work'
  ) => void;
  onOpenGatewayModal: () => void;
  onOpenLogsModal: () => void;
  onOpenExportModal: () => void;
  theme?: 'light' | 'dark';
}

// 14 hard-locked tasks matching ALLOWED_TASKS in scripts/crd_worker.py
export const CMS2_ALLOWED_TASKS: WorkerTaskSpec[] = [
  {
    taskType: 'DEVICE_HEARTBEAT',
    label: 'Heartbeat & RPT Scan',
    category: 'SYSTEM',
    description: 'ส่งสัญญาณชีพ CMS-2 พร้อมสแกน D:\\COOP\\VIEWREPORT แบบ Read-Only',
    zeroPii: true,
    paperZero: true,
    defaultTitle: 'CMS-2 Live Heartbeat & Read-Only .RPT Check',
  },
  {
    taskType: 'INBOX_WATCHER_10MIN',
    label: 'Doc B Inbox Watcher (10m)',
    category: 'SYSTEM',
    description: 'ตรวจรอบงาน Doc B Command Inbox และอัปเดตสถานะคิวฝั่ง CMS-2',
    zeroPii: true,
    paperZero: true,
    defaultTitle: 'Run 10-Min Doc B Inbox Watcher Cycle',
  },
  {
    taskType: 'DOC_B_DISPATCH',
    label: 'Doc B Command Dispatch',
    category: 'SYSTEM',
    description: 'ดึงคำสั่งล่าสุดจาก Doc B มาตรวจ Gate และประมวลผลตามกฎปลอดภัย',
    zeroPii: true,
    paperZero: true,
    defaultTitle: 'Process Active Doc B Dispatch Queue',
  },
  {
    taskType: 'WORK1_PRINT',
    label: 'WORK 1: พ้นสมาชิกภาพ',
    category: 'WORK1_9',
    description: 'ชุดงาน WORK 1 ตาราง 13 คอลัมน์ แยกวาระ 4.1 / 4.2 (Output ลง OneDrive)',
    zeroPii: true,
    paperZero: true,
    defaultTitle: 'Execute WORK 1 Membership Termination Pipeline',
  },
  {
    taskType: 'WORK2_FOLLOWUP',
    label: 'WORK 2: ติดตามหนี้ & ผู้ค้ำ',
    category: 'WORK1_9',
    description: 'ตรวจสัญญาร่วมและการค้ำประกันไขว้บนฐาน CMS-2',
    zeroPii: true,
    paperZero: true,
    defaultTitle: 'Execute WORK 2 Follow-up & Guarantor Check',
  },
  {
    taskType: 'WORK3_SMS_PREVIEW',
    label: 'WORK 3: พรีวิว SMS แจ้งเตือน',
    category: 'WORK1_9',
    description: 'จัดชุดพรีวิวข้อความแจ้งหนี้ใน Staging (ล็อก NO_AUTO_SEND_SMS)',
    zeroPii: true,
    paperZero: true,
    defaultTitle: 'Execute WORK 3 SMS Preview Staging',
  },
  {
    taskType: 'WORK4_PREVIEW_A6',
    label: 'WORK 4: พรีวิวใบฟ้า A6 (.RPT)',
    category: 'WORK4_PRINT',
    description: 'สร้าง PDF พรีวิวขนาด A6 จาก 27 .RPT ลง WORK_4_OUTPUT (Paper=0)',
    zeroPii: true,
    paperZero: true,
    defaultTitle: 'Generate WORK 4 A6 PDF Preview (Paper=0)',
  },
  {
    taskType: 'WORK4_PACK_64REC',
    label: 'WORK 4: แพ็กชุด 64 รายการ',
    category: 'WORK4_PRINT',
    description: 'รวมชุดเอกสารแจ้งชำระหนี้ 64 รายการสู่ WORK_4_OUTPUT (NO_AUTO_PRINT)',
    zeroPii: true,
    paperZero: true,
    defaultTitle: 'Build WORK 4 Unified 64-Record Pack (Paper=0)',
  },
  {
    taskType: 'WORK5_DEFAULT_LOAN',
    label: 'WORK 5: สัญญาผิดนัดชำระ',
    category: 'WORK1_9',
    description: 'สรุปสถานะสัญญาผิดนัดตามระเบียบ CRD (Zero-PII Summary)',
    zeroPii: true,
    paperZero: true,
    defaultTitle: 'Execute WORK 5 Default Loan Pipeline',
  },
  {
    taskType: 'WORK6_PAYMENT_077',
    label: 'WORK 6: รับชำระ 077',
    category: 'WORK1_9',
    description: 'ประมวลผลชุดข้อมูลรับชำระ 077 และสรุปผลลง OneDrive',
    zeroPii: true,
    paperZero: true,
    defaultTitle: 'Execute WORK 6 Payment 077 Pipeline',
  },
  {
    taskType: 'WORK7_SMS_MAPPING',
    label: 'WORK 7: จับคู่รหัสส่ง SMS',
    category: 'WORK1_9',
    description: 'จับคู่รหัสแจ้งเตือนระดับสัญญาในโหมด Staging ปลอด PII',
    zeroPii: true,
    paperZero: true,
    defaultTitle: 'Execute WORK 7 SMS Mapping Pipeline',
  },
  {
    taskType: 'WORK8_GUARANTOR',
    label: 'WORK 8: ตรวจสิทธิ์ผู้ค้ำประกัน',
    category: 'WORK1_9',
    description: 'ตรวจเงื่อนไขผู้ค้ำประกันและอายุความตามระเบียบ CRD',
    zeroPii: true,
    paperZero: true,
    defaultTitle: 'Execute WORK 8 Guarantor Pipeline',
  },
  {
    taskType: 'WORK9_EXEC_REPORT',
    label: 'WORK 9: รายงานผู้บริหาร',
    category: 'WORK1_9',
    description: 'สรุปสถิติผู้บริหารแบบ Aggregate ปลอด PII 100%',
    zeroPii: true,
    paperZero: true,
    defaultTitle: 'Generate WORK 9 Zero-PII Executive Report',
  },
  {
    taskType: 'V003_SPLIT_077',
    label: 'V003: แยกไฟล์ตามหนี้ 077',
    category: 'V003_DATA',
    description: 'แยกชุดข้อมูล 077 คงศูนย์นำหน้า 5 หลัก และรูปแบบ พ.ศ./ค.ศ.',
    zeroPii: true,
    paperZero: true,
    defaultTitle: 'Run V003 Split 077 Format Guard',
  },
];

const DOC_B_URL =
  'https://docs.google.com/document/d/1UL_maGIJiMm8N6f0sUIYwAkFsqpHLz4HrZbkQZTZn7Q/edit';
const FORM_9_PLUS_1_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSc3JEZFvAo4Wqyfj2NtK3zCrcs-oN_F6heZ-hzr7ZDDrH2NKQ/viewform';
const FORM_RESPONSES_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1BuevtBv23pzRyONidpGqcStyCKkW_NtCP2XCTkMvzbk/edit';
const CONFLUENCE_INDEX_URL = 'https://njnatee99.atlassian.net/wiki/pages/524291';
const JIRA_SCRUM1_URL = 'https://njnatee99.atlassian.net/browse/SCRUM-1';
const GITHUB_REPO_URL = 'https://github.com/m3c07n05-code/Work-space-aap';
const WEB_CRD_URL = 'https://crd.nateework.cloud';

function containsPotentialPii(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/\b\d{13}\b/.test(trimmed) || /\d-\d{4}-\d{5}-\d{2}-\d/.test(trimmed)) {
    return 'ตรวจพบตัวเลขคล้ายเลขประจำตัวประชาชน 13 หลัก (ระบบบล็อกเพื่อรักษา Zero-PII 100%)';
  }
  if (/\b0[689]\d{8}\b/.test(trimmed) || /\b0[689]\d-\d{3}-\d{4}\b/.test(trimmed)) {
    return 'ตรวจพบตัวเลขคล้ายเบอร์โทรศัพท์มือถือ (ระบบบล็อกเพื่อรักษา Zero-PII 100%)';
  }
  if (/(?:^|\s)(?:นาย|นางสาว|นาง)[ก-๙]{2,}/.test(trimmed)) {
    return 'ตรวจพบข้อความคล้ายชื่อบุคคล (ห้ามใส่ชื่อสมาชิกจริงลงในคำสั่งคิวงาน)';
  }
  return null;
}

export const UnifiedControlFlowStudio: React.FC<UnifiedControlFlowStudioProps> = ({
  onNavigate,
  onOpenGatewayModal,
  onOpenLogsModal,
  onOpenExportModal,
  theme = 'light',
}) => {
  const isDark = theme === 'dark';

  // Step 1: Audit state
  const [auditReport, setAuditReport] = useState<SiteAuditReport | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [copiedAudit, setCopiedAudit] = useState(false);

  // Step 2: Manifest & Code Inspector state
  const [manifest, setManifest] = useState<ProjectManifest | null>(() =>
    backendGateway.getManifest()
  );
  const [isPullingManifest, setIsPullingManifest] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  // Step 3: Safe Allowlist Runner state
  const [taskFilter, setTaskFilter] = useState<'ALL' | WorkerTaskSpec['category']>('ALL');
  const [noteText, setNoteText] = useState('');
  const [piiWarning, setPiiWarning] = useState<string | null>(null);
  const [submittingTask, setSubmittingTask] = useState<string | null>(null);
  const [lastJobResult, setLastJobResult] = useState<{
    success: boolean;
    taskType: string;
    jobId?: string;
    status?: string;
    deduplicated?: boolean;
    latencyMs: number;
    message: string;
    timestamp: string;
  } | null>(null);

  useEffect(() => {
    const unsub = backendGateway.onManifestChange((next) => {
      setManifest(next);
    });
    return unsub;
  }, []);

  const hasToken = backendGateway.hasGatewayToken();
  const gatewayConfig = backendGateway.getConfig();
  const scopes = backendGateway.getScopes();

  const handleRunAudit = async () => {
    if (isAuditing) return;
    setIsAuditing(true);
    try {
      const report = await backendGateway.runSiteAudit();
      setAuditReport(report);
      if (report.manifest) {
        setManifest(report.manifest);
      }
    } finally {
      setIsAuditing(false);
    }
  };

  const handleCopyAuditSummary = () => {
    if (!auditReport) return;
    const lines = [
      `[CRD WEB UNIFIED AUDIT — ZERO-PII]`,
      `Checked At: ${auditReport.checkedAtIso}`,
      `Overall Status: ${auditReport.overallStatus} (${auditReport.latencyMs}ms)`,
      `Recommended Action: ${auditReport.recommendedAction}`,
      `--- Checks ---`,
      ...auditReport.checks.map(
        (c) => `- [${c.status}] ${c.label}: ${c.detail}${c.meta ? ` (${c.meta})` : ''}`
      ),
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedAudit(true);
    setTimeout(() => setCopiedAudit(false), 2500);
  };

  const handlePullManifest = async () => {
    if (isPullingManifest) return;
    setIsPullingManifest(true);
    setPullError(null);
    try {
      const res = await backendGateway.readManifest();
      if (res.success && res.manifest) {
        setManifest(res.manifest);
      } else {
        setPullError(res.error || 'ไม่สามารถอ่าน 00_Project_Manifest.json ได้');
      }
    } finally {
      setIsPullingManifest(false);
    }
  };

  const handleCopyManifestJson = () => {
    if (!manifest) return;
    navigator.clipboard.writeText(JSON.stringify(manifest, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2500);
  };

  const handleRunAllowlistTask = async (spec: WorkerTaskSpec) => {
    if (submittingTask) return;
    const piiIssue = containsPotentialPii(noteText);
    if (piiIssue) {
      setPiiWarning(piiIssue);
      return;
    }
    setPiiWarning(null);
    setSubmittingTask(spec.taskType);

    try {
      const cleanNote = noteText.trim();
      const res = await backendGateway.submitWorkerJob(
        spec.taskType,
        spec.defaultTitle,
        cleanNote || undefined
      );
      const resp = res.log.response || {};
      const jobId = resp.jobId ? String(resp.jobId) : undefined;
      const status = resp.status ? String(resp.status) : res.success ? 'PENDING' : 'ERROR';
      const deduplicated = Boolean(resp.deduplicated);
      const errorDetail = resp.error ? String(resp.error) : '';

      setLastJobResult({
        success: res.success,
        taskType: spec.taskType,
        jobId,
        status,
        deduplicated,
        latencyMs: res.log.latencyMs,
        message: res.success
          ? deduplicated
            ? `คิวงาน ${spec.taskType} มีอยู่แล้วในระบบ (Deduplicated)`
            : `ส่งงาน ${spec.taskType} เข้าคิว GAS Gateway สำเร็จ (รอ CMS-2 ดึงทำงาน)`
          : `ส่งงานไม่สำเร็จ: ${errorDetail || `HTTP ${res.log.status}`}`,
        timestamp: new Date().toLocaleTimeString('th-TH'),
      });
    } finally {
      setSubmittingTask(null);
    }
  };

  const scrollToStep = (stepId: string) => {
    const el = document.getElementById(stepId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const pendingJobs = Array.isArray(manifest?.pendingJobs) ? manifest.pendingJobs : [];
  const completedJobs = Array.isArray(manifest?.completedJobs) ? manifest.completedJobs : [];
  const modulesList = Array.isArray(manifest?.modules) ? manifest.modules : [];
  const manifestScopes = Array.isArray(manifest?.scopes) ? manifest.scopes : [];
  const fc = manifest?.folderConsolidation;
  const cf = manifest?.coordinationCenterForm;

  const filteredTasks =
    taskFilter === 'ALL'
      ? CMS2_ALLOWED_TASKS
      : CMS2_ALLOWED_TASKS.filter((t) => t.category === taskFilter);

  const checkCardBadge = (status: AuditCheckItem['status']) => {
    if (status === 'PASS') {
      return {
        pill: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40',
        border: 'border-emerald-200/80 dark:border-emerald-800/60',
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
      };
    }
    if (status === 'WARN') {
      return {
        pill: 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/40',
        border: 'border-amber-200/80 dark:border-amber-800/60',
        icon: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />,
      };
    }
    if (status === 'FAIL') {
      return {
        pill: 'bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-500/40',
        border: 'border-rose-200/80 dark:border-rose-800/60',
        icon: <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />,
      };
    }
    return {
      pill: 'bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-500/40',
      border: 'border-blue-200/80 dark:border-slate-800',
      icon: <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />,
    };
  };

  const ecosystemDestinations = [
    {
      id: 'web-crd',
      name: 'Web CRD (Production)',
      subtitle: WEB_CRD_URL,
      status: gatewayConfig.isSimulationMode ? 'SIMULATOR' : 'LIVE',
      url: WEB_CRD_URL,
      icon: <Globe className="w-4 h-4 text-blue-600 dark:text-teal-400" />,
    },
    {
      id: 'gas-gateway',
      name: 'GAS Gateway Index (/exec)',
      subtitle: manifest?.gasDeployStatus || 'Apps Script Web App Gateway',
      status: gatewayConfig.status === 'connected' ? 'CONNECTED' : gatewayConfig.status.toUpperCase(),
      url: gatewayConfig.baseUrl || DEFAULT_GAS_URL,
      icon: <Server className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
    },
    {
      id: 'drive-workspace',
      name: 'Google Drive Workspace',
      subtitle: 'AI_Project_Workspace / 00_Project_Manifest.json',
      status: manifest ? 'SYNCED' : 'STANDBY',
      url: `https://drive.google.com/drive/folders/${WORKSPACE_FOLDER_ID}`,
      icon: <FolderGit2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />,
    },
    {
      id: 'doc-b',
      name: 'Doc B Command Inbox',
      subtitle: 'CRD — Task Inbox & Remote Communication',
      status: manifest?.docBState?.lastTopActive ? 'ACTIVE' : 'MONITORED',
      url: DOC_B_URL,
      icon: <FileText className="w-4 h-4 text-blue-700 dark:text-sky-400" />,
    },
    {
      id: 'form-9-plus-1',
      name: 'ฟอร์มศูนย์ประสานงาน 9+1',
      subtitle: `10 ศูนย์ประสานงาน (${cf?.status || 'PASS'})`,
      status: cf?.status || 'PASS',
      url: FORM_9_PLUS_1_URL,
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
    },
    {
      id: 'sheet-responses',
      name: 'ชีต การตอบแบบฟอร์ม 1',
      subtitle: cf?.sheetName || 'บันทึกการตอบศูนย์ประสานงาน 9+1',
      status: 'LINKED',
      url: FORM_RESPONSES_SHEET_URL,
      icon: <FileSpreadsheet className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />,
    },
    {
      id: 'confluence',
      name: 'Confluence Master Index',
      subtitle: 'MASTER INDEX สถาปัตยกรรม CRD',
      status: 'DOCS',
      url: CONFLUENCE_INDEX_URL,
      icon: <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
    },
    {
      id: 'jira-scrum1',
      name: 'Jira SCRUM-1',
      subtitle: 'WORK 4 Direct-RPT PDF & A6 Pipeline',
      status: 'BACKLOG',
      url: JIRA_SCRUM1_URL,
      icon: <ExternalLink className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />,
    },
    {
      id: 'github-repo',
      name: 'GitHub Work-space-aap',
      subtitle: 'm3c07n05-code/Work-space-aap',
      status: 'SOURCE',
      url: GITHUB_REPO_URL,
      icon: <Github className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
  ];

  const internalStudios: Array<{
    id:
      | 'work1'
      | 'work4'
      | 'ai-studio'
      | 'scope-builder'
      | 'stop-gates'
      | 'gascode';
    label: string;
    sub: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'work1',
      label: 'WORK 1',
      sub: 'ตาราง 13 คอลัมน์ & Drive 3D',
      icon: <Layers className="w-4 h-4 text-blue-600 dark:text-teal-400" />,
    },
    {
      id: 'work4',
      label: 'WORK 4',
      sub: 'ห้องพิมพ์ใบฟ้า A6',
      icon: <Printer className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />,
    },
    {
      id: 'ai-studio',
      label: 'AI Studio',
      sub: 'ออกแบบ UI & สเปกอัตโนมัติ',
      icon: <Sparkles className="w-4 h-4 text-blue-600 dark:text-sky-400" />,
    },
    {
      id: 'scope-builder',
      label: 'Scope Builder',
      sub: 'เพิ่มขอบเขตงานเข้า Drive',
      icon: <Zap className="w-4 h-4 text-teal-600 dark:text-teal-400" />,
    },
    {
      id: 'stop-gates',
      label: 'Stop Gates',
      sub: 'ตรวจ 16 ด่าน & PDPA',
      icon: <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
    },
    {
      id: 'gascode',
      label: 'Code.gs',
      sub: 'ซอร์สโค้ด GAS Gateway',
      icon: <Code2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
    },
  ];

  return (
    <div className={`${isDark ? 'dark' : ''} space-y-6 pb-10 animate-fade-in`}>
      {/* Top Hero Header & 4-Step Flow Navigator */}
      <GlassBox variant="highlight" className="p-6 sm:p-7 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-blue-100/90 dark:bg-teal-500/20 text-blue-900 dark:text-teal-300 border border-blue-200 dark:border-teal-500/40 flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5" />
                UNIFIED CONTROL &amp; AUDIT FLOW
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-100/90 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Zero-PII 100%
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-100/90 dark:bg-amber-500/20 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-500/40 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Paper=0 NO_AUTO_PRINT
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#14243A] dark:text-white">
              Unified Control &amp; Audit Flow (ตรวจเว็บ • ดึงงาน • รันสคริปต์ • เชื่อมเครื่องมือ)
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
              ศูนย์บัญชาการ 4 ขั้นตอนเชื่อมหน้าเว็บ, Google Apps Script Gateway, Manifest บน Google Drive และ PC Worker <code className="font-mono font-bold">CMS-2</code> ครบจบในหน้าเดียว
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <LiquidButton
              type="button"
              size="default"
              variant="glowing"
              glow={true}
              beacon={!auditReport}
              disabled={isAuditing}
              onClick={handleRunAudit}
              className="text-xs font-bold cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 text-blue-600 dark:text-teal-300 ${isAuditing ? 'animate-spin' : ''}`} />
              <span>{isAuditing ? 'กำลังตรวจทั้งระบบ...' : 'ตรวจระบบทั้งหมด (1-Click Audit)'}</span>
            </LiquidButton>

            <LiquidButton
              type="button"
              size="default"
              onClick={onOpenGatewayModal}
              className="text-xs font-bold cursor-pointer"
            >
              <Key className="w-4 h-4 text-slate-700 dark:text-slate-200" />
              <span>{hasToken ? 'ตั้งค่า Token' : 'ใส่ Token'}</span>
            </LiquidButton>
          </div>
        </div>

        {/* 4-Step Flow Pill Jump Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-800">
          {[
            { id: 'ucf-step-1', step: 'STEP 1', title: 'ตรวจเว็บ & โครงสร้าง', icon: <Activity className="w-4 h-4 text-blue-600 dark:text-teal-400" /> },
            { id: 'ucf-step-2', step: 'STEP 2', title: 'ดึงงาน & โค้ด/Manifest', icon: <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> },
            { id: 'ucf-step-3', step: 'STEP 3', title: 'รันสคริปต์ฝั่ง CMS-2', icon: <Play className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> },
            { id: 'ucf-step-4', step: 'STEP 4', title: 'เครื่องมือที่เชื่อมทั้งหมด', icon: <Globe className="w-4 h-4 text-amber-600 dark:text-amber-400" /> },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollToStep(item.id)}
              className="p-3 rounded-2xl bg-white/80 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-left transition-all cursor-pointer flex items-center gap-2.5 shadow-2xs"
            >
              <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                {item.icon}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
                  {item.step}
                </div>
                <div className="text-xs font-bold text-[#14243A] dark:text-white truncate">
                  {item.title}
                </div>
              </div>
            </button>
          ))}
        </div>
      </GlassBox>

      {/* ==================================================================== */}
      {/* STEP 1: 1-Click Full Audit                                           */}
      {/* ==================================================================== */}
      <GlassBox id="ucf-step-1" variant="frosted" className="p-5 sm:p-7 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-blue-100 dark:bg-teal-500/20 text-blue-800 dark:text-teal-300 border border-blue-200 dark:border-teal-500/40">
                STEP 1
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-[#14243A] dark:text-white">
                ตรวจเว็บ &amp; โครงสร้างทั้งหมด (1-Click Full Audit)
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              รันตรวจจริงครบวงจร: Frontend Host, GAS Gateway &amp; Token, Google Drive Manifest, Worker <code className="font-mono font-bold">CMS-2</code>, Doc B Bridge และ 16 Stop Gates
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!hasToken && (
              <LiquidButton
                type="button"
                size="sm"
                onClick={onOpenGatewayModal}
                className="text-xs font-bold cursor-pointer"
              >
                <Key className="w-3.5 h-3.5 text-amber-600" />
                <span>ตั้งค่า Token ด่วน</span>
              </LiquidButton>
            )}

            {auditReport && (
              <LiquidButton
                type="button"
                size="sm"
                onClick={handleCopyAuditSummary}
                className="text-xs font-bold cursor-pointer"
              >
                {copiedAudit ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-slate-700 dark:text-slate-200" />
                )}
                <span>{copiedAudit ? 'คัดลอกรายงานแล้ว' : 'คัดลอกรายงานสรุป (Zero-PII)'}</span>
              </LiquidButton>
            )}

            <LiquidButton
              type="button"
              size="default"
              variant="glowing"
              glow={true}
              disabled={isAuditing}
              onClick={handleRunAudit}
              className="text-xs font-bold cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 text-blue-600 dark:text-teal-300 ${isAuditing ? 'animate-spin' : ''}`} />
              <span>{isAuditing ? 'กำลังตรวจสอบ...' : 'รัน Full Audit ทันที'}</span>
            </LiquidButton>
          </div>
        </div>

        {/* Summary Banner when auditReport is present */}
        {auditReport ? (
          <div className="space-y-4">
            <div
              className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                auditReport.overallStatus === 'READY'
                  ? 'bg-emerald-50/90 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
                  : auditReport.overallStatus === 'PARTIAL'
                    ? 'bg-amber-50/90 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-200'
                    : 'bg-rose-50/90 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-950 dark:text-rose-200'
              }`}
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono font-bold">
                  <span>OVERALL: {auditReport.overallStatus}</span>
                  <span>•</span>
                  <span>Latency: {auditReport.latencyMs}ms</span>
                  <span>•</span>
                  <span>Checked: {new Date(auditReport.checkedAtIso).toLocaleTimeString('th-TH')}</span>
                </div>
                <p className="text-xs sm:text-sm font-semibold">{auditReport.recommendedAction}</p>
              </div>
              {(!hasToken || auditReport.overallStatus === 'ACTION_REQUIRED') && (
                <button
                  type="button"
                  onClick={onOpenGatewayModal}
                  className="px-3.5 py-2 rounded-xl bg-white/90 dark:bg-slate-900 text-xs font-bold text-[#14243A] dark:text-white border border-slate-200 dark:border-slate-700 hover:bg-white cursor-pointer shrink-0 shadow-2xs"
                >
                  เปิดตั้งค่า Gateway / Token →
                </button>
              )}
            </div>

            {/* 6 Audit Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {auditReport.checks.map((item) => {
                const style = checkCardBadge(item.status);
                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-2xl bg-white/85 dark:bg-slate-900/85 border ${style.border} flex flex-col justify-between space-y-2.5 shadow-2xs`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
                          {item.category}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${style.pill}`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        {style.icon}
                        <h3 className="text-xs sm:text-sm font-bold text-[#14243A] dark:text-white leading-snug">
                          {item.label}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {item.detail}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      <span className="truncate">{item.meta || 'Zero-PII Verified'}</span>
                      {item.actionHint === 'OPEN_GATEWAY_MODAL' && (
                        <button
                          type="button"
                          onClick={onOpenGatewayModal}
                          className="text-blue-600 dark:text-teal-400 hover:underline font-bold shrink-0 cursor-pointer"
                        >
                          ตั้งค่า →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-2xl bg-white/75 dark:bg-slate-900/75 border border-dashed border-blue-200 dark:border-slate-700 text-center space-y-3">
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              กดปุ่ม <strong>“รัน Full Audit ทันที”</strong> เพื่อตรวจสถานะจริงของ Frontend, GAS Gateway, Token, Drive Manifest, Worker <code className="font-mono font-bold">CMS-2</code>, Doc B Bridge และ 16 Stop Gates ในคลิกเดียว
            </p>
            {!hasToken && (
              <p className="text-xs text-amber-700 dark:text-amber-300 font-semibold">
                หมายเหตุ: ขณะนี้ยังไม่ได้ตั้งค่า Gateway Token ในเบราว์เซอร์ — กด “ตั้งค่า Token ด่วน” ก่อนรันเพื่อให้ GAS ตรวจสอบสิทธิ์ผ่าน
              </p>
            )}
          </div>
        )}
      </GlassBox>

      {/* ==================================================================== */}
      {/* STEP 2: Pull Work & Code Inspector                                   */}
      {/* ==================================================================== */}
      <GlassBox id="ucf-step-2" variant="default" className="p-5 sm:p-7 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/40">
                STEP 2
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-[#14243A] dark:text-white">
                ดึงงาน &amp; ดึงโค้ด/โครงสร้าง (Pull Work &amp; Code Inspector)
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              อ่านสถานะล่าสุดจาก <code className="font-mono font-bold">{MANIFEST_FILE_NAME}</code> พร้อมตรวจคิวงาน, OneDrive Consolidation, ฟอร์ม 9+1, โค้ด <code className="font-mono font-bold">Code.gs</code> และ Export โค้ด
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <LiquidButton
              type="button"
              size="sm"
              disabled={isPullingManifest}
              onClick={handlePullManifest}
              className="text-xs font-bold cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-600 dark:text-teal-300 ${isPullingManifest ? 'animate-spin' : ''}`} />
              <span>{isPullingManifest ? 'กำลังดึง Manifest...' : 'ดึง Manifest ล่าสุด'}</span>
            </LiquidButton>

            <LiquidButton
              type="button"
              size="sm"
              onClick={() => onNavigate('gascode')}
              className="text-xs font-bold cursor-pointer"
            >
              <Code2 className="w-3.5 h-3.5 text-amber-600" />
              <span>เปิดหน้าโค้ด Code.gs</span>
            </LiquidButton>

            <LiquidButton
              type="button"
              size="sm"
              onClick={onOpenExportModal}
              className="text-xs font-bold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>วิธี Export โค้ด</span>
            </LiquidButton>
          </div>
        </div>

        {pullError && (
          <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{pullError}</span>
          </div>
        )}

        {/* Key Metrics Summary Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card A: OneDrive Consolidation */}
          <div className="p-4 rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-slate-200/80 dark:border-slate-800 space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-500 dark:text-slate-400 font-bold">ONEDRIVE CONSOLIDATION</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-bold">
                {fc?.status || 'BASELINE'}
              </span>
            </div>
            <div className="text-base font-bold text-[#14243A] dark:text-white">
              {fc ? `${fc.archivedFolders ?? 21}/21 โฟลเดอร์` : '21/21 รายการ'} • {fc?.workRunnerStatus || '9/9 READY_100%'}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 font-mono">
              .RPT ต้นฉบับ: {fc?.viewreportPureRptCount ?? 27} ไฟล์ (non-.rpt: {fc?.viewreportNonRptCount ?? 0})
            </div>
          </div>

          {/* Card B: Coordination Center Form 9+1 */}
          <div className="p-4 rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-slate-200/80 dark:border-slate-800 space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-500 dark:text-slate-400 font-bold">ฟอร์มศูนย์ประสานงาน 9+1</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-bold">
                {cf?.status || 'PASS'}
              </span>
            </div>
            <div className="text-base font-bold text-[#14243A] dark:text-white">
              {cf?.centersCount ?? 10} ศูนย์ (9+1) พร้อมรับคำตอบ
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 font-mono truncate">
              ชีต: {cf?.sheetName || 'การตอบแบบฟอร์ม 1'}
            </div>
          </div>

          {/* Card C: Pending & Completed Job Queue */}
          <div className="p-4 rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-slate-200/80 dark:border-slate-800 space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-500 dark:text-slate-400 font-bold">QUEUE (GAS BRIDGE)</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300 font-bold">
                {manifest ? 'LIVE' : 'STANDBY'}
              </span>
            </div>
            <div className="text-base font-bold text-[#14243A] dark:text-white tabular-nums">
              ค้าง {pendingJobs.length} งาน / เสร็จ {completedJobs.length} งาน
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 font-mono">
              Gate: {manifest?.gateStatus || 'รออ่าน Manifest'}
            </div>
          </div>

          {/* Card D: Scopes & Modules */}
          <div className="p-4 rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-slate-200/80 dark:border-slate-800 space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-500 dark:text-slate-400 font-bold">SCOPES &amp; MODULES</span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 font-bold">
                SYNCED
              </span>
            </div>
            <div className="text-base font-bold text-[#14243A] dark:text-white tabular-nums">
              {modulesList.length} Modules • {manifestScopes.length || scopes.length} Scopes
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 font-mono truncate">
              GAS Deploy: {manifest?.gasDeployStatus || 'READY'}
            </div>
          </div>
        </div>

        {/* Pending / Completed Jobs Lists */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[#14243A] dark:text-white flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>งานรอทำในคิว (pendingJobs: {pendingJobs.length})</span>
              </h3>
              <button
                type="button"
                onClick={onOpenLogsModal}
                className="text-[11px] font-mono font-bold text-blue-600 dark:text-teal-400 hover:underline cursor-pointer"
              >
                ดู Live Payloads →
              </button>
            </div>
            {pendingJobs.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
                ไม่มีงานค้างใน pendingJobs (สามารถส่งคิวงานใหม่ได้ใน Step 3)
              </p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {pendingJobs.slice(0, 6).map((job, idx) => (
                  <div
                    key={job.jobId || idx}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-mono font-bold text-blue-700 dark:text-teal-300 truncate">
                        {job.taskType || job.type || 'JOB'} · {job.jobId}
                      </div>
                      <div className="text-slate-700 dark:text-slate-300 truncate">{job.title || '-'}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 shrink-0">
                      {job.status || 'PENDING'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[#14243A] dark:text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>งานที่ดำเนินการแล้ว (completedJobs: {completedJobs.length})</span>
              </h3>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                Scopes ในเครื่อง: {scopes.length}
              </span>
            </div>
            {completedJobs.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
                ยังไม่มีประวัติ completedJobs ใน snapshot ปัจจุบัน (กด “ดึง Manifest ล่าสุด” เพื่ออัปเดต)
              </p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {completedJobs.slice(0, 6).map((job, idx) => (
                  <div
                    key={job.jobId || idx}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-mono font-bold text-[#14243A] dark:text-white truncate">
                        {job.taskType || job.type || 'JOB'} · {job.jobId}
                      </div>
                      <div className="text-slate-600 dark:text-slate-400 truncate">
                        {job.summary || job.title || '-'}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 shrink-0">
                      {job.status || 'DONE'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Collapsible Raw Manifest JSON Inspector */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/75 dark:bg-slate-950/70 overflow-hidden">
          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-slate-100/70 dark:bg-slate-900/70">
            <button
              type="button"
              onClick={() => setShowRawJson((prev) => !prev)}
              className="flex items-center gap-2 text-xs font-bold text-[#14243A] dark:text-white cursor-pointer"
            >
              {showRawJson ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              <FileCode className="w-4 h-4 text-blue-600 dark:text-teal-400" />
              <span>ตัวดูโครงสร้าง Manifest JSON ({MANIFEST_FILE_NAME})</span>
            </button>

            <div className="flex items-center gap-2">
              {manifest && (
                <button
                  type="button"
                  onClick={handleCopyManifestJson}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 text-xs font-bold text-blue-700 dark:text-teal-300 border border-blue-200 dark:border-slate-700 cursor-pointer"
                >
                  {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedJson ? 'คัดลอก JSON แล้ว' : 'คัดลอก JSON'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowRawJson((prev) => !prev)}
                className="text-xs font-mono font-semibold text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
              >
                {showRawJson ? 'ซ่อน JSON' : 'เปิดดู JSON'}
              </button>
            </div>
          </div>

          {showRawJson && (
            <div className="p-4 border-t border-slate-200/70 dark:border-slate-800">
              {manifest ? (
                <pre className="p-4 rounded-xl bg-slate-900 text-blue-100 text-[11px] font-mono overflow-x-auto max-h-80 leading-relaxed shadow-inner">
                  {JSON.stringify(manifest, null, 2)}
                </pre>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  ยังไม่มีข้อมูล Manifest ในหน่วยความจำ — กดปุ่ม “ดึง Manifest ล่าสุด” ด้านบนเพื่อโหลดจาก Google Drive
                </p>
              )}
            </div>
          )}
        </div>
      </GlassBox>

      {/* ==================================================================== */}
      {/* STEP 3: Safe Allowlist Runner (CMS-2)                                */}
      {/* ==================================================================== */}
      <GlassBox id="ucf-step-3" variant="frosted" className="p-5 sm:p-7 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40">
                STEP 3
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-[#14243A] dark:text-white">
                รันสคริปต์ฝั่ง CMS-2 (Safe Allowlist Runner · 14 งานมาตรฐาน)
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              ส่งคำสั่งที่ตรงกับ <code className="font-mono font-bold">ALLOWED_TASKS</code> ใน <code className="font-mono font-bold">scripts/crd_worker.py</code> เข้าคิว GAS Gateway อย่างปลอดภัย
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-emerald-100/90 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Zero-PII
            </span>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-amber-100/90 dark:bg-amber-500/20 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" />
              Paper=0 NO_AUTO_PRINT
            </span>
          </div>
        </div>

        {/* Note input (Zero-PII guarded) + Category Filters */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-7 space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
              หมายเหตุคำสั่งสั้นๆ (Optional — ห้ามใส่ข้อมูลส่วนบุคคล / PII เด็ดขาด)
            </label>
            <input
              type="text"
              value={noteText}
              onChange={(e) => {
                setNoteText(e.target.value);
                if (piiWarning) setPiiWarning(null);
              }}
              maxLength={160}
              placeholder="เช่น ตรวจพรีวิวรอบเดือน พ.ย. 2026 หรือเช็กความพร้อม 27 .rpt (ห้ามใส่ชื่อสมาชิก/เลขบัตร/เบอร์โทร)"
              className="w-full px-4 py-2.5 rounded-2xl bg-white/95 dark:bg-slate-950 border border-blue-200 dark:border-slate-700 text-xs sm:text-sm text-[#14243A] dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
              คำเตือน Zero-PII 100%: ห้ามระบุชื่อ-นามสกุลสมาชิก เลขบัตรประชาชน 13 หลัก เบอร์โทรศัพท์ หรือยอดหนี้รายบุคคล
            </p>
          </div>

          <div className="lg:col-span-5 space-y-1.5">
            <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">
              กรองหมวดงาน ({filteredTasks.length} / {CMS2_ALLOWED_TASKS.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'ALL', label: 'ทั้งหมด (14)' },
                  { id: 'SYSTEM', label: 'System & Doc B (3)' },
                  { id: 'WORK4_PRINT', label: 'WORK 4 A6 (2)' },
                  { id: 'WORK1_9', label: 'WORK 1–9 (8)' },
                  { id: 'V003_DATA', label: 'V003 (1)' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTaskFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer border transition-all ${
                    taskFilter === f.id
                      ? 'bg-blue-600 text-white border-blue-600 dark:bg-teal-500 dark:text-slate-950 dark:border-teal-400 shadow-2xs'
                      : 'bg-white/85 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* PII Guard Warning */}
        {piiWarning && (
          <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700 text-xs font-bold text-rose-800 dark:text-rose-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{piiWarning}</span>
          </div>
        )}

        {/* Last Submitted Job Feedback */}
        {lastJobResult && (
          <div
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
              lastJobResult.success
                ? 'bg-emerald-50/90 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-700 text-emerald-950 dark:text-emerald-200'
                : 'bg-rose-50/90 dark:bg-rose-950/60 border-rose-200 dark:border-rose-700 text-rose-950 dark:text-rose-200'
            }`}
          >
            <div className="space-y-1">
              <div className="font-bold flex items-center gap-2">
                {lastJobResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{lastJobResult.message}</span>
              </div>
              <div className="font-mono text-[11px] opacity-90">
                Task: {lastJobResult.taskType}
                {lastJobResult.jobId ? ` • Job ID: ${lastJobResult.jobId}` : ''} • Status:{' '}
                {lastJobResult.status} • {lastJobResult.latencyMs}ms • {lastJobResult.timestamp}
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenLogsModal}
              className="px-3.5 py-2 rounded-xl bg-white/90 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-blue-700 dark:text-teal-300 hover:bg-white cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>ดู Payload Logs →</span>
            </button>
          </div>
        )}

        {/* 14 Allowlist Task Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredTasks.map((task) => {
            const isSending = submittingTask === task.taskType;
            return (
              <div
                key={task.taskType}
                className="p-4 rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between space-y-3 shadow-2xs hover:border-blue-300 dark:hover:border-teal-500/50 transition-all"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-blue-100 dark:bg-teal-500/20 text-blue-800 dark:text-teal-300 border border-blue-200 dark:border-teal-500/30 truncate">
                      {task.taskType}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                        Zero-PII
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                        Paper=0
                      </span>
                    </div>
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold text-[#14243A] dark:text-white">
                    {task.label}
                  </h3>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    {task.description}
                  </p>
                </div>

                <LiquidButton
                  type="button"
                  size="sm"
                  disabled={Boolean(submittingTask)}
                  onClick={() => handleRunAllowlistTask(task)}
                  className="w-full text-xs font-bold cursor-pointer"
                >
                  {isSending ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      <span>กำลังส่งคิว...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5 text-blue-600 dark:text-teal-300" />
                      <span>ส่งคิวงานเข้า CMS-2</span>
                    </>
                  )}
                </LiquidButton>
              </div>
            );
          })}
        </div>
      </GlassBox>

      {/* ==================================================================== */}
      {/* STEP 4: Connected Ecosystem & Internal Studios                       */}
      {/* ==================================================================== */}
      <GlassBox id="ucf-step-4" variant="default" className="p-5 sm:p-7 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/40">
                STEP 4
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-[#14243A] dark:text-white">
                ศูนย์รวมเครื่องมือที่เชื่อมทั้งหมด (Connected Ecosystem)
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              เข้าถึงทุกปลายทางจริงภายนอกและสลับไปยัง Studio ภายในแอปได้ในคลิกเดียว
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 w-fit">
            {ecosystemDestinations.length} ปลายทาง + {internalStudios.length} Studio
          </span>
        </div>

        {/* External Connected Destinations */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {ecosystemDestinations.map((dest) => (
            <a
              key={dest.id}
              href={dest.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-slate-200/80 dark:border-slate-800 hover:border-blue-400 dark:hover:border-teal-400 transition-all shadow-2xs group flex flex-col justify-between space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                    {dest.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-[#14243A] dark:text-white group-hover:text-blue-700 dark:group-hover:text-teal-300 truncate flex items-center gap-1">
                      <span className="truncate">{dest.name}</span>
                      <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {dest.subtitle}
                    </p>
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100/90 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 shrink-0">
                  {dest.status}
                </span>
              </div>
            </a>
          ))}
        </div>

        {/* Internal Studios Quick Switcher */}
        <div className="pt-4 border-t border-slate-200/70 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-bold text-[#14243A] dark:text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-600 dark:text-teal-400" />
              <span>สลับไปยัง Studio ภายในแอป:</span>
            </h3>
            <button
              type="button"
              onClick={onOpenLogsModal}
              className="text-xs font-semibold text-blue-600 dark:text-teal-400 hover:underline cursor-pointer flex items-center gap-1"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Payload Inspector</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {internalStudios.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => onNavigate(st.id)}
                className="p-3 rounded-2xl bg-white/85 dark:bg-slate-900/85 hover:bg-blue-50/80 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 shadow-2xs group"
              >
                <div className="flex items-center justify-between">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    {st.icon}
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-teal-300" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#14243A] dark:text-white">{st.label}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2">
                    {st.sub}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </GlassBox>
    </div>
  );
};
