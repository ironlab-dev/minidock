'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { RemoteConsole } from '@/components/system/RemoteConsole';
import { useTranslation } from '@/hooks/useTranslation';
import { AlertCircle, CheckCircle2, RefreshCw, ExternalLink, History, Monitor, Trash2, MonitorSpeaker, Globe, ChevronDown } from 'lucide-react';
import { client } from '@/api/client';
import { PageLayout, Button, Tabs } from '@/components/ui';
import { generateUUID } from '@/lib/uuid';

interface ConnectionHistoryItem {
    id: string;
    host: string;
    port: number;
    lastConnected: number;
}

interface LocalIPInfo {
    device: string;
    name: string;
    address: string;
}

export default function RemoteDesktopPage() {
    const searchParams = useSearchParams();
    const { t } = useTranslation();

    const [vncStatus, setVncStatus] = useState<{
        enabled: boolean;
        listening: boolean;
        processName: string | null;
        primaryIP: string | null;
    } | null>(null);

    const checkVncStatus = useCallback(async () => {
        try {
            const data = await client.get<{ enabled: boolean; listening: boolean; processName: string | null; primaryIP: string | null }>('/system/screensharing');
            setVncStatus(data);
        } catch (e) {
            console.error('[RemoteDesktop] Failed to check VNC status:', e);
        }
    }, []);

    useEffect(() => {
        checkVncStatus();
        const timer = setInterval(checkVncStatus, 5000);
        return () => clearInterval(timer);
    }, [checkVncStatus]);

    // Connection Mode: 'host' or 'external'
    const [connectionMode, setConnectionMode] = useState<'host' | 'external'>('host');
    const [customHost, setCustomHost] = useState('');
    const [customPort, setCustomPort] = useState('5900');
    const [isHostConnected, setIsHostConnected] = useState(false);
    const [isCustomConnected, setIsCustomConnected] = useState(false);
    const [history, setHistory] = useState<ConnectionHistoryItem[]>([]);
    const urlParamProcessed = useRef(false);

    // macOS detection
    const isMacOS = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

    // Available local IPs for selection
    const [localIPs, setLocalIPs] = useState<LocalIPInfo[]>([]);
    const [selectedIP, setSelectedIP] = useState<string>('');
    const [showIPMenu, setShowIPMenu] = useState(false);

    // Fetch local IPs (only once on mount)
    useEffect(() => {
        const fetchLocalIPs = async () => {
            try {
                const data = await client.get<{ localIPs: LocalIPInfo[]; localIP: string }>('/system/ip-info');
                if (data.localIPs && data.localIPs.length > 0) {
                    setLocalIPs(data.localIPs);
                    // Default to primary IP
                    if (data.localIP) {
                        setSelectedIP(data.localIP);
                    }
                }
            } catch (e) {
                console.error('[RemoteDesktop] Failed to fetch local IPs:', e);
            }
        };
        fetchLocalIPs();
    }, []);

    // Connectivity configuration
    const [externalHost, setExternalHost] = useState<string>('');
    const [externalVncPort, setExternalVncPort] = useState<string>('5900');

    // Fetch connectivity configuration
    useEffect(() => {
        const fetchConnectivity = async () => {
            try {
                const data = await client.get<Record<string, unknown>>('/services/ssh-manager');
                if ((data.stats as Record<string, string>)?.external_host) {
                    setExternalHost((data.stats as Record<string, string>).external_host);
                }
                if ((data.stats as Record<string, string>)?.external_vnc_port) {
                    setExternalVncPort((data.stats as Record<string, string>).external_vnc_port);
                }
            } catch (e) {
                console.error('[RemoteDesktop] Failed to fetch connectivity config:', e);
            }
        };
        fetchConnectivity();
    }, []);

    // URL parameter handling for initial load
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && !urlParamProcessed.current) {
            if (['host', 'external'].includes(tab)) {
                setConnectionMode(tab as typeof connectionMode);
                urlParamProcessed.current = true;
            }
        }
    }, [searchParams]);

    // Helper to persist history
    const saveHistoryToBackend = async (newHistory: ConnectionHistoryItem[]) => {
        const payload = {
            key: 'REMOTE_DESKTOP_HISTORY',
            value: JSON.stringify(newHistory),
            category: 'system',
            isSecret: true
        };
        try {
            // Try to update first
            await client.put('/settings', payload);
        } catch (e) {
            // If it fails (likely 404 Not Found), try to create
            if ((e as Error).message && ((e as Error).message.includes('404') || (e as Error).message.includes('Not Found'))) {
                try {
                    await client.post('/settings', payload);
                } catch (createErr) {
                    console.error('Failed to create history setting', createErr);
                }
            } else {
                console.error('Failed to update history setting', e);
            }
        }
    };

    // Load History
    const loadHistory = useCallback(async () => {
        try {
            const settings = await client.get<Array<Record<string, string>>>('/settings');
            const historySetting = settings.find(s => s.key === 'REMOTE_DESKTOP_HISTORY');
            if (historySetting && historySetting.value) {
                try {
                    const items = JSON.parse(historySetting.value);
                    if (Array.isArray(items)) {
                        setHistory(items.sort((a, b) => b.lastConnected - a.lastConnected));
                    }
                } catch (e) {
                    console.error('Failed to parse history', e);
                }
            }
        } catch (e) {
            console.error('Failed to load history', e);
        }
    }, []);

    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    // Save History
    const addToHistory = useCallback(async (host: string, port: number) => {
        const newItem: ConnectionHistoryItem = {
            id: generateUUID(),
            host,
            port,
            lastConnected: Date.now()
        };

        setHistory(prev => {
            const filtered = prev.filter(item => !(item.host === host && item.port === port));
            const newHistory = [newItem, ...filtered].slice(0, 10);
            saveHistoryToBackend(newHistory);
            return newHistory;
        });
    }, []);

    const removeFromHistory = useCallback(async (id: string) => {
        setHistory(prev => {
            const newHistory = prev.filter(item => item.id !== id);
            saveHistoryToBackend(newHistory);
            return newHistory;
        });
    }, []);

    const isConflict = vncStatus?.listening && vncStatus.processName &&
        !vncStatus.processName.toLowerCase().includes('screensharing') &&
        !vncStatus.processName.toLowerCase().includes('screen sharing');

    const isValidIP = (ip: string) => {
        // In external mode, allow connection if user entered IP or external host is configured
        if (connectionMode === 'external') {
            return ip.length > 0 || externalHost.length > 0;
        }
        return ip.length > 0;
    };

    const handleCustomConnectionEnter = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && isValidIP(customHost)) {
            setIsCustomConnected(true);
        }
    };

    const formatTimeAgo = (timestamp: number) => {
        const now = Date.now();
        const diff = now - timestamp;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return days === 1 
                ? (t.remote.history.yesterday || '昨天')
                : (t.remote.history.days_ago || '{n} 天前').replace('{n}', String(days));
        }
        if (hours > 0) {
            return (t.common.hours_ago || '{n}小时前').replace('{n}', String(hours));
        }
        const minutes = Math.floor(diff / (1000 * 60));
        return minutes > 0 
            ? (t.common.minutes_ago || '{n}分钟前').replace('{n}', String(minutes))
            : (t.common.just_now || '刚刚');
    };

    // Build native VNC URL for macOS Screen Sharing
    const getNativeVncUrl = useCallback((host: string, port: string | number) => {
        return `vnc://${host}:${port}`;
    }, []);

    // Handle native macOS Screen Sharing connection
    const handleNativeVncConnect = useCallback((host: string, port: string | number) => {
        const vncUrl = getNativeVncUrl(host, port);
        window.location.href = vncUrl;
        // Add to history
        addToHistory(host, typeof port === 'string' ? parseInt(port) || 5900 : port);
    }, [getNativeVncUrl, addToHistory]);

    // Get effective host and port for native VNC connection
    // For native VNC (macOS Screen Sharing), always use internal IP in host mode
    // because native VNC connects directly from user's Mac to the target machine

    // Status badges for header
    const statusBadges = (
        <>
            {vncStatus?.enabled ? (
                <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-widest ring-1 ring-emerald-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {t.remote.status.enabled}
                </span>
            ) : (
                <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 text-rose-400 text-[10px] font-bold uppercase tracking-widest ring-1 ring-rose-500/20">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {t.remote.status.disabled}
                </span>
            )}
            {vncStatus?.listening && (
                <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-bold uppercase tracking-widest ring-1 ring-blue-500/20">
                    <RefreshCw className="w-3.5 h-3.5" />
                    {t.remote.status.port_active}
                </span>
            )}
        </>
    );

    return (
        <PageLayout animate={false}>
            {/* Sticky Header with Tabs and Status Badges */}
            <Tabs
                tabs={[
                    { id: 'host', label: t.remote.tabs.host },
                    { id: 'external', label: t.remote.tabs.external },
                ]}
                activeTab={connectionMode}
                onChange={(id) => {
                    setConnectionMode(id as typeof connectionMode);
                    if (id === 'host') setIsHostConnected(false);
                    if (id === 'external') setIsCustomConnected(false);
                }}
                paramName="tab"
                variant="blue"
                actions={
                    <div className="flex items-center gap-2">
                        {statusBadges}
                    </div>
                }
            />

            <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-6 lg:p-10">
                <div className="max-w-7xl mx-auto space-y-4 sm:space-y-5 lg:space-y-6">
                    {/* Conflict Warning */}
                    {isConflict && (
                        <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 sm:gap-5 animate-in fade-in slide-in-from-top-4 duration-500">
                            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-500">
                                <AlertCircle className="w-6 h-6" />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-amber-500 font-bold text-base mb-1 uppercase tracking-tight">{t.remote.conflict.title}</h4>
                                <p className="text-amber-500/80 text-sm leading-relaxed font-medium">
                                    {t.remote.conflict.message.replace('{processName}', vncStatus?.processName || '')}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Connection Input Area */}
                    <div className="space-y-3">
                        {connectionMode === 'host' ? (
                            vncStatus?.enabled ? (
                                <>
                                    {/* Connection Options */}
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                        {isMacOS && (selectedIP || vncStatus?.primaryIP) && (
                                            <div className="relative">
                                                <Button
                                                    onClick={() => {
                                                        // 如果有多个选项（多IP或有外网配置），显示下拉菜单
                                                        if (localIPs.length > 1 || externalHost) {
                                                            setShowIPMenu(!showIPMenu);
                                                        } else {
                                            const host = selectedIP || (vncStatus?.primaryIP ?? '127.0.0.1');
                                                            handleNativeVncConnect(host, '5900');
                                                        }
                                                    }}
                                                    variant="primary"
                                                    className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2"
                                                >
                                                    <MonitorSpeaker className="w-4 h-4" />
                                                    <span>{t.remote.connection.open_with_screensharing}</span>
                                                    {(localIPs.length > 1 || externalHost) ? (
                                                        <ChevronDown className={`w-4 h-4 transition-transform ${showIPMenu ? 'rotate-180' : ''}`} />
                                                    ) : (
                                                        <span className="text-xs opacity-60 font-mono">({selectedIP || vncStatus?.primaryIP})</span>
                                                    )}
                                                </Button>
                                                {/* IP Selection Popover */}
                                                {showIPMenu && (localIPs.length > 1 || externalHost) && (
                                                    <>
                                                        <div 
                                                            className="fixed inset-0 z-40" 
                                                            onClick={() => setShowIPMenu(false)}
                                                        />
                                                        <div className="absolute left-0 top-full mt-2 z-50 min-w-[240px] py-2 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
                                                            {/* 内网选项 */}
                                                            <div className="px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                                                {t.remote.connection.select_ip || '选择网络接口'}
                                                            </div>
                                                            {localIPs.map((ip) => (
                                                                <button
                                                                    key={ip.device}
                                                                    onClick={() => {
                                                                        setSelectedIP(ip.address);
                                                                        setShowIPMenu(false);
                                                                        handleNativeVncConnect(ip.address, '5900');
                                                                    }}
                                                                    className="w-full px-3 py-2.5 text-left hover:bg-white/5 transition-colors flex items-center gap-3 group"
                                                                >
                                                                    <div className="w-2 h-2 rounded-full bg-green-500" />
                                                                    <div className="flex-1">
                                                                        <div className="text-sm font-mono text-white group-hover:text-blue-400 transition-colors">
                                                                            {ip.address}
                                                                        </div>
                                                                        <div className="text-xs text-gray-500">
                                                                            {ip.name}
                                                                        </div>
                                                                    </div>
                                                                </button>
                                                            ))}
                                                            {/* 外网选项 - 用分隔线区分 */}
                                                            {externalHost && (
                                                                <>
                                                                    <div className="my-2 border-t border-white/10" />
                                                                    <div className="px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                                                        {t.remote.connection.external_network || '外网'}
                                                                    </div>
                                                                    <button
                                                                        onClick={() => {
                                                                            setShowIPMenu(false);
                                                                            handleNativeVncConnect(externalHost, externalVncPort);
                                                                        }}
                                                                        className="w-full px-3 py-2.5 text-left hover:bg-white/5 transition-colors flex items-center gap-3 group"
                                                                    >
                                                                        <Globe className="w-4 h-4 text-blue-400" />
                                                                        <div className="flex-1">
                                                                            <div className="text-sm font-mono text-white group-hover:text-blue-400 transition-colors">
                                                                                {externalHost}:{externalVncPort}
                                                                            </div>
                                                                            <div className="text-xs text-gray-500">
                                                                                {t.remote.connection.external_hint || '通过外网连接'}
                                                                            </div>
                                                                        </div>
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        
                                        <Button
                                            onClick={() => setIsHostConnected(true)}
                                            variant="secondary"
                                            className="shrink-0 flex items-center gap-2 h-10 px-4"
                                        >
                                            <Globe className="w-4 h-4" />
                                            <span>{t.remote.connection.use_web_console}</span>
                                        </Button>
                                    </div>

                                </>
                            ) : null
                        ) : (
                            <>
                                <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-blue-500/50 transition-all shadow-inner px-1 shrink-0 min-w-[200px]">
                                    <input
                                        type="text"
                                        placeholder={externalHost ? `${t.remote.connection.ip_address} (或使用 ${externalHost})` : t.remote.connection.ip_address}
                                        value={customHost}
                                        onChange={(e) => {
                                            setCustomHost(e.target.value);
                                            setIsCustomConnected(false);
                                        }}
                                        onKeyDown={handleCustomConnectionEnter}
                                        className="px-3 sm:px-4 py-2.5 bg-transparent text-sm text-white focus:outline-none flex-1 min-w-0 font-mono placeholder:text-gray-600"
                                    />
                                    <div className="w-[1px] h-4 bg-white/10 mx-1" />
                                    <input
                                        type="text"
                                        placeholder="5900"
                                        value={customPort}
                                        onChange={(e) => {
                                            setCustomPort(e.target.value);
                                            setIsCustomConnected(false);
                                        }}
                                        onKeyDown={handleCustomConnectionEnter}
                                        className="px-3 sm:px-4 py-2.5 bg-transparent text-sm text-white focus:outline-none w-16 sm:w-20 font-mono placeholder:text-gray-600"
                                    />
                                </div>
                                <Button
                                    disabled={!isValidIP(customHost)}
                                    onClick={() => setIsCustomConnected(true)}
                                    variant="primary"
                                    className="shrink-0"
                                >
                                    {t.remote.connection.connect}
                                </Button>
                                {isMacOS && (customHost || externalHost) && (
                                    <Button
                                        onClick={() => {
                                            const host = customHost || externalHost;
                                            const port = customPort || (externalHost ? externalVncPort : '5900');
                                            if (host) {
                                                handleNativeVncConnect(host, port);
                                            }
                                        }}
                                        variant="secondary"
                                        className="shrink-0 flex items-center gap-2"
                                        disabled={!customHost && !externalHost}
                                    >
                                        <MonitorSpeaker className="w-4 h-4" />
                                        <span>{t.remote.connection.open_with_screensharing}</span>
                                        <span className="text-xs opacity-60 font-mono">
                                            ({customHost || externalHost}:{customPort || (externalHost ? externalVncPort : '5900')})
                                        </span>
                                    </Button>
                                )}
                            </>
                        )}
                    </div>

                    {/* External Host Hint */}
                    {connectionMode === 'external' && externalHost && !isCustomConnected && (
                        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                                <Globe className="w-4 h-4" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm text-blue-400 font-medium">
                                    {t.remote.connection.external_host_hint.replace('{host}', externalHost).replace('{port}', externalVncPort)}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Recent History - Only for External mode when not connected */}
                    {connectionMode === 'external' && !isCustomConnected && history.length > 0 && (
                        <div className="pt-1 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="flex items-center gap-3 mb-2 ml-1">
                                <History className="w-4 h-4 text-blue-500" />
                                <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t.remote.history.recent_connections}</h4>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                {history.map(item => (
                                    <div
                                        key={item.id}
                                        className="group relative flex items-center gap-3 px-4 py-2.5 bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-blue-500/30 rounded-xl cursor-pointer transition-all duration-300 active:scale-95"
                                        onClick={() => {
                                            setCustomHost(item.host);
                                            setCustomPort(String(item.port));
                                            setIsCustomConnected(true);
                                        }}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Monitor className="w-4 h-4 text-blue-400" />
                                            <span className="text-sm font-bold text-gray-200 group-hover:text-white font-mono">{item.host}:{item.port}</span>
                                            <span className="text-[10px] text-gray-600 font-bold uppercase tracking-wider ml-2">{formatTimeAgo(item.lastConnected)}</span>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeFromHistory(item.id);
                                            }}
                                            className="p-1.5 text-gray-700 hover:text-red-500 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all ml-2"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Console Viewport */}
                    <div className="relative rounded-2xl sm:rounded-3xl border border-white/5 bg-black/40 backdrop-blur-xl overflow-hidden min-h-[400px] sm:min-h-[500px] flex flex-col shadow-2xl">
                        {connectionMode === 'external' ? (
                            isCustomConnected ? (
                                <RemoteConsole
                                    isHost={true}
                                    title={`Remote: ${customHost || externalHost}:${customPort || externalVncPort}`}
                                    customHost={customHost || externalHost || undefined}
                                    customPort={parseInt(customPort || externalVncPort) || 5900}
                                    onClose={() => setIsCustomConnected(false)}
                                    onConnected={() => {
                                        const host = customHost || externalHost;
                                        const port = parseInt(customPort || externalVncPort) || 5900;
                                        if (host) {
                                            addToHistory(host, port);
                                        }
                                    }}
                                />
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                                    <div className="w-20 h-20 rounded-3xl bg-blue-500/10 flex items-center justify-center text-blue-500 mb-8 border border-blue-500/20 shadow-inner">
                                        <ExternalLink className="w-10 h-10" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-white mb-4 uppercase tracking-tight">{t.remote.prepare.title}</h2>
                                    <p className="text-gray-400 max-w-md mb-10 text-sm font-medium leading-relaxed">
                                        {t.remote.connection.external_description}
                                    </p>
                                </div>
                            )
                        ) : (
                            vncStatus?.enabled ? (
                                isHostConnected ? (
                                    <div className="flex-1 flex flex-col min-h-0">
                                        <RemoteConsole
                                            key="connected"
                                            isHost={true}
                                            title={`Host Mac ${selectedIP || vncStatus?.primaryIP ? `(${selectedIP || vncStatus?.primaryIP})` : ''}`}
                                            customHost={selectedIP || vncStatus?.primaryIP || undefined}
                                            customPort={5900}
                                            onConnected={() => {
                                                const host = selectedIP || vncStatus?.primaryIP;
                                                if (host) {
                                                    addToHistory(host, 5900);
                                                }
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                                        <div className="w-20 h-20 rounded-3xl bg-blue-500/10 flex items-center justify-center text-blue-500 mb-8 border border-blue-500/20 shadow-inner">
                                            <Monitor className="w-10 h-10" />
                                        </div>
                                        <h2 className="text-2xl font-bold text-white mb-4 uppercase tracking-tight">{t.remote.prepare.host_title || '准备连接本机'}</h2>
                                        <p className="text-gray-400 max-w-md mb-10 text-sm font-medium leading-relaxed">
                                            {t.remote.prepare.host_description || '输入 VNC 密码后点击连接按钮以访问本机桌面。'}
                                        </p>
                                    </div>
                                )
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                                    <div className="w-20 h-20 rounded-3xl bg-rose-500/10 flex items-center justify-center text-rose-500 mb-8 border border-rose-500/20 shadow-inner">
                                        <AlertCircle className="w-10 h-10" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-white mb-4 uppercase tracking-tight">{t.remote.error.not_enabled_title}</h2>
                                    <p className="text-gray-400 max-w-sm mb-12 text-sm font-medium leading-relaxed">
                                        {t.remote.error.not_enabled_desc}
                                    </p>
                                    <div className="flex flex-col sm:flex-row items-center gap-4">
                                        <Button
                                            onClick={() => window.open('x-apple.systempreferences:com.apple.preferences.sharing')}
                                            variant="secondary"
                                        >
                                            {t.remote.error.open_settings}
                                        </Button>
                                        <Button
                                            onClick={() => checkVncStatus()}
                                            variant="primary"
                                        >
                                            {t.remote.error.retry_check}
                                        </Button>
                                    </div>
                                </div>
                            )
                        )}
                    </div>

                    {/* Setup Instructions */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
                        {[
                            { step: 1, color: 'text-amber-400', title: t.remote.setup.step1_title, desc: t.remote.setup.step1_desc },
                            { step: 2, color: 'text-blue-400', title: t.remote.setup.step2_title, desc: t.remote.setup.step2_desc },
                            { step: 3, color: 'text-purple-400', title: t.remote.setup.step3_title, desc: t.remote.setup.step3_desc }
                        ].map((item) => (
                            <div key={item.step} className="p-6 sm:p-8 rounded-2xl sm:rounded-3xl bg-white/[0.03] border border-white/5 backdrop-blur-md group hover:bg-white/[0.06] transition-all">
                                <div className={`w-12 h-12 rounded-2xl bg-white/[0.05] flex items-center justify-center ${item.color} mb-6 font-black text-xl border border-white/5`}>
                                    {item.step}
                                </div>
                                <h3 className="text-white font-bold text-lg mb-3 tracking-tight uppercase">{item.title}</h3>
                                <p className="text-sm text-gray-500 font-medium leading-relaxed group-hover:text-gray-400 transition-colors">
                                    {item.desc}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </PageLayout>
    );
}
