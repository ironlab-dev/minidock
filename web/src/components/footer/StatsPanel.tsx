"use client";

import { useState, useEffect } from "react";
import { motion, Variants } from "framer-motion";
import { useWebSocket, Instruction } from "@/hooks/useWebSocket";
import { useTranslation } from "@/hooks/useTranslation";
import { X, Terminal, XCircle } from "lucide-react";
import { client } from "@/api/client";

const formatSpeed = (bytesPerSecond: number) => {
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
};

export type PanelTab = 'cpu' | 'mem' | 'network' | 'instructions';

interface StatsPanelProps {
    activeTab: PanelTab;
    onClose: () => void;
    onTabSwitch: (tab: PanelTab) => void;
}

export default function StatsPanel({ activeTab, onClose, onTabSwitch }: StatsPanelProps) {
    const { sendRequest, details, instructions, metrics } = useWebSocket();
    const { t } = useTranslation();
    const [panelWidth, setPanelWidth] = useState(600);
    const [isResizing, setIsResizing] = useState(false);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());

    const toggleExpand = (id: string) => {
        const newSet = new Set(expandedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setExpandedIds(newSet);
    };

    const MIN_WIDTH = 450;
    const MAX_WIDTH = 1000;

    useEffect(() => {
        sendRequest('request_details', { type: activeTab });
        const interval = setInterval(() => {
            sendRequest('request_details', { type: activeTab });
        }, 2000);
        return () => clearInterval(interval);
    }, [activeTab, sendRequest]);

    useEffect(() => {
        if (!isResizing) return;

        const handleMouseMove = (e: MouseEvent) => {
            const windowWidth = window.innerWidth;
            const newWidth = windowWidth - e.clientX;
            const clampedWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
            setPanelWidth(clampedWidth);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing]);

    const currentData = (details && details.type === activeTab) ? details.data : null;

    const handleCancel = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (cancellingIds.has(id)) return;

        setCancellingIds(prev => new Set(prev).add(id));
        try {
            await client.post(`/services/instruction-engine/items/${id}/cancel`, {});
        } catch (error) {
            console.error("Failed to cancel instruction:", error);
        } finally {
            // Keep in cancelling state for a bit to show UI feedback
            setTimeout(() => {
                setCancellingIds(prev => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
            }, 1000);
        }
    };

    // Unified animation variant for the panel
    const panelVariants: Variants = {
        initial: { x: '100%', opacity: 0.9 },
        animate: {
            x: 0,
            opacity: 1,
            transition: {
                duration: 0.5,
                ease: [0.32, 0.72, 0, 1]
            }
        },
        exit: {
            x: '100%',
            opacity: 0,
            transition: {
                duration: 0.4,
                ease: [0.32, 0.72, 0, 1]
            }
        }
    };

    return (
        <>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
                variants={panelVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className={`fixed top-0 bottom-0 right-0 z-50 bg-[#08080a]/90 border-l border-white/[0.08] shadow-[-10px_0_30px_rgba(0,0,0,0.5)] backdrop-blur-3xl flex flex-col overflow-hidden w-full lg:w-auto`}
                style={{ width: typeof window !== 'undefined' && window.innerWidth < 1024 ? '100%' : `${panelWidth}px` }}
            >
                <div
                    onMouseDown={() => setIsResizing(true)}
                    className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize flex items-center justify-center group z-10 hidden lg:flex"
                >
                    <div className="h-12 w-1 bg-white/[0.1] rounded-full group-hover:bg-white/[0.2] transition-colors" />
                </div>

                <div className="px-6 py-4 border-b border-white/[0.03] flex items-center justify-between">
                    <div className="flex bg-white/[0.03] p-1 rounded-xl gap-1">
                        {[
                            { id: 'cpu', label: 'CPU' },
                            { id: 'mem', label: 'RAM' },
                            { id: 'network', label: 'NET' },
                            { id: 'instructions', label: t.docker.task_center || 'Tasks' }
                        ].map((tab: { id: string, label: string }) => (
                            <button
                                key={tab.id}
                                onClick={() => onTabSwitch(tab.id as PanelTab)}
                                className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === tab.id
                                    ? 'bg-blue-600 text-white shadow-[0_2px_8px_rgba(37,99,235,0.4)]'
                                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Summary metrics visible in header */}
                        <div className="flex items-center gap-4 mr-4 border-r border-white/10 pr-4 hidden md:flex">
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] text-gray-600 font-bold uppercase tracking-tighter">Load</span>
                                <span className="text-[11px] font-mono text-blue-400 font-bold">{metrics.cpu.toFixed(0)}%</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] text-gray-600 font-bold uppercase tracking-tighter">Mem</span>
                                <span className="text-[11px] font-mono text-purple-400 font-bold">{metrics.mem.toFixed(0)}%</span>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.03] text-gray-500 hover:text-white hover:bg-white/10 transition-all">
                            <X size={16} strokeWidth={3} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar p-6">
                    {/* Integrated Active Tasks Section - Only show when metrics tabs are active */}
                    {activeTab !== 'instructions' && instructions.some(i => i.status === 'running') && (
                        <div className="mb-8">
                            <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                {t.instruction.running}
                            </h3>
                            <div className="space-y-2">
                                {instructions.filter(i => i.status === 'running').map((inst: Instruction) => (
                                    <div key={inst.id} className="flex flex-col p-3 bg-blue-500/5 rounded-xl border border-blue-500/10 gap-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <Terminal size={14} className="text-blue-500/50 flex-shrink-0" />
                                                <span className="text-xs font-bold text-blue-100 font-mono truncate">{inst.command}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={(e) => handleCancel(e, inst.id)}
                                                    disabled={cancellingIds.has(inst.id)}
                                                    className={`p-1 rounded-md text-red-400 hover:bg-red-400/10 transition-colors ${cancellingIds.has(inst.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                    title={t.instruction.cancel}
                                                >
                                                    <XCircle size={14} />
                                                </button>
                                                <span className="text-[10px] text-blue-400 font-bold animate-pulse">{t.instruction.running}...</span>
                                            </div>
                                        </div>
                                        {inst.progress !== undefined && (
                                            <div className="w-full h-1 bg-blue-500/10 rounded-full overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${inst.progress}%` }}
                                                    className="h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                                                />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'instructions' ? (
                        <div className="space-y-4">
                            {instructions.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full py-20 opacity-30 gap-4">
                                    <Terminal size={48} strokeWidth={1} />
                                    <span className="text-xs font-bold uppercase tracking-widest">{t.instruction.no_logs}</span>
                                </div>
                            ) : (
                                instructions.map((inst: Instruction) => (
                                    <div
                                        key={inst.id}
                                        className={`flex flex-col p-4 bg-white/[0.02] rounded-2xl border border-white/[0.05] hover:bg-white/[0.04] transition-all group/item cursor-pointer ${expandedIds.has(inst.id) ? 'bg-white/[0.04]' : ''}`}
                                        onClick={() => toggleExpand(inst.id)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${inst.status === 'running'
                                                    ? 'bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.6)]'
                                                    : inst.status === 'success'
                                                        ? 'bg-emerald-500'
                                                        : inst.status === 'failure'
                                                            ? 'bg-red-500'
                                                            : 'bg-yellow-500'
                                                    }`} />
                                                <span className="text-sm font-bold text-gray-200 font-mono truncate">{inst.command}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {inst.status === 'running' && (
                                                    <button
                                                        onClick={(e) => handleCancel(e, inst.id)}
                                                        disabled={cancellingIds.has(inst.id)}
                                                        className={`p-1 rounded-md text-red-500 hover:bg-red-500/10 transition-colors ${cancellingIds.has(inst.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                        title={t.instruction.cancel}
                                                    >
                                                        <XCircle size={16} />
                                                    </button>
                                                )}
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded border ${inst.status === 'running' ? 'text-blue-400 border-blue-400/30' :
                                                    inst.status === 'success' ? 'text-emerald-400 border-emerald-400/30' :
                                                        inst.status === 'failure' ? 'text-red-400 border-red-400/30' :
                                                            'text-yellow-400 border-yellow-400/30'
                                                    } font-black uppercase tracking-tighter`}>
                                                    {inst.status === 'running' ? t.instruction.running :
                                                        inst.status === 'success' ? t.instruction.success :
                                                            inst.status === 'failure' ? t.instruction.failure :
                                                                t.instruction.cancelled}
                                                </span>
                                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest font-mono">
                                                    {new Date(inst.startTime).toLocaleTimeString()}
                                                </span>
                                            </div>
                                        </div>

                                        {inst.status === 'running' && inst.progress !== undefined && (
                                            <div className="mt-3 w-full h-1 bg-white/[0.03] rounded-full overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${inst.progress}%` }}
                                                    className="h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                                                />
                                            </div>
                                        )}

                                        {expandedIds.has(inst.id) && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                className="overflow-hidden mt-4"
                                            >
                                                {inst.fullCommand && (
                                                    <div className="mb-3 px-3 py-2 bg-white/[0.03] rounded-xl border border-white/[0.05]">
                                                        <div className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-1.5 opacity-50">Command Execution</div>
                                                        <code className="text-[10px] font-mono text-blue-400/80 break-all leading-tight block">
                                                            {inst.fullCommand}
                                                        </code>
                                                    </div>
                                                )}
                                                {inst.output && (
                                                    <div className={`p-4 rounded-xl overflow-x-auto border ${inst.status === 'failure' ? 'bg-red-500/5 border-red-500/10' : 'bg-black/60 border-white/5'}`}>
                                                        <div className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-2 opacity-50">Output Console</div>
                                                        <pre className={`text-[11px] font-mono ${inst.status === 'failure' ? 'text-red-400/90' : 'text-gray-400'} break-words whitespace-pre-wrap leading-relaxed`}>
                                                            {inst.output}
                                                        </pre>
                                                    </div>
                                                )}
                                                {!inst.output && inst.status === 'running' && (
                                                    <div className="py-4 text-center text-[10px] text-gray-500 italic uppercase tracking-widest">
                                                        Waiting for output...
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    ) : !currentData ? (
                        <div className="flex items-center justify-center h-full opacity-20 py-20">
                            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <div className="px-4 py-2 border-b border-white/[0.02] flex items-center justify-between opacity-30">
                                <span className="text-[9px] font-black uppercase tracking-widest">Process / Item</span>
                                <span className="text-[9px] font-black uppercase tracking-widest">Load</span>
                            </div>
                            {currentData && (currentData as { name: string, value: string, [key: string]: string | undefined }[]).map((item, idx: number) => (
                                <div key={idx} className="flex items-center justify-between p-4 bg-white/[0.01] rounded-2xl hover:bg-white/[0.03] border border-white/[0.02] transition-colors group">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`w-1.5 h-1.5 rounded-full ${activeTab === 'cpu' ? 'bg-blue-500' : 'bg-purple-500'} opacity-20 group-hover:opacity-100 transition-opacity`} />
                                        <span className="text-sm font-bold text-gray-300 truncate">{item.name}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="w-24 h-1 bg-white/[0.03] rounded-full overflow-hidden hidden sm:block">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: activeTab === 'network' ? '0%' : `${item.value}%` }}
                                                className={`h-full ${activeTab === 'cpu' ? 'bg-blue-500' : 'bg-purple-500'} opacity-40`}
                                            />
                                        </div>
                                        <span className={`text-sm font-mono font-black tabular-nums ${activeTab === 'cpu' ? 'text-blue-400' : 'text-purple-400'}`}>
                                            {activeTab === 'network' ? formatSpeed(parseFloat(item.total || '0')) : `${item.value}%`}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>
        </>
    );
}
