import { ServiceInfo } from "@/types/service";
import { useEnvironment } from "@/hooks/useEnvironment";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useTranslation } from "@/hooks/useTranslation";
import { useIPInfo } from "@/hooks/useIPInfo";
import { CheckCircle2, Server, Network, Globe, RefreshCw } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { formatRefreshTime } from "@/lib/cronUtils";

interface SystemHealthWidgetProps {
    systemService?: ServiceInfo;
}

function formatUptime(seconds: number | string | undefined, t: { common: Record<string, string>; dashboard: Record<string, string>; [key: string]: Record<string, string> }): { main: string, sub: string } {
    if (!seconds) return { main: t.common.unknown || "未知", sub: "" };

    const sec = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
    if (isNaN(sec) || sec < 0) return { main: t.common.unknown || "未知", sub: "" };

    const days = Math.floor(sec / 86400);
    const hours = Math.floor((sec % 86400) / 3600);

    return {
        main: `${days} ${days !== 1 ? t.dashboard.days : t.dashboard.day}`,
        sub: `${hours} ${hours !== 1 ? t.dashboard.hours : t.dashboard.hour}`
    };
}

export function SystemHealthWidget({ systemService }: SystemHealthWidgetProps) {
    const { statuses, refresh } = useEnvironment();
    const { metrics } = useWebSocket();
    const { t } = useTranslation();
    const { ipInfo, loading: ipLoading, isRefreshing: ipRefreshing, lastRefreshTime: ipLastRefreshTime, refresh: refreshIP } = useIPInfo();
    const [currentTime, setCurrentTime] = useState(Date.now());

    useEffect(() => {
        refresh();
    }, []);

    // 定期更新当前时间，用于刷新时间显示
    useEffect(() => {
        if (!ipLastRefreshTime) return;
        
        const diffMs = Date.now() - ipLastRefreshTime.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        
        // 如果距离上次刷新小于1分钟，每秒更新一次
        // 如果大于1分钟但小于1小时，每10秒更新一次
        // 否则每30秒更新一次
        const interval = diffMins < 1 ? 1000 : diffMins < 60 ? 10000 : 30000;
        
        const timer = setInterval(() => {
            setCurrentTime(Date.now());
        }, interval);
        
        return () => clearInterval(timer);
    }, [ipLastRefreshTime]);

    // 格式化刷新时间显示
    const ipRefreshTimeText = useMemo(() => {
        if (ipRefreshing) {
            return t.common.refreshing;
        }
        if (!ipLastRefreshTime) {
            return '';
        }
        const formatted = formatRefreshTime(ipLastRefreshTime, {
            just_now: t.common.just_now,
            seconds_ago: t.common.seconds_ago,
            minutes_ago: t.common.minutes_ago,
            hours_ago: t.common.hours_ago,
        });
        return formatted ? `${t.common.last_updated}：${formatted}` : '';
    }, [ipLastRefreshTime, ipRefreshing, currentTime, t]);

    const getIsInstalled = (s: { isInstalled?: boolean; is_installed?: boolean }) => !!(s.isInstalled || s.is_installed);
    // Prefer WebSocket uptime (real-time) over API uptime (may be stale)
    const uptime = metrics.uptime > 0 ? metrics.uptime : systemService?.stats?.uptime;
    const uptimeData = formatUptime(uptime, t);
    const cpuModel = metrics.cpuModel || "Apple Silicon";
    const memTotalGB = metrics.memTotal ? metrics.memTotal / (1024 * 1024 * 1024) : 16;
    const installedServices = statuses.filter(getIsInstalled).length;

    return (
        <div className="flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-2">
                <Server className="w-5 h-5 text-blue-500" strokeWidth={2} />
                <h2 className="text-xl font-bold text-white tracking-tight">{t.dashboard.system_health}</h2>
            </div>

            {/* 4 Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* Uptime Card */}
                <div className="glass-card rounded-[24px] p-7 flex flex-col justify-between min-h-[170px] relative overflow-hidden group hover:border-white/20 transition-all duration-300">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.15em]">{t.dashboard.uptime.toUpperCase()}</span>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 glow-emerald" />
                    </div>

                    <div className="flex-1 flex flex-col justify-center">
                        <div className="flex items-baseline gap-2 mb-1">
                            <span className="text-3xl font-bold text-white tracking-tight leading-none">{uptimeData.main}</span>
                            <span className="text-sm font-semibold text-gray-500 leading-none">{uptimeData.sub}</span>
                        </div>
                    </div>
                    <div className="mt-5 w-full h-[4px] bg-white/[0.04] rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 w-full shadow-[0_0_12px_rgba(16,185,129,0.6)]" />
                    </div>
                </div>

                {/* Services Card */}
                <div className="glass-card rounded-[24px] p-7 flex flex-col justify-between min-h-[170px] group hover:border-white/20 transition-all duration-300">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.15em]">{t.dashboard.services_label?.toUpperCase() || "服务"}</span>
                        <div className="w-4 h-4 rounded-full border border-purple-500/30 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-purple-500 glow-purple" />
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col justify-center">
                        <div className="flex items-baseline gap-2 mb-1">
                            <span className="text-3xl font-bold text-white tracking-tight leading-none">{installedServices}</span>
                            <span className="text-sm font-semibold text-gray-500 leading-none">{t.dashboard.running}</span>
                        </div>
                    </div>
                    <div className="mt-5 flex gap-1.5">
                        {/* Segmented progress bar for services */}
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div
                                key={i}
                                className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${i < Math.min(installedServices, 5)
                                    ? 'bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]'
                                    : 'bg-white/[0.05]'}`}
                            />
                        ))}
                    </div>
                </div>

                {/* CPU Load Card */}
                <div className="glass-card rounded-[24px] p-7 flex flex-col justify-between min-h-[170px] group hover:border-white/20 transition-all duration-300">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em]">{t.dashboard.cpu_load.toUpperCase()}</span>
                        <span className="text-xs text-blue-400 font-mono font-bold">{metrics.cpu.toFixed(0)}%</span>
                    </div>
                    <div className="mb-3">
                        <span className="text-base font-bold text-white/90 block truncate tracking-tight uppercase leading-none" title={cpuModel}>{cpuModel}</span>
                    </div>

                    <div className="mt-auto flex items-end gap-[3px] h-10">
                        {/* 24-segment CPU load bars */}
                        {Array.from({ length: 24 }).map((_, i) => {
                            const h = 0.3 + Math.random() * 0.6;
                            const reactiveHeight = Math.min(100, (metrics.cpu * (0.5 + Math.random() * 0.5)) + (h * 15));
                            const isActive = (i / 24) * 100 < metrics.cpu;
                            return (
                                <div key={i} className="flex-1 bg-white/[0.02] rounded-t-[1px] relative overflow-hidden h-full">
                                    <div
                                        className={`absolute bottom-0 w-full transition-all duration-700 ease-out ${isActive ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.4)]' : 'bg-blue-500/20'}`}
                                        style={{ height: `${reactiveHeight}%` }}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Memory Card */}
                <div className="glass-card rounded-[24px] p-7 flex flex-col justify-between min-h-[170px] group hover:border-white/20 transition-all duration-300">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em]">{t.dashboard.memory.toUpperCase()}</span>
                        <span className="text-xs text-purple-400 font-mono font-bold">{metrics.mem.toFixed(0)}%</span>
                    </div>

                    <div className="flex-1 flex flex-col justify-center">
                        <div className="flex items-baseline gap-1.5 mb-1">
                            <span className="text-2xl font-bold text-white tracking-tight leading-none">{(metrics.mem * memTotalGB / 100).toFixed(1)} GB</span>
                            <span className="text-[10px] font-bold text-gray-600 tracking-tighter uppercase leading-none">/ {memTotalGB.toFixed(0)} GB</span>
                        </div>
                    </div>
                    <div className="mt-5 w-full h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-blue-500 to-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.6)]"
                            style={{ width: `${metrics.mem}%` }}
                        />
                    </div>
                </div>

            </div>

            {/* IP Address Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Local IP Card */}
                <div className="glass-card rounded-[24px] p-7 flex flex-col justify-between min-h-[140px] relative overflow-hidden group hover:border-white/20 transition-all duration-300">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.15em]">{t.dashboard.local_ip?.toUpperCase() || "局域网 IP"}</span>
                        <div className="p-1.5 bg-blue-500/10 rounded-lg">
                            <Network className="w-4 h-4 text-blue-400" />
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col justify-center gap-3">
                        {ipLoading ? (
                            <div className="flex items-baseline gap-2 mb-1">
                                <span className="text-lg text-gray-500 font-mono animate-pulse">{t.dashboard.ip_loading || "获取中..."}</span>
                            </div>
                        ) : ipInfo?.localIPs && ipInfo.localIPs.length > 0 ? (
                            <div className="space-y-2 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                                {ipInfo.localIPs.map((ip, idx) => (
                                    <div key={idx} className="flex flex-col">
                                        <div className="flex items-baseline justify-between mb-0.5">
                                            <span className="text-xl font-bold text-white font-mono tracking-tight leading-none">
                                                {ip.address}
                                            </span>
                                            <span className="text-[9px] font-bold text-blue-400/80 uppercase tracking-wider bg-blue-500/5 px-1.5 py-0.5 rounded border border-blue-500/10">
                                                {ip.name}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex items-baseline gap-2 mb-1">
                                <span className="text-2xl font-bold text-white font-mono tracking-tight leading-none">
                                    {ipInfo?.localIP || t.dashboard.ip_unavailable || "不可用"}
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="mt-5 w-full h-[4px] bg-white/[0.04] rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 w-full shadow-[0_0_12px_rgba(59,130,246,0.6)]" />
                    </div>
                </div>

                {/* Public IP Card */}
                <div className="glass-card rounded-[24px] p-7 flex flex-col justify-between min-h-[140px] relative overflow-hidden group hover:border-white/20 transition-all duration-300">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.15em]">{t.dashboard.public_ip?.toUpperCase() || "外网 IP"}</span>
                        <div className="flex items-center gap-2">
                            {ipRefreshTimeText && (
                                <span className="text-[9px] text-gray-500 font-medium">
                                    {ipRefreshTimeText}
                                </span>
                            )}
                            <button
                                onClick={() => refreshIP(false)}
                                disabled={ipRefreshing || ipLoading}
                                className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                                title={t.common.refresh}
                            >
                                <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${ipRefreshing ? 'animate-spin' : ''}`} />
                            </button>
                            <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                                <Globe className="w-4 h-4 text-emerald-400" />
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col justify-center gap-2">
                        {ipLoading ? (
                            <div className="flex items-baseline gap-2 mb-1">
                                <span className="text-lg text-gray-500 font-mono">{t.dashboard.ip_loading || "获取中..."}</span>
                            </div>
                        ) : (() => {
                            const domesticIP = ipInfo?.publicIPDomestic;
                            const overseasIP = ipInfo?.publicIPOverseas;
                            const hasBoth = domesticIP && overseasIP && domesticIP !== overseasIP;
                            
                            if (hasBoth) {
                                // Show both IPs when they differ
                                return (
                                    <div className="space-y-2.5">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">
                                                {t.dashboard.public_ip_domestic || "国内 IP"}
                                            </span>
                                            <span className="text-xl font-bold text-white font-mono tracking-tight leading-none">
                                                {domesticIP}
                                            </span>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">
                                                {t.dashboard.public_ip_overseas || "国外 IP"}
                                            </span>
                                            <span className="text-xl font-bold text-white font-mono tracking-tight leading-none">
                                                {overseasIP}
                                            </span>
                                        </div>
                                    </div>
                                );
                            } else {
                                // Show single IP when they're the same or only one is available
                                const displayIP = domesticIP || overseasIP || ipInfo?.publicIP;
                                return (
                                    <div className="flex items-baseline gap-2 mb-1">
                                        <span className="text-2xl font-bold text-white font-mono tracking-tight leading-none">
                                            {displayIP || t.dashboard.ip_unavailable || "不可用"}
                                        </span>
                                    </div>
                                );
                            }
                        })()}
                    </div>
                    <div className="mt-5 w-full h-[4px] bg-white/[0.04] rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 w-full shadow-[0_0_12px_rgba(16,185,129,0.6)]" />
                    </div>
                </div>
            </div>

            {/* Status Badges Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                {statuses.slice(0, 4).map((status) => (
                    <div key={status.name} className="flex items-center justify-between px-6 py-4 glass-card rounded-[20px] group hover:border-emerald-500/10 transition-all duration-300">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest leading-none">{status.name}</span>
                        <CheckCircle2 className={`w-3.5 h-3.5 transition-all duration-500 ${getIsInstalled(status) ? 'text-emerald-500 glow-emerald opacity-100' : 'text-white/5 opacity-20'}`} />
                    </div>
                ))}
            </div>
        </div>
    );
}
