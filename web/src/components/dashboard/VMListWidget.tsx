import { useVMManage } from "@/hooks/useVMManage";
import { Card } from "@/components/ui/Card";
import { AppWindow, Play, Square, Settings, Monitor, Plus, ChevronRight } from "lucide-react";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
import { useConfirm } from "@/hooks/useConfirm";

export function VMListWidget() {
    const { t } = useTranslation();
    const { confirm, ConfirmDialog: ConfirmDialogComponent } = useConfirm();
    const { vms, fetchVMs, performAction } = useVMManage();
    const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

    const handleAction = async (vmName: string, action: 'start' | 'stop') => {
        // 对于停止操作，需要二次确认
        if (action === 'stop') {
            const confirmed = await confirm({
                title: t.vms.monitor.stop_vm || '停止虚拟机',
                message: t.vms.monitor.stop_vm_confirm?.replace('{name}', vmName) || `确定要停止虚拟机 "${vmName}" 吗？`,
                confirmText: t.common.stop || '停止',
                cancelText: t.common.cancel || '取消',
                variant: 'warning'
            });
            if (!confirmed) return;
        }

        setActionLoading(prev => ({ ...prev, [vmName]: true }));
        try {
            await performAction(vmName, action);
            await fetchVMs(true);
        } catch (err) {
            console.error(`Error performing ${action} on VM ${vmName}:`, err);
        } finally {
            setActionLoading(prev => ({ ...prev, [vmName]: false }));
        }
    };

    // Limit displayed VMs for dashboard overview
    const MAX_DISPLAYED = 4;
    const displayedVMs = useMemo(() => vms.slice(0, MAX_DISPLAYED), [vms]);
    const hasMoreVMs = vms.length > MAX_DISPLAYED;

    return (
        <Card className="glass-card rounded-[32px] p-8 hover:border-white/10 transition-all duration-300">
            <div className="flex items-center justify-between mb-8">
                <Link 
                    href="/vms" 
                    className="flex items-center gap-4 cursor-pointer group transition-all duration-200 active:scale-[0.98]"
                    aria-label={`跳转到${t.sidebar.vms}页面`}
                >
                    <div className="p-2.5 bg-purple-500/10 rounded-xl border border-purple-500/10 group-hover:bg-purple-500/15 transition-all">
                        <AppWindow className="w-5 h-5 text-purple-500" strokeWidth={2} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white tracking-tight group-hover:text-purple-400 transition-colors">{t.sidebar.vms}</h3>
                        <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-[0.1em] mt-1.5">
                            {vms.length} {t.vms.monitor.virtual_machine} {t.vms.config.name}
                        </p>
                    </div>
                </Link>
                <button className="p-2 text-gray-500 hover:text-white transition-all hover:bg-white/5 rounded-lg active:scale-90">
                    <Plus className="w-5 h-5" strokeWidth={3} />
                </button>
            </div>



            <div className="flex flex-col gap-4">
                {vms.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-600 bg-white/[0.02] rounded-2xl border border-dashed border-white/5">
                        <Monitor className="w-8 h-8 mb-3 opacity-20" />
                        <span className="text-sm font-medium">{t.vms.no_vms}</span>
                    </div>
                ) : (
                    <>
                        {displayedVMs.map((vm) => (
                        <div key={vm.name} className="group flex items-center justify-between p-5 bg-white/[0.01] hover:bg-white/[0.03] rounded-2xl border border-white/5 hover:border-white/10 transition-all duration-300">
                            <Link 
                                href={`/vms?vm=${encodeURIComponent(vm.name)}`}
                                className="flex items-center gap-5 flex-1 min-w-0 cursor-pointer transition-all duration-200 active:scale-[0.98]"
                                aria-label={`查看虚拟机 ${vm.name} 详情`}
                            >
                                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all duration-500 ${vm.isRunning ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]' : 'bg-gray-600'}`} />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-3 mb-1.5">
                                        <span className="text-sm font-black text-white tracking-tight">{vm.name}</span>
                                        <span className="px-2 py-0.5 bg-white/5 text-[9px] text-gray-400 font-black rounded border border-white/5 uppercase tracking-widest">
                                            {vm.architecture}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                                        {vm.isRunning ? (vm.ipAddress || t.vms.monitor.waiting_for_ip) : t.common.stopped}
                                    </p>
                                </div>
                            </Link>

                            <div className="flex items-center gap-2 opacity-100 lg:opacity-30 lg:group-hover:opacity-100 transition-opacity">
                                <button
                                    className={`p-2.5 rounded-xl transition-all active:scale-90 ${vm.isRunning ? 'text-gray-500 hover:text-red-400 hover:bg-red-500/10' : 'text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10'}`}
                                    onClick={() => handleAction(vm.name, vm.isRunning ? 'stop' : 'start')}
                                    disabled={actionLoading[vm.name]}
                                >
                                    {actionLoading[vm.name] ? (
                                        <div className="w-4 h-4 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
                                    ) : vm.isRunning ? (
                                        <Square className="w-4 h-4 fill-current" />
                                    ) : (
                                        <Play className="w-4 h-4 fill-current" />
                                    )}
                                </button>
                                <button className="p-2.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-xl transition-all">
                                    <Settings className="w-4 h-4" />
                                </button>
                                {vm.isRunning && (
                                    <Link href={`/vms/${vm.name}/console`} target="_blank">
                                        <button className="p-2.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-xl transition-all border border-white/5 active:scale-90">
                                            <Monitor className="w-4 h-4" />
                                        </button>
                                    </Link>
                                )}
                            </div>
                        </div>
                        ))}
                        {hasMoreVMs && (
                            <Link
                                href="/vms"
                                className="mt-2 pt-4 border-t border-white/5 text-center"
                            >
                                <span className="text-xs text-gray-400 hover:text-white transition-colors inline-flex items-center gap-1.5">
                                    {t.vms.view_all || "查看全部"} ({vms.length})
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </span>
                            </Link>
                        )}
                    </>
                )}
            </div>

            {/* Global Confirm Dialog for stop actions */}
            <ConfirmDialogComponent />
        </Card>
    );
}
