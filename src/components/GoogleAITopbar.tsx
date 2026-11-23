import React from 'react';
import { GatewayConfig } from '../types';
import { backendGateway } from '../services/backendGateway';
import { LiquidButton } from './ui/liquid-glass-button';

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
}

export const GoogleAITopbar: React.FC<GoogleAITopbarProps> = ({
  activeTab,
  onSelectTab,
  config,
  onOpenGatewayModal,
  onOpenExportModal,
  theme = 'light',
  onToggleTheme,
}) => {
  const hasToken = backendGateway.hasGatewayToken();
  const effectiveStatus =
    config.isSimulationMode && config.status !== 'testing' ? 'simulated' : config.status;

  const pillMeta =
    effectiveStatus === 'connected' && hasToken
      ? {
          label: 'Connected',
          pillClass:
            'text-emerald-700 dark:text-emerald-400 bg-emerald-50/90 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30',
          dotClass: 'bg-emerald-500 animate-pulse',
        }
      : effectiveStatus === 'testing'
        ? {
            label: 'Testing...',
            pillClass:
              'text-amber-700 dark:text-amber-300 bg-amber-50/90 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30',
            dotClass: 'bg-amber-500 animate-pulse',
          }
        : effectiveStatus === 'simulated'
          ? {
              label: 'Simulated',
              pillClass:
                'text-amber-700 dark:text-amber-300 bg-amber-50/90 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30',
              dotClass: 'bg-amber-500',
            }
          : !hasToken
            ? {
                label: 'No Token',
                pillClass:
                  'text-amber-700 dark:text-amber-300 bg-amber-50/90 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30',
                dotClass: 'bg-amber-500',
              }
            : {
                label: 'Offline',
                pillClass:
                  'text-rose-700 dark:text-rose-300 bg-rose-50/90 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/30',
                dotClass: 'bg-rose-500',
              };

  return (
    <header className={`sticky top-0 z-40 backdrop-blur-2xl border-b px-4 py-2.5 sm:py-3 transition-colors ${
      theme === 'light'
        ? 'bg-white/55 border-white/80 text-[#14243A] shadow-2xs'
        : 'bg-[#070b12]/80 border-slate-800/80 text-white'
    }`}>
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
        {/* Left: Brand Title (No Logo) or Back to Hub Button */}
        <div className="flex items-center gap-2.5 min-w-0">
          {activeTab !== 'overview' ? (
            <LiquidButton
              type="button"
              size="sm"
              onClick={() => onSelectTab('overview')}
              className="font-bold text-xs sm:text-sm cursor-pointer"
            >
              <span>←</span>
              <span>กลับหน้าหลัก (Hub)</span>
            </LiquidButton>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <span className={`font-bold text-base sm:text-lg tracking-tight ${theme === 'light' ? 'text-[#14243A]' : 'text-white'}`}>
                NexusLedger
              </span>
              <button
                type="button"
                onClick={onOpenGatewayModal}
                title="แตะเพื่อเปิดตั้งค่า Gateway / Token"
                className={`inline-flex text-[11px] font-mono font-semibold border px-2.5 py-0.5 rounded-full items-center gap-1.5 backdrop-blur-md shadow-2xs cursor-pointer transition hover:opacity-90 shrink-0 ${pillMeta.pillClass}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${pillMeta.dotClass}`} />
                <span>{pillMeta.label}</span>
              </button>
            </div>
          )}
        </div>

        {/* Right: Quick Controls with Frosted Cloudy Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {onOpenExportModal && (
            <LiquidButton
              onClick={onOpenExportModal}
              type="button"
              size="sm"
              className="text-xs font-bold cursor-pointer"
            >
              <span>📥</span>
              <span className="hidden sm:inline">เอาโค้ดไปใช้</span>
            </LiquidButton>
          )}

          {onToggleTheme && (
            <LiquidButton
              onClick={onToggleTheme}
              type="button"
              size="sm"
              className="px-2.5 text-xs font-medium cursor-pointer"
              title={theme === 'light' ? 'เปลี่ยนเป็น Dark Mode' : 'เปลี่ยนเป็น Light Mode'}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </LiquidButton>
          )}

          <LiquidButton
            onClick={onOpenGatewayModal}
            type="button"
            size="sm"
            className="text-xs font-bold cursor-pointer"
          >
            ตั้งค่า Gateway
          </LiquidButton>
        </div>
      </div>
    </header>
  );
};
