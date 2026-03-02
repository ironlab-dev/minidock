"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useServices } from "@/hooks/useServices";
import { useServiceItems, ServiceItem } from "@/hooks/useServiceItems";
import { useDockerManage } from "@/hooks/useDockerManage";
import { useTranslation } from "@/hooks/useTranslation";
import { useSettings } from "@/hooks/useSettings";
import DockerManage from "@/components/DockerManage";
import ContainerDetails from "@/components/ContainerDetails";
import { PageLayout, Button, Card, Tabs, Skeleton } from "@/components/ui";
import { Info, AlertTriangle, RefreshCw, Square, Play, Edit, FileText, Trash2, Link2, Star, ExternalLink, LayoutGrid, List } from 'lucide-react';
import { DockerLogViewer } from '@/components/DockerLogViewer';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useConfirm } from '@/hooks/useConfirm';
import DockerCommunity from "@/components/DockerCommunity";
import { CommunityApp } from "@/lib/communityApps";
import { useLayoutPreference, LayoutMode } from "@/hooks/useLayoutPreference";

export default function DockerPage() {
    const searchParams = useSearchParams();
    const { services, performAction } = useServices();
    const { saveFile, fetchContainerLogs, performAction: performDockerAction } = useDockerManage();
    const service = useMemo(() => services.find(s => s.id === "docker-engine"), [services]);
    const { t } = useTranslation();
    const { confirm, ConfirmDialog: ConfirmDialogComponent } = useConfirm();
    const { settings, saveSetting } = useSettings();
    const [view, setView] = useState<"running" | "editor" | "logs" | "community">("running");
    const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
    const [initialServiceName, setInitialServiceName] = useState<string | undefined>(undefined);
    const [hasMounted, setHasMounted] = useState(false);
    const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
    const [statusMessage, setStatusMessage] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);
    const [highlightAppId, setHighlightAppId] = useState<string | undefined>(undefined);
    const urlParamProcessed = useRef(false);

    // Layout preference: default to 'list' on desktop (xl+), 'grid' on mobile/tablet
    const getDefaultLayout = (): LayoutMode => {
        if (typeof window === 'undefined') return 'list';
        return window.innerWidth >= 1280 ? 'list' : 'grid';
    };
    const [layoutMode, setLayoutMode] = useLayoutPreference('docker', getDefaultLayout);

    const displayStatus = useCallback((text: string, type: 'success' | 'error' | 'info' = 'info') => {
        setStatusMessage({ text, type });
        setTimeout(() => setStatusMessage(null), 5000);
    }, []);

    const { items, loading, performItemAction, getItemDetails, refresh } = useServiceItems("docker-engine");

    // 健康摘要统计
    const healthSummary = useMemo(() => {
        const running = items.filter(i => i.status === 'running').length;
        const stopped = items.filter(i => i.status === 'stopped' || i.status === 'exited').length;
        const notStarted = items.filter(i => i.status === 'not_started').length;
        const unhealthy = items.filter(i => i.metadata?.health_status === 'unhealthy').length;
        const healthy = items.filter(i => i.metadata?.health_status === 'healthy').length;
        const starting = items.filter(i => i.metadata?.health_status === 'starting').length;
        
        // 计算总 CPU 和内存使用
        let totalCpu = 0;
        let totalMemMB = 0;
        items.forEach(item => {
            if (item.status === 'running') {
                const cpuStr = item.metadata?.cpu_perc || '0%';
                totalCpu += parseFloat(cpuStr.replace('%', '')) || 0;
                
                const memUsage = item.metadata?.mem_usage || '';
                if (memUsage.includes('/')) {
                    const used = memUsage.split('/')[0].trim();
                    if (used.includes('GiB')) {
                        totalMemMB += parseFloat(used.replace('GiB', '').trim()) * 1024;
                    } else if (used.includes('MiB')) {
                        totalMemMB += parseFloat(used.replace('MiB', '').trim());
                    } else if (used.includes('KiB')) {
                        totalMemMB += parseFloat(used.replace('KiB', '').trim()) / 1024;
                    }
                }
            }
        });
        
        return {
            running,
            stopped,
            notStarted,
            unhealthy,
            healthy,
            starting,
            total: items.length,
            totalCpu: totalCpu.toFixed(1),
            totalMemMB: totalMemMB.toFixed(0),
        };
    }, [items]);

    // Logs View State
    const [viewLogsContainer, setViewLogsContainer] = useState<{ id: string, name: string } | null>(null);
    const [containerLogs, setContainerLogs] = useState("");
    const [autoRefreshContainerLogs, setAutoRefreshContainerLogs] = useState(true);

    // New Service Creation State
    const [showCreate, setShowCreate] = useState(false);
    const [newServiceName, setNewServiceName] = useState('');
    const [newServiceImage, setNewServiceImage] = useState('');
    const [newServicePort, setNewServicePort] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Delete Container State
    const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; containerId: string | null; containerName: string | null }>({
        isOpen: false,
        containerId: null,
        containerName: null
    });
    const [isDeleting, setIsDeleting] = useState(false);

    // Custom URL State
    const [customUrls, setCustomUrls] = useState<Record<string, string>>({});
    const [globalCustomPort, setGlobalCustomPort] = useState<string>('');
    const [editUrlModal, setEditUrlModal] = useState<{ isOpen: boolean; containerId: string; containerName: string; currentUrl: string } | null>(null);
    const [editUrlInput, setEditUrlInput] = useState('');
    const [migrationDone, setMigrationDone] = useState(false);

    // Load custom URLs and global settings from SystemSetting API
    useEffect(() => {
        // Get settings from API
        const globalPortSetting = settings.find(s => s.key === 'DOCKER_GLOBAL_REVERSE_PROXY_PORT');
        const customUrlsSetting = settings.find(s => s.key === 'DOCKER_CUSTOM_URLS');

        if (globalPortSetting) {
            setGlobalCustomPort(globalPortSetting.value);
        }
        if (customUrlsSetting) {
            try {
                setCustomUrls(JSON.parse(customUrlsSetting.value || '{}'));
            } catch (e) {
                console.error('[DockerPage] Failed to parse custom URLs from settings', e);
            }
        }

        // Migration: migrate localStorage data to server if not already migrated
        if (!migrationDone && !globalPortSetting && !customUrlsSetting) {
            const savedUrls = localStorage.getItem('minidock_custom_urls');
            const savedPort = localStorage.getItem('minidock_global_custom_port');

            if (savedPort || savedUrls) {
                (async () => {
                    try {
                        if (savedPort) {
                            await saveSetting({
                                key: 'DOCKER_GLOBAL_REVERSE_PROXY_PORT',
                                value: savedPort,
                                category: 'docker',
                                isSecret: false
                            });
                            setGlobalCustomPort(savedPort);
                        }
                        if (savedUrls) {
                            try {
                                const parsedUrls = JSON.parse(savedUrls);
                                await saveSetting({
                                    key: 'DOCKER_CUSTOM_URLS',
                                    value: savedUrls,
                                    category: 'docker',
                                    isSecret: false
                                });
                                setCustomUrls(parsedUrls);
                            } catch (e) {
                                console.error('[DockerPage] Failed to parse saved URLs during migration', e);
                            }
                        }
                        // Clear localStorage after successful migration
                        localStorage.removeItem('minidock_global_custom_port');
                        localStorage.removeItem('minidock_custom_urls');
                        setMigrationDone(true);
                    } catch (err) {
                        console.error('[DockerPage] Failed to migrate localStorage settings', err);
                    }
                })();
            } else {
                setMigrationDone(true);
            }
        }
    }, [settings, migrationDone, saveSetting]);

    // Save global custom port (onBlur to avoid excessive writes)
    const handleGlobalPortChange = useCallback((port: string) => {
        setGlobalCustomPort(port);
    }, []);

    const saveGlobalCustomPort = useCallback(async () => {
        const trimmedPort = globalCustomPort.trim();
        try {
            if (trimmedPort) {
                await saveSetting({
                    key: 'DOCKER_GLOBAL_REVERSE_PROXY_PORT',
                    value: trimmedPort,
                    category: 'docker',
                    isSecret: false
                });
            } else {
                // If empty, we could delete the setting, but for now just save empty string
                // The backend will handle upsert logic
                await saveSetting({
                    key: 'DOCKER_GLOBAL_REVERSE_PROXY_PORT',
                    value: '',
                    category: 'docker',
                    isSecret: false
                });
            }
        } catch (err) {
            console.error('[DockerPage] Failed to save global port setting', err);
            displayStatus(t.docker.save_error || '保存失败', 'error');
        }
    }, [globalCustomPort, saveSetting, displayStatus, t]);

    // Save custom URL
    const saveCustomUrl = useCallback(async (containerId: string, url: string) => {
        const newUrls = { ...customUrls };
        if (url.trim()) {
            newUrls[containerId] = url.trim();
        } else {
            delete newUrls[containerId];
        }
        setCustomUrls(newUrls);
        try {
            await saveSetting({
                key: 'DOCKER_CUSTOM_URLS',
                value: JSON.stringify(newUrls),
                category: 'docker',
                isSecret: false
            });
            setEditUrlModal(null);
            setEditUrlInput('');
            displayStatus(url.trim() ? (t.docker.custom_url_saved || '访问链接已保存') : (t.docker.custom_url_removed || '已恢复默认链接'), 'success');
        } catch (err) {
            console.error('[DockerPage] Failed to save custom URL', err);
            displayStatus(t.docker.save_error || '保存失败', 'error');
        }
    }, [customUrls, saveSetting, t, displayStatus]);

    // Get display URL for a container
    const getContainerUrl = useCallback((item: ServiceItem): { url: string; type: 'custom' | 'traefik' | 'port' } | null => {
        // Priority: 1. Custom URL  2. Traefik host (with global port if applicable)  3. Port-based URL
        if (customUrls[item.id]) {
            return { url: customUrls[item.id], type: 'custom' };
        }
        if (item.metadata?.traefik_host) {
            const host = item.metadata.traefik_host;
            let url = `https://${host}`;
            // Only append global port if the host doesn't already have a port
            if (globalCustomPort && !host.includes(':')) {
                url += `:${globalCustomPort}`;
            }
            return { url, type: 'traefik' };
        }
        return null;
    }, [customUrls, globalCustomPort]);

    useEffect(() => {
        setHasMounted(true);
    }, []);

    // URL parameter handling for initial load
    useEffect(() => {
        const containerId = searchParams.get('container');
        if (containerId && items.length > 0 && !urlParamProcessed.current) {
            const container = items.find(item => item.id === containerId);
            if (container) {
                const projectName = container.metadata?.project || '';
                const serviceName = container.name || projectName;
                if (serviceName) {
                    setInitialServiceName(serviceName);
                    setView("editor");
                    urlParamProcessed.current = true;
                }
            }
        }

        const tab = searchParams.get('tab');
        if (tab && !urlParamProcessed.current) {
            if (['running', 'editor', 'logs', 'community'].includes(tab)) {
                setView(tab as typeof view);
                urlParamProcessed.current = true;
            }
        }
    }, [searchParams, items]);

    // Auto-refresh container logs
    useEffect(() => {
        let interval: NodeJS.Timeout;
        const fetchLogs = async () => {
            if (!viewLogsContainer) return;
            try {
                const res = await fetchContainerLogs(viewLogsContainer.id);
                setContainerLogs(res.content);
            } catch (e) {
                console.error("Failed to fetch logs", e);
            }
        };

        if (view === 'logs' && viewLogsContainer) {
            fetchLogs(); // Initial fetch
            if (autoRefreshContainerLogs) {
                interval = setInterval(fetchLogs, 3000);
            }
        }
        return () => clearInterval(interval);
    }, [view, viewLogsContainer, autoRefreshContainerLogs, fetchContainerLogs]);

    const handleManualLogRefresh = useCallback(async () => {
        if (!viewLogsContainer) return;
        try {
            const res = await fetchContainerLogs(viewLogsContainer.id);
            setContainerLogs(res.content);
        } catch {
            displayStatus(t.docker.failed_to_refresh_logs, 'error');
        }
    }, [viewLogsContainer, fetchContainerLogs, displayStatus, t]);

    const handleContainerAction = useCallback(async (itemId: string, action: string, itemName: string) => {
        // 对于停止和重启操作，需要二次确认
        if (action === 'stop' || action === 'restart') {
            const actionText = action === 'stop' ? t.common.stop : t.common.restart;
            const confirmed = await confirm({
                title: actionText,
                message: `确定要${actionText}容器 "${itemName}" 吗？`,
                confirmText: actionText,
                cancelText: t.common.cancel,
                variant: 'warning'
            });
            if (!confirmed) return;
        }

        setActionLoading(prev => ({ ...prev, [itemId]: true }));
        try {
            const result = await performItemAction(itemId, action);
            if (result.success) {
                const actionText = action === 'start' ? t.common.start : action === 'stop' ? t.common.stop : action === 'restart' ? t.common.restart : action === 'delete' ? t.docker.delete_container : action;
                if (action === 'delete') {
                    displayStatus(t.docker.delete_container_success, 'success');
                } else {
                    displayStatus(t.docker.container_action_success.replace('{name}', itemName).replace('{action}', actionText), 'success');
                }
                // 等待后端缓存更新后刷新列表（后端缓存TTL是3秒，等待1秒确保缓存失效）
                await new Promise(resolve => setTimeout(resolve, 1000));
                await refresh();
                // 再等待一下，确保状态完全更新
                await new Promise(resolve => setTimeout(resolve, 500));
                await refresh();
            } else {
                if (action === 'delete') {
                    displayStatus(t.docker.delete_container_failed + ': ' + (result.error || '未知错误'), 'error');
                } else {
                    displayStatus(result.error || `${itemName} 操作失败`, 'error');
                }
            }
        } catch (err) {
            const error = err as { message?: string };
            if (action === 'delete') {
                displayStatus(t.docker.delete_container_failed + ': ' + (error?.message || '未知错误'), 'error');
            } else {
                displayStatus(`操作失败: ${error?.message || '未知错误'}`, 'error');
            }
        } finally {
            setActionLoading(prev => ({ ...prev, [itemId]: false }));
        }
    }, [performItemAction, refresh, displayStatus, t, confirm]);

    const handleDeleteContainer = useCallback(async () => {
        if (!deleteConfirm.containerId || !deleteConfirm.containerName) return;

        setIsDeleting(true);
        try {
            await handleContainerAction(deleteConfirm.containerId, 'delete', deleteConfirm.containerName);
            setDeleteConfirm({ isOpen: false, containerId: null, containerName: null });
        } catch (err) {
            displayStatus(t.docker.delete_container_failed + ': ' + (err instanceof Error ? err.message : '未知错误'), 'error');
        } finally {
            setIsDeleting(false);
        }
    }, [deleteConfirm, handleContainerAction, displayStatus, t]);

    const handleStartService = useCallback(async (serviceName: string, displayName: string) => {
        const itemId = `service:${serviceName}`;
        setActionLoading(prev => ({ ...prev, [itemId]: true }));
        try {
            const res = await performDockerAction(serviceName, 'start');
            if (res.content.startsWith('instruction_id:')) {
                displayStatus(`部署任务已启动: ${displayName}`, 'info');
                return;
            }
            displayStatus(t.docker.service_started_success?.replace('{name}', displayName) || `服务 "${displayName}" 启动成功`, 'success');
            // 等待后端缓存更新后刷新列表
            await new Promise(resolve => setTimeout(resolve, 2000));
            await refresh();
        } catch (err) {
            const error = err as Error;
            displayStatus(`启动服务失败: ${error.message || '未知错误'}`, 'error');
        } finally {
            setActionLoading(prev => ({ ...prev, [itemId]: false }));
        }
    }, [performDockerAction, refresh, displayStatus, t]);

    const handleCommunityInstall = useCallback(async (app: CommunityApp) => {
        try {
            await saveFile(app.id, 'docker-compose.yml', app.compose);
            // 给后端一点时间同步文件并更新服务列表
            await new Promise(resolve => setTimeout(resolve, 500));
            // 刷新服务列表，确保 Editor 组件能找到新服务
            await refresh();

            setInitialServiceName(app.id);
            setView("editor");
            displayStatus(`已为 ${app.name} 准备好配置文件`, 'success');
        } catch (e) {
            const error = e as Error;
            displayStatus(`为 ${app.name} 准备配置文件失败: ${error.message}`, 'error');
        }
    }, [saveFile, refresh, displayStatus]);

    const handleViewCommunityApp = useCallback((appId: string) => {
        setHighlightAppId(appId);
        setView("community");
    }, []);

    if (!hasMounted) return null; // Use null to match server pre-render exactly

    return (
        <PageLayout>
            {/* Tabs and Action Buttons Section */}
            <Tabs
                tabs={[
                    { id: "running", label: t.docker.tabs.running },
                    { id: "editor", label: t.docker.tabs.editor },
                    { id: "logs", label: t.docker.tabs.logs },
                    { id: "community", label: t.docker.tabs.community },
                ]}
                activeTab={view}
                onChange={(id) => {
                    setView(id as typeof view);
                    if (id === "running") setInitialServiceName(undefined);
                }}
                paramName="tab"
                variant="blue"
                actions={
                    <>
                        {service && service.status === "running" && (
                            <div className="px-4 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                DAEMON RUNNING
                            </div>
                        )}
                        {service && (
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setShowCreate(true)}
                                    className="px-4 py-1.5 rounded-lg bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2 shadow-lg shadow-brand-blue/20"
                                >
                                    <span className="text-base leading-none">+</span>
                                    {t.dashboard.add_service}
                                </button>
                                <button
                                    onClick={() => performAction(service.id, service.status === "running" ? "stop" : "start")}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2 ${service.status === "running"
                                        ? "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white"
                                        : "bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/20 hover:bg-brand-emerald hover:text-white"
                                        }`}
                                >
                                    {service.status === "running" ? (
                                        <>
                                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                                            </svg>
                                            {t.docker.stop_service}
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                            </svg>
                                            {t.docker.start_service}
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </>
                }
            />

            {statusMessage && (
                <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-xs font-bold animate-in slide-in-from-top-2 ${statusMessage.type === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : statusMessage.type === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
                    {statusMessage.text}
                </div>
            )}

            <div className="flex-1 overflow-y-auto no-scrollbar p-10">
                {view === "community" ? (
                    <DockerCommunity
                        onInstall={(app) => {
                            setHighlightAppId(undefined);
                            handleCommunityInstall(app);
                        }}
                        initialSelectedAppId={highlightAppId}
                    />
                ) : view === "editor" ? (
                    <DockerManage
                        initialServiceName={initialServiceName}
                        onViewCommunityApp={handleViewCommunityApp}
                    />
                ) : view === "logs" ? (
                    viewLogsContainer ? (
                        <div className="h-full">
                            <DockerLogViewer
                                title={viewLogsContainer.name}
                                logs={containerLogs}
                                showLogs={true}
                                onClose={() => setViewLogsContainer(null)}
                                onRefresh={handleManualLogRefresh}
                                autoRefresh={autoRefreshContainerLogs}
                                onToggleAutoRefresh={() => setAutoRefreshContainerLogs(!autoRefreshContainerLogs)}
                                status={autoRefreshContainerLogs ? 'active' : 'inactive'}
                            />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <h3 className="text-section text-gray-400">{t.docker.select_container_logs}</h3>
                            {loading ? (
                                <div className="flex items-center justify-center p-12">
                                    <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {items.filter(i => i.status === 'running').map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => {
                                                setViewLogsContainer({ id: item.id, name: item.name });
                                                setContainerLogs(""); // Clear previous logs
                                            }}
                                            className="flex flex-col gap-2 p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all text-left group"
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <span className="font-bold text-sm text-gray-200 group-hover:text-white">{item.name}</span>
                                                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                                            </div>
                                            <div className="text-[10px] font-mono text-gray-500 truncate w-full">
                                                {item.metadata?.image || t.docker.unknown_image || 'unknown image'}
                                            </div>
                                            <div className="mt-2 text-[10px] font-mono text-blue-400 opacity-60 group-hover:opacity-100 transition-opacity uppercase tracking-wider">
                                                {t.docker.click_to_view_logs}
                                            </div>
                                        </button>
                                    ))}
                                    {items.length === 0 && (
                                        <div className="col-span-full text-center py-12 text-gray-500 text-sm">
                                            {t.docker.no_running_containers}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                ) : (
                    <div className="space-y-6">
                        {loading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {[1, 2, 3, 4, 5, 6].map((i) => (
                                    <Card key={i} className="p-6 bg-white/[0.02] border border-white/5">
                                        <div className="flex items-center gap-3 mb-4">
                                            <Skeleton variant="circular" className="w-2.5 h-2.5" animation="pulse" />
                                            <div className="flex-1">
                                                <Skeleton className="h-4 w-2/3 mb-2" />
                                                <Skeleton className="h-3 w-1/3" />
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <Skeleton className="h-2 w-full" />
                                            <Skeleton className="h-2 w-full" />
                                            <div className="flex justify-end gap-2 pt-2">
                                                <Skeleton className="w-8 h-8 rounded-full" />
                                                <Skeleton className="w-8 h-8 rounded-full" />
                                                <Skeleton className="w-8 h-8 rounded-full" />
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        ) : !loading && items.length === 0 ? (
                            <div className="rounded-3xl border border-white/5 bg-white/5 p-12 text-center backdrop-blur-xl border-dashed">
                                <p className="text-gray-400">{t.docker.no_containers}</p>
                            </div>
                        ) : (
                            <>
                                {/* 健康摘要卡片 */}
                                <div className="rounded-2xl bg-white/[0.02] border border-white/5 backdrop-blur-md p-4 mb-6">
                                    <div className="flex items-center justify-between gap-4">
                                        {/* 左侧：状态统计组 */}
                                        <div className="flex items-center gap-4 sm:gap-6">
                                            {/* 容器状态统计 */}
                                            <div className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                                <span className="text-sm font-bold text-white">{healthSummary.running}</span>
                                                <span className="text-xs text-gray-500 uppercase tracking-wider">{t.docker.health_summary?.running || '运行中'}</span>
                                            </div>
                                            {healthSummary.stopped > 0 && (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2.5 h-2.5 rounded-full bg-gray-500" />
                                                    <span className="text-sm font-bold text-white">{healthSummary.stopped}</span>
                                                    <span className="text-xs text-gray-500 uppercase tracking-wider">{t.docker.health_summary?.stopped || '已停止'}</span>
                                                </div>
                                            )}
                                            {healthSummary.notStarted > 0 && (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                                                    <span className="text-sm font-bold text-white">{healthSummary.notStarted}</span>
                                                    <span className="text-xs text-gray-500 uppercase tracking-wider">{t.docker.health_summary?.not_started || '未启动'}</span>
                                                </div>
                                            )}
                                            {healthSummary.unhealthy > 0 && (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                                                    <span className="text-sm font-bold text-red-400">{healthSummary.unhealthy}</span>
                                                    <span className="text-xs text-red-400/70 uppercase tracking-wider">{t.docker.health_summary?.unhealthy || '异常'}</span>
                                                </div>
                                            )}

                                            {/* 资源使用统计 */}
                                            {healthSummary.running > 0 && (
                                                <>
                                                    <div className="w-px h-4 bg-white/10" />
                                                    <div className="flex items-center gap-4 text-xs font-mono">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-gray-500">CPU</span>
                                                            <span className="text-blue-400 font-bold">{healthSummary.totalCpu}%</span>
                                                        </div>
                                                        <div className="w-px h-4 bg-white/10" />
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-gray-500">MEM</span>
                                                            <span className="text-purple-400 font-bold">
                                                                {parseInt(healthSummary.totalMemMB) >= 1024 
                                                                    ? `${(parseInt(healthSummary.totalMemMB) / 1024).toFixed(1)}GB` 
                                                                    : `${healthSummary.totalMemMB}MB`}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {/* 右侧：操作组 */}
                                        <div className="flex items-center gap-2">
                                            {/* 全局端口设置 */}
                                            {healthSummary.running > 0 && (
                                                <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-white/5 border border-white/10 group/port hover:border-blue-500/30 transition-all">
                                                    <span className="text-[10px] text-gray-500 uppercase font-black tracking-widest">{t.docker.global_port || '全局端口'}</span>
                                                    <input
                                                        type="text"
                                                        value={globalCustomPort}
                                                        onChange={(e) => handleGlobalPortChange(e.target.value)}
                                                        onBlur={saveGlobalCustomPort}
                                                        placeholder="443"
                                                        className="w-10 bg-transparent border-none text-white font-bold focus:outline-none placeholder:text-gray-600 text-center"
                                                        title="设置全局转发端口，将自动应用到所有检测到的域名上"
                                                    />
                                                    <Link2 size={10} className="text-gray-600 group-hover/port:text-blue-500 transition-colors" />
                                                </div>
                                            )}

                                            {/* Layout Toggle */}
                                            {healthSummary.running > 0 && (
                                                <div className="w-px h-4 bg-white/10" />
                                            )}
                                            <div className="flex items-center gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
                                                <button
                                                    onClick={() => setLayoutMode('grid')}
                                                    className={`p-1.5 rounded-md transition-all active:scale-95 ${
                                                        layoutMode === 'grid'
                                                            ? 'bg-white/10 text-white'
                                                            : 'text-gray-400 hover:text-white'
                                                    }`}
                                                    aria-label="网格视图"
                                                >
                                                    <LayoutGrid className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => setLayoutMode('list')}
                                                    className={`p-1.5 rounded-md transition-all active:scale-95 ${
                                                        layoutMode === 'list'
                                                            ? 'bg-white/10 text-white'
                                                            : 'text-gray-400 hover:text-white'
                                                    }`}
                                                    aria-label="列表视图"
                                                >
                                                    <List className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Grid View (Cards) */}
                                {layoutMode === 'grid' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {items.map((item) => {
                                        const cpu = item.metadata?.cpu_perc || "0%";
                                        const memPerc = item.metadata?.mem_perc || "0%";
                                        const statusColor = item.status === 'running'
                                            ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                                            : item.status === 'not_started'
                                                ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                                                : item.status === 'stopped' || item.status === 'exited'
                                                    ? 'bg-gray-600'
                                                    : 'bg-red-500';

                                        const shortId = item.id.startsWith('service:')
                                            ? item.id.replace('service:', '')
                                            : item.id.substring(0, 10);

                                        // 解析端口和链接 (适配移动端)
                                        const ports = item.metadata?.ports || "";
                                        const portList = ports ? ports.split(',').filter(p => p.trim()).map(p => {
                                            const trimmed = p.trim();
                                            if (trimmed.includes('->')) {
                                                const parts = trimmed.split('->');
                                                const external = parts[0].trim();
                                                const portNum = external.includes(':') ? external.split(':').pop() : external;
                                                if (portNum) {
                                                    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
                                                    return { label: portNum, value: `http://${hostname}:${portNum}` };
                                                }
                                            } else if (trimmed.includes(':')) {
                                                const parts = trimmed.split(':');
                                                const hostPort = parts[0].trim();
                                                if (hostPort && /^\d+$/.test(hostPort)) {
                                                    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
                                                    return { label: hostPort, value: `http://${hostname}:${hostPort}` };
                                                }
                                            }
                                            return null;
                                        }).filter((p): p is { label: string; value: string } => p !== null) : [];

                                        const customUrl = getContainerUrl(item);

                                        return (
                                            <Card key={item.id} className="p-5 bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all group">
                                                <div className="flex items-start justify-between mb-4">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <h3 className="text-sm font-black text-white uppercase truncate flex-1" title={item.name}>{item.name}</h3>
                                                                {item.metadata?.is_managed !== 'true' && (
                                                                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-500 text-[8px] font-black uppercase border border-amber-500/20 flex-shrink-0">EXT</span>
                                                                )}
                                                            </div>
                                                            <p className="text-[10px] font-mono text-gray-500 uppercase truncate">
                                                                {item.status === 'not_started' ? t.docker.not_started : `ID: ${shortId}`}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        {item.status === 'running' && (
                                                            <button
                                                                onClick={() => handleContainerAction(item.id, 'restart', item.name)}
                                                                disabled={actionLoading[item.id]}
                                                                className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-500/10 transition-all"
                                                            >
                                                                <RefreshCw size={14} className={actionLoading[item.id] ? "animate-spin" : ""} />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => setSelectedContainerId(item.id)}
                                                            className="p-1.5 rounded-lg text-gray-500 hover:bg-white/10"
                                                        >
                                                            <Info size={14} />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="space-y-4">
                                                    {/* Stats for Running */}
                                                    {item.status === 'running' && (
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="space-y-1">
                                                                <div className="flex justify-between text-[9px] font-bold text-gray-500 uppercase tracking-tighter">
                                                                    <span>CPU</span>
                                                                    <span>{cpu}</span>
                                                                </div>
                                                                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-blue-500" style={{ width: cpu }} />
                                                                </div>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <div className="flex justify-between text-[9px] font-bold text-gray-500 uppercase tracking-tighter">
                                                                    <span>MEM</span>
                                                                    <span>{memPerc}</span>
                                                                </div>
                                                                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-purple-500" style={{ width: memPerc }} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Links Area for Mobile */}
                                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                                        {customUrl && (
                                                            <a
                                                                href={customUrl.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className={`px-2 py-1 rounded-lg text-[10px] font-bold tracking-wider transition-all flex items-center gap-1.5 ${
                                                                    customUrl.type === 'custom' 
                                                                        ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
                                                                        : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                                                }`}
                                                            >
                                                                {customUrl.type === 'custom' ? <Star size={10} /> : <ExternalLink size={10} />}
                                                                <span className="truncate max-w-[120px]">{customUrl.url.replace(/^https?:\/\//, '').split('/')[0]}</span>
                                                            </a>
                                                        )}
                                                        {portList.map((p, idx) => (
                                                            <a
                                                                key={idx}
                                                                href={p.value}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[10px] text-blue-400 font-bold hover:bg-blue-500 hover:text-white transition-all"
                                                            >
                                                                :{p.label}
                                                            </a>
                                                        ))}
                                                        <button
                                                            onClick={() => {
                                                                setEditUrlModal({
                                                                    isOpen: true,
                                                                    containerId: item.id,
                                                                    containerName: item.name,
                                                                    currentUrl: customUrls[item.id] || item.metadata?.traefik_host ? `https://${item.metadata?.traefik_host}` : ''
                                                                });
                                                                setEditUrlInput(customUrls[item.id] || '');
                                                            }}
                                                            className="p-1.5 rounded-lg text-gray-500 hover:bg-white/10 transition-all ml-auto"
                                                        >
                                                            <Link2 size={14} />
                                                        </button>
                                                    </div>

                                                    {/* Action Bar */}
                                                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    setViewLogsContainer({ id: item.id, name: item.name });
                                                                    setContainerLogs("");
                                                                    setView("logs");
                                                                }}
                                                                className="px-3 py-1.5 rounded-lg bg-white/5 text-gray-300 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all"
                                                            >
                                                                {t.docker.view_logs}
                                                            </button>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {item.status === 'running' ? (
                                                                <button
                                                                    onClick={() => handleContainerAction(item.id, 'stop', item.name)}
                                                                    disabled={actionLoading[item.id]}
                                                                    className="p-2 rounded-full text-red-500 hover:bg-red-500/10 transition-all"
                                                                >
                                                                    <Square size={16} fill="currentColor" />
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={() => item.status === 'not_started' ? handleStartService(item.metadata?.service_name || item.name, item.name) : handleContainerAction(item.id, 'start', item.name)}
                                                                    disabled={actionLoading[item.id]}
                                                                    className="p-2 rounded-full text-emerald-500 hover:bg-emerald-500/10 transition-all"
                                                                >
                                                                    <Play size={16} fill="currentColor" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </Card>
                                        );
                                    })}
                                </div>
                                )}

                                {/* List View (Table) */}
                                {layoutMode === 'list' && (
                                <div className="bg-white/[0.02] border border-white/5 rounded-2xl backdrop-blur-md overflow-hidden">
                                    <table className="w-full text-left min-w-[800px]">
                                        <thead>
                                            <tr className="border-b border-white/[0.08] text-[11px] text-gray-500 font-black uppercase tracking-widest bg-white/[0.01]">
                                                <th className="px-6 py-5 rounded-tl-2xl text-left align-middle">{t.docker.table.container}</th>
                                                <th className="px-6 py-5 text-left align-middle">{t.docker.table.image}</th>
                                                <th className="px-6 py-5 relative group/header text-left align-middle">
                                                    <div className="flex items-center gap-1.5 transition-colors cursor-help">
                                                        <span className="group-hover/header:text-blue-400 transition-colors">{t.docker.table.load}</span>
                                                        <div className="relative group/tooltip">
                                                            <Info size={12} className="text-gray-500 group-hover/header:text-blue-400 group-hover/header:scale-110 transition-all flex-shrink-0" />
                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-zinc-900 border border-white/10 rounded-lg text-[11px] text-zinc-300 font-medium whitespace-nowrap opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-all duration-200 z-[100] shadow-xl">
                                                                {t.docker.cpu_load_desc}
                                                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-zinc-900" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </th>
                                                <th className="px-6 py-5 text-left align-middle">{t.docker.table.ports}</th>
                                                <th className="px-6 py-5 text-right rounded-tr-2xl align-middle">{t.docker.table.actions}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/[0.08]">
                                            {items.map((item) => {
                                                const cpu = item.metadata?.cpu_perc || "0%";
                                                const memRaw = item.metadata?.mem_usage || "0/0";
                                                const memPerc = item.metadata?.mem_perc || "0%";
                                                const ports = item.metadata?.ports || "";

                                                // Format memory display: extract just the used part (e.g., "15MB" from "11.14MiB / 15.66GiB")
                                                let memDisplay = memRaw;
                                                if (memRaw.includes('/')) {
                                                    const parts = memRaw.split('/');
                                                    const used = parts[0].trim();
                                                    // Convert MiB to MB for display
                                                    if (used.includes('MiB')) {
                                                        const num = parseFloat(used.replace('MiB', '').trim());
                                                        memDisplay = `${num.toFixed(0)}MB`;
                                                    } else if (used.includes('GiB')) {
                                                        const num = parseFloat(used.replace('GiB', '').trim());
                                                        memDisplay = `${(num * 1024).toFixed(0)}MB`;
                                                    } else if (used.includes('KiB')) {
                                                        const num = parseFloat(used.replace('KiB', '').trim());
                                                        memDisplay = `${(num / 1024).toFixed(0)}MB`;
                                                    } else {
                                                        memDisplay = used;
                                                    }
                                                } else if (memRaw === "0/0") {
                                                    memDisplay = "0/0";
                                                }

                                                // Enhanced port parser supporting multiple formats:
                                                // - 0.0.0.0:8080->80/tcp
                                                // - 127.0.0.1:8080->80/tcp
                                                // - 8080->80/tcp
                                                // - 0.0.0.0:8080->80/tcp, 0.0.0.0:8443->443/tcp
                                                // - For not_started services, ports might be in format "8080:80, 8443:443"
                                                const portList = ports ? ports.split(',').filter(p => p.trim()).map(p => {
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
                                                }).filter((p): p is { label: string; value: string; full: string } => p !== null) : [];

                                                // Extract short container ID (first 10 characters)
                                                // For not_started services, id is "service:name", so we skip the prefix
                                                const shortId = item.id.startsWith('service:')
                                                    ? item.id.replace('service:', '')
                                                    : item.id.substring(0, 10);

                                                // Parse image name and tag
                                                const imageFull = item.metadata?.image || 'unknown';
                                                const imageParts = imageFull.split(':');
                                                const imageName = imageParts[0] || imageFull;
                                                const imageTag = imageParts[1] || 'latest';

                                                // Determine status color
                                                const statusColor = item.status === 'running'
                                                    ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                                                    : item.status === 'not_started'
                                                        ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                                                        : item.status === 'stopped' || item.status === 'exited'
                                                            ? 'bg-gray-600'
                                                            : 'bg-red-500';

                                                const isManaged = item.metadata?.is_managed === 'true';
                                                const projectName = item.metadata?.project || '';
                                                // 只要有 project 名称就可以点击，编辑器会处理非管理服务的提示
                                                const canEdit = !!projectName;

                                                const handleContainerNameClick = () => {
                                                    if (canEdit) {
                                                        // 优先使用容器名称，如果没有则使用 project 名称
                                                        // 因为服务列表中的名称通常是容器名称格式
                                                        const serviceName = item.name || projectName;
                                                        setInitialServiceName(serviceName);
                                                        setView("editor");
                                                    }
                                                };

                                                return (
                                                    <tr key={item.id} className="group hover:bg-white/[0.02] transition-colors duration-200 border-b border-white/[0.08] last:border-b-0">
                                                <td className="px-6 py-5 align-middle">
                                                    <div className="flex items-center gap-3 min-w-[200px]">
                                                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all duration-500 ${statusColor}`} />
                                                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                {canEdit ? (
                                                                    <button
                                                                        onClick={handleContainerNameClick}
                                                                        className="text-sm font-black text-blue-400 hover:text-blue-300 tracking-tight uppercase transition-colors flex items-center gap-1.5 group/name hover:underline cursor-pointer max-w-[280px]"
                                                                        title={item.name}
                                                                    >
                                                                        <span className="truncate">{item.name}</span>
                                                                        <Edit size={12} className="opacity-0 group-hover/name:opacity-100 transition-opacity flex-shrink-0" />
                                                                    </button>
                                                                ) : (
                                                                    <span className="text-sm font-black text-white tracking-tight uppercase truncate max-w-[280px]" title={item.name}>{item.name}</span>
                                                                )}
                                                                {!isManaged && (
                                                                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 text-[9px] font-black uppercase tracking-wider border border-amber-500/20">EXT</span>
                                                                )}
                                                                        {item.metadata?.config_changed === 'true' && (
                                                                            <div className="relative group/tooltip">
                                                                                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400 cursor-help">
                                                                                    <AlertTriangle size={10} />
                                                                                    <span className="text-[8px] font-bold uppercase tracking-wider">Outdated</span>
                                                                                </div>
                                                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-zinc-900 border border-orange-500/30 rounded-lg text-[11px] text-zinc-300 font-medium whitespace-nowrap opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-all duration-200 z-50 shadow-xl backdrop-blur-md">
                                                                                    <div className="flex items-center gap-2 mb-1 text-orange-400">
                                                                                        <AlertTriangle size={12} />
                                                                                        <span className="font-bold uppercase tracking-wider text-[10px]">Changes Pending</span>
                                                                                    </div>
                                                                                    <div className="text-gray-400 text-[10px]">
                                                                                        {item.metadata?.config_differences || "Configuration changed"}
                                                                                    </div>
                                                                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-zinc-900" />
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <span className="text-[10px] font-mono text-gray-500">
                                                                        {item.status === 'not_started'
                                                                            ? t.docker.not_started || 'Not Started'
                                                                            : `ID: ${shortId}`
                                                                        }
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-5 align-middle">
                                                            {item.status === 'not_started' ? (
                                                                <div className="flex flex-col gap-0.5">
                                                                    <span className="text-xs font-mono text-gray-500 italic">{t.docker.configured_not_started || 'Configured but not started'}</span>
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-col gap-0.5">
                                                                    <span className="text-xs font-mono text-gray-400 truncate max-w-[200px]">{imageName}</span>
                                                                    <span className="text-[10px] font-mono text-gray-600">{imageTag}</span>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-5 align-middle">
                                                            {item.status === 'not_started' ? (
                                                                <span className="text-[10px] text-gray-500 font-mono">-</span>
                                                            ) : (
                                                                <div className="flex flex-col gap-2.5 min-w-[140px]">
                                                                    {/* CPU Row */}
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="text-[10px] font-mono text-gray-500 w-8 flex-shrink-0 text-left">CPU</span>
                                                                        <div className="flex-1 flex items-center gap-2">
                                                                            <div className="h-1 bg-white/5 rounded-full overflow-hidden flex-1" title={t.docker.cpu_load_desc}>
                                                                                <div
                                                                                    className="h-full bg-blue-500 transition-all duration-500 ease-out"
                                                                                    style={{ width: item.status === 'running' ? cpu : '0%' }}
                                                                                />
                                                                            </div>
                                                                            <span className="text-[10px] font-mono text-white min-w-[40px] text-right">{cpu}</span>
                                                                        </div>
                                                                    </div>
                                                                    {/* MEM Row */}
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="text-[10px] font-mono text-gray-500 w-8 flex-shrink-0 text-left">MEM</span>
                                                                        <div className="flex-1 flex items-center gap-2">
                                                                            <div className="h-1 bg-white/5 rounded-full overflow-hidden flex-1" title={t.docker.mem_usage_desc}>
                                                                                <div
                                                                                    className="h-full bg-purple-500 transition-all duration-500 ease-out"
                                                                                    style={{ width: item.status === 'running' ? memPerc : '0%' }}
                                                                                />
                                                                            </div>
                                                                            <span className="text-[10px] font-mono text-white min-w-[60px] text-right">{memDisplay}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-5 align-middle">
                                                            {(() => {
                                                                const customUrl = getContainerUrl(item);
                                                                return (
                                                                    <div className="flex flex-wrap items-center gap-1.5 max-w-[400px]">
                                                                        {/* 自定义/Traefik 链接优先显示 */}
                                                                        {customUrl && (
                                                                            <a
                                                                                href={customUrl.url}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider transition-all flex-shrink-0 flex items-center gap-1 ${
                                                                                    customUrl.type === 'custom' 
                                                                                        ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500 hover:text-white'
                                                                                        : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white'
                                                                                }`}
                                                                                title={customUrl.type === 'custom' ? (t.docker.custom_url || '自定义链接') : (t.docker.traefik_domain || 'Traefik 域名')}
                                                                            >
                                                                                {customUrl.type === 'custom' && <Star className="w-2.5 h-2.5" />}
                                                                                {customUrl.type === 'traefik' && <ExternalLink className="w-2.5 h-2.5" />}
                                                                                {customUrl.url.replace(/^https?:\/\//, '').split('/')[0]}
                                                                            </a>
                                                                        )}
                                                                        {/* 端口链接 */}
                                                                        {portList.map((p, idx) => (
                                                                            <a
                                                                                key={idx}
                                                                                href={p.value}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className="px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[10px] text-blue-400 font-bold uppercase tracking-wider hover:bg-blue-500 hover:text-white transition-all flex-shrink-0"
                                                                            >
                                                                                :{p.label}
                                                                            </a>
                                                                        ))}
                                                                        {/* 编辑自定义链接按钮 */}
                                                                        <button
                                                                            onClick={() => {
                                                                                setEditUrlModal({
                                                                                    isOpen: true,
                                                                                    containerId: item.id,
                                                                                    containerName: item.name,
                                                                                    currentUrl: customUrls[item.id] || item.metadata?.traefik_host ? `https://${item.metadata?.traefik_host}` : ''
                                                                                });
                                                                                setEditUrlInput(customUrls[item.id] || '');
                                                                            }}
                                                                            className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-all"
                                                                            title={t.docker.custom_url || '自定义链接'}
                                                                        >
                                                                            <Link2 className="w-3 h-3" />
                                                                        </button>
                                                                        {!customUrl && portList.length === 0 && (
                                                                            <span className="text-[10px] text-gray-600 font-mono">-</span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </td>
                                                        <td className="px-6 py-5 text-right align-middle">
                                                            <div className="flex items-center justify-end gap-2">
                                                                {item.status === 'running' && (
                                                                    <>
                                                                        <button
                                                                            onClick={() => handleContainerAction(item.id, 'restart', item.name)}
                                                                            disabled={actionLoading[item.id] || loading}
                                                                            title={t.common.restart}
                                                                            className="p-2 rounded-full text-blue-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                        >
                                                                            {actionLoading[item.id] ? (
                                                                                <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500/60 rounded-full animate-spin" />
                                                                            ) : (
                                                                                <RefreshCw className="w-4 h-4" />
                                                                            )}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleContainerAction(item.id, 'stop', item.name)}
                                                                            disabled={actionLoading[item.id] || loading}
                                                                            title={t.common?.stop}
                                                                            className="p-2 rounded-full text-gray-500 hover:text-white hover:bg-white/10 transition-all active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                        >
                                                                            {actionLoading[item.id] ? (
                                                                                <div className="w-4 h-4 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
                                                                            ) : (
                                                                                <Square className="w-4 h-4 fill-current" />
                                                                            )}
                                                                        </button>
                                                                    </>
                                                                )}
                                                                {item.status !== 'running' && (
                                                                    <button
                                                                        onClick={() => {
                                                                            if (item.status === 'not_started') {
                                                                                // 对于未启动的服务，使用 docker compose up
                                                                                handleStartService(item.metadata?.service_name || item.name, item.name);
                                                                            } else {
                                                                                // 对于已停止的容器，使用 docker start
                                                                                handleContainerAction(item.id, 'start', item.name);
                                                                            }
                                                                        }}
                                                                        disabled={actionLoading[item.id] || loading}
                                                                        title={item.status === 'not_started' ? (t.docker.click_to_start || t.common?.start) : t.common?.start}
                                                                        className="p-2 rounded-full text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    >
                                                                        {actionLoading[item.id] ? (
                                                                            <div className="w-4 h-4 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
                                                                        ) : (
                                                                            <Play className="w-4 h-4 fill-current" />
                                                                        )}
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => {
                                                                        setViewLogsContainer({ id: item.id, name: item.name });
                                                                        setContainerLogs("");
                                                                        setView("logs");
                                                                    }}
                                                                    className="p-2 rounded-full text-purple-500 hover:text-purple-400 hover:bg-purple-500/10 transition-all active:scale-90"
                                                                    title={t.docker.view_logs}
                                                                >
                                                                    <FileText className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => setSelectedContainerId(item.id)}
                                                                    className="p-2 rounded-full text-gray-500 hover:text-white hover:bg-white/10 transition-all active:scale-90"
                                                                    title={t.common?.details}
                                                                >
                                                                    <Info className="w-4 h-4" />
                                                                </button>
                                                                {!isManaged && (
                                                                    <button
                                                                        onClick={() => setDeleteConfirm({
                                                                            isOpen: true,
                                                                            containerId: item.id,
                                                                            containerName: item.name
                                                                        })}
                                                                        disabled={actionLoading[item.id] || loading}
                                                                        className="p-2 rounded-full text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-all active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                        title={t.docker.delete_container}
                                                                    >
                                                                        {actionLoading[item.id] ? (
                                                                            <div className="w-4 h-4 border-2 border-red-500/30 border-t-red-500/60 rounded-full animate-spin" />
                                                                        ) : (
                                                                            <Trash2 className="w-4 h-4" />
                                                                        )}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Create Service Modal */}
            {showCreate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <Card className="w-full max-w-lg overflow-hidden shadow-2xl p-0">
                        <div className="p-6 border-b border-white/10 flex items-center justify-between">
                            <h2 className="text-xl font-bold tracking-tight text-white">{t.dashboard.add_service}</h2>
                            <button onClick={() => setShowCreate(false)} className="p-2 rounded-lg hover:bg-white/5 text-gray-400">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            if (!newServiceName || !newServiceImage || isCreating) return;


                            const serviceName = newServiceName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
                            setIsCreating(true);
                            try {
                                // Generate initial docker-compose.yml content
                                let composeContent = 'version: "3.8"\n\nservices:\n';
                                composeContent += `  ${serviceName}:\n`;
                                composeContent += `    image: ${newServiceImage}\n`;

                                if (newServicePort) {
                                    composeContent += `    ports:\n`;
                                    composeContent += `      - "${newServicePort}"\n`;
                                }

                                // Add recommended volume mappings
                                composeContent += `    volumes:\n`;
                                composeContent += `      - ./config:/app/config\n`;
                                composeContent += `      - ./data:/app/data\n`;

                                // Create the service
                                await saveFile(serviceName, 'docker-compose.yml', composeContent);

                                // Success - set initial service name and switch to editor
                                setInitialServiceName(serviceName);
                                setShowCreate(false);
                                setView("editor");

                                // Clear form
                                setNewServiceName('');
                                setNewServiceImage('');
                                setNewServicePort('');

                                displayStatus(`服务 "${serviceName}" 创建成功`, 'success');
                            } catch (err) {
                                // 检查是否是重名冲突错误
                                const error = err as Error;
                                const errorMessage = error?.message || '未知错误';
                                if (errorMessage.includes('已存在') || errorMessage.includes('already exists')) {
                                    displayStatus(t.docker.service_name_exists.replace('{name}', serviceName) + ' ' + t.docker.service_name_exists_desc, 'error');
                                } else {
                                    displayStatus(`创建服务失败: ${errorMessage}`, 'error');
                                }
                            } finally {
                                setIsCreating(false);
                            }
                        }} className="p-6 space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">{t.docker.service_name || "Service Name"}</label>
                                    <input
                                        required
                                        value={newServiceName}
                                        onChange={e => setNewServiceName(e.target.value)}
                                        placeholder="my-app"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">{t.docker.image || "Image"}</label>
                                    <input
                                        required
                                        value={newServiceImage}
                                        onChange={e => setNewServiceImage(e.target.value)}
                                        placeholder="nginx:latest"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">{t.docker.port_mapping || "Port Mapping (Host:Container)"}</label>
                                    <input
                                        value={newServicePort}
                                        onChange={e => setNewServicePort(e.target.value)}
                                        placeholder="8080:80"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                                    />
                                </div>
                                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                                    <p className="text-xs text-blue-400">
                                        For full configuration (Environment, Volumes), please use the editor in the next step.
                                    </p>
                                </div>
                            </div>
                            <div className="flex justify-end pt-4 gap-3">
                                <Button
                                    type="button"
                                    onClick={() => setShowCreate(false)}
                                    variant="secondary"
                                >
                                    {t.common.cancel}
                                </Button>
                                <Button type="submit" disabled={isCreating}>
                                    {isCreating ? "创建中..." : t.docker.continue_to_editor}
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}

            {selectedContainerId && (
                <ContainerDetails
                    itemId={selectedContainerId}
                    onClose={() => setSelectedContainerId(null)}
                    getItemDetails={getItemDetails}
                    onEditService={(serviceName) => {
                        setSelectedContainerId(null);
                        setInitialServiceName(serviceName);
                        setView("editor");
                    }}
                />
            )}

            {/* Delete Container Confirmation Dialog */}
            <ConfirmDialog
                isOpen={deleteConfirm.isOpen}
                onClose={() => setDeleteConfirm({ isOpen: false, containerId: null, containerName: null })}
                onConfirm={handleDeleteContainer}
                title={t.docker.delete_container}
                message={t.docker.delete_container_confirm.replace('{name}', deleteConfirm.containerName || '')}
                confirmText={t.docker.delete_container}
                cancelText={t.common.cancel}
                variant="danger"
                isLoading={isDeleting}
            />

            {/* Global Confirm Dialog for stop/restart actions */}
            <ConfirmDialogComponent />

            {/* Custom URL Edit Modal */}
            {editUrlModal?.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <Card className="w-full max-w-md overflow-hidden shadow-2xl p-0">
                        <div className="p-6 border-b border-white/10 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold tracking-tight text-white">{t.docker.custom_url || '自定义链接'}</h2>
                                <p className="text-xs text-gray-500 mt-1">{editUrlModal.containerName}</p>
                            </div>
                            <button 
                                onClick={() => { setEditUrlModal(null); setEditUrlInput(''); }} 
                                className="p-2 rounded-lg hover:bg-white/5 text-gray-400"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">
                                    {t.docker.custom_url_placeholder || '输入自定义访问 URL'}
                                </label>
                                <input
                                    type="url"
                                    value={editUrlInput}
                                    onChange={e => setEditUrlInput(e.target.value)}
                                    placeholder="https://app.example.com"
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                                    autoFocus
                                />
                            </div>
                            {editUrlModal.currentUrl && !customUrls[editUrlModal.containerId] && (
                                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                                    <div className="flex items-center gap-2 text-xs text-emerald-400">
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        <span className="font-bold">{t.docker.traefik_domain || 'Traefik 域名'}</span>
                                    </div>
                                    <p className="text-xs text-emerald-300/70 mt-1 font-mono">{editUrlModal.currentUrl}</p>
                                </div>
                            )}
                            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                                <p className="text-[11px] text-gray-400 leading-relaxed">
                                    {t.docker.custom_url_desc || '设置自定义访问链接后，点击链接标签将直接跳转到此地址。留空将恢复默认的端口链接或 Traefik 域名。'}
                                </p>
                            </div>
                        </div>
                        <div className="p-6 border-t border-white/10 flex justify-end gap-3">
                            <Button
                                variant="secondary"
                                onClick={() => { setEditUrlModal(null); setEditUrlInput(''); }}
                            >
                                {t.common.cancel}
                            </Button>
                            <Button
                                onClick={() => saveCustomUrl(editUrlModal.containerId, editUrlInput)}
                            >
                                {t.common.save}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </PageLayout>
    );
}
