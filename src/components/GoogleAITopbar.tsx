import React from 'react';
import { GatewayConfig } from '../types';
import { backendGateway } from '../services/backendGateway';
import { LiquidButton } from './ui/liquid-glass-button';
import { ChevronLeft, Moon, Sun, Settings, Smartphone, Monitor } from 'lucide-react';

export type DeviceViewMode = 'iphone' | 'pc';

interface GoogleAITopbarProps {
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  config: GatewayConfig;
  onOpenGatewayModal: () => void;
  onOpenLogsModal: () => void;
  onOpenGasCodeModal: () => void;
  onOpenExportModal?: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  viewMode?: DeviceViewMode;
  onToggleViewMode?: () => void;
}

const TAB_TITLES: Record<string, string> = {
  overview: 'CRD Work Center',
  'control-flow': 'ศูนย์สั่งการและตรวจระบบ',
  work1: 'WORK 1 พ้นสมาชิกภาพ',
  work4: 'WORK 4 พิมพ์จดหมาย',
  'proposed-work': 'ปฏิบัติการ WORK 1–9',
  'admin-hub': 'หลังบ้านและตั้งค่าระบบ',
  'scope-builder': 'จัดการขอบเขตงาน',
  'stop-gates': 'ตรวจ 16 ด่านควบคุม',
  'ai-studio': 'ส่งคำสั่ง AI อัตโนมัติ',
  gascode: 'โค้ดหลังบ้าน (Code.gs)',
};

export const GoogleAITopbar: React.FC<GoogleAITopbarProps> = ({
  activeTab,
  onSelectTab,
  config,
  onOpenGatewayModal,
  theme = 'light',
  onToggleTheme,
  viewMode = 'iphone',
  onToggleViewMode,
}) => {
  const hasUrl = backendGateway.hasGatewayUrl();
  const hasToken = backendGateway.hasGatewayToken();
  const effectiveStatus =
    config.isSimulationMode && config.status !== 'testing' ? 'simulated' : config.status;

  const pillMeta =
    effectiveStatus === 'connected' && hasUrl && hasToken
      ? {
          label: 'ออนไลน์',
          pillClass:
            'text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
          dotClass: 'bg-emerald-500 animate-pulse',
        }
      : effectiveStatus === 'testing'
        ? {
            label: 'กำลังเชื่อม...',
            pillClass:
              'text-amber-700 dark:text-amber-300 bg-amber-500/15 border-amber-500/30',
            dotClass: 'bg-amber-500 animate-pulse',
          }
        : !hasUrl || !hasToken
          ? {
              label: 'รอตั้งค่า',
              pillClass:
                'text-amber-700 dark:text-amber-300 bg-amber-500/15 border-amber-500/30',
              dotClass: 'bg-amber-500',
            }
          : {
              label: 'ออฟไลน์',
              pillClass:
                'text-rose-700 dark:text-rose-300 bg-rose-500/15 border-rose-500/30',
              dotClass: 'bg-rose-500',
            };

  const isHome = activeTab === 'overview';
  const isAdminSection = ['admin-hub', 'scope-builder', 'stop-gates', 'ai-studio', 'gascode'].includes(activeTab);

  return (
    <header
      className={`sticky top-0 z-40 safe-top pb-2.5 px-4 backdrop-blur-2xl border-b transition-colors ${
        theme === 'light'
          ? 'bg-white/85 border-slate-200/70 text-[#14243A] shadow-2xs'
          : 'bg-[#070b12]/85 border-slate-800/80 text-white'
      }`}
    >
      <div className={`${viewMode === 'pc' ? 'max-w-7xl' : 'max-w-4xl'} mx-auto flex items-center justify-between gap-2 min-h-[44px] transition-all`}>
        {/* Left: Brand or Native iOS Back Button */}
        <div className="flex items-center gap-2 min-w-0">
          {!isHome ? (
            <button
              type="button"
              onClick={() => onSelectTab(isAdminSection && activeTab !== 'admin-hub' ? 'admin-hub' : 'overview')}
              className={`touch-target inline-flex items-center gap-1 pr-3 pl-1.5 rounded-full text-sm font-semibold transition-colors cursor-pointer ${
                theme === 'light'
                  ? 'text-blue-700 hover:bg-blue-50 active:bg-blue-100'
                  : 'text-teal-300 hover:bg-slate-800 active:bg-slate-700'
              }`}
            >
              <ChevronLeft className="w-5 h-5 shrink-0" />
              <span className="truncate">{isAdminSection && activeTab !== 'admin-hub' ? 'หลังบ้าน' : 'หน้าหลัก'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <span className={`font-bold text-lg tracking-tight truncate ${theme === 'light' ? 'text-[#14243A]' : 'text-white'}`}>
                CRD Work Center
              </span>
              <button
                type="button"
                onClick={onOpenGatewayModal}
                title="แตะเพื่อตรวจการเชื่อมต่อ Gateway"
                className={`inline-flex text-[11px] font-semibold border px-2.5 py-0.5 rounded-full items-center gap-1.5 cursor-pointer shrink-0 ${pillMeta.pillClass}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${pillMeta.dotClass}`} />
                <span>{pillMeta.label}</span>
              </button>
            </div>
          )}
        </div>

        {/* Center Title on Subpages */}
        {!isHome && (
          <span className="hidden sm:inline-block text-sm font-semibold truncate text-slate-600 dark:text-slate-300">
            {TAB_TITLES[activeTab] || 'CRD Work Center'}
          </span>
        )}

        {/* Right: Compact Touch-Friendly Controls (iPhone / PC Switcher + Theme + Back Office) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onToggleViewMode && (
            <LiquidButton
              onClick={onToggleViewMode}
              type="button"
              size="sm"
              className="touch-target px-2.5 text-xs font-bold cursor-pointer"
              title={viewMode === 'iphone' ? 'กำลังใช้โหมด iPhone (แตะเพื่อสลับเป็นโหมด PC เต็มจอ)' : 'กำลังใช้โหมด PC (แตะเพื่อสลับเป็นโหมด iPhone)'}
            >
              {viewMode === 'iphone' ? (
                <>
                  <Smartphone className="w-4 h-4 text-blue-600 dark:text-teal-400" />
                  <span className="hidden xs:inline sm:inline">iPhone</span>
                </>
              ) : (
                <>
                  <Monitor className="w-4 h-4 text-indigo-600 dark:text-teal-400" />
                  <span className="hidden xs:inline sm:inline">PC</span>
                </>
              )}
            </LiquidButton>
          )}

          {onToggleTheme && (
            <LiquidButton
              onClick={onToggleTheme}
              type="button"
              size="sm"
              className="touch-target w-11 px-0 flex items-center justify-center cursor-pointer"
              title={theme === 'light' ? 'สลับเป็นโหมดมืด' : 'สลับเป็นโหมดสว่าง'}
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4 text-slate-700" />
              ) : (
                <Sun className="w-4 h-4 text-amber-300" />
              )}
            </LiquidButton>
          )}

          <LiquidButton
            onClick={() => onSelectTab('admin-hub')}
            type="button"
            size="sm"
            variant={isAdminSection ? 'glowing' : 'default'}
            className="touch-target px-3 text-xs font-bold cursor-pointer"
            title="เข้าหน้าหลังบ้านและตั้งค่าระบบ"
          >
            <Settings className="w-4 h-4 text-blue-600 dark:text-teal-400" />
            <span>หลังบ้าน</span>
          </LiquidButton>
        </div>
      </div>
    </header>
  );
};
