import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  ShieldCheck,
  FolderArchive,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  HardDriveUpload,
  Filter,
} from 'lucide-react';
import { GlassBox } from './ui/glass-box';
import { LiquidButton } from './ui/liquid-glass-button';
import GlassFolder from './ui/glass-folder-cards';
import {
  WORK1_13_HEADERS,
  WORK1_SYNTHETIC_ROWS,
  Work1AgendaGroup,
  CRD_WORK1_9_BACKUP_FOLDERS,
  BackupFileSpec,
  BackupSyncResult,
  buildWork1Csv,
  toGlassFolderFiles,
  dispatchBackupFileToDrive,
} from '../services/work1BackupService';

interface Work1AndBackupStudioProps {
  theme?: 'light' | 'dark';
}

export const Work1AndBackupStudio: React.FC<Work1AndBackupStudioProps> = ({ theme = 'light' }) => {
  const [agendaFilter, setAgendaFilter] = useState<'ALL' | Work1AgendaGroup>('ALL');
  const [csvFeedback, setCsvFeedback] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<BackupFileSpec>(
    CRD_WORK1_9_BACKUP_FOLDERS[0].files[0]
  );
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupResults, setBackupResults] = useState<Record<string, BackupSyncResult>>({});
  const [lastBackupNotice, setLastBackupNotice] = useState<BackupSyncResult | null>(null);

  const filteredRows =
    agendaFilter === 'ALL'
      ? WORK1_SYNTHETIC_ROWS
      : WORK1_SYNTHETIC_ROWS.filter((r) => r.agendaGroup === agendaFilter);

  const handleExportCsv = () => {
    const csvContent = buildWork1Csv(filteredRows);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WORK1_13Col_ZeroPII_Demo_${agendaFilter.toLowerCase()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setCsvFeedback(
      `ส่งออก CSV ครบ ${WORK1_13_HEADERS.length} คอลัมน์ (${filteredRows.length} แถวจำลอง Zero-PII) เรียบร้อยแล้ว`
    );
    setTimeout(() => setCsvFeedback(null), 5000);
  };

  const handleBackupSingleFile = async (file: BackupFileSpec) => {
    if (isBackingUp) return;
    setSelectedFile(file);
    setIsBackingUp(true);
    setLastBackupNotice(null);
    try {
      const result = await dispatchBackupFileToDrive(file);
      setBackupResults((prev) => ({ ...prev, [file.id]: result }));
      setLastBackupNotice(result);
    } finally {
      setIsBackingUp(false);
    }
  };

  const folderTone = theme === 'dark' ? 'dark' : 'light';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Banner */}
      <GlassBox variant="frosted" className="p-6 sm:p-7 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-blue-100/80 dark:bg-teal-500/15 text-blue-900 dark:text-teal-300 border border-blue-200/80 dark:border-teal-500/30">
                WORK 1 · 13-Column Report
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-100/80 dark:bg-emerald-500/15 text-emerald-900 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-500/30 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                ZERO-PII DEMO CONTRACT
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#14243A] dark:text-white">
              ตาราง WORK 1 (13 คอลัมน์) + ส่งออก CSV &amp; สำรอง Drive 3D
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              แสดงโครงสร้างตารางรายงานพ้นสมาชิกภาพ 13 คอลัมน์ (แยกวาระ 4.1 พม. และ 4.2 พม.+สัญญาอื่น) ด้วยข้อมูลจำลองปลอด PII 100% พร้อมระบบสำรองรายไฟล์ <code className="font-mono font-bold">CRD_WORK1_9_BACKUP</code> ผ่าน GAS Gateway
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <LiquidButton
              type="button"
              size="default"
              variant="glowing"
              glow={true}
              onClick={handleExportCsv}
              className="text-xs font-bold cursor-pointer"
            >
              <Download className="w-4 h-4 text-blue-600 dark:text-teal-300" />
              <span>Export CSV (13 คอลัมน์)</span>
            </LiquidButton>
          </div>
        </div>

        {csvFeedback && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-500/40 text-xs text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{csvFeedback}</span>
          </div>
        )}
      </GlassBox>

      {/* Section 1: WORK 1 13-Column Table */}
      <GlassBox variant="default" className="p-5 sm:p-7 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-blue-600 dark:text-teal-400" />
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[#14243A] dark:text-white">
                ตารางรายงาน WORK 1 มาตรฐาน {WORK1_13_HEADERS.length} คอลัมน์
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                คงศูนย์นำหน้า Mem_ID 5 หลัก และแยกคีย์สัญญา (NewLoanID) ออกจากยอดหุ้น/เงินฝากระดับสมาชิก
              </p>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
            {(
              [
                { id: 'ALL', label: `ทั้งหมด (${WORK1_SYNTHETIC_ROWS.length})` },
                { id: '4.1_PM_ONLY', label: 'วาระ 4.1 พม. สิทธิเดี่ยว' },
                { id: '4.2_PM_PLUS_OTHER', label: 'วาระ 4.2 พม.+สัญญาอื่น' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setAgendaFilter(opt.id)}
                className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer border ${
                  agendaFilter === opt.id
                    ? 'bg-blue-600 text-white border-blue-600 dark:bg-teal-500 dark:text-slate-950 dark:border-teal-400 shadow-xs'
                    : 'bg-white/80 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 13-Column Scrollable Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-950/70">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800">
                {WORK1_13_HEADERS.map((header, idx) => (
                  <th
                    key={header}
                    className="px-3 py-2.5 font-bold whitespace-nowrap border-r last:border-r-0 border-slate-200/60 dark:border-slate-800"
                  >
                    <span className="text-[10px] font-mono text-slate-400 mr-1">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
              {filteredRows.map((row, idx) => (
                <tr
                  key={`${row.memberId}-${row.contractNo}`}
                  className="hover:bg-blue-50/50 dark:hover:bg-slate-900/60 transition-colors"
                >
                  <td className="px-3 py-2.5 font-mono tabular-nums text-slate-500">{idx + 1}</td>
                  <td className="px-3 py-2.5 font-mono font-bold text-blue-700 dark:text-teal-300 tabular-nums">
                    {row.memberId}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap font-medium">{row.memberName}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        row.agendaGroup === '4.1_PM_ONLY'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                      }`}
                    >
                      {row.statusLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono whitespace-nowrap">{row.contractNo}</td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-right">
                    {row.loanAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-right">
                    {row.principalBalance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-right">
                    {row.fineAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-right font-semibold">
                    {row.totalDefaultContract.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </td>
                  <td
                    className="px-3 py-2.5 font-mono tabular-nums text-right"
                    title="ข้อมูลระดับสมาชิก ห้ามรวมซ้ำหลายสัญญา"
                  >
                    {row.isFirstContractOfMember ? (
                      row.totalShares.toLocaleString('th-TH', { minimumFractionDigits: 2 })
                    ) : (
                      <span className="text-[11px] text-slate-400">
                        {row.totalShares.toLocaleString('th-TH')} (ซ้ำระดับสมาชิก)
                      </span>
                    )}
                  </td>
                  <td
                    className="px-3 py-2.5 font-mono tabular-nums text-right"
                    title="ข้อมูลระดับสมาชิก ห้ามรวมซ้ำหลายสัญญา"
                  >
                    {row.isFirstContractOfMember ? (
                      row.depositAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })
                    ) : (
                      <span className="text-[11px] text-slate-400">— (ระดับสมาชิก)</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{row.affiliation}</td>
                  <td className="px-3 py-2.5 font-mono whitespace-nowrap tabular-nums">
                    {row.lastPaymentDate}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassBox>

      {/* Section 2: CRD_WORK1_9_BACKUP 3D GlassFolder Per-File Backup */}
      <GlassBox variant="frosted" className="p-6 sm:p-7 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <FolderArchive className="w-5 h-5 text-indigo-600 dark:text-teal-400" />
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[#14243A] dark:text-white">
                ระบบสำรองรายไฟล์ Google Drive (<code className="font-mono">CRD_WORK1_9_BACKUP</code>) — 3D GlassFolder
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                คลิกที่แฟ้ม 3 มิติเพื่อเปิดและเลือกไฟล์ จากนั้นกดสำรองเมทาดาต้าเข้า <code className="font-mono">00_Project_Manifest.json</code> พร้อมตรวจสอบ Readback จริงจาก GAS Gateway
              </p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-white/80 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            CORS-Readable ACK
          </span>
        </div>

        {/* 3D GlassFolder Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 justify-items-center py-4">
          {CRD_WORK1_9_BACKUP_FOLDERS.map((group, groupIdx) => (
            <div key={group.id} className="flex flex-col items-center gap-3">
              <GlassFolder
                label={group.label}
                meta={group.meta}
                tone={folderTone}
                art={group.art}
                seed={group.seed}
                width={260}
                appear={true}
                appearDelay={groupIdx * 90}
                action="more"
                files={toGlassFolderFiles(group.files)}
                onFileSelect={(_, fileIdx) => {
                  const spec = group.files[fileIdx];
                  if (spec) {
                    setSelectedFile(spec);
                  }
                }}
              />
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                คลิกเปิดแฟ้มเพื่อเลือกไฟล์ ({group.files.length} ไฟล์)
              </span>
            </div>
          ))}
        </div>

        {/* Selected File Inspector & Per-File Drive Backup Trigger */}
        <div className="p-5 rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-slate-200/80 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-mono font-bold bg-blue-100 dark:bg-teal-500/20 text-blue-800 dark:text-teal-300">
                  {selectedFile.workId}
                </span>
                <span className="font-mono text-sm font-bold text-[#14243A] dark:text-white">
                  {selectedFile.name}
                </span>
                <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
                  [{selectedFile.gate}]
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">{selectedFile.summary}</p>
              <p className="text-[11px] font-mono text-slate-500">
                ปลายทาง Drive: {selectedFile.driveTargetFolder}
              </p>
            </div>

            <LiquidButton
              type="button"
              size="default"
              variant="glowing"
              glow={true}
              disabled={isBackingUp}
              onClick={() => handleBackupSingleFile(selectedFile)}
              className="text-xs font-bold shrink-0 cursor-pointer"
            >
              {isBackingUp ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                  <span>กำลังสำรอง &amp; Readback...</span>
                </>
              ) : (
                <>
                  <HardDriveUpload className="w-4 h-4 text-blue-600 dark:text-teal-300" />
                  <span>สำรองไฟล์นี้เข้า Google Drive</span>
                </>
              )}
            </LiquidButton>
          </div>

          {/* Quick File Selector Chips */}
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-200/60 dark:border-slate-800">
            {CRD_WORK1_9_BACKUP_FOLDERS.flatMap((g) => g.files).map((file) => {
              const status = backupResults[file.id];
              const isSelected = selectedFile.id === file.id;
              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => setSelectedFile(file)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all cursor-pointer border flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 dark:bg-teal-500 dark:text-slate-950'
                      : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-blue-300'
                  }`}
                >
                  {status?.readbackVerified && (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  )}
                  <span>{file.workId}</span>
                </button>
              );
            })}
          </div>

          {lastBackupNotice && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                lastBackupNotice.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-500/40 text-emerald-900 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-500/40 text-rose-900 dark:text-rose-300'
              }`}
            >
              {lastBackupNotice.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <div className="font-bold">{lastBackupNotice.message}</div>
                <div className="font-mono text-[11px] opacity-85">
                  manifestUpdated: {String(lastBackupNotice.manifestUpdated)} | readbackVerified:{' '}
                  {String(lastBackupNotice.readbackVerified)}
                  {lastBackupNotice.eventId ? ` | eventId: ${lastBackupNotice.eventId}` : ''}
                </div>
              </div>
            </div>
          )}
        </div>
      </GlassBox>
    </div>
  );
};
