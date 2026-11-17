import React, { useState, useEffect } from 'react';
import {
  X,
  Terminal,
  Trash2,
  ArrowUpRight,
  ArrowDownLeft,
  Copy,
  Check,
  RefreshCw,
  FolderGit2,
  Layers,
  Database,
  CheckCircle2,
} from 'lucide-react';
import { backendGateway } from '../services/backendGateway';
import { PayloadLog, ManifestModule } from '../types';

interface PayloadLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  manifestModules?: ManifestModule[];
}

export const PayloadLogsModal: React.FC<PayloadLogsModalProps> = ({
  isOpen,
  onClose,
  manifestModules: propModules,
}) => {
  const [activeTab, setActiveTab] = useState<'modules' | 'logs'>('modules');
  const [logs, setLogs] = useState<PayloadLog[]>(backendGateway.getLogs());
  const [modules, setModules] = useState<ManifestModule[]>(
    propModules || backendGateway.getManifest()?.modules || []
  );
  const [selectedLog, setSelectedLog] = useState<PayloadLog | null>(logs[0] || null);
  const [selectedModule, setSelectedModule] = useState<ManifestModule | null>(
    modules[0] || null
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (propModules && propModules.length > 0) {
      setModules(propModules);
      if (!selectedModule) setSelectedModule(propModules[0]);
    }
  }, [propModules]);

  useEffect(() => {
    const unsubLogs = backendGateway.onLog((newLogs) => {
      setLogs(newLogs);
      if (!selectedLog && newLogs.length > 0) {
        setSelectedLog(newLogs[0]);
      }
    });

    const unsubManifest = backendGateway.onManifestChange((manifest) => {
      if (manifest?.modules) {
        setModules(manifest.modules);
        if (!selectedModule && manifest.modules.length > 0) {
          setSelectedModule(manifest.modules[0]);
        }
      }
    });

    // Auto-fetch if opened with empty modules
    if (isOpen && modules.length === 0) {
      handleRefreshManifest();
    }

    return () => {
      unsubLogs();
      unsubManifest();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRefreshManifest = async () => {
    setIsRefreshing(true);
    try {
      const res = await backendGateway.readManifest();
      if (res.success && res.manifest?.modules) {
        setModules(res.manifest.modules);
        if (!selectedModule && res.manifest.modules.length > 0) {
          setSelectedModule(res.manifest.modules[0]);
        }
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCopy = (content: any) => {
    if (!content) return;
    navigator.clipboard.writeText(JSON.stringify(content, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    backendGateway.clearLogs();
    setSelectedLog(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/40 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[85vh] rounded-3xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-3xl border border-white/90 dark:border-slate-800 shadow-[0_24px_60px_-12px_rgba(20,50,110,0.22)] flex flex-col overflow-hidden text-[#14243A] dark:text-white">
        {/* Header */}
        <div className="px-6 py-4 bg-white/80 dark:bg-slate-950 border-b border-blue-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-teal-500/15 border border-blue-200 dark:border-teal-500/30 flex items-center justify-center text-blue-700 dark:text-teal-400 shadow-sm">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#14243A] dark:text-white">
                  ศูนย์ข้อมูลกลาง (Live Manifest & Payloads)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                  Drive: 00_Project_Manifest.json
                </span>
              </div>
              <p className="text-xs font-mono text-slate-500">
                {modules.length} modules ตรวจสอบได้จริง | {logs.length} gateway logs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshManifest}
              disabled={isRefreshing}
              className="px-3 py-1.5 text-xs text-blue-700 dark:text-teal-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer font-bold border border-blue-200 dark:border-slate-700"
              title="ดึงข้อมูลล่าสุดจาก 00_Project_Manifest.json บน Google Drive"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>รีเฟรช Drive</span>
            </button>

            {activeTab === 'logs' && logs.length > 0 && (
              <button
                onClick={handleClear}
                className="px-3 py-1.5 text-xs text-rose-600 hover:text-rose-700 rounded-xl hover:bg-rose-50 transition-colors flex items-center gap-1.5 cursor-pointer font-bold border border-rose-200"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>ล้างประวัติ</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 py-2.5 bg-slate-50/70 dark:bg-slate-950/60 border-b border-blue-100 dark:border-slate-800 flex items-center gap-3">
          <button
            onClick={() => setActiveTab('modules')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'modules'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-slate-800'
            }`}
          >
            <FolderGit2 className="w-4 h-4" />
            <span>Modules บน Drive ({modules.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'logs'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-slate-800'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>ประวัติคำสั่ง ({logs.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 sm:grid-cols-12 min-h-[400px]">
          {activeTab === 'modules' ? (
            <>
              {/* Left: Manifest Modules list */}
              <div className="sm:col-span-5 border-r border-blue-100 dark:border-slate-800 overflow-y-auto divide-y divide-blue-50 dark:divide-slate-800 p-2 space-y-1">
                {modules.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 font-medium">
                    {isRefreshing ? 'กำลังดึงข้อมูลโมดูลจาก Drive...' : 'ไม่พบโมดูลใน 00_Project_Manifest.json'}
                  </div>
                ) : (
                  modules.map((mod, idx) => {
                    const isSelected = selectedModule?.componentId === mod.componentId;
                    return (
                      <button
                        key={mod.componentId || idx}
                        onClick={() => setSelectedModule(mod)}
                        className={`w-full text-left p-3 rounded-2xl transition-all font-mono text-xs cursor-pointer ${
                          isSelected
                            ? 'bg-blue-100/90 dark:bg-slate-800 border border-blue-300 dark:border-teal-500 text-blue-900 dark:text-teal-300 shadow-2xs font-bold'
                            : 'hover:bg-blue-50/70 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="px-2 py-0.5 rounded-full font-bold bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200">
                            {mod.componentId}
                          </span>
                          <span className="text-slate-400 text-[10px]">
                            {mod.updatedAtIso
                              ? new Date(mod.updatedAtIso).toLocaleTimeString('th-TH')
                              : mod.syncedAt
                              ? new Date(mod.syncedAt).toLocaleTimeString('th-TH')
                              : 'SYNCED'}
                          </span>
                        </div>
                        <div className="font-bold text-[#14243A] dark:text-white truncate">
                          {mod.title || mod.name || 'ไม่มีชื่อโมดูล'}
                        </div>
                        {mod.category && (
                          <div className="text-[10px] text-slate-500 truncate mt-0.5">
                            หมวดหมู่: {mod.category}
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Right: Selected Module Detail */}
              <div className="sm:col-span-7 p-5 overflow-y-auto bg-blue-50/40 dark:bg-slate-950/70 font-mono text-xs space-y-4">
                {selectedModule ? (
                  <>
                    <div className="flex items-center justify-between pb-2 border-b border-blue-100 dark:border-slate-800">
                      <span className="text-[11px] text-slate-600 dark:text-slate-400 font-bold">
                        MODULE SPECIFICATION ({selectedModule.componentId})
                      </span>
                      <button
                        onClick={() => handleCopy(selectedModule)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white hover:bg-blue-50 text-xs text-blue-700 border border-blue-200 shadow-2xs cursor-pointer font-bold transition"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? 'คัดลอกแล้ว' : 'คัดลอก JSON'}</span>
                      </button>
                    </div>

                    <div className="space-y-1.5 text-xs bg-white/90 dark:bg-slate-900 p-3.5 rounded-2xl border border-blue-100 dark:border-slate-800">
                      <div>
                        <span className="text-slate-500 font-medium">Component ID:</span>{' '}
                        <span className="text-blue-900 dark:text-teal-300 font-bold">{selectedModule.componentId}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium">ชื่อ/Title:</span>{' '}
                        <span className="text-slate-800 dark:text-white font-bold">{selectedModule.title || selectedModule.name || '-'}</span>
                      </div>
                      {selectedModule.category && (
                        <div>
                          <span className="text-slate-500 font-medium">หมวดหมู่ (Category):</span>{' '}
                          <span className="text-[#14243A] dark:text-slate-200 font-semibold">{selectedModule.category}</span>
                        </div>
                      )}
                      {selectedModule.summary && (
                        <div>
                          <span className="text-slate-500 font-medium">สรุปการทำงาน:</span>{' '}
                          <span className="text-slate-700 dark:text-slate-300">{selectedModule.summary}</span>
                        </div>
                      )}
                      {selectedModule.rule && (
                        <div>
                          <span className="text-slate-500 font-medium">กฎความปลอดภัย (Rule):</span>{' '}
                          <span className="text-amber-700 dark:text-amber-400 font-medium">{selectedModule.rule}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-slate-500 font-medium">สถานะในระบบ:</span>{' '}
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {selectedModule.status || 'SYNCED_ACTIVE'}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5 text-blue-700 dark:text-teal-300 text-xs font-bold mb-1.5">
                        <Layers className="w-4 h-4" /> Full Manifest Spec Record (JSON)
                      </div>
                      <pre className="p-3.5 rounded-2xl bg-white/95 dark:bg-slate-900 border border-blue-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 overflow-x-auto leading-relaxed shadow-inner">
                        {JSON.stringify(selectedModule, null, 2)}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500 text-xs font-medium">
                    เลือกโมดูลทางซ้ายเพื่อดูรายละเอียด
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Left: Log list */}
              <div className="sm:col-span-5 border-r border-blue-100 dark:border-slate-800 overflow-y-auto divide-y divide-blue-50 dark:divide-slate-800 p-2 space-y-1">
                {logs.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 font-medium">
                    ยังไม่มีประวัติการส่งคำสั่ง
                    <br />
                    (กดส่งคำสั่งหรือบันทึกขอบเขตงานเพื่อดูผลลัพธ์)
                  </div>
                ) : (
                  logs.map((log) => {
                    const isSelected = selectedLog?.id === log.id;
                    return (
                      <button
                        key={log.id}
                        onClick={() => setSelectedLog(log)}
                        className={`w-full text-left p-3 rounded-2xl transition-all font-mono text-xs cursor-pointer ${
                          isSelected
                            ? 'bg-blue-100/90 dark:bg-slate-800 border border-blue-300 text-blue-900 dark:text-teal-300 shadow-2xs font-bold'
                            : 'hover:bg-blue-50/70 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="px-2 py-0.5 rounded-full font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-200">
                            {log.status} {log.method}
                          </span>
                          <span className="text-slate-500 text-[10px]">{log.timestamp}</span>
                        </div>
                        <div className="font-bold text-[#14243A] dark:text-white truncate">{log.action}</div>
                        <div className="text-[10px] text-slate-500 truncate mt-0.5">{log.endpoint}</div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Right: Selected Log Detail */}
              <div className="sm:col-span-7 p-5 overflow-y-auto bg-blue-50/40 dark:bg-slate-950/70 font-mono text-xs space-y-4">
                {selectedLog ? (
                  <>
                    <div className="flex items-center justify-between pb-2 border-b border-blue-100 dark:border-slate-800">
                      <span className="text-[11px] text-slate-600 dark:text-slate-400 font-bold">PAYLOAD DETAIL</span>
                      <button
                        onClick={() => handleCopy(selectedLog)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white hover:bg-blue-50 text-xs text-blue-700 border border-blue-200 shadow-2xs cursor-pointer font-bold transition"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? 'คัดลอกแล้ว' : 'คัดลอก JSON'}</span>
                      </button>
                    </div>

                    <div className="space-y-1 text-xs">
                      <div>
                        <span className="text-slate-500 font-medium">Action:</span>{' '}
                        <span className="text-blue-900 dark:text-emerald-400 font-bold">{selectedLog.action}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium">Target:</span>{' '}
                        <span className="text-blue-700 dark:text-teal-300 break-all select-all font-semibold">{selectedLog.endpoint}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium">Latency:</span>{' '}
                        <span className="text-[#14243A] font-bold">{selectedLog.latencyMs}ms</span>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5 text-blue-700 dark:text-teal-300 text-xs font-bold mb-1.5">
                        <ArrowUpRight className="w-4 h-4" /> Outbound Request Body (JSON)
                      </div>
                      <pre className="p-3.5 rounded-2xl bg-white/95 dark:bg-slate-900 border border-blue-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 overflow-x-auto leading-relaxed shadow-inner">
                        {JSON.stringify(selectedLog.payload, null, 2)}
                      </pre>
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-xs font-bold mb-1.5">
                        <ArrowDownLeft className="w-4 h-4" /> Response Acknowledged (HTTP {selectedLog.status})
                      </div>
                      <pre className="p-3.5 rounded-2xl bg-white/95 dark:bg-slate-900 border border-blue-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 overflow-x-auto leading-relaxed shadow-inner">
                        {JSON.stringify(selectedLog.response, null, 2)}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500 text-xs font-medium">
                    เลือกคำสั่งทางซ้ายเพื่อตรวจสอบรายละเอียด
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
