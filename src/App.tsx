/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { GoogleAITopbar } from './components/GoogleAITopbar';
import { CleanHubDashboard } from './components/CleanHubDashboard';
import { BackOfficeAdminHub } from './components/BackOfficeAdminHub';
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
import { Work4PrintStudio } from './components/Work4PrintStudio';
import { Work1AndBackupStudio } from './components/Work1AndBackupStudio';
import { UnifiedControlFlowStudio } from './components/UnifiedControlFlowStudio';
import { LiquidNavbar, NimbusIcons, LiquidNavItem } from './components/ui/liquid-glass-navbar';

import { backendGateway } from './services/backendGateway';
import { GatewayConfig, ManifestModule } from './types';

export type ActiveTabType =
  | 'overview'
  | 'control-flow'
  | 'work1'
  | 'work4'
  | 'proposed-work'
  | 'admin-hub'
  | 'scope-builder'
  | 'ai-studio'
  | 'stop-gates'
  | 'gascode';

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
    const MANIFEST_REFRESH_INTERVAL_MS = 60_000;
    let isRefreshing = false;

    const refreshManifestIfReady = async (background: boolean) => {
      if (isRefreshing) return;
      const cfg = backendGateway.getConfig();
      if (cfg.isSimulationMode || !backendGateway.hasGatewayUrl() || !backendGateway.hasGatewayToken()) {
        return;
      }
      isRefreshing = true;
      try {
        const res = await backendGateway.readManifest(undefined, { background });
        if (res.success && res.manifest?.modules) {
          setManifestModules(res.manifest.modules);
        }
      } finally {
        isRefreshing = false;
      }
    };

    void refreshManifestIfReady(false);

    const refreshTimer = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) {
        void refreshManifestIfReady(true);
      }
    }, MANIFEST_REFRESH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        void refreshManifestIfReady(true);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
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
      clearInterval(refreshTimer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      unsubConfig();
      unsubLogs();
      unsubScopes();
      unsubManifest();
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [activeTab]);

  // Original Liquid Glass Navbar (Zero Watermark) mapped cleanly to Front Office + Back Office
  const navItems: LiquidNavItem[] = [
    { label: 'หน้าหลัก', icon: NimbusIcons.home, fx: 'glow' },
    { label: 'WORK 1', icon: NimbusIcons.globe, fx: 'spin' },
    { label: 'พิมพ์จดหมาย', icon: NimbusIcons.plane, fx: 'plane' },
    { label: 'WORK 1–9', icon: NimbusIcons.drop, fx: 'drop' },
    { label: 'หลังบ้าน', icon: NimbusIcons.user, fx: 'wave' },
  ];

  const getNavbarIndex = (): number => {
    switch (activeTab) {
      case 'overview':
      case 'control-flow':
        return 0;
      case 'work1':
        return 1;
      case 'work4':
        return 2;
      case 'proposed-work':
        return 3;
      case 'admin-hub':
      case 'scope-builder':
      case 'stop-gates':
      case 'ai-studio':
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
        setActiveTab('work1');
        break;
      case 2:
        setActiveTab('work4');
        break;
      case 3:
        setActiveTab('proposed-work');
        break;
      case 4:
        setActiveTab('admin-hub');
        break;
    }
  };

  const livePayloadCount = manifestModules.length > 0 ? manifestModules.length : logCount;

  return (
    <div
      className={`relative min-h-[100dvh] font-sans antialiased flex flex-col transition-colors ${
        theme === 'light'
          ? 'bg-transparent text-[#14243A] selection:bg-blue-200 selection:text-blue-900'
          : 'theme-dark dark bg-[#070b12] text-slate-100 selection:bg-teal-400 selection:text-slate-950'
      }`}
    >
      {/* Ambient Background Layer (z-0) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-[10%] left-[10%] w-[420px] h-[420px] rounded-full bg-gradient-to-br from-white/95 via-slate-50/50 to-transparent blur-[90px] opacity-90 dark:opacity-10" />
        <div className="absolute top-[35%] -right-[5%] w-[420px] h-[420px] rounded-full bg-gradient-to-bl from-white/90 via-zinc-100/40 to-transparent blur-[100px] opacity-80 dark:opacity-10" />
      </div>

      {/* Top Bar (z-40, Safe Area for iPhone Dynamic Island) */}
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

      {/* Main Container (z-10, Safe Bottom Clearance) */}
      <main className="relative z-10 flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 pt-4 sm:pt-5 space-y-5 main-safe-bottom">
        {/* Front-Office Views */}
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

        {activeTab === 'control-flow' && (
          <UnifiedControlFlowStudio
            onNavigate={(view) => setActiveTab(view as ActiveTabType)}
            onOpenGatewayModal={() => setIsGatewayModalOpen(true)}
            onOpenLogsModal={() => setIsLogsModalOpen(true)}
            onOpenExportModal={() => setIsExportModalOpen(true)}
            theme={theme}
          />
        )}

        {activeTab === 'work1' && <Work1AndBackupStudio theme={theme} />}

        {activeTab === 'work4' && (
          <Work4PrintStudio onBack={() => setActiveTab('overview')} theme={theme} />
        )}

        {activeTab === 'proposed-work' && (
          <div className="space-y-5 animate-fade-in">
            <ProposedWorkGrid onSelectWork={(w) => setActiveTab(w as ActiveTabType)} />
          </div>
        )}

        {/* Back-Office Views */}
        {activeTab === 'admin-hub' && (
          <BackOfficeAdminHub
            config={config}
            scopesCount={scopesCount}
            logCount={logCount}
            livePayloadCount={livePayloadCount}
            onNavigate={(view) => setActiveTab(view as ActiveTabType)}
            onOpenGatewayModal={() => setIsGatewayModalOpen(true)}
            onOpenLogsModal={() => setIsLogsModalOpen(true)}
            onOpenExportModal={() => setIsExportModalOpen(true)}
          />
        )}

        {activeTab === 'ai-studio' && (
          <div className="space-y-5 animate-fade-in">
            <AICommandDispatcher onOpenLogsModal={() => setIsLogsModalOpen(true)} />
            <SelfEvolvingDesignStudio onOpenLogsModal={() => setIsLogsModalOpen(true)} />
          </div>
        )}

        {activeTab === 'scope-builder' && (
          <div className="space-y-5 animate-fade-in">
            <ScopeBuilderClean onOpenLogsModal={() => setIsLogsModalOpen(true)} />
          </div>
        )}

        {activeTab === 'stop-gates' && (
          <div className="space-y-5 animate-fade-in">
            <StopGatesAuditClean onOpenLogsModal={() => setIsLogsModalOpen(true)} />
          </div>
        )}

        {activeTab === 'gascode' && (
          <div className="space-y-5 animate-fade-in">
            <GasCodeSection />
          </div>
        )}
      </main>

      {/* Original Frosted Liquid Glass Bottom Dock (iPhone 15 Pro Max Safe Area — Zero Watermark) */}
      <nav
        aria-label="เมนูหลักด้านล่าง"
        className="fixed bottom-0 inset-x-0 z-50 safe-bottom pt-2 px-3 bg-white/75 dark:bg-slate-900/85 backdrop-blur-2xl border-t border-slate-200/60 dark:border-slate-800/80 flex items-center justify-center shadow-[0_-8px_30px_rgba(0,0,0,0.04)]"
      >
        <LiquidNavbar
          items={navItems}
          active={getNavbarIndex()}
          onChange={(idx) => handleNavbarChange(idx)}
          tone={theme === 'dark' ? 'dark' : 'light'}
          compact={true}
          sound={true}
        />
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
