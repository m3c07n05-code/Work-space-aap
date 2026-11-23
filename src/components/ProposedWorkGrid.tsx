import React, { useState } from 'react';
import { ExternalLink, CheckCircle2, Layers } from 'lucide-react';
import { WORKSPACE_FOLDER_ID } from '../services/backendGateway';

interface ProposedWorkGridProps {
  onSelectWork?: (workId: string) => void;
}

export const ProposedWorkGrid: React.FC<ProposedWorkGridProps> = ({ onSelectWork }) => {
  const [activeNotice, setActiveNotice] = useState<string | null>(null);

  const workItems = [
    {
      id: 'WORK 1',
      title: 'แยก พม. / พม.+สัญญาอื่น',
      status: 'ACTIVE_STUDIO',
      runnerTask: 'WORK1_PRINT',
      desc: 'ตรวจรอบมติ แยกสมาชิกที่มี พม. 1 สัญญา ออกจากสมาชิกหลายสัญญา (13 คอลัมน์ + Drive 3D)',
    },
    {
      id: 'WORK 2',
      title: 'ระบบสัญญาร่วม & ผู้ค้ำประกัน',
      status: 'READY_CMS2',
      runnerTask: 'WORK2_FOLLOWUP',
      desc: 'ตรวจสอบการค้ำประกันไขว้และติดตามหนี้สัญญาเดี่ยว/ร่วมบนฝั่ง CMS-2 (9/9 READY_100%)',
    },
    {
      id: 'WORK 3',
      title: 'พรีวิวแจ้งเตือน SMS & เบี้ยปรับ V003',
      status: 'READY_CMS2',
      runnerTask: 'WORK3_SMS_PREVIEW',
      desc: 'จัดชุดพรีวิวข้อความแจ้งหนี้ควบคุมตามกฎ V003 คงศูนย์นำหน้า (NO_AUTO_SEND_SMS)',
    },
    {
      id: 'WORK 4',
      title: 'เตรียมพิมพ์จดหมาย 9 หมวด & EMS A6',
      status: 'ACTIVE_STUDIO',
      runnerTask: 'WORK4_PREVIEW_A6',
      desc: 'ตรวจรายชื่อ 9 หมวด แยกผู้กู้/กู้ร่วม/ผู้ค้ำ × 2/4/5 งวด (A6 Direct-RPT, Paper=0)',
    },
    {
      id: 'WORK 5',
      title: 'สรุปสัญญาผิดนัดชำระ (Default Loan)',
      status: 'READY_CMS2',
      runnerTask: 'WORK5_DEFAULT_LOAN',
      desc: 'เชื่อมต่อ Staging สรุปสถานะสัญญาผิดนัดและยอดรายวันปลอด PII 100%',
    },
    {
      id: 'WORK 6',
      title: 'รายงานรับชำระ 077 & ลูกหนี้คงเหลือ',
      status: 'READY_CMS2',
      runnerTask: 'WORK6_PAYMENT_077',
      desc: 'แยกหมวดลูกหนี้ตามอายุหนี้และประมวลผลชุดข้อมูลรับชำระ 077 บน CMS-2',
    },
    {
      id: 'WORK 7',
      title: 'จับคู่รหัสส่ง SMS แจ้งหนี้ (Mapping)',
      status: 'READY_CMS2',
      runnerTask: 'WORK7_SMS_MAPPING',
      desc: 'ตรวจสอบสิทธิ์และจับคู่รหัสส่งข้อความแจ้งหนี้ระดับสัญญาในโหมด Staging',
    },
    {
      id: 'WORK 8',
      title: 'ตรวจสอบผู้ค้ำประกัน & อายุความ',
      status: 'READY_CMS2',
      runnerTask: 'WORK8_GUARANTOR',
      desc: 'สแกนสิทธิ์ผู้ค้ำประกันและสัญญาที่เข้าเกณฑ์ติดตามเร่งด่วนบน CMS-2',
    },
    {
      id: 'WORK 9',
      title: 'ออกรายงานสรุปผู้บริหาร (Exec Report)',
      status: 'READY_CMS2',
      runnerTask: 'WORK9_EXEC_REPORT',
      desc: 'สรุปผลเชิงบริหารแบบ Aggregate ปลอด PII 100% ลง OneDrive Canonical Output',
    },
  ];

  const externalLinks = [
    {
      id: 'UI-03',
      name: 'Google Drive Workspace',
      url: `https://drive.google.com/drive/folders/${WORKSPACE_FOLDER_ID}`,
      desc: 'โฟลเดอร์ AI_Project_Workspace & 00_Project_Manifest.json',
    },
    {
      id: 'UI-DOCB',
      name: 'Doc B Command Inbox',
      url: 'https://docs.google.com/document/d/1UL_maGIJiMm8N6f0sUIYwAkFsqpHLz4HrZbkQZTZn7Q/edit',
      desc: 'เอกสารสั่งงานระยะไกลและรายงานผล Execution Report',
    },
    {
      id: 'UI-FORM',
      name: 'ฟอร์มศูนย์ประสานงาน 9+1',
      url: 'https://docs.google.com/forms/d/e/1FAIpQLSc3JEZFvAo4Wqyfj2NtK3zCrcs-oN_F6heZ-hzr7ZDDrH2NKQ/viewform',
      desc: 'Google Form 10 ศูนย์ประสานงาน (STATUS: PASS)',
    },
    {
      id: 'UI-SHEET',
      name: 'ชีต การตอบแบบฟอร์ม 1',
      url: 'https://docs.google.com/spreadsheets/d/1BuevtBv23pzRyONidpGqcStyCKkW_NtCP2XCTkMvzbk/edit',
      desc: 'ฐานข้อมูลคำตอบจากฟอร์มศูนย์ประสานงาน 9+1',
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
      url: 'https://njnatee99.atlassian.net/browse/SCRUM-1',
      desc: 'ระบบติดตามงาน CRD Backlog (SCRUM-1: Direct-RPT PDF & A6 Print)',
    },
  ];

  const handleActionClick = (id: string, title: string, runnerTask: string) => {
    if (id === 'WORK 1' && onSelectWork) {
      onSelectWork('work1');
      return;
    }
    if (id === 'WORK 4' && onSelectWork) {
      onSelectWork('work4');
      return;
    }
    if (onSelectWork) {
      onSelectWork('control-flow');
      return;
    }
    setActiveNotice(
      `สถานะ: [READY_100% ฝั่ง CMS-2] - โมดูล "${title}" (${runnerTask}) พร้อมส่งคิวรันอย่างปลอดภัยผ่านหน้า Unified Control Flow`
    );
    setTimeout(() => setActiveNotice(null), 5000);
  };

  return (
    <section className="card-glass rounded-3xl p-6 sm:p-8 space-y-6 border border-blue-200/90 shadow-[0_16px_40px_-16px_rgba(20,50,90,0.1)]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 dark:border-slate-800 pb-4">
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-[#14243A] dark:text-white flex items-center gap-2.5">
            <Layers className="w-6 h-6 text-indigo-600 dark:text-teal-400" />
            <span>โครงสร้างงาน CRD &amp; ผังงาน WORK 1–9</span>
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
            สถานะชุดงานทั้ง 9 หมวดฝั่ง PC Worker CMS-2 (9/9 READY_100%) — กดเพื่อเปิด Studio หรือส่งคิวรันผ่าน Unified Control Flow
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
            CMS-2: 9/9 READY_100%
          </span>
          <span className="px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30">
            Section 05 Compliance
          </span>
        </div>
      </div>

      {activeNotice && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-500/40 rounded-2xl text-xs sm:text-sm text-emerald-900 dark:text-emerald-300 flex items-start gap-2.5 shadow-2xs font-sans">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <span>{activeNotice}</span>
        </div>
      )}

      {/* Grid WORK 1-9 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
        {workItems.map((item) => {
          const isStudio = item.status === 'ACTIVE_STUDIO';
          return (
            <div
              key={item.id}
              onClick={() => handleActionClick(item.id, item.title, item.runnerTask)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                isStudio
                  ? 'bg-blue-50/90 dark:bg-teal-950/40 border-blue-300 dark:border-teal-500/40 shadow-xs hover:border-blue-500'
                  : 'bg-white/90 dark:bg-slate-950/80 border-emerald-200/80 dark:border-slate-800 hover:border-blue-400 shadow-2xs'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="text-xs font-bold font-mono text-blue-700 dark:text-teal-300">{item.id}</span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                      isStudio
                        ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40'
                        : 'bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-700'
                    }`}
                  >
                    {isStudio ? '● STUDIO + READY' : '● READY_100%'}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-[#14243A] dark:text-white leading-snug">{item.title}</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{item.desc}</p>
              </div>

              <div className="pt-2 border-t border-blue-50 dark:border-slate-800/80 text-[11px] font-medium text-blue-700 dark:text-teal-300 flex items-center justify-between">
                <span>{isStudio ? 'เปิด Studio ในแอป' : 'ส่งคิวผ่าน Control Flow →'}</span>
                <span className="font-mono text-[10px] text-slate-400">{item.runnerTask}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* External CRD Verification Links */}
      <div className="pt-4 border-t border-blue-100 dark:border-slate-800">
        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3">
          ลิงก์เชื่อมโยงเอกสารและเครื่องมือ CRD ภายนอก:
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
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
      </div>
    </section>
  );
};
