import React, { useState, useEffect } from 'react';
import {
  Wifi,
  RefreshCw,
  CheckCircle2,
  SlidersHorizontal,
  Key,
  AlertCircle,
  Cpu,
  Terminal,
  Globe,
} from 'lucide-react';
import { backendGateway, SyncState } from '../services/backendGateway';
import { resolveCms2StatusFromManifest } from '../services/work4Service';
import { GatewayConfig, ProjectManifest } from '../types';
import { LiquidButton } from './ui/liquid-glass-button';
import { GlassBox } from './ui/glass-box';

interface ConnectionStatusBannerProps {
  config: GatewayConfig;
  onOpenGatewayModal: () => void;
  onOpenLogsModal?: () => void;
  livePayloadCount?: number;
}

export const ConnectionStatusBanner: React.FC<ConnectionStatusBannerProps> = ({
  config,
  onOpenGatewayModal,
  onOpenLogsModal,
  livePayloadCount,
}) => {
  const [isPinging, setIsPinging] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [syncState, setSyncState] = useState<SyncState>(() => backendGateway.getSyncState());
  const [manifest, setManifest] = useState<ProjectManifest | null>(() => backendGateway.getManifest());
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const unsubscribeSync = backendGateway.onSyncStateChange((newState) => {
      setSyncState(newState);
    });
    const unsubscribeManifest = backendGateway.onManifestChange((nextManifest) => {
      setManifest(nextManifest);
      setNowMs(Date.now());
    });
    return () => {
      unsubscribeSync();
      unsubscribeManifest();
    };
  }, []);

  // Keep relative CMS-2 heartbeat age fresh every 30s and trigger background refresh if approaching stale (>2m)
  useEffect(() => {
    const tickTimer = setInterval(() => {
      const currentMs = Date.now();
      setNowMs(currentMs);
      if (typeof document !== 'undefined' && document.hidden) return;
      const cfg = backendGateway.getConfig();
      if (cfg.isSimulationMode || !backendGateway.hasGatewayUrl() || !backendGateway.hasGatewayToken()) {
        return;
      }
      const cms2 = resolveCms2StatusFromManifest(backendGateway.getManifest(), currentMs);
      if (!cms2.hasDevice || cms2.ageMin === null || cms2.ageMin >= 2) {
        void backendGateway.readManifest(undefined, { background: true });
      }
    }, 30_000);

    return () => clearInterval(tickTimer);
  }, []);

  // Trigger a brief sync indicator transition whenever config latency/baseUrl changes externally
  useEffect(() => {
    setSyncState(backendGateway.getSyncState());
  }, [config.latencyMs, config.baseUrl]);

  const handlePing = async () => {
    setIsPinging(true);
    setFeedback(null);
    try {
      const syncRes = await backendGateway.verifyAndSync();
      const res = syncRes.ping;
      setNowMs(Date.now());
      const syncDetail = syncRes.manifestSuccess
        ? ` • Live Payloads: ${syncRes.modulesCount} modules`
        : '';
      setFeedback({
        ok: res.success,
        text: res.success
          ? `${res.message}${syncDetail} (${res.latencyMs}ms)`
          : `เชื่อมต่อไม่สำเร็จ: ${res.message}${res.latencyMs > 0 ? ` (${res.latencyMs}ms)` : ''}`,
      });
      setTimeout(() => setFeedback(null), 6000);
    } finally {
      setIsPinging(false);
    }
  };

  const isSyncing = syncState.status === 'syncing' || isPinging;
  const hasUrl = backendGateway.hasGatewayUrl();
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

  const cms2State = resolveCms2StatusFromManifest(manifest, nowMs);
  const cms2 = cms2State.hasDevice;
  const cms2LastSeen = cms2State.lastSeenIso;
  const cms2AgeMin = cms2State.ageMin;
  const isCms2Online = cms2State.isOnline;

  const defaultFeedbackText =
    effectiveStatus === 'connected'
      ? hasUrl && hasToken
        ? 'พร้อมส่งคำสั่งขยายงานจริง'
        : 'ยังไม่ได้ตั้งค่า URL / Token — กด "ตั้งค่า URL / Token"'
      : effectiveStatus === 'testing'
        ? 'กำลังตรวจสอบสัญญาณ...'
        : effectiveStatus === 'simulated'
          ? 'โหมดจำลองออฟไลน์ (ไม่ได้ยิง GAS จริง)'
          : !hasUrl || !hasToken
            ? 'ยังไม่ได้ใส่ URL หรือ Token — กด "ตั้งค่า URL / Token" (เก็บเฉพาะ localStorage)'
            : 'ออฟไลน์ — ตรวจสอบ URL หรือ Token';

  const statusPillIsPositive = feedback ? feedback.ok : effectiveStatus === 'connected' && hasUrl && hasToken;
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
                    ? `CMS-2 LastSeen: ${cms2LastSeen || 'N/A'} | Status: ${cms2State.statusLabel}`
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
                      ? `CMS-2: ${cms2AgeMin !== null ? `ล่าสุด ${cms2AgeMin}m` : cms2State.statusLabel}`
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
              เชื่อมตรงกับ Gateway อัปเดตข้อมูลเข้า Google Drive อัตโนมัติ (ซิงค์ล่าสุด: {syncState.updatedAt})
            </p>
          </div>
        </div>

        {/* Right: Latency & Frosted Cloudy Button Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs font-mono text-slate-600 dark:text-slate-400 bg-slate-200/55 dark:bg-slate-800/80 backdrop-blur-xl px-3 py-1.5 rounded-full border border-white/90 dark:border-slate-700 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9)]">
            Latency: <strong className="text-slate-900 dark:text-emerald-400 tabular-nums font-bold">{config.latencyMs}ms</strong>
          </div>

          {onOpenLogsModal && (
            <button
              type="button"
              onClick={onOpenLogsModal}
              title="เปิด Live Payloads & โมดูลจาก Manifest จริง"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-bold bg-white/80 dark:bg-slate-800/90 hover:bg-white text-[#14243A] dark:text-slate-200 border border-white/95 dark:border-slate-700 shadow-2xs cursor-pointer transition"
            >
              <Terminal className="w-3.5 h-3.5 text-blue-600 dark:text-teal-400" />
              <span>Live Payloads</span>
              <span className="px-1.5 py-0.2 rounded-md bg-blue-50 dark:bg-slate-900 text-blue-700 dark:text-teal-300 tabular-nums">
                {livePayloadCount ?? 0}
              </span>
            </button>
          )}

          <LiquidButton
            size="sm"
            onClick={handlePing}
            disabled={isPinging}
            className="text-xs font-semibold cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin text-blue-600' : 'text-slate-700 dark:text-slate-200'}`} />
            <span>{isPinging ? 'กำลังซิงค์...' : 'ทดสอบ Ping / Sync'}</span>
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

      {/* Zero-Secret Local Gateway Status Bar (No public URL exposure) */}
      <div className="bg-slate-200/45 dark:bg-slate-900/90 backdrop-blur-xl border border-white/85 dark:border-slate-800 rounded-2xl p-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 text-xs shadow-[inset_0_1px_2px_rgba(255,255,255,0.85)]">
        <button
          type="button"
          onClick={onOpenGatewayModal}
          className="flex items-center gap-2 min-w-0 cursor-pointer text-left hover:opacity-85 transition-opacity"
          title="Gateway URL เก็บเฉพาะใน localStorage ของเบราว์เซอร์เครื่องนี้เท่านั้น"
        >
          <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="font-mono font-semibold text-slate-700 dark:text-slate-200 truncate">
            {hasUrl
              ? 'Gateway URL: ตั้งค่าแล้ว (Local Browser Only)'
              : 'Gateway URL: ยังไม่ใส่ — กด "ตั้งค่า URL / Token"'}
          </span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
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
