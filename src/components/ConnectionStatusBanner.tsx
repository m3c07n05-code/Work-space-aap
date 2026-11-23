import React, { useState, useEffect } from 'react';
import {
  Wifi,
  RefreshCw,
  Copy,
  Check,
  CheckCircle2,
  SlidersHorizontal,
  Key,
  AlertCircle,
  Cpu,
} from 'lucide-react';
import { backendGateway, SyncState } from '../services/backendGateway';
import { GatewayConfig, ProjectManifest } from '../types';
import { LiquidButton } from './ui/liquid-glass-button';
import { GlassBox } from './ui/glass-box';

interface ConnectionStatusBannerProps {
  config: GatewayConfig;
  onOpenGatewayModal: () => void;
}

export const ConnectionStatusBanner: React.FC<ConnectionStatusBannerProps> = ({
  config,
  onOpenGatewayModal,
}) => {
  const [isPinging, setIsPinging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [syncState, setSyncState] = useState<SyncState>(() => backendGateway.getSyncState());
  const [manifest, setManifest] = useState<ProjectManifest | null>(() => backendGateway.getManifest());

  useEffect(() => {
    const unsubscribeSync = backendGateway.onSyncStateChange((newState) => {
      setSyncState(newState);
    });
    const unsubscribeManifest = backendGateway.onManifestChange((nextManifest) => {
      setManifest(nextManifest);
    });
    return () => {
      unsubscribeSync();
      unsubscribeManifest();
    };
  }, []);

  // Trigger a brief sync indicator transition whenever config latency/baseUrl changes externally
  useEffect(() => {
    setSyncState(backendGateway.getSyncState());
  }, [config.latencyMs, config.baseUrl]);

  const handlePing = async () => {
    setIsPinging(true);
    setFeedback(null);
    try {
      const res = await backendGateway.testConnection();
      setFeedback({
        ok: res.success,
        text: res.success
          ? `${res.message} (${res.latencyMs}ms)`
          : `เชื่อมต่อไม่สำเร็จ: ${res.message} (${res.latencyMs}ms)`,
      });
      setTimeout(() => setFeedback(null), 5000);
    } finally {
      setIsPinging(false);
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(config.baseUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isSyncing = syncState.status === 'syncing' || isPinging;
  const hasToken = backendGateway.hasGatewayToken();

  const effectiveStatus = config.isSimulationMode && config.status !== 'testing'
    ? 'simulated'
    : config.status;

  const statusMeta = {
    connected: {
      label: 'Google Apps Script (Connected)',
      badgeClass:
        'bg-white/75 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-white/90 dark:border-emerald-500/40',
      dotClass: 'bg-emerald-500',
    },
    testing: {
      label: 'Google Apps Script (Testing...)',
      badgeClass:
        'bg-amber-50/90 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/40',
      dotClass: 'bg-amber-500 animate-pulse',
    },
    simulated: {
      label: 'Offline Simulator (Simulated)',
      badgeClass:
        'bg-amber-50/90 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/40',
      dotClass: 'bg-amber-500',
    },
    offline: {
      label: 'Google Apps Script (Offline)',
      badgeClass:
        'bg-rose-50/90 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-500/40',
      dotClass: 'bg-rose-500',
    },
  }[effectiveStatus];

  const devicesMap = manifest?.devices || {};
  const cms2Key = Object.keys(devicesMap).find((k) => {
    const entry = devicesMap[k];
    return (
      k.toUpperCase().includes('CMS-2') ||
      String(entry?.deviceId || '').toUpperCase().includes('CMS-2') ||
      String(entry?.label || '').toUpperCase().includes('CMS-2')
    );
  });
  const cms2 = cms2Key ? devicesMap[cms2Key] : undefined;
  const cms2LastSeen = cms2 ? String(cms2.lastSeenIso || cms2.lastHeartbeatIso || '') : '';
  const cms2Ms = cms2LastSeen ? Date.parse(cms2LastSeen) : NaN;
  const cms2AgeMin = Number.isFinite(cms2Ms) ? Math.max(0, Math.round((Date.now() - cms2Ms) / 60000)) : null;
  const isCms2Online = Boolean(cms2 && cms2AgeMin !== null && cms2AgeMin <= 5);

  const defaultFeedbackText =
    effectiveStatus === 'connected'
      ? hasToken
        ? 'พร้อมส่งคำสั่งขยายงานจริง'
        : 'เชื่อมต่อได้ (แนะนำตั้งค่า Token)'
      : effectiveStatus === 'testing'
        ? 'กำลังตรวจสอบสัญญาณ...'
        : effectiveStatus === 'simulated'
          ? 'โหมดจำลองออฟไลน์ (ไม่ได้ยิง GAS จริง)'
          : 'ออฟไลน์ — ตรวจสอบ URL หรือ Token';

  const statusPillIsPositive = feedback ? feedback.ok : effectiveStatus === 'connected' && hasToken;
  const statusPillIsError = feedback ? !feedback.ok : effectiveStatus === 'offline';

  return (
    <GlassBox variant="frosted" className="p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Status & Real-Time Sync Indicator */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-slate-200/60 dark:bg-slate-800 backdrop-blur-xl border border-white/90 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-teal-400 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.95)]">
            <Wifi className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm sm:text-base font-bold text-[#14243A] dark:text-slate-100">
                สถานะการเชื่อมต่อหลังบ้าน
              </span>

              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border flex items-center gap-1.5 shadow-2xs backdrop-blur-md ${statusMeta.badgeClass}`}
              >
                <span className={`w-2 h-2 rounded-full ${statusMeta.dotClass}`} />
                {statusMeta.label}
              </span>

              {/* Zero-Secret Token Status Badge (Click to configure) */}
              <button
                type="button"
                onClick={onOpenGatewayModal}
                title={
                  hasToken
                    ? 'Gateway Token พร้อมใช้งาน (Zero-Secret — คลิกเพื่อตรวจสอบหรือแก้ไข)'
                    : 'ยังไม่ได้ใส่ Gateway Token (คลิกเพื่อตั้งค่าในเบราว์เซอร์)'
                }
                className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border flex items-center gap-1.5 shadow-2xs backdrop-blur-md cursor-pointer transition-colors ${
                  hasToken
                    ? 'bg-emerald-50/90 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700 hover:bg-emerald-100'
                    : 'bg-amber-50/95 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 hover:bg-amber-100'
                }`}
              >
                <Key className="w-3 h-3" />
                <span>{hasToken ? 'Token: พร้อมใช้' : 'Token: ยังไม่ใส่'}</span>
              </button>

              {/* Worker CMS-2 Status Badge from Manifest devices */}
              <span
                title={
                  cms2
                    ? `CMS-2 LastSeen: ${cms2LastSeen || 'N/A'} | Status: ${String(cms2.status || 'UNKNOWN')}`
                    : 'ยังไม่มีข้อมูล Heartbeat ของเครื่อง CMS-2 จาก Manifest'
                }
                className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border flex items-center gap-1.5 shadow-2xs backdrop-blur-md ${
                  isCms2Online
                    ? 'bg-emerald-50/85 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700'
                    : cms2
                      ? 'bg-slate-100/90 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                      : 'bg-slate-100/75 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                }`}
              >
                <Cpu className="w-3 h-3" />
                <span>
                  {isCms2Online
                    ? 'CMS-2: Online'
                    : cms2
                      ? `CMS-2: ${cms2AgeMin !== null ? `ล่าสุด ${cms2AgeMin}m` : String(cms2.status || 'Standby')}`
                      : 'CMS-2: รอข้อมูล'}
                </span>
              </span>

              {/* Real-time Sync Indicator ('กำลังซิงค์' / 'ล่าสุด') */}
              <span
                onClick={() => backendGateway.triggerSyncPulse(700)}
                title={`อัปเดตเมื่อ: ${syncState.updatedAt} (แตะเพื่อซิงค์ข้อมูล)`}
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1.5 border backdrop-blur-xl transition-all duration-300 cursor-pointer select-none shadow-2xs ${
                  isSyncing
                    ? 'bg-amber-50/90 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300/90 dark:border-amber-700'
                    : 'bg-slate-200/60 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border-white/90 dark:border-slate-700'
                }`}
              >
                <span className="relative flex h-2 w-2">
                  {isSyncing ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-80" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                    </>
                  ) : (
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
                  )}
                </span>
                <span>{isSyncing ? 'กำลังซิงค์' : 'ล่าสุด'}</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              เชื่อมตรงกับ Web App อัปเดตข้อมูลเข้า Google Drive อัตโนมัติ (ซิงค์ล่าสุด: {syncState.updatedAt})
            </p>
          </div>
        </div>

        {/* Right: Latency & Frosted Cloudy Button Actions */}
        <div className="flex items-center gap-2.5">
          <div className="text-xs font-mono text-slate-600 dark:text-slate-400 bg-slate-200/55 dark:bg-slate-800/80 backdrop-blur-xl px-3 py-1.5 rounded-full border border-white/90 dark:border-slate-700 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9)]">
            Latency: <strong className="text-slate-900 dark:text-emerald-400 tabular-nums font-bold">{config.latencyMs}ms</strong>
          </div>

          <LiquidButton
            size="sm"
            onClick={handlePing}
            disabled={isPinging}
            className="text-xs font-semibold cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin text-blue-600' : 'text-slate-700 dark:text-slate-200'}`} />
            <span>{isPinging ? 'กำลังซิงค์...' : 'ทดสอบ Ping'}</span>
          </LiquidButton>

          <LiquidButton
            size="sm"
            onClick={onOpenGatewayModal}
            className="text-xs font-semibold cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-700 dark:text-slate-200" />
            <span>ตั้งค่า URL / Token</span>
          </LiquidButton>
        </div>
      </div>

      {/* URL Display Bar - Frosted Cloudy Glass */}
      <div className="bg-slate-200/45 dark:bg-slate-900/90 backdrop-blur-xl border border-white/85 dark:border-slate-800 rounded-2xl p-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 text-xs shadow-[inset_0_1px_2px_rgba(255,255,255,0.85)]">
        <div className="flex items-center gap-2 truncate min-w-0">
          <span className="text-slate-500 font-mono font-semibold shrink-0">Web App:</span>
          <span className="font-mono text-slate-800 dark:text-slate-200 truncate select-all">{config.baseUrl}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopyUrl}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-200/70 dark:bg-slate-800 hover:bg-white/90 text-slate-800 dark:text-slate-200 border border-white/95 dark:border-slate-700 shadow-[inset_0_1px_1px_rgba(255,255,255,0.95)] transition-colors cursor-pointer text-xs font-semibold backdrop-blur-md"
            title="คัดลอก URL"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-600" />}
            <span>{copied ? 'คัดลอกแล้ว' : 'คัดลอก'}</span>
          </button>
          <span
            className={`font-semibold text-xs flex items-center gap-1 px-3 py-1 rounded-full border backdrop-blur-md ${
              statusPillIsError
                ? 'bg-rose-50/90 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                : statusPillIsPositive
                  ? 'bg-white/75 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400 border-white/90 dark:border-emerald-800'
                  : 'bg-amber-50/90 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
            }`}
          >
            {statusPillIsError ? (
              <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2
                className={`w-3.5 h-3.5 shrink-0 ${statusPillIsPositive ? 'text-emerald-600' : 'text-amber-600'}`}
              />
            )}
            <span>{feedback ? feedback.text : defaultFeedbackText}</span>
          </span>
        </div>
      </div>
    </GlassBox>
  );
};
