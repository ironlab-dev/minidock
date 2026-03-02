"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from "@/hooks/useTranslation";
import { useToast } from "@/hooks/useToast";
import { useConfirm } from "@/hooks/useConfirm";
import { useSettings } from "@/hooks/useSettings";
import { getSolutionIcon } from "@/lib/solutionDefinitions";
import { getSetupGuide, resolveSetupGuide } from "@/lib/setupGuides";
import { Play, Square, RefreshCw, Trash2, FolderOpen, Layers, AlertTriangle, RotateCw, Globe, Copy, Check, ExternalLink, Pencil, X, AlertCircle, Link2 } from 'lucide-react';
import Link from 'next/link';
import SolutionComponentCard from './SolutionComponentCard';
import ExternalContainerCard from './ExternalContainerCard';
import SetupGuidePanel from './SetupGuidePanel';
import type { SolutionInfo, SolutionDetail, SolutionDeployment, DeploymentProgress, DeployedComponent, ExternalContainer } from '@/types/solution';

interface SolutionInstalledProps {
    solutions: SolutionInfo[];
    getSolutionDetail: (id: string) => Promise<SolutionDetail>;
    getStatus: (id: string) => Promise<DeploymentProgress>;
    performAction: (id: string, action: string) => Promise<{ message: string }>;
    uninstall: (id: string) => Promise<void>;
    updatePaths: (id: string, mediaPath: string, downloadsPath: string) => Promise<SolutionDeployment>;
    onRefresh: () => void;
}

const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
    running: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
    partial: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
    stopped: { bg: 'bg-gray-500/10', text: 'text-gray-400', dot: 'bg-gray-400' },
    deploying: { bg: 'bg-purple-500/10', text: 'text-purple-400', dot: 'bg-purple-400' },
    error: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
};

export default function SolutionInstalled({ solutions, getSolutionDetail, performAction, uninstall, updatePaths, onRefresh }: SolutionInstalledProps) {
    const { t } = useTranslation();
    const toast = useToast();
    const { confirm, ConfirmDialog } = useConfirm();
    const { settings, saveSetting } = useSettings();
    const [details, setDetails] = useState<Record<string, SolutionDetail>>({});
    const [loadingActions, setLoadingActions] = useState<Record<string, boolean>>({});
    const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

    // Custom URL management
    const customUrls = useMemo(() => {
        const setting = settings.find(s => s.key === 'SOLUTION_CUSTOM_URLS');
        if (setting?.value) {
            try {
                return JSON.parse(setting.value) as Record<string, string>;
            } catch {
                // ignore
            }
        }
        return {} as Record<string, string>;
    }, [settings]);

    const saveCustomUrl = useCallback(async (componentId: string, url: string) => {
        const newUrls = { ...customUrls };
        if (url.trim()) {
            newUrls[componentId] = url.trim();
        } else {
            delete newUrls[componentId];
        }
        try {
            await saveSetting({
                key: 'SOLUTION_CUSTOM_URLS',
                value: JSON.stringify(newUrls),
                category: 'custom',
                isSecret: false,
            });
            toast.success(url.trim() ? t.solutions.installed.custom_url_saved : t.solutions.installed.custom_url_removed);
        } catch {
            toast.error(t.common.operation_failed);
        }
    }, [customUrls, saveSetting, toast, t]);

    // Load details for installed solutions
    useEffect(() => {
        solutions.forEach(async (sol) => {
            try {
                const detail = await getSolutionDetail(sol.id);
                setDetails(prev => ({ ...prev, [sol.id]: detail }));
            } catch {
                // ignore
            }
        });
    }, [solutions, getSolutionDetail]);

    const handleAction = useCallback(async (id: string, action: string) => {
        setLoadingActions(prev => ({ ...prev, [id]: true }));
        try {
            const result = await performAction(id, action);
            toast.success(result.message || t.common.operation_success);
            onRefresh();
            // Refresh detail
            const detail = await getSolutionDetail(id);
            setDetails(prev => ({ ...prev, [id]: detail }));
        } catch {
            toast.error(t.common.operation_failed);
        } finally {
            setLoadingActions(prev => ({ ...prev, [id]: false }));
        }
    }, [performAction, getSolutionDetail, onRefresh, toast, t]);

    const handleUninstall = useCallback(async (sol: SolutionInfo) => {
        const confirmed = await confirm(
            t.solutions.installed.uninstall_confirm.replace('{name}', sol.name),
            { destructive: true }
        );
        if (!confirmed) return;

        setLoadingActions(prev => ({ ...prev, [sol.id]: true }));
        try {
            await uninstall(sol.id);
            toast.success(t.common.operation_success);
            onRefresh();
        } catch {
            toast.error(t.common.operation_failed);
        } finally {
            setLoadingActions(prev => ({ ...prev, [sol.id]: false }));
        }
    }, [confirm, uninstall, onRefresh, toast, t]);

    const handleCopyUrl = useCallback(async (url: string, solId: string) => {
        try {
            await navigator.clipboard.writeText(url);
            setCopiedUrl(solId);
            setTimeout(() => setCopiedUrl(null), 2000);
        } catch { /* ignore */ }
    }, []);

    const handleUpdatePaths = useCallback(async (id: string, mediaPath: string, downloadsPath: string) => {
        try {
            await updatePaths(id, mediaPath, downloadsPath);
            toast.success(t.common.operation_success);
            // Refresh detail
            const detail = await getSolutionDetail(id);
            setDetails(prev => ({ ...prev, [id]: detail }));
        } catch {
            toast.error(t.common.operation_failed);
        }
    }, [updatePaths, getSolutionDetail, toast, t]);

    if (solutions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Layers className="w-12 h-12 text-gray-600 mb-4" />
                <h3 className="text-base font-semibold text-gray-400">{t.solutions.installed.no_deployments}</h3>
                <p className="text-sm text-gray-500 mt-1">{t.solutions.installed.no_deployments_desc}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <ConfirmDialog />
            {solutions.map(sol => (
                <SolutionCard
                    key={sol.id}
                    sol={sol}
                    detail={details[sol.id]}
                    isLoading={loadingActions[sol.id] || false}
                    copiedUrl={copiedUrl}
                    t={t}
                    onAction={handleAction}
                    onUninstall={handleUninstall}
                    onCopyUrl={handleCopyUrl}
                    onUpdatePaths={handleUpdatePaths}
                    customUrls={customUrls}
                    onSaveCustomUrl={saveCustomUrl}
                />
            ))}
        </div>
    );
}

// Extracted card to keep the main component clean and allow useMemo per-card
function SolutionCard({
    sol, detail, isLoading, copiedUrl, t,
    onAction, onUninstall, onCopyUrl, onUpdatePaths,
    customUrls, onSaveCustomUrl,
}: {
    sol: SolutionInfo;
    detail: SolutionDetail | undefined;
    isLoading: boolean;
    copiedUrl: string | null;
    t: ReturnType<typeof import('@/hooks/useTranslation').useTranslation>['t'];
    onAction: (id: string, action: string) => void;
    onUninstall: (sol: SolutionInfo) => void;
    onCopyUrl: (url: string, id: string) => void;
    onUpdatePaths: (id: string, mediaPath: string, downloadsPath: string) => Promise<void>;
    customUrls: Record<string, string>;
    onSaveCustomUrl: (componentId: string, url: string) => Promise<void>;
}) {
    const deployment = detail?.deployment;
    const components: DeployedComponent[] = deployment?.components || [];
    const colors = statusColors[sol.status] || statusColors.stopped;

    // Find primary component (first core component in definition)
    const coreComponent = useMemo(() => {
        if (!detail?.definition) return null;
        return detail.definition.components.find(c => c.tier === 'core') || null;
    }, [detail]);

    const primaryUrl = useMemo(() => {
        if (!coreComponent || !deployment) return null;
        // Custom URL takes priority
        if (customUrls[coreComponent.id]) return customUrls[coreComponent.id];
        const deployed = deployment.components.find(c => c.componentId === coreComponent.id);
        return deployed?.webUIUrl || null;
    }, [coreComponent, deployment, customUrls]);

    // Build port map for setup guide (deployed + external)
    const setupSteps = useMemo(() => {
        const guide = getSetupGuide(sol.id);
        if (!guide || !deployment) return [];

        const portMap = new Map<string, number>();
        const webUIUrlMap = new Map<string, string>();
        deployment.components.forEach(c => {
            portMap.set(c.componentId, c.port);
            if (c.webUIUrl) webUIUrlMap.set(c.componentId, c.webUIUrl);
        });
        detail?.externalContainers?.forEach(c => {
            if (c.port) portMap.set(c.componentId, c.port);
        });

        const customUrlMap = new Map<string, string>(Object.entries(customUrls));
        return resolveSetupGuide(guide, portMap, webUIUrlMap, customUrlMap);
    }, [sol.id, deployment, detail?.externalContainers, customUrls]);

    // Custom URL editing state
    const [editUrlModal, setEditUrlModal] = useState<{ componentId: string; componentName: string } | null>(null);
    const [editUrlInput, setEditUrlInput] = useState('');

    const openEditUrlModal = (componentId: string, componentName: string) => {
        setEditUrlModal({ componentId, componentName });
        setEditUrlInput(customUrls[componentId] || '');
    };

    const handleSaveCustomUrl = async () => {
        if (!editUrlModal) return;
        await onSaveCustomUrl(editUrlModal.componentId, editUrlInput);
        setEditUrlModal(null);
        setEditUrlInput('');
    };

    // Path editing state
    const [editingPaths, setEditingPaths] = useState(false);
    const [editMediaPath, setEditMediaPath] = useState('');
    const [editDownloadsPath, setEditDownloadsPath] = useState('');
    const [savingPaths, setSavingPaths] = useState(false);

    const startEditPaths = () => {
        if (!deployment) return;
        setEditMediaPath(deployment.mediaPath);
        setEditDownloadsPath(deployment.downloadsPath);
        setEditingPaths(true);
    };

    const cancelEditPaths = () => {
        setEditingPaths(false);
    };

    const saveEditPaths = async () => {
        if (!deployment) return;
        if (editMediaPath === deployment.mediaPath && editDownloadsPath === deployment.downloadsPath) {
            setEditingPaths(false);
            return;
        }
        setSavingPaths(true);
        try {
            await onUpdatePaths(sol.id, editMediaPath, editDownloadsPath);
            setEditingPaths(false);
        } finally {
            setSavingPaths(false);
        }
    };

    return (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
            {/* Solution Header */}
            <div className="px-6 py-4 border-b border-white/[0.06]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center overflow-hidden">
                            <img src={getSolutionIcon(sol.icon)} alt={sol.name} className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-white">{sol.name}</h3>
                            <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md ${colors.bg} mt-0.5`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${colors.dot} ${sol.status === 'running' ? 'animate-pulse' : ''}`} />
                                <span className={`text-xs font-medium ${colors.text}`}>
                                    {sol.status === 'partial' && components.length > 0
                                        ? t.solutions.status.partial_detail
                                            .replace('{running}', String(components.filter(c => c.status === 'running').length))
                                            .replace('{total}', String(components.length))
                                        : (t.solutions.status[sol.status as keyof typeof t.solutions.status] || sol.status)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onAction(sol.id, 'start_all')}
                            disabled={isLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-medium transition-all disabled:opacity-50"
                        >
                            <Play className="w-3 h-3" />
                            {t.solutions.installed.start_all}
                        </button>
                        <button
                            onClick={() => onAction(sol.id, 'stop_all')}
                            disabled={isLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] text-gray-400 hover:bg-white/[0.08] text-xs font-medium transition-all disabled:opacity-50"
                        >
                            <Square className="w-3 h-3" />
                            {t.solutions.installed.stop_all}
                        </button>
                        <button
                            onClick={() => onAction(sol.id, 'update_all')}
                            disabled={isLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] text-gray-400 hover:bg-white/[0.08] text-xs font-medium transition-all disabled:opacity-50"
                        >
                            <RefreshCw className="w-3 h-3" />
                            {t.solutions.installed.update_all}
                        </button>
                        <button
                            onClick={() => onUninstall(sol)}
                            disabled={isLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-all disabled:opacity-50"
                        >
                            <Trash2 className="w-3 h-3" />
                            {t.solutions.installed.uninstall}
                        </button>
                    </div>
                </div>
            </div>

            {/* Primary URL + Storage Info */}
            {deployment && (
                <div className="px-6 py-3 border-b border-white/[0.04]">
                    <div className="flex items-center gap-6 text-xs flex-wrap">
                        {primaryUrl && (
                            <div className="flex items-center gap-2">
                                <Globe className="w-3.5 h-3.5 text-blue-400" />
                                <span className="text-gray-500">{t.solutions.installed.primary_url}:</span>
                                <span className="text-blue-400 font-mono">{primaryUrl}</span>
                                <button
                                    onClick={() => onCopyUrl(primaryUrl, sol.id)}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-all"
                                >
                                    {copiedUrl === sol.id
                                        ? <Check className="w-3 h-3 text-emerald-400" />
                                        : <Copy className="w-3 h-3" />
                                    }
                                </button>
                                <a
                                    href={primaryUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-all"
                                >
                                    <ExternalLink className="w-3 h-3" />
                                </a>
                                {coreComponent && (
                                    <button
                                        onClick={() => openEditUrlModal(coreComponent.id, coreComponent.name)}
                                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-all"
                                        title={t.solutions.installed.custom_url}
                                    >
                                        <Link2 className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        )}
                        {!editingPaths && (
                            <>
                                <Link
                                    href={`/files?tab=files&path=${encodeURIComponent(deployment.mediaPath)}`}
                                    className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 transition-colors text-xs"
                                >
                                    <FolderOpen className="w-3.5 h-3.5" />
                                    <span>{t.solutions.installed.media_path}:</span>
                                    <span className="text-gray-400 font-mono">{deployment.mediaPath}</span>
                                </Link>
                                <Link
                                    href={`/files?tab=files&path=${encodeURIComponent(deployment.downloadsPath)}`}
                                    className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 transition-colors text-xs"
                                >
                                    <FolderOpen className="w-3.5 h-3.5" />
                                    <span>{t.solutions.installed.downloads_path}:</span>
                                    <span className="text-gray-400 font-mono">{deployment.downloadsPath}</span>
                                </Link>
                                <button
                                    onClick={startEditPaths}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-all text-xs"
                                    title={t.solutions.installed.edit_paths}
                                >
                                    <Pencil className="w-3 h-3" />
                                </button>
                            </>
                        )}
                    </div>

                    {/* Inline Path Editor */}
                    {editingPaths && (
                        <div className="mt-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                            <div className="flex items-start gap-2.5 mb-3">
                                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-400/80 leading-relaxed">
                                    {t.solutions.installed.edit_paths_warning}
                                </p>
                            </div>
                            <div className="space-y-2.5">
                                <div className="flex items-center gap-3">
                                    <label className="text-xs text-gray-500 w-20 flex-shrink-0">{t.solutions.installed.media_path}</label>
                                    <input
                                        type="text"
                                        value={editMediaPath}
                                        onChange={e => setEditMediaPath(e.target.value)}
                                        className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-mono text-gray-300 focus:outline-none focus:border-blue-500/50"
                                    />
                                </div>
                                <div className="flex items-center gap-3">
                                    <label className="text-xs text-gray-500 w-20 flex-shrink-0">{t.solutions.installed.downloads_path}</label>
                                    <input
                                        type="text"
                                        value={editDownloadsPath}
                                        onChange={e => setEditDownloadsPath(e.target.value)}
                                        className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-mono text-gray-300 focus:outline-none focus:border-blue-500/50"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center justify-end gap-2 mt-3">
                                <button
                                    onClick={cancelEditPaths}
                                    disabled={savingPaths}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] text-gray-400 hover:bg-white/[0.08] text-xs font-medium transition-all disabled:opacity-50"
                                >
                                    <X className="w-3 h-3" />
                                    {t.common.cancel}
                                </button>
                                <button
                                    onClick={saveEditPaths}
                                    disabled={savingPaths || (!editMediaPath.trim() || !editDownloadsPath.trim())}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-xs font-medium transition-all disabled:opacity-50"
                                >
                                    {savingPaths ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                    {t.common.save}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Error Summary Banner */}
            {components.some(c => c.status === 'error') && (
                <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-red-500/[0.06] border border-red-500/[0.12]">
                    <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-red-400 mb-1.5">{t.solutions.installed.error_title}</p>
                            {components.filter(c => c.status === 'error').map(c => (
                                <p key={c.componentId} className="text-xs text-red-400/70 leading-relaxed">
                                    <span className="font-medium text-red-400">{c.name}</span>
                                    {c.error && <span className="ml-1">— {c.error}</span>}
                                </p>
                            ))}
                        </div>
                        <button
                            onClick={() => onAction(sol.id, 'retry_failed')}
                            disabled={isLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-all disabled:opacity-50 flex-shrink-0"
                        >
                            <RotateCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                            {t.solutions.installed.retry_failed}
                        </button>
                    </div>
                </div>
            )}

            {/* Setup Guide */}
            {setupSteps.length > 0 && (
                <SetupGuidePanel solutionId={sol.id} steps={setupSteps} />
            )}

            {/* Components */}
            <div className="p-6">
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">{t.solutions.installed.components}</h4>
                <div className="space-y-2">
                    {components.map(comp => (
                        <SolutionComponentCard
                            key={comp.componentId}
                            component={comp}
                            customUrl={customUrls[comp.componentId]}
                            onEditUrl={() => openEditUrlModal(comp.componentId, comp.name)}
                        />
                    ))}
                    {components.length === 0 && (
                        <div className="text-sm text-gray-500 py-4 text-center">
                            {t.common.loading}
                        </div>
                    )}
                </div>
            </div>

            {/* External Containers (Related Services) */}
            {detail?.externalContainers && detail.externalContainers.length > 0 && (
                <div className="px-6 pb-6">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">{t.solutions.installed.related_services}</h4>
                    <div className="space-y-2">
                        {detail.externalContainers.map((ext: ExternalContainer) => (
                            <ExternalContainerCard key={ext.componentId} container={ext} />
                        ))}
                    </div>
                </div>
            )}

            {/* Custom URL Edit Modal */}
            {editUrlModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#141416] shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-white/[0.08] flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold tracking-tight text-white">{t.solutions.installed.custom_url}</h2>
                                <p className="text-xs text-gray-500 mt-1">{editUrlModal.componentName}</p>
                            </div>
                            <button
                                onClick={() => { setEditUrlModal(null); setEditUrlInput(''); }}
                                className="p-2 rounded-lg hover:bg-white/[0.05] text-gray-400"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">
                                    {t.solutions.installed.custom_url_placeholder}
                                </label>
                                <input
                                    type="url"
                                    value={editUrlInput}
                                    onChange={e => setEditUrlInput(e.target.value)}
                                    placeholder="https://app.example.com"
                                    className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                                    autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveCustomUrl(); }}
                                />
                            </div>
                            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                                <p className="text-[11px] text-gray-400 leading-relaxed">
                                    {t.solutions.installed.custom_url_desc}
                                </p>
                            </div>
                        </div>
                        <div className="p-6 border-t border-white/[0.08] flex justify-end gap-3">
                            <button
                                onClick={() => { setEditUrlModal(null); setEditUrlInput(''); }}
                                className="px-4 py-2 rounded-lg bg-white/[0.04] text-gray-400 hover:bg-white/[0.08] text-sm font-medium transition-all"
                            >
                                {t.common.cancel}
                            </button>
                            <button
                                onClick={handleSaveCustomUrl}
                                className="px-4 py-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-sm font-medium transition-all"
                            >
                                {t.common.save}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
