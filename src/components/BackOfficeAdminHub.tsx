import React from 'react';
import {
  Settings,
  ShieldCheck,
  Code2,
  Terminal,
  PlusCircle,
  Sparkles,
  Box,
  Download,
  ChevronRight,
  Wifi,
  RefreshCw,
} from 'lucide-react';
import { GatewayConfig } from '../types';
import { backendGateway } from '../services/backendGateway';

interface BackOfficeAdminHubProps {
  config: GatewayConfig;
  scopesCount: number;
  logCount: number;
  livePayloadCount: number;
  onNavigate: (
    view: 'scope-builder' | 'stop-gates' | 'ai-studio' | '3d-view' | 'gascode'
  ) => void;
  onOpenGatewayModal: () => void;
  onOpenLogsModal: () => void;
  onOpenExportModal: () => void;
}

export const BackOfficeAdminHub: React.FC<BackOfficeAdminHubProps> = ({
  config,
  scopesCount,
  logCount,
  livePayloadCount,
  onNavigate,
  onOpenGatewayModal,
  onOpenLogsModal,
  onOpenExportModal,
}) => {
  const [isPinging, setIsPinging] = React.useState(false);
  const isConnected =
    config.status === 'connected' &&
    backendGateway.hasGatewayUrl() &&
    backendGateway.hasGatewayToken();

  const handleQuickPing = async () => {
    setIsPinging(true);
    try {
      await backendGateway.testConnection();
    } finally {
      setIsPinging(false);
    }
  };

  const quickTiles = [
    {
      id: 'ai-studio',
      title: 'สั่ง AI อัตโนมัติ',
      meta: 'Manifest + คิว',
      icon: <Sparkles className="w-5 h-5 text-white" />,
      gradient: 'from-blue-500 to-indigo-600',
      onClick: () => onNavigate('ai-studio'),
    },
    {
      id: 'scope-builder',
      title: 'ขอบเขตงาน',
      meta: `${scopesCount} รายการ`,
      icon: <PlusCircle className="w-5 h-5 text-white" />,
      gradient: 'from-teal-500 to-emerald-600',
      onClick: () => onNavigate('scope-builder'),
    },
    {
      id: 'stop-gates',
      title: '16 ด่าน PDPA',
      meta: '16/16 ผ่าน',
      icon: <ShieldCheck className="w-5 h-5 text-white" />,
      gradient: 'from-emerald-500 to-green-600',
      onClick: () => onNavigate('stop-gates'),
    },
    {
      id: 'payloads',
      title: 'Live Payloads',
      meta: `${livePayloadCount || logCount} บันทึก`,
      icon: <Terminal className="w-5 h-5 text-white" />,
      gradient: 'from-slate-700 to-slate-900',
      onClick: onOpenLogsModal,
    },
    {
      id: 'gascode',
      title: 'โค้ด Code.gs',
      meta: 'Apps Script',
      icon: <Code2 className="w-5 h-5 text-white" />,
      gradient: 'from-amber-500 to-orange-600',
      onClick: () => onNavigate('gascode'),
    },
    {
      id: '3d-view',
      title: 'ผังระบบ 3 มิติ',
      meta: 'Three.js Map',
      icon: <Box className="w-5 h-5 text-white" />,
      gradient: 'from-violet-500 to-purple-600',
      onClick: () => onNavigate('3d-view'),
    },
  ];

  return (
    <section className="space-y-4">
      {/* Sleek iOS Control-Center Status Card (Compact, Layered Depth, Zero Text Bloat) */}
      <div className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A] text-white shadow-[0_14px_36px_-10px_rgba(15,23,42,0.45)] border border-white/10">
        <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full bg-sky-500/20 blur-2xl pointer-events-none" />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-md flex items-center justify-center shrink-0">
              <Wifi className={`w-5 h-5 ${isConnected ? 'text-emerald-400' : 'text-amber-300'}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight">ศูนย์ควบคุมหลังบ้าน</span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isConnected
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                      : 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  {isConnected ? `ออนไลน์ ${config.latencyMs}ms` : 'รอตั้งค่า'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300/80 truncate mt-0.5">
                Google Apps Script · Drive Manifest Sync
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleQuickPing}
            disabled={isPinging}
            title="ทดสอบการเชื่อมต่อ"
            className="touch-target w-11 h-11 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 border border-white/15 flex items-center justify-center transition-all cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-4 h-4 text-sky-300 ${isPinging ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Clean 2-Button Action Strip (Ready for custom button replacement) */}
        <div className="relative grid grid-cols-2 gap-2.5 mt-4">
          <button
            type="button"
            onClick={onOpenGatewayModal}
            className="touch-target flex items-center justify-center gap-2 rounded-2xl bg-white/12 hover:bg-white/20 active:scale-[0.98] border border-white/15 text-xs font-bold text-white transition-all cursor-pointer"
          >
            <Settings className="w-4 h-4 text-sky-300" />
            <span>ตั้งค่า Gateway</span>
          </button>
          <button
            type="button"
            onClick={onOpenExportModal}
            className="touch-target flex items-center justify-center gap-2 rounded-2xl bg-white/12 hover:bg-white/20 active:scale-[0.98] border border-white/15 text-xs font-bold text-white transition-all cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-300" />
            <span>ส่งออกโค้ด</span>
          </button>
        </div>
      </div>

      {/* Symmetrical 2x3 iOS Glass Bento Grid (Balanced, Clean, Zero Clutter) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {quickTiles.map((tile) => (
          <button
            key={tile.id}
            type="button"
            onClick={tile.onClick}
            className="group text-left rounded-3xl p-4 bg-white/85 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.12)] hover:shadow-[0_12px_28px_-10px_rgba(37,99,235,0.2)] active:scale-[0.97] transition-all cursor-pointer flex flex-col justify-between gap-3.5"
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${tile.gradient} shadow-md flex items-center justify-center group-hover:scale-105 transition-transform`}
              >
                {tile.icon}
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#14243A] dark:text-white leading-snug">
                {tile.title}
              </div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                {tile.meta}
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};
