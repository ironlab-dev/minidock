import { useEffect, useRef, useState, useCallback } from 'react';
import Ansi from 'ansi-to-react';
import { RefreshCw, Download, Terminal, X, Copy, Check } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface DockerLogViewerProps {
    title: string;
    logs: string;
    showLogs: boolean;
    onClose: () => void;
    onRefresh: () => void;
    autoRefresh: boolean;
    onToggleAutoRefresh: () => void;
    status: 'active' | 'inactive';
}

export const DockerLogViewer = ({
    title,
    logs,
    showLogs,
    onClose,
    onRefresh,
    autoRefresh,
    onToggleAutoRefresh,
}: DockerLogViewerProps) => {
    const logsEndRef = useRef<HTMLDivElement>(null);
    const [copied, setCopied] = useState(false);
    const { t } = useTranslation();

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(logs);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [logs]);

    // Auto-scroll to bottom when logs update
    useEffect(() => {
        if (showLogs && logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, showLogs]);

    if (!showLogs) return null;

    return (
        <div className="flex flex-col rounded-2xl border border-white/5 bg-zinc-950/80 backdrop-blur-xl overflow-hidden animate-in fade-in zoom-in-95 duration-300 h-full shadow-2xl ring-1 ring-white/10">
            {/* Integrated Toolbar - Similar to TerminalComponent */}
            <div className="flex items-center justify-between bg-white/[0.04] border-b border-white/[0.08] px-6 py-4">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-400">
                        <Terminal size={18} />
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-sm tracking-tight leading-none">{title || 'Docker Logs'}</h3>
                        <div className="flex items-center gap-2 mt-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-zinc-600'}`} />
                            <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">{autoRefresh ? 'Streaming' : 'Paused'}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleCopy}
                        className="p-2 text-zinc-400 hover:text-white transition-all hover:bg-white/5 rounded-lg active:scale-95"
                        title={t.common.copy || "Copy"}
                    >
                        {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                    </button>
                    <button
                        onClick={onToggleAutoRefresh}
                        className={`p-2 transition-all rounded-lg active:scale-95 ${autoRefresh ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                        title={autoRefresh ? "Pause Auto-refresh" : "Enable Auto-refresh"}
                    >
                        <RefreshCw size={18} className={autoRefresh ? "animate-spin-slow" : ""} />
                    </button>
                    <button
                        onClick={onRefresh}
                        className="p-2 text-zinc-400 hover:text-white transition-all hover:bg-white/5 rounded-lg active:scale-95"
                        title={t.common.refresh || "Refresh Now"}
                    >
                        <Download size={18} />
                    </button>
                    {onClose && (
                        <div className="ml-1 pl-1 border-l border-white/10">
                            <button
                                onClick={onClose}
                                className="p-2 text-zinc-400 hover:text-red-400 transition-all hover:bg-red-500/10 rounded-lg active:scale-95"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Terminal Content */}
            <div className="relative flex-1 bg-black/40 overflow-hidden group/container">
                <div className="absolute inset-0 p-6 font-mono text-[13px] leading-relaxed overflow-auto custom-scrollbar selection:bg-blue-500/30">
                    <div className="min-w-max">
                        {logs ? (
                            <div className="whitespace-pre overflow-visible">
                                <Ansi useClasses={false}>{logs}</Ansi>
                            </div>
                        ) : (
                            <div className="text-gray-600 italic animate-pulse">
                                {t.common.loading || "Waiting for output..."}
                            </div>
                        )}
                    </div>
                    <div ref={logsEndRef} className="h-4" />
                </div>

                {/* Subtle Gradient Overlays */}
                <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-black/20 to-transparent pointer-events-none" />
                <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
            </div>
        </div>
    );
};
