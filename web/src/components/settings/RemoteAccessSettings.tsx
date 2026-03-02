'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  Shield,
  Wifi,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Link2,
  Unlink,
  Copy,
  Check,
  RefreshCw,
  Download,
  Smartphone,
  Laptop,
  CheckCircle2
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { Badge } from '@/components/ui/Badge';
import { client } from '@/api/client';

interface TailscaleNode {
  ID: string;
  HostName: string;
  DNSName: string;
  TailscaleIPs: string[];
  Online: boolean;
  Relay?: string;
  CurAddr?: string;
  RxBytes?: number;
  TxBytes?: number;
}

interface TailscaleStatus {
  BackendState: string;
  Self?: TailscaleNode;
  Peer?: Record<string, TailscaleNode>;
  Health?: string[];
  MagicDNSSuffix?: string;
}

interface TailscaleInstallCheck {
  installed: boolean;
  path?: string;
  daemonRunning?: boolean;
}

interface TailscaleAuthResponse {
  authURL?: string;
  success: boolean;
  message?: string;
}

type SetupStep = 'install' | 'connect' | 'client' | 'done';

export function RemoteAccessSettings() {
  const [status, setStatus] = useState<TailscaleStatus | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean | null>(null);
  const [isDaemonRunning, setIsDaemonRunning] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [authURL, setAuthURL] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<SetupStep>('install');
  const [installerOpened, setInstallerOpened] = useState(false);
  const [autoEnableTriggered, setAutoEnableTriggered] = useState(false);

  // Determine current setup step
  const determineStep = useCallback((installed: boolean, daemonRunning: boolean, status: TailscaleStatus | null): SetupStep => {
    if (!installed) return 'install';
    if (!daemonRunning) return 'install'; // Daemon not running, need to reinstall with Mac app
    if (!status || status.BackendState !== 'Running') return 'connect';
    return 'done';
  }, []);

  // Fetch status
  const fetchStatus = useCallback(async () => {
    try {
      setError(null);
      const [statusRes, installedRes] = await Promise.all([
        client.get<TailscaleStatus>('/remote/status').catch(() => null),
        client.get<TailscaleInstallCheck>('/remote/installed').catch(() => null),
      ]);
      setStatus(statusRes);
      setIsInstalled(installedRes?.installed ?? false);
      setIsDaemonRunning(installedRes?.daemonRunning ?? false);

      // Update current step
      const step = determineStep(installedRes?.installed ?? false, installedRes?.daemonRunning ?? false, statusRes);
      setCurrentStep(step);

      // Clear auth URL if connected
      if (statusRes?.BackendState === 'Running') {
        setAuthURL(null);
      }
    } catch (err) {
      console.error('Failed to fetch remote status:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setIsLoading(false);
    }
  }, [determineStep]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // 当进入 connect 步骤时自动触发登录流程
  useEffect(() => {
    if (currentStep === 'connect' && !autoEnableTriggered && !isEnabling && !authURL) {
      setAutoEnableTriggered(true);
      (async () => {
        setIsEnabling(true);
        try {
          const res = await client.post<TailscaleAuthResponse>('/remote/enable', {});
          if (res.authURL) {
            setAuthURL(res.authURL);
            window.open(res.authURL, '_blank');
          }
        } catch (err) {
          console.error('Auto-enable failed:', err);
          // 不显示错误，用户可以手动点击重试
        } finally {
          setIsEnabling(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, autoEnableTriggered]);

  // Enable remote access
  const handleEnable = async () => {
    setIsEnabling(true);
    setError(null);
    try {
      const res = await client.post<TailscaleAuthResponse>('/remote/enable', {});
      if (res.authURL) {
        setAuthURL(res.authURL);
        // Auto-open the auth URL
        window.open(res.authURL, '_blank');
      }
      await fetchStatus();
    } catch (err) {
      console.error('Failed to enable:', err);
      setError(err instanceof Error ? err.message : 'Failed to enable remote access');
    } finally {
      setIsEnabling(false);
    }
  };

  // Disable remote access
  const handleDisable = async () => {
    setIsDisabling(true);
    setError(null);
    try {
      await client.post('/remote/disable', {});
      await fetchStatus();
    } catch (err) {
      console.error('Failed to disable:', err);
      setError(err instanceof Error ? err.message : 'Failed to disable remote access');
    } finally {
      setIsDisabling(false);
    }
  };

  // Logout completely
  const handleLogout = async () => {
    setIsDisabling(true);
    setError(null);
    try {
      await client.post('/remote/logout', {});
      setAuthURL(null);
      await fetchStatus();
    } catch (err) {
      console.error('Failed to logout:', err);
      setError(err instanceof Error ? err.message : 'Failed to logout');
    } finally {
      setIsDisabling(false);
    }
  };

  // Copy to clipboard
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const isConnected = status?.BackendState === 'Running';
  const isDirect = isConnected && (!status?.Self?.Relay || status?.Self?.Relay === '');

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="p-8 rounded-2xl bg-white/5 border border-white/5 h-48" />
      </div>
    );
  }

  // Setup wizard for non-connected state
  if (!isConnected) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Setup Progress */}
        <Card className="p-8 border-none bg-white/[0.02] backdrop-blur-xl relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/20 blur-[80px] rounded-full" />

          {/* Header */}
          <div className="flex items-center gap-4 mb-8 relative">
            <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white leading-none">设置远程访问</h3>
              <p className="text-xs text-gray-500 mt-2">
                通过 Tailscale 从任何地方安全访问你的 NAS
              </p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-300">出错了</p>
                  <p className="text-xs text-red-300/70 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Setup Steps */}
          <div className="space-y-4">
            {/* Step 1: Install */}
            <div className={`p-4 rounded-2xl border transition-all ${
              currentStep === 'install'
                ? 'bg-blue-500/10 border-blue-500/30'
                : (isInstalled && isDaemonRunning)
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-white/[0.02] border-white/5'
            }`}>
              <div className="flex items-start gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  (isInstalled && isDaemonRunning)
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : currentStep === 'install'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-white/5 text-gray-500'
                }`}>
                  {(isInstalled && isDaemonRunning) ? <CheckCircle2 className="w-5 h-5" /> : <span className="text-sm font-bold">1</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-white">安装 Tailscale</h4>
                    {(isInstalled && isDaemonRunning) && <Badge variant="emerald">已完成</Badge>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    在 NAS 主机上安装 Tailscale 客户端
                  </p>

                  {currentStep === 'install' && (() => {
                    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
                    const needsLaunch = isInstalled && !isDaemonRunning;

                    return (
                    <div className="mt-4 space-y-4">
                      {!installerOpened ? (
                        <>
                          {needsLaunch ? (
                            <>
                              {/* 已安装但未运行 → 主操作是打开应用 */}
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={async () => {
                                  try {
                                    setError(null);
                                    const res = await client.post<{ opened: boolean }>('/remote/open-tailscale', {});
                                    if (!res.opened) {
                                      setError('Tailscale 应用未找到，请尝试重新安装');
                                    }
                                  } catch (err) {
                                    setError(err instanceof Error ? err.message : '无法打开 Tailscale');
                                  }
                                }}
                              >
                                <ExternalLink className="w-4 h-4 mr-2" />
                                启动 Tailscale
                              </Button>
                              <p className="text-[10px] text-gray-500">
                                Tailscale 已安装，点击启动后即可继续配置
                              </p>
                            </>
                          ) : (
                            <>
                              {/* 未安装 → 主操作是下载安装 */}
                              <Button
                                variant="primary"
                                size="sm"
                                disabled={isInstalling}
                                onClick={async () => {
                                  try {
                                    setError(null);
                                    setIsInstalling(true);
                                    await client.post('/remote/download-install', {});
                                    setInstallerOpened(true);
                                  } catch (err) {
                                    setError(err instanceof Error ? err.message : '下载或安装失败');
                                  } finally {
                                    setIsInstalling(false);
                                  }
                                }}
                              >
                                {isInstalling ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <Download className="w-4 h-4 mr-2" />
                                )}
                                {isInstalling ? '正在下载...' : '一键下载安装'}
                              </Button>
                              <p className="text-[10px] text-gray-500">
                                从 Tailscale 官网下载安装包并在 NAS 上安装
                              </p>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          {/* 安装器已打开，等待用户完成安装 */}
                          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                            <div className="flex items-start gap-3">
                              <div className="p-2 rounded-lg bg-blue-500/20">
                                <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                              </div>
                              <div className="flex-1">
                                <h5 className="text-sm font-semibold text-blue-300">安装器已打开</h5>
                                <p className="text-xs text-blue-300/70 mt-1">
                                  {isLocal
                                    ? '请在弹出的安装窗口中完成安装'
                                    : '请在 NAS 屏幕上完成 Tailscale 安装'
                                  }
                                </p>
                                <div className="mt-3 space-y-2 text-xs text-gray-400">
                                  <p>1. 点击「继续」开始安装</p>
                                  <p>2. 输入管理员密码确认安装</p>
                                  <p>3. 安装完成后打开 Tailscale 应用</p>
                                </div>
                              </div>
                            </div>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setInstallerOpened(false)}
                          >
                            <RefreshCw className="w-3 h-3 mr-2" />
                            重新下载
                          </Button>
                        </>
                      )}

                      <div className="flex items-center gap-2 text-[10px] text-gray-500">
                        <RefreshCw className="w-3 h-3" />
                        <span>安装并启动后此页面会自动检测并进入下一步</span>
                      </div>
                    </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Step 2: Connect */}
            <div className={`p-4 rounded-2xl border transition-all ${
              currentStep === 'connect'
                ? 'bg-blue-500/10 border-blue-500/30'
                : isConnected
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-white/[0.02] border-white/5 opacity-50'
            }`}>
              <div className="flex items-start gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  isConnected
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : currentStep === 'connect'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-white/5 text-gray-500'
                }`}>
                  {isConnected ? <CheckCircle2 className="w-5 h-5" /> : <span className="text-sm font-bold">2</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-white">登录 Tailscale</h4>
                    {isConnected && <Badge variant="emerald">已连接</Badge>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    使用 Google、GitHub 或 Apple 账号登录
                  </p>

                  {currentStep === 'connect' && isInstalled && (
                    <div className="mt-4">
                      {authURL ? (
                        <div className="space-y-3">
                          <p className="text-xs text-blue-400">
                            请在打开的页面中完成登录，登录后此页面会自动更新
                          </p>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => window.open(authURL, '_blank')}
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            打开登录页面
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleEnable}
                          isLoading={isEnabling}
                        >
                          <Shield className="w-4 h-4 mr-2" />
                          连接 Tailscale
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Step 3: Client Setup */}
            <div className={`p-4 rounded-2xl border transition-all ${
              currentStep === 'client' || currentStep === 'done'
                ? 'bg-white/[0.02] border-white/10'
                : 'bg-white/[0.02] border-white/5 opacity-50'
            }`}>
              <div className="flex items-start gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  currentStep === 'done'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-white/5 text-gray-500'
                }`}>
                  <span className="text-sm font-bold">3</span>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-white">在你的设备上安装</h4>
                  <p className="text-xs text-gray-500 mt-1">
                    在手机或电脑上安装 Tailscale，登录同一账号即可远程访问 NAS
                  </p>

                  {(currentStep === 'connect' || currentStep === 'done') && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open('https://apps.apple.com/app/tailscale/id1470499037', '_blank')}
                      >
                        <Smartphone className="w-3 h-3 mr-2" />
                        iOS
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open('https://play.google.com/store/apps/details?id=com.tailscale.ipn', '_blank')}
                      >
                        <Smartphone className="w-3 h-3 mr-2" />
                        Android
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open('https://tailscale.com/download', '_blank')}
                      >
                        <Laptop className="w-3 h-3 mr-2" />
                        Mac / Windows
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Benefits */}
        <Card className="p-6 border-none bg-white/[0.01]">
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
            Tailscale 的优势
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Shield className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-xs text-gray-300 font-medium">端到端加密</p>
                <p className="text-[10px] text-gray-500 mt-0.5">WireGuard 协议，军用级安全</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
                <Wifi className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-xs text-gray-300 font-medium">P2P 直连</p>
                <p className="text-[10px] text-gray-500 mt-0.5">数据不经过第三方服务器</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                <Globe className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-xs text-gray-300 font-medium">无需端口映射</p>
                <p className="text-[10px] text-gray-500 mt-0.5">穿透任何 NAT 和防火墙</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                <Link2 className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-xs text-gray-300 font-medium">个人免费</p>
                <p className="text-[10px] text-gray-500 mt-0.5">最多 100 台设备，3 个用户</p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Connected state - show dashboard
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Main Card */}
      <Card className="p-8 border-none bg-white/[0.02] backdrop-blur-xl relative overflow-hidden group">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/20 blur-[80px] rounded-full
                      group-hover:bg-emerald-500/30 transition-all duration-700" />

        {/* Header */}
        <div className="flex items-center justify-between mb-8 relative">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white leading-none">远程访问</h3>
              <p className="text-xs text-gray-500 mt-2">
                已连接到 Tailscale 网络
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {(isEnabling || isDisabling) && (
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            )}
            <Switch
              checked={isConnected}
              onChange={(checked) => checked ? handleEnable() : handleDisable()}
              disabled={isEnabling || isDisabling}
            />
          </div>
        </div>

        {/* Connection Info */}
        {status?.Self && (
          <div className="space-y-4">
            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Tailscale IP */}
              <div className="p-4 bg-white/[0.03] rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                    <Link2 className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
                      远程访问 IP
                    </div>
                    <div className="text-white font-mono text-sm mt-0.5 truncate">
                      {status.Self.TailscaleIPs?.[0] || 'N/A'}
                    </div>
                  </div>
                  <Badge variant="emerald" pulse>在线</Badge>
                </div>
              </div>

              {/* Connection Type */}
              <div className="p-4 bg-white/[0.03] rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    isDirect
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    <Wifi className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
                      连接类型
                    </div>
                    <div className="text-white text-sm mt-0.5">
                      {isDirect ? '直连 (P2P)' : `中继 (${status.Self.Relay || 'DERP'})`}
                    </div>
                  </div>
                  <Badge variant={isDirect ? 'emerald' : 'amber'}>
                    {isDirect ? '最快' : '中继'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* DNS Name */}
            <div className="p-4 bg-white/[0.03] rounded-xl border border-white/5">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-2">
                Magic DNS 地址
              </div>
              <div className="flex items-center justify-between gap-4">
                <code className="text-blue-400 text-sm font-mono truncate flex-1">
                  {status.Self.DNSName}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(status.Self!.DNSName)}
                  className="shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 mr-1.5 text-emerald-400" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 mr-1.5" />
                      复制
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-gray-600 mt-2">
                在 Tailscale 网络中的任何设备上使用此地址访问 NAS
              </p>
            </div>

            {/* How to Use */}
            <div className="p-4 bg-blue-500/5 rounded-xl border border-blue-500/10">
              <h4 className="text-xs font-semibold text-blue-400 mb-2">如何使用</h4>
              <div className="space-y-2 text-xs text-gray-400">
                <p>1. 在手机/笔记本上安装 Tailscale 并登录同一账号</p>
                <p>2. 在外网时，使用上方的 IP 或 DNS 地址访问 NAS</p>
                <p>3. 例如访问 <code className="text-blue-400">http://{status.Self.TailscaleIPs?.[0]}:23000</code></p>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-white/5 flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchStatus}
                className="text-gray-400 hover:text-white"
              >
                <RefreshCw className="w-3 h-3 mr-2" />
                刷新状态
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleLogout}
                isLoading={isDisabling}
              >
                <Unlink className="w-3 h-3 mr-2" />
                断开并登出
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Client Install Reminder */}
      <Card className="p-6 border-none bg-white/[0.01]">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
          在你的设备上安装 Tailscale
        </h4>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.open('https://apps.apple.com/app/tailscale/id1470499037', '_blank')}
          >
            <Smartphone className="w-3 h-3 mr-2" />
            iOS App Store
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.open('https://play.google.com/store/apps/details?id=com.tailscale.ipn', '_blank')}
          >
            <Smartphone className="w-3 h-3 mr-2" />
            Android Play Store
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.open('https://tailscale.com/download', '_blank')}
          >
            <Laptop className="w-3 h-3 mr-2" />
            Mac / Windows / Linux
          </Button>
        </div>
        <p className="text-[10px] text-gray-600 mt-3">
          安装后登录与 NAS 相同的 Tailscale 账号，即可在外网访问
        </p>
      </Card>
    </div>
  );
}
