import React from 'react';
import {
  Mail,
  ExternalLink,
  ShieldCheck,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { GlassBox } from './ui/glass-box';

interface AutoCycleSpec {
  id: string;
  title: string;
  schedule: string;
  subtitle: string;
  isActiveNow: boolean;
  icon: React.ReactNode;
}

const APPSHEET_URL =
  'https://www.appsheet.com/newshortcut/545c8e25-4d3b-44e4-8267-cf06caca4f15';

function isWithinWork1Window(date: Date): boolean {
  const day = date.getDate();
  return day >= 21 || day <= 5;
}

export const CrdLiveOperationsPanel: React.FC = () => {
  const now = new Date();
  const work1Active = isWithinWork1Window(now);

  const autoCycles: AutoCycleSpec[] = [
    {
      id: 'WORK1-AUTO',
      title: 'WORK 1 · ดึงเมลสาขา 9+1 ศูนย์ (ออโต้ตามรอบ)',
      schedule: 'รอบวันที่ 21 – 5 ของทุกเดือน',
      subtitle: 'แยก 7 โฟลเดอร์อัตโนมัติ + ทะเบียน Excel + จับคู่ S_Data_Loan (ไม่ต้องกดยิงเอง)',
      isActiveNow: work1Active,
      icon: <Mail className="w-5 h-5 text-blue-600 dark:text-teal-400" />,
    },
  ];

  return (
    <GlassBox variant="frosted" className="p-4 sm:p-6 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-300">
              AUTO SCHEDULE · รันอัตโนมัติตามรอบ
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" /> Zero-PII &amp; Paper=0
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
            งานอัตโนมัติตามรอบเวลา (Auto-Run)
          </h2>
        </div>

        <a
          href={APPSHEET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-500 transition-colors shrink-0"
        >
          <span>เปิด AppSheet มือถือ</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="grid grid-cols-1 gap-3.5">
        {autoCycles.map((cycle) => (
          <div
            key={cycle.id}
            className="rounded-2xl border border-slate-200/80 dark:border-slate-700/70 bg-white/75 dark:bg-slate-900/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-slate-800 shrink-0">
                {cycle.icon}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {cycle.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  {cycle.subtitle}
                </p>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{cycle.schedule}</span>
                </div>
              </div>
            </div>

            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold shrink-0 self-start sm:self-center ${
                cycle.isActiveNow
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{cycle.isActiveNow ? 'อยู่ในรอบทำงานอัตโนมัติ (21–5)' : 'รอเปิดรอบถัดไป (วันที่ 21)'}</span>
            </span>
          </div>
        ))}
      </div>
    </GlassBox>
  );
};
