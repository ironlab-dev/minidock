'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from "@/hooks/useTranslation";
import { useIPInfo } from "@/hooks/useIPInfo";
import { client } from '@/api/client';
import {
    Network,
    Shield,
    Plus,
    Trash2,
    Key,
    Globe,
    Server,
    Router,
    CheckCircle2,
    XCircle,
    AlertTriangle
} from 'lucide-react';

interface SSHKey {
    type: string;
    key: string;
    comment: string;
    raw: string;
}

interface ServiceInfo {
    id: string;
    stats: {
        external_ip?: string;
        ssh_enabled?: string;
    };
}

export const ConnectivitySettings: React.FC = () => {
    const { t } = useTranslation();
    const { ipInfo } = useIPInfo();
    const [keys, setKeys] = useState<SSHKey[]>([]);
    const [newKey, setNewKey] = useState('');
    const [externalIP, setExternalIP] = useState<string | null>(null);
    const [, setSshEnabled] = useState<boolean>(false);
    const [isAdding, setIsAdding] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Custom Config
    const [extHost, setExtHost] = useState('');
    const [sshExtPort, setSshExtPort] = useState('22');
    const [vncExtPort, setVncExtPort] = useState('5900');
    const [isSaving, setIsSaving] = useState(false);
    
    // Connectivity Check
    interface PortStatus {
        name: string;
        port: number;
        reachable: boolean | null; // null = 未检测, true = 可达, false = 不可达
        latency: number | null;
    }
    const [portStatuses, setPortStatuses] = useState<PortStatus[]>([]);
    const [isChecking, setIsChecking] = useState(false);
    
    // 更新端口状态列表，当端口号变化时重置检测状态
    useEffect(() => {
        setPortStatuses([
            { name: 'SSH', port: parseInt(sshExtPort) || 22, reachable: null, latency: null },
            { name: 'VNC', port: parseInt(vncExtPort) || 5900, reachable: null, latency: null }
        ]);
    }, [sshExtPort, vncExtPort]);

    // Fetch keys
    useEffect(() => {
        const fetchKeys = async () => {
            try {
                const data = await client.get<SSHKey[]>('/ssh/keys');
                setKeys(data);
            } catch (e) {
                console.error("Failed to fetch SSH keys", e);
            }
        };
        fetchKeys();
    }, [refreshTrigger]);

    // Fetch service info for IP and Status
    useEffect(() => {
        const fetchInfo = async () => {
            try {
                const data = await client.get<ServiceInfo & { status: string; stats: Record<string, string> }>('/services/ssh-manager');
                setExternalIP(data.stats.external_ip ?? null);
                setSshEnabled(data.status === 'running');

                if (data.stats.external_host !== undefined) setExtHost(data.stats.external_host);
                if (data.stats.external_ssh_port !== undefined) setSshExtPort(data.stats.external_ssh_port);
                if (data.stats.external_vnc_port !== undefined) setVncExtPort(data.stats.external_vnc_port);
            } catch (e) {
                console.error("Failed to fetch connectivity info", e);
            }
        };
        fetchInfo();
        const interval = setInterval(fetchInfo, 30000); // Polling every 30s as fallback to WS
        return () => clearInterval(interval);
    }, []);

    // Quick Hack: Fetch keys serves as connectivity check too.

    const handleAddKey = async () => {
        if (!newKey.trim()) return;
        try {
            await client.post('/ssh/keys', { key: newKey });
            setNewKey('');
            setIsAdding(false);
            setRefreshTrigger(p => p + 1);
        } catch (e) {
            console.error("Failed to add key", e);
        }
    };

    const handleDeleteKey = async (signature: string) => {
        if (!confirm('Delete this key?')) return;
        try {
            await client.delete(`/ssh/keys?signature=${encodeURIComponent(signature)}`);
            setRefreshTrigger(p => p + 1);
        } catch (e) {
            console.error("Failed to delete key", e);
        }
    };

    const handleSaveConfig = async () => {
        setIsSaving(true);
        try {
            const configs = [
                { key: 'EXTERNAL_HOST', value: extHost, category: 'system', isSecret: false },
                { key: 'EXTERNAL_SSH_PORT', value: sshExtPort, category: 'system', isSecret: false },
                { key: 'EXTERNAL_VNC_PORT', value: vncExtPort, category: 'system', isSecret: false }
            ];

            for (const cfg of configs) {
                await client.post('/settings', cfg);
            }
            alert(t.common.saved || 'Saved');
            // 保存成功后立即刷新数据
            const data = await client.get<{ stats: Record<string, string> }>('/services/ssh-manager');
            if (data.stats.external_host !== undefined) setExtHost(data.stats.external_host);
            if (data.stats.external_ssh_port !== undefined) setSshExtPort(data.stats.external_ssh_port);
            if (data.stats.external_vnc_port !== undefined) setVncExtPort(data.stats.external_vnc_port);
        } catch (e) {
            console.error("Failed to save config", e);
            alert(e instanceof Error ? e.message : '保存失败，请重试');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCheckConnectivity = async () => {
        if (!extHost.trim()) {
            alert(t.ssh.connectivity.external_domain_desc || '请先填写外部域名');
            return;
        }
        
        setIsChecking(true);
        try {
            const response = await client.post<{
                results: Array<{
                    name: string;
                    port: number;
                    reachable: boolean;
                    latency: number | null;
                }>;
            }>('/connectivity/check', {
                host: extHost,
                ports: [
                    { name: 'SSH', port: parseInt(sshExtPort) || 22 },
                    { name: 'VNC', port: parseInt(vncExtPort) || 5900 }
                ]
            });
            
            setPortStatuses(response.results.map(r => ({
                name: r.name,
                port: r.port,
                reachable: r.reachable,
                latency: r.latency
            })));
        } catch (e) {
            console.error("Failed to check connectivity", e);
            alert(e instanceof Error ? e.message : (t.common.error || '检测失败，请重试'));
        } finally {
            setIsChecking(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                        <Network className="w-6 h-6 text-blue-400" />
                        {t.ssh.connectivity.title}
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">{t.ssh.subtitle}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* External Access Status */}
                <div className="glass-card p-6 border border-white/5 rounded-2xl space-y-6 relative overflow-hidden group">
                    {/* Background Glow */}
                    <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/20 blur-[80px] rounded-full group-hover:bg-blue-500/30 transition-all duration-700" />

                    <h3 className="text-lg font-semibold text-white flex items-center gap-2 relative z-10">
                        <Globe className="w-5 h-5 text-emerald-400" />
                        {t.ssh.connectivity.external_access}
                    </h3>

                    <div className="space-y-4 relative z-10">
                        <div className="space-y-3">
                            {(() => {
                                const domesticIP = ipInfo?.publicIPDomestic;
                                const overseasIP = ipInfo?.publicIPOverseas;
                                const hasBoth = domesticIP && overseasIP && domesticIP !== overseasIP;
                                const displayIP = domesticIP || overseasIP || externalIP || ipInfo?.publicIP;
                                
                                if (hasBoth) {
                                    // Show both IPs when they differ
                                    return (
                                        <>
                                            <div className="flex items-center justify-between p-4 bg-white/[0.03] rounded-xl border border-white/5">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                                                        <Globe className="w-5 h-5" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                                                            {t.dashboard.public_ip_domestic || "国内 IP"}
                                                        </div>
                                                        <div className="text-white font-mono text-lg mt-0.5 flex items-center gap-2">
                                                            {domesticIP}
                                                            <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">{t.ssh.connectivity.active}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between p-4 bg-white/[0.03] rounded-xl border border-white/5">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
                                                        <Globe className="w-5 h-5" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                                                            {t.dashboard.public_ip_overseas || "国外 IP"}
                                                        </div>
                                                        <div className="text-white font-mono text-lg mt-0.5 flex items-center gap-2">
                                                            {overseasIP}
                                                            <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">{t.ssh.connectivity.active}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    );
                                } else {
                                    // Show single IP when they're the same or only one is available
                                    return (
                                        <div className="flex items-center justify-between p-4 bg-white/[0.03] rounded-xl border border-white/5">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                                                    <Globe className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">{t.ssh.connectivity.external_ip}</div>
                                                    <div className="text-white font-mono text-lg mt-0.5 flex items-center gap-2">
                                                        {displayIP || '---.---.---.---'}
                                                        <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">{t.ssh.connectivity.active}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }
                            })()}
                        </div>

                        {/* External Connectivity Status */}
                        {extHost && portStatuses.some(s => s.reachable !== null) && (
                            <div className="space-y-2 pt-2">
                                <div className="text-xs text-gray-500 font-bold uppercase tracking-wider ml-1">
                                    {t.ssh.connectivity.external_status}
                                </div>
                                {portStatuses.map((status) => (
                                    <div key={status.name} className="flex items-center justify-between p-3 bg-white/[0.03] rounded-xl border border-white/5">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${
                                                status.reachable === true ? 'bg-emerald-500/10 text-emerald-400' :
                                                status.reachable === false ? 'bg-red-500/10 text-red-400' :
                                                'bg-gray-500/10 text-gray-400'
                                            }`}>
                                                {status.reachable === true ? (
                                                    <CheckCircle2 className="w-4 h-4" />
                                                ) : status.reachable === false ? (
                                                    <XCircle className="w-4 h-4" />
                                                ) : (
                                                    <Server className="w-4 h-4" />
                                                )}
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-400 font-medium">
                                                    {status.name} ({status.port})
                                                </div>
                                                <div className="text-white text-sm mt-0.5 flex items-center gap-2">
                                                    {status.reachable === true ? (
                                                        <>
                                                            <span>{t.ssh.connectivity.reachable}</span>
                                                            {status.latency !== null && (
                                                                <span className="text-xs text-gray-500">({status.latency}ms)</span>
                                                            )}
                                                        </>
                                                    ) : status.reachable === false ? (
                                                        <span>{t.ssh.connectivity.unreachable}</span>
                                                    ) : (
                                                        <span className="text-gray-500">{t.ssh.connectivity.not_checked}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Custom Configuration Section */}
                        <div className="pt-2 space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider ml-1">
                                    {t.ssh.connectivity.external_domain}
                                </label>
                                <input
                                    type="text"
                                    value={extHost}
                                    onChange={e => setExtHost(e.target.value)}
                                    placeholder="nas.example.com"
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors font-mono"
                                />
                                <p className="text-[10px] text-gray-600 ml-1">{t.ssh.connectivity.external_domain_desc}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider ml-1">SSH</label>
                                    <input
                                        type="text"
                                        value={sshExtPort}
                                        onChange={e => setSshExtPort(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors font-mono"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider ml-1">VNC</label>
                                    <input
                                        type="text"
                                        value={vncExtPort}
                                        onChange={e => setVncExtPort(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors font-mono"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={handleSaveConfig}
                                    disabled={isSaving}
                                    className="py-2.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-widest border border-blue-500/20 transition-all active:scale-[0.98] disabled:opacity-50"
                                >
                                    {isSaving ? '...' : t.ssh.connectivity.save_connectivity}
                                </button>
                                <button
                                    onClick={handleCheckConnectivity}
                                    disabled={isChecking || !extHost.trim()}
                                    className="py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-widest border border-emerald-500/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isChecking ? (
                                        <>
                                            <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                                            <span>{t.ssh.connectivity.checking}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Network className="w-3 h-3" />
                                            <span>{t.ssh.connectivity.check_connectivity}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                            {portStatuses.some(s => s.reachable === false) && (
                                <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                                        <div className="text-xs text-amber-300">
                                            <p className="font-semibold mb-1">{t.ssh.connectivity.connectivity_warning}</p>
                                            <p className="text-amber-400/80">{t.ssh.connectivity.connectivity_warning_desc}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="pt-4 border-t border-white/5">
                        <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
                            <Router className="w-4 h-4 text-amber-400" />
                            {t.ssh.connectivity.port_forwarding}
                        </h4>
                        <p className="text-xs text-gray-500 leading-relaxed mb-4">
                            {t.ssh.connectivity.port_forwarding_desc}
                        </p>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-white/[0.02] rounded-lg border border-white/5 flex flex-col items-center justify-center text-center">
                                <span className="text-xs text-gray-500 font-mono mb-1">SSH</span>
                                <span className="text-lg font-bold text-white font-mono">{sshExtPort} <span className="text-gray-600">→</span> 22</span>
                            </div>
                            <div className="p-3 bg-white/[0.02] rounded-lg border border-white/5 flex flex-col items-center justify-center text-center">
                                <span className="text-xs text-gray-500 font-mono mb-1">VNC</span>
                                <span className="text-lg font-bold text-white font-mono">{vncExtPort}+ <span className="text-gray-600">→</span> 5900+</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* SSH Keys */}
                <div className="glass-card p-6 border border-white/5 rounded-2xl flex flex-col h-full relative overflow-hidden">
                    <div className="absolute -top-24 -left-24 w-48 h-48 bg-purple-500/20 blur-[80px] rounded-full pointer-events-none" />

                    <div className="flex items-center justify-between mb-6 relative z-10">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            <Key className="w-5 h-5 text-purple-400" />
                            {t.ssh.keys_title}
                        </h3>
                        <button
                            onClick={() => setIsAdding(!isAdding)}
                            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-all active:scale-95 border border-white/5 hover:border-white/10"
                        >
                            <Plus className={`w-5 h-5 transition-transform duration-300 ${isAdding ? 'rotate-45' : ''}`} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar relative z-10 space-y-3">
                        {isAdding && (
                            <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 mb-4 animate-in slide-in-from-top-2 duration-200">
                                <textarea
                                    className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-xs font-mono text-gray-300 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 resize-none h-24 mb-3"
                                    placeholder={t.ssh.key_content_placeholder}
                                    value={newKey}
                                    onChange={e => setNewKey(e.target.value)}
                                />
                                <div className="flex justify-end gap-2">
                                    <button
                                        onClick={() => setIsAdding(false)}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                                    >
                                        {t.common.cancel}
                                    </button>
                                    <button
                                        onClick={handleAddKey}
                                        disabled={!newKey.trim()}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500 hover:bg-blue-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {t.ssh.add_key}
                                    </button>
                                </div>
                            </div>
                        )}

                        {keys.length === 0 && !isAdding ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                                <Shield className="w-12 h-12 opacity-20 mb-3" />
                                <p className="text-sm">{t.ssh.no_keys}</p>
                            </div>
                        ) : (
                            keys.map((k, i) => (
                                <div key={i} className="group p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 hover:bg-white/[0.04] transition-all duration-200 flex items-start gap-3">
                                    <div className="p-2 bg-gray-800/50 rounded-lg text-gray-400 group-hover:text-purple-400 group-hover:bg-purple-500/10 transition-colors">
                                        <Key className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-gray-300 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">{k.type}</span>
                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleDeleteKey(k.key.substring(0, 20))}
                                                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-xs font-mono text-gray-500 mt-2 break-all line-clamp-2" title={k.key}>{k.key}</p>
                                        {k.comment && (
                                            <p className="text-[10px] text-gray-600 mt-1 italic">{k.comment}</p>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
