"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useTranslation } from "@/hooks/useTranslation";
import { useToast } from "@/hooks/useToast";
import { VNCConsole } from '@/components/vms/VNCConsole';
import VMManage from '@/components/vms/VMManage';
import { VMCreateWizard } from '@/components/vms/VMCreateWizard';
import { PageLayout, Button, Card, ConfirmDialog, Tabs, Skeleton } from "@/components/ui";
import { Badge } from '@/components/ui/Badge';
import { Info, ToyBrick, Trash2, AlertTriangle, Edit, LayoutGrid, List } from 'lucide-react';
import EnvironmentGuard from '@/components/EnvironmentGuard';
import { useVMManage, VMServiceItem } from '@/hooks/useVMManage';
import { useConfirm } from '@/hooks/useConfirm';
import VMCommunity, { WizardInitialData } from '@/components/VMCommunity';
import { useLayoutPreference, LayoutMode } from "@/hooks/useLayoutPreference";

export default function VMsPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const { vms, loading, isRefreshing, fetchVMs, createVM, importVM, performAction: performVMAction, deleteVM } = useVMManage();
    const { t } = useTranslation();
    const toast = useToast();
    const { confirm, ConfirmDialog: ConfirmDialogComponent } = useConfirm();
    const [view, setView] = useState<"monitor" | "manage" | "community">("monitor");
    const [initialWizardData, setInitialWizardData] = useState<WizardInitialData | undefined>(undefined);
    const [actioningVM, setActioningVM] = useState<string | null>(null);
    const [hasMounted, setHasMounted] = useState(false);
    const urlParamProcessed = useRef(false);

    useEffect(() => {
        setHasMounted(true);
    }, []);

    const [importPath, setImportPath] = useState('');
    const [showImport, setShowImport] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [activeConsole, setActiveConsole] = useState<string | null>(null);
    const [initialVMName, setInitialVMName] = useState<string | undefined>(undefined);
    const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; vmName: string | null }>({ isOpen: false, vmName: null });
    const [isDeleting, setIsDeleting] = useState(false);

    // Layout preference: default to 'list' on desktop (lg+), 'grid' on mobile/tablet
    const getDefaultLayout = (): LayoutMode => {
        if (typeof window === 'undefined') return 'list';
        return window.innerWidth >= 1024 ? 'list' : 'grid';
    };
    const [layoutMode, setLayoutMode] = useLayoutPreference('vms', getDefaultLayout);

    // Memoize VM counts to avoid recalculating on every render
    const vmStats = useMemo(() => {
        const running = vms.filter(vm => vm.isRunning).length;
        const stopped = vms.filter(vm => !vm.isRunning).length;
        const hasRunning = vms.some(vm => vm.isRunning);
        return { running, stopped, hasRunning };
    }, [vms]);

    // URL parameter handling for initial load
    useEffect(() => {
        const vmParam = searchParams.get('vm');
        if (vmParam && vms.length > 0 && !urlParamProcessed.current) {
            const vm = vms.find(v => v.name === vmParam || v.directoryName === vmParam);
            if (vm) {
                setView("manage");
                setInitialVMName(vm.name);
                urlParamProcessed.current = true;
            }
        }

        const tab = searchParams.get('tab');
        if (tab && !urlParamProcessed.current) {
            if (['monitor', 'manage', 'community'].includes(tab)) {
                setView(tab as typeof view);
                urlParamProcessed.current = true;
            }
        }
    }, [searchParams, vms]);

    const handleAction = async (vm: VMServiceItem, action: 'start' | 'stop') => {
        // 对于停止操作，需要二次确认
        if (action === 'stop') {
            const confirmed = await confirm({
                title: t.vms.monitor.stop_vm || '停止虚拟机',
                message: t.vms.monitor.stop_vm_confirm?.replace('{name}', vm.name) || `确定要停止虚拟机 "${vm.name}" 吗？`,
                confirmText: t.common.stop || '停止',
                cancelText: t.common.cancel || '取消',
                variant: 'warning'
            });
            if (!confirmed) return;
        }

        setActioningVM(vm.name);
        try {
            // 使用 directoryName 调用 API
            await performVMAction(vm.directoryName, action);
            fetchVMs(true); // Silent refresh after action
            const actionText = action === 'start' ? '启动' : '停止';
            toast.success(t.vms.monitor.vm_actioned_successfully.replace('{action}', actionText));
        } catch (e) {
            const actionText = action === 'start' ? '启动' : '停止';
            toast.error(t.vms.monitor.failed_to_action_vm.replace('{action}', actionText) + ': ' + e);
        }
        setActioningVM(null);
    };

    const handleDeleteVM = async () => {
        if (!deleteConfirm.vmName) return;

        setIsDeleting(true);
        try {
            await deleteVM(deleteConfirm.vmName);
            toast.success('虚拟机已删除');
            await fetchVMs();
            setDeleteConfirm({ isOpen: false, vmName: null });
        } catch (e) {
            toast.error(`删除失败: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setIsDeleting(false);
        }
    };

    if (!hasMounted) return null; // Use null to match server pre-render exactly

    return (
        <PageLayout>
            <EnvironmentGuard
                feature="qemu"
                title={t.dashboard.services["utm-vms"].name}
                description={t.dashboard.services["utm-vms"].description}
            >
                {/* Tabs and Action Buttons Section */}
                <Tabs
                    tabs={[
                        { id: "monitor", label: t.vms.tabs.monitor },
                        { id: "manage", label: t.vms.tabs.manage },
                        { id: "community", label: t.vms.tabs.community },
                    ]}
                    activeTab={view}
                    onChange={(id) => {
                        setView(id as typeof view);
                        if (id === "monitor") setInitialVMName(undefined);
                    }}
                    paramName="tab"
                    variant="purple"
                    actions={
                        <div className="flex items-center gap-3">
                            <Button
                                onClick={() => {
                                    setInitialWizardData(undefined);
                                    setShowCreate(true);
                                }}
                                variant="primary"
                                size="sm"
                            >
                                {t.vms.create_vm}
                            </Button>
                            <Button
                                onClick={() => setShowImport(true)}
                                variant="secondary"
                                size="sm"
                            >
                                {t.vms.import_vm}
                            </Button>
                        </div>
                    }
                />

                <div className="flex-1 overflow-y-auto no-scrollbar p-10">
                    {view === "manage" ? (
                        <VMManage
                            initialVMName={initialVMName}
                            onCreate={() => {
                                setInitialWizardData(undefined);
                                setShowCreate(true);
                            }}
                        />
                    ) : view === "community" ? (
                        <VMCommunity
                            onInstall={(data) => {
                                setInitialWizardData(data);
                                setShowCreate(true);
                            }}
                        />
                    ) : (
                        <div className="space-y-6">
                            {loading && !isRefreshing && vms.length === 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {[1, 2, 3].map((i) => (
                                        <Card key={i} className="p-6 bg-white/[0.02] border border-white/5">
                                            <div className="flex items-center gap-4 mb-4">
                                                <Skeleton variant="circular" className="w-10 h-10" animation="pulse" />
                                                <div className="flex-1">
                                                    <Skeleton className="h-4 w-2/3 mb-2" />
                                                    <Skeleton className="h-3 w-1/3" />
                                                </div>
                                            </div>
                                            <div className="space-y-4">
                                                <Skeleton className="h-4 w-20 rounded-full" />
                                                <div className="grid grid-cols-2 gap-4">
                                                    <Skeleton className="h-8 w-full" />
                                                    <Skeleton className="h-8 w-full" />
                                                </div>
                                                <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                                                    <Skeleton className="w-8 h-8 rounded-lg" />
                                                    <Skeleton className="w-8 h-8 rounded-lg" />
                                                    <Skeleton className="w-8 h-8 rounded-lg" />
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            ) : vms.length === 0 ? (
                                <div className="rounded-3xl border border-white/5 bg-white/5 p-12 text-center backdrop-blur-xl border-dashed">
                                    <p className="text-gray-400">{t.vms.no_vms}</p>
                                </div>
                            ) : (
                                <>
                                    {/* Summary Bar with Layout Toggle */}
                                    <div className="rounded-2xl bg-white/[0.02] border border-white/5 backdrop-blur-md p-4 mb-6">
                                        <div className="flex items-center justify-between gap-4">
                                            {/* 左侧：状态统计组 */}
                                            <div className="flex items-center gap-4 sm:gap-6">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-2.5 h-2.5 rounded-full ${vmStats.hasRunning ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-gray-500'}`} />
                                                    <span className="text-sm font-bold text-white">{vmStats.running}</span>
                                                    <span className="text-xs text-gray-500 uppercase tracking-wider">{t.vms.status?.running || '运行中'}</span>
                                                </div>
                                                {vmStats.stopped > 0 && (
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2.5 h-2.5 rounded-full bg-gray-500" />
                                                        <span className="text-sm font-bold text-white">{vmStats.stopped}</span>
                                                        <span className="text-xs text-gray-500 uppercase tracking-wider">{t.vms.status?.stopped || '已停止'}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* 右侧：操作组 */}
                                            <div className="flex items-center gap-2">
                                                {/* Layout Toggle */}
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
                                        {vms.map((vm) => (
                                            <Card key={vm.uuid} className="p-5 bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all group">
                                                <div className="flex items-start justify-between mb-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${vm.isRunning ? 'bg-brand-purple/10 text-brand-purple border border-brand-purple/20 shadow-[0_0_12px_rgba(168,85,247,0.2)]' : 'bg-gray-500/10 text-gray-400 border border-white/5'}`}>
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                                        </div>
                                                        <div>
                                                            <h3 className="text-sm font-bold text-white uppercase tracking-tight">{vm.name}</h3>
                                                            <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mt-0.5">{vm.architecture}</p>
                                                        </div>
                                                    </div>
                                                    <Badge variant={vm.isRunning ? 'emerald' : 'gray'} pulse={vm.isRunning}>
                                                        {vm.isRunning ? t.vms.monitor.running : t.vms.monitor.stopped}
                                                    </Badge>
                                                </div>

                                                <div className="space-y-4">
                                                    {/* Stats for Running */}
                                                    {vm.isRunning && (
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="space-y-1">
                                                                <div className="flex justify-between text-[10px] font-mono text-gray-500">
                                                                    <span>CPU</span>
                                                                    <span>{vm.cpuUsage || "0%"}</span>
                                                                </div>
                                                                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-blue-500" style={{ width: vm.cpuUsage || '0%' }} />
                                                                </div>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <div className="flex justify-between text-[10px] font-mono text-gray-500">
                                                                    <span>MEM</span>
                                                                    <span>{vm.memoryUsage || "0%"}</span>
                                                                </div>
                                                                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-purple-500" style={{ width: vm.memoryUsage || '0%' }} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Network Info */}
                                                    {vm.isRunning && (vm.ipAddress || vm.macAddress) && (
                                                        <div className="px-3 py-2 bg-black/20 rounded-xl border border-white/5">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] font-black text-gray-500 uppercase">Network</span>
                                                                <span className="text-xs font-mono text-purple-400 font-bold">{vm.ipAddress || vm.macAddress}</span>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Action Bar */}
                                                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    setInitialVMName(vm.directoryName);
                                                                    setView("manage");
                                                                    const params = new URLSearchParams(searchParams.toString());
                                                                    params.delete('vm');
                                                                    router.replace(`${pathname}${params.toString() ? '?' + params.toString() : ''}`);
                                                                }}
                                                                className="px-3 py-1.5 rounded-lg bg-white/5 text-gray-300 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all"
                                                            >
                                                                {t.vms.edit}
                                                            </button>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {vm.isRunning && vm.vncPort && (
                                                                <button
                                                                    onClick={() => setActiveConsole(vm.directoryName)}
                                                                    className="p-2 rounded-lg bg-brand-purple/10 text-brand-purple border border-brand-purple/20 hover:bg-brand-purple hover:text-white transition-all"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                                                </button>
                                                            )}
                                                            <button
                                                                disabled={actioningVM === vm.name}
                                                                onClick={() => handleAction(vm, vm.isRunning ? 'stop' : 'start')}
                                                                className={`p-2 rounded-lg transition-all ${vm.isRunning
                                                                    ? 'text-red-500 hover:bg-red-500/10'
                                                                    : 'text-emerald-500 hover:bg-emerald-500/10'}`}
                                                            >
                                                                {actioningVM === vm.name ? (
                                                                    <div className="w-4 h-4 border-2 rounded-full animate-spin border-white/10 border-t-white/50" />
                                                                ) : vm.isRunning ? (
                                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" /></svg>
                                                                ) : (
                                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </Card>
                                        ))}
                                    </div>
                                    )}

                                    {/* List View (Table) */}
                                    {layoutMode === 'list' && (
                                    <div className="bg-white/[0.02] border border-white/5 rounded-3xl backdrop-blur-md overflow-hidden">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="border-b border-white/5 text-[10px] text-gray-500 font-bold uppercase tracking-widest bg-white/[0.01]">
                                                    <th className="px-6 py-4 rounded-tl-3xl">{t.vms.monitor.virtual_machine}</th>
                                                    <th className="px-6 py-4">{t.vms.monitor.status}</th>
                                                    <th className="px-6 py-4 relative group/header">
                                                        <div className="flex items-center gap-1.5 transition-colors cursor-help">
                                                            <span className="group-hover/header:text-purple-400 transition-colors">{t.vms.cpu_load}</span>
                                                            <div className="relative group/tooltip">
                                                                <Info size={12} className="text-gray-500 group-hover/header:text-purple-400 group-hover/header:scale-110 transition-all flex-shrink-0" />
                                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-zinc-900 border border-white/10 rounded-lg text-[11px] text-zinc-300 font-medium whitespace-nowrap opacity-0 group-hover/header:opacity-100 pointer-events-none transition-all duration-200 z-50 shadow-xl">
                                                                    {t.vms.cpu_load_desc}
                                                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-zinc-900" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </th>
                                                    <th className="px-6 py-4 relative group/header">
                                                        <div className="flex items-center gap-1.5 transition-colors cursor-help">
                                                            <span className="group-hover/header:text-purple-400 transition-colors">{t.vms.mem_usage}</span>
                                                            <div className="relative group/tooltip">
                                                                <Info size={12} className="text-gray-500 group-hover/header:text-purple-400 group-hover/header:scale-110 transition-all flex-shrink-0" />
                                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-zinc-900 border border-white/10 rounded-lg text-[11px] text-zinc-300 font-medium whitespace-nowrap opacity-0 group-hover/header:opacity-100 pointer-events-none transition-all duration-200 z-50 shadow-xl">
                                                                    {t.vms.mem_usage_desc}
                                                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-zinc-900" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </th>
                                                    <th className="px-6 py-4">{t.vms.monitor.network}</th>
                                                    <th className="px-6 py-4 text-right rounded-tr-3xl">{t.vms.monitor.actions}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {vms.map((vm) => {
                                                    return (
                                                        <tr key={vm.uuid} className="group hover:bg-white/[0.02] transition-colors duration-200">
                                                            <td className="px-6 py-4">
                                                                <div className="flex items-center gap-4">
                                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${vm.isRunning ? 'bg-brand-purple/10 text-brand-purple border border-brand-purple/20 shadow-[0_0_12px_rgba(168,85,247,0.2)]' : 'bg-gray-500/10 text-gray-400 border border-white/5'}`}>
                                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                                                    </div>
                                                                    <div>
                                                                        <button
                                                                            onClick={() => {
                                                                                setInitialVMName(vm.directoryName);
                                                                                setView("manage");
                                                                                // 清除 URL 参数
                                                                                const params = new URLSearchParams(searchParams.toString());
                                                                                params.delete('vm');
                                                                                router.replace(`${pathname}${params.toString() ? '?' + params.toString() : ''}`);
                                                                            }}
                                                                            className="text-sm font-bold text-blue-400 hover:text-blue-300 leading-tight uppercase tracking-tight transition-colors flex items-center gap-1.5 group/name hover:underline cursor-pointer"
                                                                            title={t.vms.click_to_edit}
                                                                        >
                                                                            <span>{vm.name}</span>
                                                                            <Edit size={12} className="opacity-0 group-hover/name:opacity-100 transition-opacity flex-shrink-0" />
                                                                        </button>
                                                                        <p className="text-[10px] font-mono text-gray-500 tracking-wider mt-0.5 uppercase">{vm.architecture}</p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <Badge variant={vm.isRunning ? 'emerald' : 'gray'} pulse={vm.isRunning}>
                                                                    {vm.isRunning ? t.vms.monitor.running : t.vms.monitor.stopped}
                                                                </Badge>
                                                                {vm.isRunning && vm.configChanged && (
                                                                    <div className="relative group/config mt-1">
                                                                        <div className="flex items-center gap-1.5 text-orange-400 cursor-help transition-colors hover:text-orange-300">
                                                                            <AlertTriangle size={12} className="shrink-0" />
                                                                            <span className="text-[10px] font-bold uppercase tracking-wider">{t.vms.monitor.outdated}</span>
                                                                        </div>
                                                                        <div className="absolute top-full left-0 mt-2 px-3 py-2 bg-zinc-900 border border-orange-500/30 rounded-lg text-[11px] text-zinc-300 font-medium min-w-[180px] opacity-0 group-hover/config:opacity-100 pointer-events-none transition-all duration-200 z-50 shadow-2xl backdrop-blur-md">
                                                                            <div className="flex items-center gap-2 mb-1.5 text-orange-400 pb-1.5 border-b border-white/5">
                                                                                <AlertTriangle size={12} />
                                                                                <span className="font-bold uppercase tracking-wider text-[10px]">{t.vms.monitor.pending_changes}</span>
                                                                            </div>
                                                                            <ul className="space-y-1">
                                                                                {vm.configDifferences?.map((diff, idx) => (
                                                                                    <li key={idx} className="flex items-start gap-2">
                                                                                        <div className="w-1 h-1 rounded-full bg-orange-500/50 mt-1.5 shrink-0" />
                                                                                        <span>{diff}</span>
                                                                                    </li>
                                                                                ))}
                                                                                {!vm.configDifferences && <li>{t.vms.monitor.configuration_changed}</li>}
                                                                            </ul>
                                                                            <div className="mt-2 pt-1.5 border-t border-white/5 text-[9px] text-gray-500 italic">
                                                                                {t.vms.monitor.restart_vm_apply}
                                                                            </div>
                                                                            <div className="absolute bottom-full left-4 border-8 border-transparent border-b-zinc-900" />
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="flex flex-col gap-1.5 min-w-[100px]">
                                                                    <div className="flex justify-between text-[10px] font-mono text-gray-500">
                                                                        <span>{vm.cpuUsage || "0%"}</span>
                                                                    </div>
                                                                    <div className="h-1 bg-white/5 rounded-full overflow-hidden" title={t.vms.cpu_load_desc}>
                                                                        <div
                                                                            className="h-full bg-blue-500 transition-all duration-500 ease-out"
                                                                            style={{ width: vm.isRunning ? (vm.cpuUsage || '0%') : '0%' }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="flex flex-col gap-1.5 min-w-[100px]">
                                                                    <div className="flex justify-between text-[10px] font-mono text-gray-500">
                                                                        <span>{vm.memoryUsage || "0%"}</span>
                                                                    </div>
                                                                    <div className="h-1 bg-white/5 rounded-full overflow-hidden" title={t.vms.mem_usage_desc}>
                                                                        <div
                                                                            className="h-full bg-purple-500/80 transition-all duration-500 ease-out"
                                                                            style={{ width: vm.isRunning ? (vm.memoryUsage || '0%') : '0%' }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="flex flex-col gap-1">
                                                                    {vm.isRunning && vm.ipAddress ? (
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[10px] font-bold text-gray-500 uppercase">IP</span>
                                                                            <span className="text-xs font-mono text-purple-400 font-bold">{vm.ipAddress}</span>
                                                                        </div>
                                                                    ) : vm.isRunning && vm.macAddress ? (
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[10px] font-bold text-gray-500 uppercase">MAC</span>
                                                                            <span className="text-[11px] font-mono text-gray-500">{vm.macAddress}</span>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-[10px] text-gray-600 font-mono">-</span>
                                                                    )}

                                                                    {vm.isRunning && vm.qgaVerified && (
                                                                        <div className="flex items-center gap-1.5 mt-1">
                                                                            <ToyBrick size={10} className="text-emerald-500" />
                                                                            <span className="text-[9px] font-bold text-emerald-500/80 uppercase tracking-wider">{t.vms.monitor.agent_active}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 text-right">
                                                                <div className="flex items-center justify-end gap-2">
                                                                    <button
                                                                        disabled={actioningVM === vm.name}
                                                                        onClick={() => handleAction(vm, vm.isRunning ? 'stop' : 'start')}
                                                                        className={`p-2 rounded-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${vm.isRunning
                                                                            ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white'
                                                                            : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white'}`}
                                                                    >
                                                                        {actioningVM === vm.name ? (
                                                                            <div className={`w-4 h-4 border-2 rounded-full animate-spin ${vm.isRunning
                                                                                ? 'border-red-500/30 border-t-red-500'
                                                                                : 'border-emerald-500/30 border-t-emerald-500'}`} />
                                                                        ) : vm.isRunning ? (
                                                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" /></svg>
                                                                        ) : (
                                                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                                                                        )}
                                                                    </button>

                                                                    {vm.isRunning && vm.vncPort && (
                                                                        <button
                                                                            onClick={() => setActiveConsole(vm.directoryName)}
                                                                            title={t.vms.monitor.open_web_console}
                                                                            className="p-2 rounded-lg bg-brand-purple/10 text-brand-purple border border-brand-purple/20 hover:bg-brand-purple hover:text-white transition-all active:scale-95"
                                                                        >
                                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            // 使用 directoryName 进行删除
                                                                            setDeleteConfirm({ isOpen: true, vmName: vm.directoryName });
                                                                        }}
                                                                        className="p-2 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all active:scale-95"
                                                                        title="删除虚拟机"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
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

                {
                    showCreate && (
                        <VMCreateWizard
                            initialData={initialWizardData}
                            onClose={() => {
                                setShowCreate(false);
                                setInitialWizardData(undefined);
                            }}
                            onCreate={async (config) => {
                                try {
                                    await createVM(
                                        config.name,
                                        config.arch,
                                        config.ram,
                                        config.cpuCount,
                                        config.diskSize,
                                        config.preset,
                                        config.uefi,
                                        config.networkMode,
                                        config.bridgeInterface,
                                        config.isoPath
                                    );
                                    setShowCreate(false);
                                    toast.success(t.vms.monitor.vm_created_successfully);
                                    fetchVMs();
                                } catch (error) {
                                    console.error(error);
                                    toast.error(t.vms.monitor.failed_to_create_vm + ': ' + error);
                                }
                            }}
                        />
                    )
                }

                {/* Import VM Modal */}
                {
                    showImport && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                            <Card className="w-full max-w-lg overflow-hidden shadow-2xl p-0">
                                <div className="p-6 border-b border-white/10 flex items-center justify-between">
                                    <h2 className="text-xl font-bold tracking-tight text-white">{t.vms.import_vm}</h2>
                                    <button onClick={() => setShowImport(false)} className="p-2 rounded-lg hover:bg-white/5 text-gray-400">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                                <form onSubmit={async (e) => {
                                    e.preventDefault();
                                    try {
                                        await importVM(importPath);
                                        setShowImport(false);
                                        setImportPath('');
                                        fetchVMs();
                                    } catch (error) {
                                        toast.error('Failed to import VM: ' + error);
                                    }
                                }} className="p-6 space-y-6">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">UTM 路径</label>
                                            <input
                                                required
                                                value={importPath}
                                                onChange={e => setImportPath(e.target.value)}
                                                placeholder="/Users/name/Documents/MyVM.utm"
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-colors"
                                            />
                                            <p className="text-xs text-gray-400 ml-1">Path to an existing .utm bundle</p>
                                        </div>
                                    </div>
                                    <div className="flex justify-end pt-4 gap-3">
                                        <Button
                                            type="button"
                                            onClick={() => setShowImport(false)}
                                            variant="secondary"
                                        >
                                            {t.common.cancel}
                                        </Button>
                                        <Button type="submit">
                                            导入
                                        </Button>
                                    </div>
                                </form>
                            </Card>
                        </div>
                    )
                }
            </EnvironmentGuard >

            {activeConsole && (
                <VNCConsole
                    vmName={activeConsole}
                    onClose={() => setActiveConsole(null)}
                />
            )
            }

            {/* Delete Confirmation Dialog */}
            <ConfirmDialog
                isOpen={deleteConfirm.isOpen}
                onClose={() => setDeleteConfirm({ isOpen: false, vmName: null })}
                onConfirm={handleDeleteVM}
                title="删除虚拟机"
                message={`确定要删除虚拟机 "${deleteConfirm.vmName}" 吗？\n\n此操作将：\n• 停止虚拟机（如果正在运行）\n• 删除虚拟机配置和磁盘文件\n• 提交删除操作到 Git（如果已配置同步）\n\n此操作不可撤销，所有数据将永久丢失。`}
                confirmText="删除"
                cancelText="取消"
                variant="danger"
                isLoading={isDeleting}
            />

            {/* Global Confirm Dialog for stop actions */}
            <ConfirmDialogComponent />
        </PageLayout >
    );
}
