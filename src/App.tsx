/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { GoogleAITopbar } from './components/GoogleAITopbar';
import { ConnectionStatusBanner } from './components/ConnectionStatusBanner';
import { CleanHubDashboard } from './components/CleanHubDashboard';
import { SelfEvolvingDesignStudio } from './components/SelfEvolvingDesignStudio';
import { ScopeBuilderClean } from './components/ScopeBuilderClean';
import { StopGatesAuditClean } from './components/StopGatesAuditClean';
import { ProposedWorkGrid } from './components/ProposedWorkGrid';
import { GasCodeSection } from './components/GasCodeSection';
import { BackendGatewayModal } from './components/BackendGatewayModal';
import { GasCodeModal } from './components/GasCodeModal';
import { PayloadLogsModal } from './components/PayloadLogsModal';
import { ExportCodeModal } from './components/ExportCodeModal';
import { AICommandDispatcher } from './components/AICommandDispatcher';
import { GeminiChatbotView } from './components/GeminiChatbotView';
import { CrdArchitecture3DView } from './components/CrdArchitecture3DView';
import { Work4LetterPrintStudio } from './components/Work4LetterPrintStudio';
import { Work1AndBackupStudio } from './components/Work1AndBackupStudio';
import { LiquidNavbar, NimbusIcons, LiquidNavItem } from './components/ui/liquid-glass-navbar';
import { backendGateway } from './services/backendGateway';
import { GatewayConfig, ManifestModule } from './types';
import { Terminal, ArrowLeft } from 'lucide-react';

export type ActiveTabType =
  | 'overview'
  | 'work1'
  | 'work4-studio'
  | 'ai-chat'
  | '3d-view'
  | 'scope-builder'
  | 'ai-studio'
  | 'stop-gates'
  | 'gascode'
  | 'proposed-work';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTabType>('overview');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [config, setConfig] = useState<GatewayConfig>(backendGateway.getConfig());
  const [isGatewayModalOpen, setIsGatewayModalOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [isGasCodeModalOpen, setIsGasCodeModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [logCount, setLogCount] = useState(backendGateway.getLogs().length);
  const [scopesCount, setScopesCount] = useState(backendGateway.getScopes().length);
  const [manifestModules, setManifestModules] = useState<ManifestModule[]>(
    backendGateway.getManifest()?.modules || []
  );

  useEffect(() => {
    const currentCfg = backendGateway.getConfig();
    if (currentCfg.baseUrl && !currentCfg.isSimulationMode) {
      backendGateway.readManifest().then((res) => {
        if (res.success && res.manifest?.modules) {
          setManifestModules(res.manifest.modules);
        }
      });
    }

    const unsubConfig = backendGateway.onConfigChange((newConfig) => {
      setConfig(newConfig);
    });
    const unsubLogs = backendGateway.onLog((logs) => {
      setLogCount(logs.length);
    });
    const unsubScopes = backendGateway.onScopeChange((scopes) => {
      setScopesCount(scopes.length);
    });
    const unsubManifest = backendGateway.onManifestChange((manifest) => {
      if (manifest?.modules) {
        setManifestModules(manifest.modules);
      }
    });
    return () => {
      unsubConfig();
      unsubLogs();
      unsubScopes();
      unsubManifest();
    };
  }, []);

  // Liquid Navbar items matching Hub + 5-tab Bottom Bar
  const navItems: LiquidNavItem[] = [
    { label: "หน้าหลัก", icon: NimbusIcons.home, fx: "glow" },
    { label: "3 มิติ", icon: NimbusIcons.globe, fx: "spin" },
    { label: "AI แชท", icon: NimbusIcons.plane, fx: "plane" },
    { label: "ขอบเขตงาน", icon: NimbusIcons.drop, fx: "drop" },
    { label: "16 ด่าน", icon: NimbusIcons.user, fx: "wave" },
  ];

  // Map active tab to navbar index 0..4
  const getNavbarIndex = (): number => {
    switch (activeTab) {
      case 'overview':
        return 0;
      case '3d-view':
        return 1;
      case 'ai-chat':
      case 'ai-studio':
        return 2;
      case 'work1':
      case 'scope-builder':
      case 'proposed-work':
      case 'work4-studio':
        return 3;
      case 'stop-gates':
      case 'gascode':
        return 4;
      default:
        return 0;
    }
  };

  const handleNavbarChange = (index: number) => {
    switch (index) {
      case 0:
        setActiveTab('overview');
        break;
      case 1:
        setActiveTab('3d-view');
        break;
      case 2:
        setActiveTab('ai-chat');
        break;
      case 3:
        setActiveTab('scope-builder');
        break;
      case 4:
        setActiveTab('stop-gates');
        break;
    }
  };

  return (
    <div className={`relative min-h-screen font-sans antialiased flex flex-col transition-colors ${
      theme === 'light'
        ? 'bg-transparent text-[#14243A] selection:bg-blue-200 selection:text-blue-900'
        : 'theme-dark bg-[#070b12] text-slate-100 selection:bg-teal-400 selection:text-slate-950'
    }`}>
      {/* Pure iOS Frosted Crystal Glass Ambient (Pure White & Neutral Translucent, Zero Blue Tint) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-[10%] left-[10%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-white/95 via-slate-50/50 to-transparent blur-[100px] opacity-90" />
        <div className="absolute top-[35%] -right-[5%] w-[480px] h-[480px] rounded-full bg-gradient-to-bl from-white/90 via-zinc-100/40 to-transparent blur-[110px] opacity-80" />
        <div className="absolute -bottom-[8%] left-[15%] w-[520px] h-[520px] rounded-full bg-gradient-to-tr from-white/95 via-slate-50/50 to-transparent blur-[120px] opacity-90" />
      </div>

      {/* Top Bar with Brand, Back Button, Theme Switcher, and Gateway Trigger */}
      <GoogleAITopbar
        activeTab={activeTab}
        onSelectTab={(tabId) => setActiveTab(tabId as ActiveTabType)}
        config={config}
        onOpenGatewayModal={() => setIsGatewayModalOpen(true)}
        onOpenLogsModal={() => setIsLogsModalOpen(true)}
        onOpenGasCodeModal={() => setIsGasCodeModalOpen(true)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-5 sm:py-6 space-y-6 pb-44">
        {/* Connection Status Banner (Always visible & interactive) */}
        <ConnectionStatusBanner
          config={config}
          onOpenGatewayModal={() => setIsGatewayModalOpen(true)}
        />

        {/* Back button banner if in a sub-menu */}
        {activeTab !== 'overview' && (
          <div className="flex items-center justify-between pb-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer ${
                theme === 'light'
                  ? 'bg-white/80 hover:bg-white text-slate-700 border border-blue-200/80 hover:border-blue-300'
                  : 'bg-slate-900/80 hover:bg-slate-800 text-teal-300 border border-slate-700'
              }`}
            >
              <ArrowLeft className="w-4 h-4 text-blue-600 dark:text-teal-400" />
              <span>← กลับหน้าหลัก (Hub)</span>
            </button>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {activeTab === 'work1' && 'WORK 1: ตาราง 13 คอลัมน์ & สำรอง Drive 3D'}
              {activeTab === 'work4-studio' && 'WORK 4: ห้องควบคุมงานพิมพ์จดหมาย 9 หมวด & EMS'}
              {activeTab === 'ai-chat' && 'Gemini AI Chatbot (Multi-Turn)'}
              {activeTab === '3d-view' && 'Three.js 3D CRD Architecture'}
              {activeTab === 'ai-studio' && 'Google AI UI Studio'}
              {activeTab === 'scope-builder' && 'Scope Builder'}
              {activeTab === 'stop-gates' && '16 Stop Gates Audit'}
              {activeTab === 'proposed-work' && 'ศูนย์ปฏิบัติการสายงานจริง CRD WORK 1–9'}
              {activeTab === 'gascode' && 'Google Apps Script (Code.gs)'}
            </span>
          </div>
        )}

        {/* View 1: Clean Hub Dashboard */}
        {activeTab === 'overview' && (
          <CleanHubDashboard
            config={config}
            scopesCount={scopesCount}
            logCount={logCount}
            onNavigate={(view) => setActiveTab(view as ActiveTabType)}
            onOpenGatewayModal={() => setIsGatewayModalOpen(true)}
            onOpenLogsModal={() => setIsLogsModalOpen(true)}
            onOpenExportModal={() => setIsExportModalOpen(true)}
            theme={theme}
          />
        )}

        {/* View 1-W1: WORK 1 13-Col Export & 3D GlassFolder Drive Backup */}
        {activeTab === 'work1' && (
          <div className="space-y-6 animate-fade-in">
            <Work1AndBackupStudio theme={theme} />
          </div>
        )}

        {/* View 1A: Dedicated WORK 4 Monthly Letter & EMS Printing Control Room */}
        {activeTab === 'work4-studio' && (
          <div className="space-y-6 animate-fade-in">
            <Work4LetterPrintStudio onOpenLogsModal={() => setIsLogsModalOpen(true)} />
          </div>
        )}

        {/* View 1B: Multi-Turn Gemini AI Chatbot */}
        {activeTab === 'ai-chat' && (
          <div className="space-y-6 animate-fade-in">
            <GeminiChatbotView />
          </div>
        )}

        {/* View 1C: Interactive Three.js 3D CRD Architecture */}
        {activeTab === '3d-view' && (
          <div className="space-y-6 animate-fade-in">
            <CrdArchitecture3DView />
          </div>
        )}

        {/* View 2: Self-Evolving In-App AI UI Designer & Code Introspection */}
        {activeTab === 'ai-studio' && (
          <div className="space-y-6 animate-fade-in">
            <SelfEvolvingDesignStudio
              onOpenLogsModal={() => setIsLogsModalOpen(true)}
            />
            <AICommandDispatcher onOpenLogsModal={() => setIsLogsModalOpen(true)} />
          </div>
        )}

        {/* View 3: Scope Builder Dedicated View */}
        {activeTab === 'scope-builder' && (
          <div className="space-y-6 animate-fade-in">
            <ScopeBuilderClean onOpenLogsModal={() => setIsLogsModalOpen(true)} />
            <ProposedWorkGrid
              initialSelectedWorkId="WORK 1"
              onOpenLogsModal={() => setIsLogsModalOpen(true)}
            />
          </div>
        )}

        {/* View 4: Stop Gates 16-Stage Audit Dedicated View */}
        {activeTab === 'stop-gates' && (
          <div className="space-y-6 animate-fade-in">
            <StopGatesAuditClean onOpenLogsModal={() => setIsLogsModalOpen(true)} />
          </div>
        )}

        {/* View 5: Operational WORK 1–9 Hub Dedicated View */}
        {activeTab === 'proposed-work' && (
          <div className="space-y-6 animate-fade-in">
            <ProposedWorkGrid
              initialSelectedWorkId="WORK 1"
              onOpenLogsModal={() => setIsLogsModalOpen(true)}
            />
          </div>
        )}

        {/* View 6: Google Apps Script Backend Code Section */}
        {activeTab === 'gascode' && (
          <div className="space-y-6 animate-fade-in">
            <GasCodeSection />
          </div>
        )}
      </main>

      {/* Floating Live Payloads counter button */}
      <div className="hidden md:block fixed bottom-6 right-6 z-40">
        <button
          onClick={() => setIsLogsModalOpen(true)}
          className={`px-4 py-2.5 rounded-2xl border text-xs font-medium shadow-xl flex items-center gap-2.5 cursor-pointer transition-all ${
            theme === 'light'
              ? 'bg-white/95 hover:bg-slate-50 border-blue-200 text-[#14243A]'
              : 'bg-[#0e1626]/95 hover:bg-slate-800 border-teal-500/40 text-slate-200'
          }`}
          title={`ดูประวัติการส่งคำสั่งและโมดูลจริงจาก 00_Project_Manifest.json (${manifestModules.length} Modules)`}
        >
          <Terminal className="w-4 h-4 text-blue-600 dark:text-teal-400" />
          <span className="font-semibold">Live Payloads</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-slate-800 text-blue-700 dark:text-teal-300 font-mono text-[11px] font-bold">
            {manifestModules.length > 0 ? manifestModules.length : logCount}
          </span>
        </button>
      </div>

      {/* Docked Bottom Bar with Frosted Glass Strip (Fixes overlap & text squishing) */}
      <nav className="fixed bottom-0 inset-x-0 z-50 bg-white/75 dark:bg-slate-900/80 backdrop-blur-2xl border-t border-slate-200/50 dark:border-slate-800/80 py-2.5 px-4 flex flex-col items-center justify-center shadow-[0_-8px_30px_rgba(0,0,0,0.03)]">
        <div className="flex flex-col items-center">
          <LiquidNavbar
            items={navItems}
            active={getNavbarIndex()}
            onChange={(idx) => handleNavbarChange(idx)}
            tone={theme === 'dark' ? 'dark' : 'light'}
            compact={true}
            sound={true}
          />
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-1 select-none tracking-tight">
            by guglielmogiannattasio.it
          </span>
        </div>
      </nav>

      {/* Modals */}
      <BackendGatewayModal
        isOpen={isGatewayModalOpen}
        onClose={() => setIsGatewayModalOpen(false)}
        onOpenLogsDrawer={() => setIsLogsModalOpen(true)}
      />

      <GasCodeModal
        isOpen={isGasCodeModalOpen}
        onClose={() => setIsGasCodeModalOpen(false)}
      />

      <PayloadLogsModal
        isOpen={isLogsModalOpen}
        onClose={() => setIsLogsModalOpen(false)}
        manifestModules={manifestModules}
      />

      <ExportCodeModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onOpenGasModal={() => setIsGasCodeModalOpen(true)}
      />
    </div>
  );
}
