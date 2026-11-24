import React from 'react';
import {
  FileSpreadsheet,
  Printer,
  Layers,
  Activity,
  ChevronRight,
  Settings,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { GatewayConfig } from '../types';
import { LiquidButton } from './ui/liquid-glass-button';
import { GlassBox } from './ui/glass-box';

interface CleanHubDashboardProps {
  config: GatewayConfig;
  scopesCount: number;
  logCount: number;
  onNavigate: (
    view:
      | 'control-flow'
      | 'work1'
      | 'work4'
      | 'ai-studio'
      | 'scope-builder'
      | 'stop-gates'
      | 'gascode'
      | 'proposed-work'
      | 'admin-hub'
  ) => void;
  onOpenGatewayModal: () => void;
  onOpenLogsModal: () => void;
  onOpenExportModal?: () => void;
  theme: 'light' | 'dark';
}

export const CleanHubDashboard: React.FC<CleanHubDashboardProps> = ({
  onNavigate,
}) => {
  // หน้าบ้าน (Front Office): เฉพาะงานปฏิบัติการจริงที่ใช้งานประจำวัน ไม่ปนโค้ดหรือเครื่องมือหลังบ้าน
  const frontCards = [
    {
      id: 'work1' as const,
      title: 'WORK 1: พ้นสมาชิกภาพ (A–M ล็อก 100%)',
      desc: 'ตาราง 13 คอลัมน์มาตรฐาน แยก พม. เดี่ยว/สัญญาอื่น และสำรองข้อมูล Drive',
      badge: 'WORK 1',
      icon: <FileSpreadsheet className="w-6 h-6 text-blue-600 dark:text-teal-400" />,
      actionText: 'เปิดงาน WORK 1',
      highlight: true,
    },
    {
      id: 'work4' as const,
      title: 'WORK 4: พิมพ์จดหมาย 9 หมวด & EMS A6',
      desc: 'ตรวจชุดพิมพ์จดหมายบอกกล่าว ใบนำส่ง A4 และใบฟ้า EMS แบบ Read-Only 100%',
      badge: 'WORK 4',
      icon: <Printer className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />,
      actionText: 'เปิดห้องพิมพ์ WORK 4',
      highlight: false,
    },
    {
      id: 'proposed-work' as const,
      title: 'ศูนย์ปฏิบัติการสายงาน WORK 1–9',
      desc: 'เข้าถึงทุกสายงานปฏิบัติการ CRD ครบทั้ง 9 สายงานในที่เดียว',
      badge: '9 สายงาน',
      icon: <Layers className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />,
      actionText: 'ดูสายงาน WORK 1–9',
      highlight: false,
    },
    {
      id: 'control-flow' as const,
      title: 'ศูนย์สั่งการและตรวจสถานะงาน (Control Flow)',
      desc: 'ตรวจสถานะระบบ ดึงงาน รันสคริปต์ และเชื่อมเครื่องมือปฏิบัติการ',
      badge: 'Live Flow',
      icon: <Activity className="w-6 h-6 text-sky-600 dark:text-sky-400" />,
      actionText: 'เปิดศูนย์สั่งการ',
      highlight: false,
    },
  ];

  return (
    <section className="space-y-5">
      {/* Compact Front-Office Header for iPhone 15 Pro Max */}
      <GlassBox variant="frosted" className="p-5 sm:p-6 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-teal-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            หน้าบ้านปฏิบัติการจริง (Front Office)
          </span>
          <button
            type="button"
            onClick={() => onNavigate('admin-hub')}
            className="touch-target inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100/90 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>ไปหลังบ้าน</span>
          </button>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#14243A] dark:text-white">
          เลือกสายงานที่ต้องการดำเนินการ
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          รวมงานปฏิบัติการจริง WORK 1–9 และห้องพิมพ์จดหมายไว้หน้าเดียว ส่วนตั้งค่า Gateway, ส่งคำสั่ง AI อัตโนมัติ, โค้ด Code.gs และ Logs แยกไปไว้หน้าหลังบ้านเรียบร้อยแล้ว
        </p>
      </GlassBox>

      {/* Primary Front-Office Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {frontCards.map((card) => (
          <GlassBox
            key={card.id}
            variant="default"
            interactive={true}
            onClick={() => onNavigate(card.id)}
            className="group"
          >
            <div className="p-5 flex flex-col justify-between space-y-4 h-full">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-slate-100/90 dark:bg-slate-900 border border-white dark:border-slate-800 shadow-2xs">
                    {card.icon}
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/90 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700">
                    {card.badge}
                  </span>
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-bold text-[#14243A] dark:text-white group-hover:text-blue-700 dark:group-hover:text-teal-300 transition-colors">
                    {card.title}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {card.desc}
                  </p>
                </div>
              </div>

              <LiquidButton
                size="default"
                variant={card.highlight ? 'glowing' : 'default'}
                glow={card.highlight}
                className="touch-target w-full text-xs font-bold cursor-pointer"
              >
                <span>{card.actionText}</span>
                <ChevronRight className="w-4 h-4 ml-1" />
              </LiquidButton>
            </div>
          </GlassBox>
        ))}
      </div>

      {/* Compact Safety Footer Pill */}
      <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white/75 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>มาตรฐาน Zero-PII & Read-Only 100%</span>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('admin-hub')}
          className="font-semibold text-blue-700 dark:text-teal-400 hover:underline cursor-pointer"
        >
          จัดการหลังบ้าน →
        </button>
      </div>
    </section>
  );
};
