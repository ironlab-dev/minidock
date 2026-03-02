"use client";

import { useState, useEffect, useRef } from 'react';
import { useVMManage, VMServiceItem, GitCommit } from '@/hooks/useVMManage';
import { useTranslation } from '@/hooks/useTranslation';
import { Editor } from '@/components/ui/Editor';
import { VMConfigEditor } from './VMConfigEditor';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DiffViewer } from '@/components/ui/DiffViewer';
import { Button } from '../ui';
import { Trash2, Info, Terminal, Copy, Check, AlertTriangle, FolderOpen, Disc } from 'lucide-react';
import Link from 'next/link';
import { useGitOps } from "@/hooks/useGitOps";
import { client } from '@/api/client';
import { useConfirm } from '@/hooks/useConfirm';
import { formatCode } from '@/lib/formatCode';

export default function VMManage({ initialVMName, onCreate }: { initialVMName?: string, onCreate?: () => void }) {
    const { vms, fetchVMs, performAction, getConfig, saveConfig, fetchHistory, fetchDiff, deleteVM } = useVMManage();
    const { vmBasePath } = useGitOps();
    const { t } = useTranslation();
    const { confirm, ConfirmDialog: ConfirmDialogComponent } = useConfirm();
    const [selectedVM, setSelectedVM] = useState<VMServiceItem | null>(null);
    const [configContent, setConfigContent] = useState('');
    const [originalConfig, setOriginalConfig] = useState('');
    const [activeEditorTab, setActiveEditorTab] = useState<'simple' | 'advanced'>('simple');
    const [isSaving, setIsSaving] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [vimMode, setVimMode] = useState(false);
    const [history, setHistory] = useState<GitCommit[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
    const [diffContent, setDiffContent] = useState('');
    const [showDiff, setShowDiff] = useState(false);
    const [statusMessage, setStatusMessage] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; vmName: string | null }>({ isOpen: false, vmName: null });
    const [isDeleting, setIsDeleting] = useState(false);
    const [hostVncStatus, setHostVncStatus] = useState<{ enabled: boolean; listening?: boolean; port?: number; processName?: string | null } | null>(null);
    const [networkMode, setNetworkMode] = useState<'user' | 'bridge' | null>(null);
    const [copiedSSH, setCopiedSSH] = useState(false);

    // Track if we've already processed the initialVMName to prevent re-selection on vms updates
    const hasProcessedInitialVM = useRef(false);
    const lastInitialVMName = useRef<string | undefined>(undefined);

    useEffect(() => {
        const checkHostVnc = async () => {
            try {
                const data = await client.get<{ enabled: boolean; port: number }>('/system/screensharing');
                setHostVncStatus(data);
            } catch (e) {
                console.error('Failed to check host VNC status', e);
            }
        };

        const savedVimMode = localStorage.getItem('minidock_vim_mode');
        if (savedVimMode !== null) {
            setVimMode(savedVimMode === 'true');
        }

        checkHostVnc();
        const timer = setInterval(checkHostVnc, 10000);
        return () => clearInterval(timer);
    }, [fetchVMs]);

    useEffect(() => {
        // Only process initialVMName if:
        // 1. It's provided and not empty
        // 2. We have VMs loaded
        // 3. Either we haven't processed it yet, OR it has changed from the last time
        // initialVMName 现在是 directoryName
        if (initialVMName && vms.length > 0) {
            const vm = vms.find(v => v.directoryName === initialVMName || v.name === initialVMName);
            if (vm && (!hasProcessedInitialVM.current || lastInitialVMName.current !== initialVMName)) {
                handleSelectVM(vm);
                hasProcessedInitialVM.current = true;
                lastInitialVMName.current = initialVMName;
            }
        } else if (!initialVMName) {
            // Reset the flag when initialVMName is cleared
            hasProcessedInitialVM.current = false;
            lastInitialVMName.current = undefined;
        }
    }, [initialVMName, vms]);

    // Sync selectedVM with latest vms state when vms updates
    useEffect(() => {
        if (selectedVM && vms.length > 0) {
            const updatedVM = vms.find(v => v.name === selectedVM.name);
            if (updatedVM) {
                // Only update if there are actual changes to avoid unnecessary re-renders
                if (updatedVM.isRunning !== selectedVM.isRunning ||
                    updatedVM.vncPort !== selectedVM.vncPort ||
                    updatedVM.ipAddress !== selectedVM.ipAddress ||
                    updatedVM.macAddress !== selectedVM.macAddress ||
                    updatedVM.cpuUsage !== selectedVM.cpuUsage ||
                    updatedVM.memoryUsage !== selectedVM.memoryUsage) {
                    setSelectedVM(updatedVM);
                }
            }
        }
    }, [vms]);

    const displayStatus = (text: string, type: 'success' | 'error' | 'info') => {
        setStatusMessage({ text, type });
        setTimeout(() => setStatusMessage(null), 5000);
    };

    const handleFormat = async () => {
        if (!configContent || activeEditorTab !== 'advanced') return;

        try {
            const result = await formatCode({
                language: 'xml',
                content: configContent,
            });

            if (result.success && result.formatted) {
                setConfigContent(result.formatted);
                displayStatus(t.common.format_success, 'success');
            } else {
                displayStatus(result.error || t.common.format_failed, 'error');
            }
        } catch (e) {
            console.error('Format error:', e);
            displayStatus(t.common.format_failed + ': ' + (e instanceof Error ? e.message : String(e)), 'error');
        }
    };

    const handleSelectVM = async (vm: VMServiceItem) => {
        setSelectedVM(vm);
        setIsActionLoading(true);
        try {
            // 使用 directoryName 而不是 name 来调用 API
            const config = await getConfig(vm.directoryName);
            setConfigContent(config);
            setOriginalConfig(config);

            // Parse network mode from config
            try {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(config, 'text/xml');
                const networkKey = Array.from(xmlDoc.querySelectorAll('key')).find(k => k.textContent === 'Network');
                if (networkKey) {
                    const networkDict = networkKey.nextElementSibling;
                    if (networkDict) {
                        const modeKey = Array.from(networkDict.querySelectorAll('key')).find(k => k.textContent === 'NetworkMode');
                        if (modeKey) {
                            const modeValue = modeKey.nextElementSibling?.textContent;
                            setNetworkMode(modeValue === 'bridge' ? 'bridge' : 'user');
                        } else {
                            setNetworkMode('user'); // Default
                        }
                    } else {
                        setNetworkMode('user'); // Default
                    }
                } else {
                    setNetworkMode('user'); // Default
                }
            } catch {
                setNetworkMode('user'); // Default on parse error
            }
        } catch {
            displayStatus("Failed to load VM config", 'error');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleSave = async () => {
        if (!selectedVM) return;
        setIsSaving(true);
        try {
            // 使用 directoryName 而不是 name 来调用 API
            await saveConfig(selectedVM.directoryName, configContent);
            setOriginalConfig(configContent);
            displayStatus("Configuration saved successfully", 'success');
            fetchVMs();
        } catch (e) {
            // 检查是否是 VM 运行时重命名的错误
            if (e instanceof Error && e.message.includes("Cannot rename VM while it is running")) {
                displayStatus(t.vms.monitor.cannot_rename_running, 'error');
            } else {
                displayStatus("Save failed: " + (e instanceof Error ? e.message : String(e)), 'error');
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleAction = async (action: 'start' | 'stop') => {
        if (!selectedVM) return;
        setIsActionLoading(true);
        try {
            await performAction(selectedVM.name, action);
            // Wait a bit for the backend to update the VM state
            await new Promise(resolve => setTimeout(resolve, 500));
            await fetchVMs();
            // The useEffect hook will automatically sync selectedVM with the updated vms state
            displayStatus(`VM ${action}ed successfully`, 'success');
        } catch (e) {
            displayStatus(`Failed to ${action} VM: ${e instanceof Error ? e.message : e}`, 'error');
        } finally {
            setIsActionLoading(false);
        }
    };

    const toggleVimMode = () => {
        const newMode = !vimMode;
        setVimMode(newMode);
        localStorage.setItem('minidock_vim_mode', String(newMode));
    };

    const handleDeleteVM = async () => {
        if (!deleteConfirm.vmName) return;

        setIsDeleting(true);
        try {
            await deleteVM(deleteConfirm.vmName);
            displayStatus("虚拟机已删除", 'success');

            // 如果删除的是当前选中的虚拟机，清除选择
            // deleteConfirm.vmName 现在是 directoryName
            if (selectedVM?.directoryName === deleteConfirm.vmName) {
                setSelectedVM(null);
                setConfigContent('');
                setOriginalConfig('');
            }

            // 刷新虚拟机列表
            await fetchVMs();
            setDeleteConfirm({ isOpen: false, vmName: null });
        } catch (e) {
            displayStatus("删除失败: " + (e instanceof Error ? e.message : String(e)), 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="flex flex-col h-full gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 overflow-x-auto no-scrollbar py-2">
                    {vms.map(vm => (
                        <button
                            key={vm.name}
                            onClick={() => handleSelectVM(vm)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap relative ${selectedVM?.directoryName === vm.directoryName ? 'bg-brand-purple text-white shadow-lg shadow-brand-purple/20' : 'bg-white/[0.03] text-gray-400 hover:text-white border border-white/5'}`}
                        >
                            <span className={`w-1.5 h-1.5 rounded-full ${vm.isRunning ? 'bg-green-500' : 'bg-red-500/50'}`}></span>
                            {vm.name}
                            {vm.isRunning && vm.configChanged && (
                                <AlertTriangle size={10} className="text-orange-400 shrink-0" />
                            )}
                        </button>
                    ))}
                    <button
                        onClick={onCreate}
                        className="w-8 h-8 flex items-center justify-center rounded-xl bg-brand-purple/10 text-brand-purple border border-brand-purple/20 hover:bg-brand-purple/20 transition-all font-bold flex-shrink-0"
                    >
                        +
                    </button>
                </div>
                {statusMessage && (
                    <div className={`px-4 py-2 rounded-xl text-xs font-bold animate-in slide-in-from-top-2 ${statusMessage.type === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : statusMessage.type === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
                        {statusMessage.text}
                    </div>
                )}
            </div>

            {selectedVM ? (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full min-h-[500px]">
                    <div className="lg:col-span-1 space-y-4 relative z-50">
                        {selectedVM.isRunning && selectedVM.configChanged && (
                            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 space-y-3 animate-in fade-in zoom-in-95 duration-300">
                                <div className="flex items-center gap-2 font-bold text-[10px] uppercase tracking-widest">
                                    <AlertTriangle size={14} className="shrink-0" />
                                    {t.vms.manage.config_mismatch}
                                </div>
                                <div className="space-y-3 pt-2">
                                    {selectedVM.configDifferences?.map((diff, idx) => {
                                        const [label, values] = diff.split(': ');
                                        const [planned, running] = values?.split(' -> ') || [values, ''];
                                        return (
                                            <div key={idx} className="space-y-1.5 pt-2 first:pt-0 border-t border-amber-500/10 first:border-0">
                                                <div className="text-[9px] opacity-80 uppercase font-bold tracking-wider">{label}</div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="space-y-1">
                                                        <div className="text-[8px] opacity-40 uppercase font-bold">{t.vms.manage.planned}</div>
                                                        <div className="text-[10px] font-mono break-all bg-black/40 p-1.5 rounded border border-white/5 text-amber-200/90">{planned}</div>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="text-[8px] opacity-40 uppercase font-bold">{t.vms.manage.running}</div>
                                                        <div className="text-[10px] font-mono break-all bg-black/40 p-1.5 rounded border border-white/5 opacity-60 italic">{running}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {!selectedVM.configDifferences && (
                                        <p className="text-[10px] opacity-80 py-2">{t.vms.manage.config_out_of_sync}</p>
                                    )}
                                </div>
                                <button
                                    onClick={async () => {
                                        const restartConfirmed = await confirm({
                                            title: '确认重启',
                                            message: t.vms.manage.restart_vm_apply,
                                            variant: 'warning',
                                        });
                                        if (restartConfirmed) {
                                            await handleAction('stop');
                                            // Add extra delay to ensure cleanup
                                            await new Promise(r => setTimeout(r, 1000));
                                            await handleAction('start');
                                        }
                                    }}
                                    disabled={isActionLoading}
                                    className="w-full mt-2 py-2.5 bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
                                >
                                    {isActionLoading ? (
                                        <div className="w-3 h-3 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                                    ) : (
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    )}
                                    {t.vms.manage.deploy_changes}
                                </button>
                            </div>
                        )}
                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-4">
                            <div>
                                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1 ml-1">{t.vms.manage.properties}</p>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center px-2 py-1.5 rounded-lg bg-black/20 font-mono text-[10px]">
                                        <span className="text-gray-500 uppercase tracking-wider">{t.vms.manage.arch}</span>
                                        <span className="text-white">{selectedVM.architecture}</span>
                                    </div>
                                    <div className="flex justify-between items-center px-2 py-1.5 rounded-lg bg-black/20 font-mono text-[10px]">
                                        <span className="text-gray-500 uppercase tracking-wider">{t.vms.manage.vnc_port}</span>
                                        <div className="text-right">
                                            <div className="text-white">:{selectedVM.vncPort}</div>
                                            <div className="text-[8px] uppercase tracking-wider font-bold">
                                                {selectedVM.vncBindAddress === '0.0.0.0' ? (
                                                    <span className="text-brand-purple">External (0.0.0.0)</span>
                                                ) : (
                                                    <span className="text-gray-500">Local Only</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {selectedVM.isRunning && (
                                <div>
                                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1 ml-1">{t.vms.manage.network}</p>
                                    <div className="space-y-2 font-mono text-[10px]">
                                        <div className="px-2 py-1.5 rounded-lg bg-brand-purple/10 border border-brand-purple/20">
                                            <div className="text-gray-500 text-[9px] uppercase tracking-wider">{t.vms.manage.ip_address}</div>
                                            <div className="text-brand-purple font-bold flex items-center gap-2">
                                                {selectedVM.ipAddress || (
                                                    <div className="flex items-center gap-1.5 opacity-80 cursor-help group relative" title="需安装 QEMU Guest Agent">
                                                        <span className="animate-pulse">{t.vms.manage.waiting}</span>
                                                        <div className="relative">
                                                            <Info size={12} className="text-brand-purple" />
                                                            <div className="absolute top-full left-0 mt-3 w-64 p-3 bg-neutral-950 border border-white/20 rounded-xl shadow-2xl z-[9999] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto transform origin-top-left">
                                                                <div className="space-y-2">
                                                                    <div className="text-[10px] font-bold text-gray-100">无法获取 IP 地址?</div>
                                                                    <p className="text-[9px] text-gray-400 leading-relaxed">
                                                                        虚拟机需要安装 <span className="text-brand-purple font-bold">QEMU Guest Agent</span> 才能向宿主机汇报 IP 信息。
                                                                    </p>
                                                                    <div className="bg-white/5 rounded-lg p-2 border border-white/5 space-y-1">
                                                                        <div className="text-[8px] text-gray-500 uppercase font-bold">Debian / Ubuntu</div>
                                                                        <div className="flex items-center gap-2">
                                                                            <code className="flex-1 text-[9px] font-mono text-emerald-400 truncate">apt install qemu-guest-agent</code>
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    navigator.clipboard.writeText("apt update && apt install qemu-guest-agent -y && systemctl start qemu-guest-agent");
                                                                                    // You might want to show a toast here
                                                                                }}
                                                                                className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
                                                                                title="复制完整安装命令"
                                                                            >
                                                                                <Copy size={10} />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                {/* Triangle Arrow */}
                                                                <div className="absolute bottom-full left-3 -mb-1 w-2 h-2 bg-neutral-950 border-t border-l border-white/20 transform rotate-45"></div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {networkMode === 'user' && selectedVM.vncPort && (
                                            <div className="px-2 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="text-gray-500 text-[9px] uppercase tracking-wider flex items-center gap-1">
                                                        <Terminal size={8} />
                                                        {t.vms.manage.ssh_port}
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            const sshPort = selectedVM.vncPort! - 5900 + 1000;
                                                            const sshCommand = `ssh -p ${sshPort} user@localhost`;
                                                            navigator.clipboard.writeText(sshCommand);
                                                            setCopiedSSH(true);
                                                            setTimeout(() => setCopiedSSH(false), 2000);
                                                        }}
                                                        className="p-0.5 rounded hover:bg-white/10 transition-colors"
                                                        title={t.vms.manage.copy_ssh_command}
                                                    >
                                                        {copiedSSH ? (
                                                            <Check size={10} className="text-emerald-400" />
                                                        ) : (
                                                            <Copy size={10} className="text-gray-400" />
                                                        )}
                                                    </button>
                                                </div>
                                                <div className="text-emerald-400 font-bold">{selectedVM.vncPort - 5900 + 1000}</div>
                                                <div className="text-[8px] text-gray-600 mt-1 break-all">
                                                    ssh -p {selectedVM.vncPort - 5900 + 1000} user@localhost
                                                </div>
                                            </div>
                                        )}

                                        {networkMode === 'bridge' && selectedVM.ipAddress && (
                                            <div className="px-2 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="text-gray-500 text-[9px] uppercase tracking-wider flex items-center gap-1">
                                                        <Terminal size={8} />
                                                        {t.vms.manage.ssh}
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            const sshCommand = `ssh user@${selectedVM.ipAddress}`;
                                                            navigator.clipboard.writeText(sshCommand);
                                                            setCopiedSSH(true);
                                                            setTimeout(() => setCopiedSSH(false), 2000);
                                                        }}
                                                        className="p-0.5 rounded hover:bg-white/10 transition-colors"
                                                        title={t.vms.manage.copy_ssh_command}
                                                    >
                                                        {copiedSSH ? (
                                                            <Check size={10} className="text-emerald-400" />
                                                        ) : (
                                                            <Copy size={10} className="text-gray-400" />
                                                        )}
                                                    </button>
                                                </div>
                                                <div className="text-blue-400 font-bold text-[8px] break-all">
                                                    ssh user@{selectedVM.ipAddress}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {!selectedVM.isRunning && hostVncStatus?.listening && (
                                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-2">
                                    <div className="flex items-center gap-2 text-blue-400">
                                        <Info className="w-3.5 h-3.5" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500">{t.vms.manage.port_occupancy_hint}</span>
                                    </div>
                                    <p className="text-[10px] text-gray-400 leading-relaxed">
                                        {t.vms.manage.port_occupancy_desc}
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Button
                                onClick={() => handleAction(selectedVM.isRunning ? 'stop' : 'start')}
                                disabled={isActionLoading}
                                variant={selectedVM.isRunning ? 'danger' : 'success'}
                                className="w-full"
                                isLoading={isActionLoading}
                            >
                                {selectedVM.isRunning ? t.vms.manage.stop_vm : t.vms.manage.start_vm}
                            </Button>
                            <Button
                                onClick={() => setDeleteConfirm({ isOpen: true, vmName: selectedVM.directoryName })}
                                disabled={isActionLoading}
                                variant="danger"
                                className="w-full flex items-center justify-center gap-2"
                            >
                                <Trash2 size={14} />
                                {t.vms.manage.delete_vm}
                            </Button>

                            <div className="pt-2 flex flex-col gap-2">
                                <Link
                                    href={`/files?tab=files&path=${encodeURIComponent(selectedVM.path)}`}
                                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all text-gray-400 hover:text-white hover:bg-white/5"
                                >
                                    <FolderOpen className="w-4 h-4 text-orange-400" />
                                    <span>{t.vms.manage_files || "Manage VM Files"}</span>
                                </Link>
                                <Link
                                    href={`/files?tab=files&path=${vmBasePath}/ISOs`}
                                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all text-gray-400 hover:text-white hover:bg-white/5"
                                >
                                    <Disc className="w-4 h-4 text-pink-400" />
                                    <span>{t.vms.manage_isos || "Manage ISOs"}</span>
                                </Link>
                            </div>
                        </div>

                        {/* History Area */}

                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2 px-1 font-medium">{t.vms.manage.lifecycle}</p>
                            <p className="text-[10px] text-gray-500 leading-relaxed px-1">
                                {t.vms.manage.lifecycle_desc}
                            </p>
                        </div>
                    </div>

                    <div className="lg:col-span-3 flex flex-col gap-4">
                        <div className="flex-1 flex flex-col rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden backdrop-blur-md">
                            <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-white/[0.02]">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">{t.vms.manage.configuration}</span>
                                <div className="flex bg-white/5 p-0.5 rounded-lg border border-white/5 scale-90">
                                    <button
                                        onClick={() => setActiveEditorTab('simple')}
                                        className={`px-3 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all ${activeEditorTab === 'simple' ? 'bg-brand-purple text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                                    >
                                        {t.vms.manage.visual}
                                    </button>
                                    <button
                                        onClick={() => setActiveEditorTab('advanced')}
                                        className={`px-3 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all ${activeEditorTab === 'advanced' ? 'bg-brand-purple text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                                    >
                                        {t.vms.manage.source}
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-hidden relative">
                                {activeEditorTab === 'simple' ? (
                                    <VMConfigEditor
                                        config={configContent}
                                        onChange={setConfigContent}
                                        vmName={selectedVM.directoryName}
                                        readOnly={selectedVM.isManaged === false}
                                    />
                                ) : (
                                    <Editor
                                        value={configContent}
                                        onChange={setConfigContent}
                                        language="xml"
                                        vimMode={vimMode}
                                        onSave={handleSave}
                                        className="absolute inset-0"
                                        readOnly={selectedVM.isManaged === false}
                                    />
                                )}
                            </div>
                            {/* Action Bar */}
                            <div className="flex items-center justify-between px-6 pt-4 pb-4 lg:pb-6 border-t border-white/5 bg-white/[0.02]">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={async () => {
                                            if (!selectedVM) return;
                                            try {
                                                const commits = await fetchHistory(selectedVM.name);
                                                setHistory(commits);
                                                setShowHistory(!showHistory);
                                                setShowDiff(false);
                                                setSelectedCommit(null);
                                            } catch {
                                                displayStatus(t.vms.manage.failed_to_fetch_history, 'error');
                                            }
                                        }}
                                        className={`px-4 py-2 rounded-xl border transition-all text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${showHistory
                                            ? 'bg-brand-purple/20 border-brand-purple/30 text-brand-purple'
                                            : 'bg-white/[0.05] border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.1]'
                                            }`}
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        {t.vms.manage.history_git}
                                    </button>

                                    {activeEditorTab === 'advanced' && (
                                        <>
                                            <button
                                                onClick={handleFormat}
                                                className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all bg-white/[0.05] hover:bg-white/[0.1] text-gray-400 hover:text-white border border-transparent"
                                            >
                                                {t.common.format}
                                            </button>
                                            <button
                                                onClick={toggleVimMode}
                                                className={`px-3 py-1.5 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${vimMode ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-white/[0.05] border-white/10 text-gray-400 hover:text-white'}`}
                                            >
                                                VIM {vimMode ? 'ON' : 'OFF'}
                                            </button>
                                        </>
                                    )}
                                </div>

                                <div className="flex items-center gap-3">
                                    {selectedVM.isManaged === false && (
                                        <div className="px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-bold uppercase tracking-widest">
                                            {t.vms.manage.readonly_hint || "只读模式：此虚拟机不在配置目录中"}
                                        </div>
                                    )}
                                    <Button
                                        onClick={handleSave}
                                        disabled={!selectedVM || isSaving || configContent === originalConfig || selectedVM.isManaged === false}
                                        isLoading={isSaving}
                                        className="px-8"
                                    >
                                        {t.common.save}
                                    </Button>
                                </div>
                            </div>

                            {/* History Panel */}
                            {showHistory && (
                                <div className="mt-4 rounded-2xl border border-white/5 bg-black/40 overflow-hidden animate-in slide-in-from-top-2 duration-300 max-h-[400px]">
                                    <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/[0.02]">
                                        <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">{t.vms.manage.git_history_log}</span>
                                        <button onClick={() => {
                                            setShowHistory(false);
                                            setShowDiff(false);
                                            setSelectedCommit(null);
                                        }} className="text-gray-500 hover:text-white text-xs">✕</button>
                                    </div>
                                    {!showDiff ? (
                                        <div className="overflow-y-auto">
                                            {history.length > 0 ? (
                                                <div className="divide-y divide-white/5">
                                                    {history.map((commit, idx) => (
                                                        <button
                                                            key={idx}
                                                            onClick={async () => {
                                                                if (!selectedVM) return;
                                                                try {
                                                                    setSelectedCommit(commit.hash);
                                                                    const diff = await fetchDiff(selectedVM.name, commit.hash);
                                                                    setDiffContent(diff);
                                                                    setShowDiff(true);
                                                                } catch {
                                                                    displayStatus(t.vms.manage.failed_to_fetch_history, 'error');
                                                                }
                                                            }}
                                                            className="w-full px-4 py-3 text-left hover:bg-white/[0.03] transition-colors group"
                                                        >
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <span className="font-mono text-xs text-brand-purple/80">{commit.hash}</span>
                                                                        <span className="text-xs text-gray-500">{new Date(commit.date).toLocaleString('zh-CN')}</span>
                                                                    </div>
                                                                    <div className="text-sm text-gray-300 group-hover:text-white transition-colors line-clamp-2">
                                                                        {commit.message}
                                                                    </div>
                                                                    <div className="text-xs text-gray-500 mt-1">
                                                                        {commit.author}
                                                                    </div>
                                                                </div>
                                                                <svg className="w-4 h-4 text-gray-500 group-hover:text-gray-300 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                                </svg>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="p-4 text-center text-gray-500 text-sm">{t.vms.manage.no_history_entries}</div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col h-full">
                                            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/[0.02]">
                                                <button
                                                    onClick={() => {
                                                        setShowDiff(false);
                                                        setSelectedCommit(null);
                                                    }}
                                                    className="text-xs text-gray-500 hover:text-white flex items-center gap-1"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                                    </svg>
                                                    {t.common.back || '返回'}
                                                </button>
                                                <span className="text-xs font-mono text-gray-500">{t.vms.manage.diff || 'Diff'}: {selectedCommit}</span>
                                            </div>
                                            <div className="overflow-hidden max-h-[300px] rounded-lg border border-white/5 bg-black/30 backdrop-blur-sm">
                                                <DiffViewer content={diffContent || ''} className="max-h-[300px]" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 rounded-3xl border border-white/5 bg-white/5 p-12 text-center backdrop-blur-xl flex flex-col items-center justify-center border-dashed">
                    <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4 text-gray-500">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <h3 className="text-white/90 font-bold text-lg mb-2">{t.vms.manage.native_vm_management}</h3>
                    <p className="text-gray-500 text-xs max-w-sm font-medium leading-relaxed">
                        {t.vms.manage.select_vm_desc}
                    </p>
                </div>
            )}

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
            <ConfirmDialogComponent />
        </div>
    );
}
