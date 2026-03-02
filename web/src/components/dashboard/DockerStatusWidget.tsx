import { ServiceInfo } from "@/types/service";
import { Container, Play, Square, MoreVertical, Terminal, RefreshCw, FileText, Info, FolderOpen, ChevronRight } from "lucide-react";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useServiceItems } from "@/hooks/useServiceItems";
import { useTranslation } from "@/hooks/useTranslation";
import { useConfirm } from "@/hooks/useConfirm";
import { useSettings } from "@/hooks/useSettings";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface DockerStatusWidgetProps {
    service?: ServiceInfo;
    onAction: (id: string, action: "start" | "stop" | "restart") => Promise<void>;
}

export function DockerStatusWidget({ service }: DockerStatusWidgetProps) {
    const { t } = useTranslation();
    const router = useRouter();
    const { confirm, ConfirmDialog: ConfirmDialogComponent } = useConfirm();
    const { items, refresh, performItemAction } = useServiceItems(service?.id || '');
    const { settings } = useSettings();
    const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
    const [menuOpen, setMenuOpen] = useState<Record<string, boolean>>({});
    const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const isRunning = service?.status === 'running';

    // Get Docker settings from SystemSetting API
    const globalCustomPort = useMemo(() => {
        return settings.find(s => s.key === 'DOCKER_GLOBAL_REVERSE_PROXY_PORT')?.value || '';
    }, [settings]);

    const customUrls = useMemo(() => {
        const setting = settings.find(s => s.key === 'DOCKER_CUSTOM_URLS');
        if (setting?.value) {
            try {
                return JSON.parse(setting.value) as Record<string, string>;
            } catch (e) {
                console.error('[DockerStatusWidget] Failed to parse custom URLs', e);
            }
        }
        return {} as Record<string, string>;
    }, [settings]);

    // Get container URL (similar to Docker page logic)
    const getContainerUrl = useCallback((container: { id: string; metadata?: { traefik_host?: string } }): { url: string; type: 'custom' | 'traefik' | 'port' } | null => {
        if (customUrls[container.id]) {
            return { url: customUrls[container.id], type: 'custom' };
        }
        if (container.metadata?.traefik_host) {
            const host = container.metadata.traefik_host;
            let url = `https://${host}`;
            if (globalCustomPort && !host.includes(':')) {
                url += `:${globalCustomPort}`;
            }
            return { url, type: 'traefik' };
        }
        return null;
    }, [customUrls, globalCustomPort]);

    const handleAction = async (containerId: string, action: string, containerName: string) => {
        setActionLoading(prev => ({ ...prev, [containerId]: true }));
        try {
            const result = await performItemAction(containerId, action);
            if (!result.success) {
                console.error(`Failed to ${action} container ${containerName}:`, result.error);
            }
            await refresh();
        } catch (err) {
            console.error(`Error performing action on container ${containerName}:`, err);
        } finally {
            setActionLoading(prev => ({ ...prev, [containerId]: false }));
        }
    };

    // 端口解析函数（复用 Docker 页面的逻辑）
    const parsePorts = (ports: string): Array<{ label: string; value: string; full: string }> => {
        if (!ports) return [];

        return ports.split(',').filter(p => p.trim()).map(p => {
            const trimmed = p.trim();

            // Check if format contains '->' (port mapping from docker ps)
            if (trimmed.includes('->')) {
                const parts = trimmed.split('->');
                const external = parts[0].trim();

                // Extract port number from external part (e.g., "0.0.0.0:8080" or "8080")
                let portNum: string | undefined;
                if (external.includes(':')) {
                    portNum = external.split(':').pop();
                } else {
                    portNum = external;
                }

                if (portNum) {
                    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
                    return {
                        label: portNum,
                        value: `http://${hostname}:${portNum}`,
                        full: trimmed
                    };
                }
            } else if (trimmed.includes(':') && !trimmed.includes('->')) {
                // For not_started services, ports might be in format "8080:80"
                const parts = trimmed.split(':');
                const hostPort = parts[0].trim();
                if (hostPort && /^\d+$/.test(hostPort)) {
                    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
                    return {
                        label: hostPort,
                        value: `http://${hostname}:${hostPort}`,
                        full: trimmed
                    };
                }
            }

            return null;
        }).filter((p): p is { label: string; value: string; full: string } => p !== null);
    };

    // 关闭菜单
    const closeMenu = (containerId: string) => {
        setMenuOpen(prev => ({ ...prev, [containerId]: false }));
    };

    // 切换菜单显示
    const toggleMenu = (containerId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setMenuOpen(prev => ({
            ...prev,
            [containerId]: !prev[containerId]
        }));
    };

    // 点击外部关闭菜单
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            Object.keys(menuOpen).forEach(containerId => {
                if (menuOpen[containerId] && menuRefs.current[containerId]) {
                    if (!menuRefs.current[containerId]?.contains(event.target as Node)) {
                        closeMenu(containerId);
                    }
                }
            });
        };

        if (Object.values(menuOpen).some(open => open)) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [menuOpen]);

    // 处理菜单操作
    const handleMenuAction = async (containerId: string, action: string, containerName: string) => {
        closeMenu(containerId);

        if (action === 'view_logs') {
            // 跳转到 Docker 页面的 logs 标签，容器会在页面加载后自动选择
            router.push(`/docker?container=${containerId}`);
            // 注意：实际切换到 logs 标签需要用户在页面上操作，或者可以通过 URL 参数控制
            // 这里先跳转到容器详情，用户可以手动切换到 logs 标签
        } else if (action === 'view_details') {
            router.push(`/docker?container=${containerId}`);
        } else if (action === 'stop' || action === 'restart') {
            // 对于停止和重启操作，需要二次确认
            const actionText = action === 'stop' ? t.common.stop : t.common.restart;
            const confirmed = await confirm({
                title: actionText,
                message: `确定要${actionText}容器 "${containerName}" 吗？`,
                confirmText: actionText,
                cancelText: t.common.cancel,
                variant: 'warning'
            });
            if (confirmed) {
                await handleAction(containerId, action, containerName);
            }
        } else {
            await handleAction(containerId, action, containerName);
        }
    };

    useEffect(() => {
        if (isRunning) {
            refresh();
        }
    }, [isRunning, refresh]);

    const runningContainers = items.filter(item => item.status?.toLowerCase() === 'running');

    // Limit displayed containers for dashboard overview
    const MAX_DISPLAYED = 6;
    const displayedContainers = useMemo(() => items.slice(0, MAX_DISPLAYED), [items]);
    const hasMoreContainers = items.length > MAX_DISPLAYED;

    if (!service) return null;

    return (
        <div className="glass-card rounded-[32px] p-8 hover:border-white/10 transition-all duration-300">
            <div className="flex items-center justify-between mb-8">
                <Link
                    href="/docker"
                    className="flex items-center gap-4 cursor-pointer group transition-all duration-200 active:scale-[0.98]"
                    aria-label="跳转到Docker页面"
                >
                    <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/10 group-hover:bg-blue-500/15 transition-all">
                        <Container className="w-5 h-5 text-blue-500" strokeWidth={2} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white tracking-tight group-hover:text-blue-400 transition-colors">Docker Engine</h3>
                        <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-[0.1em] mt-1.5">
                            {items.length} {t.dashboard.metrics.containers_total} • {runningContainers.length} {t.dashboard.metrics.containers_running}
                        </p>
                    </div>
                </Link>

                <button className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all duration-500 ${isRunning
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 glow-emerald'
                    : 'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}>
                    {isRunning ? t.common.running : t.common.stopped}
                </button>
            </div>


            <div className="flex flex-col gap-4">
                {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-600 bg-white/[0.01] rounded-3xl border border-dashed border-white/5">
                        <Terminal className="w-10 h-10 mb-4 opacity-10" />
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-500">{t.docker.no_containers}</span>
                    </div>
                ) : (
                    <>
                        {displayedContainers.map((container, idx) => {
                        const isContRunning = container.status?.toLowerCase() === 'running';
                        const portsStr = container.metadata?.ports || "";
                        const portList = parsePorts(portsStr);
                        const containerUrl = getContainerUrl(container);
                        const isMenuOpen = menuOpen[container.id] || false;

                        return (
                            <div key={container.id}
                                className="group flex items-center justify-between p-5 bg-white/[0.01] hover:bg-white/[0.03] rounded-2xl border border-white/5 hover:border-white/10 transition-all duration-300 relative"
                                style={{ animationDelay: `${idx * 50}ms` }}>
                                <Link
                                    href={`/docker?container=${container.id}`}
                                    className="flex items-center gap-5 flex-1 min-w-0 cursor-pointer transition-all duration-200 active:scale-[0.98]"
                                    aria-label={`查看容器 ${container.name} 详情`}
                                >
                                    {/* Status Indicator */}
                                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all duration-500 ${isContRunning ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />

                                    <div className="min-w-0 flex-1">
                                        <div className="mb-1.5">
                                            <span className="text-sm font-black text-white tracking-tight">{container.name}</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest truncate max-w-[150px]">
                                                {container.metadata?.image?.split('/').pop() || 'Unknown'}
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                                    {isContRunning ? (
                                        <>
                                            {/* Show container URL (custom or Traefik) if available */}
                                            {containerUrl && (
                                                <a
                                                    href={containerUrl.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="px-2 py-0.5 bg-purple-500/10 text-[9px] text-purple-400 font-black rounded-full border border-purple-500/20 uppercase tracking-widest hover:bg-purple-500 hover:text-white transition-all cursor-pointer whitespace-nowrap"
                                                    title={containerUrl.type === 'custom' ? '自定义链接' : 'Traefik 域名'}
                                                >
                                                    {containerUrl.type === 'custom' ? '🔗' : '🌐'}
                                                </a>
                                            )}
                                            {/* Show port links */}
                                            {portList.length > 0 && (
                                                <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                                                    {portList.map((port, portIdx) => (
                                                        <a
                                                            key={portIdx}
                                                            href={port.value}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="px-2 py-0.5 bg-blue-500/10 text-[9px] text-blue-400 font-black rounded-full border border-blue-500/20 uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all cursor-pointer whitespace-nowrap"
                                                        >
                                                            :{port.label}
                                                        </a>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="relative" ref={(el) => { menuRefs.current[container.id] = el; }}>
                                                <button
                                                    className="p-2 sm:p-2.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-xl transition-all active:scale-90"
                                                    onClick={(e) => toggleMenu(container.id, e)}
                                                    aria-label={t.docker.quick_actions?.menu || "更多操作"}
                                                >
                                                    <MoreVertical className="w-4 h-4" />
                                                </button>
                                                {isMenuOpen && (
                                                    <div className="absolute right-0 sm:right-0 top-full mt-2 z-50 min-w-[160px] max-w-[calc(100vw-2rem)] bg-[#1A1A1A] border border-white/20 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                                        <button
                                                            onClick={() => handleMenuAction(container.id, 'restart', container.name)}
                                                            disabled={actionLoading[container.id]}
                                                            className="w-full px-4 py-2.5 text-left text-xs text-white hover:text-blue-400 hover:bg-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            {actionLoading[container.id] ? (
                                                                <div className="w-3 h-3 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                                                            ) : (
                                                                <RefreshCw className="w-3.5 h-3.5" />
                                                            )}
                                                            <span>{t.docker.quick_actions?.restart || t.common.restart}</span>
                                                        </button>
                                                        <button
                                                            onClick={() => handleMenuAction(container.id, 'stop', container.name)}
                                                            disabled={actionLoading[container.id]}
                                                            className="w-full px-4 py-2.5 text-left text-xs text-white hover:text-white hover:bg-white/10 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            {actionLoading[container.id] ? (
                                                                <div className="w-3 h-3 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
                                                            ) : (
                                                                <Square className="w-3.5 h-3.5 fill-current" />
                                                            )}
                                                            <span>{t.docker.quick_actions?.stop || t.common.stop}</span>
                                                        </button>
                                                        <div className="h-px bg-white/10 my-1" />
                                                        <button
                                                            onClick={() => handleMenuAction(container.id, 'view_logs', container.name)}
                                                            className="w-full px-4 py-2.5 text-left text-xs text-white hover:text-purple-400 hover:bg-purple-500/20 transition-all flex items-center gap-2"
                                                        >
                                                            <FileText className="w-3.5 h-3.5" />
                                                            <span>{t.docker.quick_actions?.view_logs || t.docker.view_logs}</span>
                                                        </button>
                                                        <button
                                                            onClick={() => handleMenuAction(container.id, 'view_details', container.name)}
                                                            className="w-full px-4 py-2.5 text-left text-xs text-white hover:text-blue-400 hover:bg-blue-500/20 transition-all flex items-center gap-2"
                                                        >
                                                            <Info className="w-3.5 h-3.5" />
                                                            <span>{t.docker.quick_actions?.view_details || t.common.details}</span>
                                                        </button>
                                                        <Link
                                                            href={`/files?tab=files&path=/Users/shared/minidock/docker/${container.name}`}
                                                            className="w-full px-4 py-2.5 text-left text-xs text-white hover:text-emerald-400 hover:bg-emerald-500/20 transition-all flex items-center gap-2"
                                                        >
                                                            <FolderOpen className="w-3.5 h-3.5" />
                                                            <span>{t.docker.table.manage_files}</span>
                                                        </Link>
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <button
                                            className="p-2.5 text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-all active:scale-90"
                                            onClick={() => handleAction(container.id, 'start', container.name)}
                                            disabled={actionLoading[container.id]}
                                        >
                                            {actionLoading[container.id] ? (
                                                <div className="w-4 h-4 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
                                            ) : (
                                                <Play className="w-4 h-4 fill-current" />
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                        })}
                        {hasMoreContainers && (
                            <Link
                                href="/docker"
                                className="mt-2 pt-4 border-t border-white/5 text-center"
                            >
                                <span className="text-xs text-gray-400 hover:text-white transition-colors inline-flex items-center gap-1.5">
                                    {t.docker.view_all || "查看全部"} ({items.length})
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </span>
                            </Link>
                        )}
                    </>
                )}
            </div>

            {/* Global Confirm Dialog for stop/restart actions */}
            <ConfirmDialogComponent />
        </div>
    );
}
