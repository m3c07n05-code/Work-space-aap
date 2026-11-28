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
