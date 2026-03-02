"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useTranslation } from "@/hooks/useTranslation";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/contexts/SidebarContext";

import { ArrowUp, ArrowDown } from "lucide-react";

const formatSpeed = (bytesPerSecond: number) => {
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
};

import StatsPanel from "./footer/StatsPanel";


const PUBLIC_PAGES = ['/login', '/register'];

export default function Footer() {
    const { metrics, status, isInitialConnecting, instructions } = useWebSocket();
    const { t } = useTranslation();
    const pathname = usePathname();
    const { panelState, togglePanel, closePanel, openPanel, isCollapsed } = useSidebar();

    const isPublicPage = PUBLIC_PAGES.includes(pathname);
    const footerLeft = isCollapsed ? "lg:left-20" : "lg:left-64";
    const [hasMounted, setHasMounted] = useState(false);

    useEffect(() => {
        setHasMounted(true);
    }, []);


    return (
        <>
            <footer className={`h-[42px] border-t border-white/[0.03] bg-[rgba(8,8,10,0.85)] backdrop-blur-3xl flex items-center justify-between px-6 fixed bottom-0 left-0 ${footerLeft} right-0 z-50 transition-all duration-300 ease-in-out select-none ${isPublicPage ? 'hidden' : ''}`}>
                <div className="flex items-center gap-7 h-full">
                    {/* Status Dot */}
                    <div className="flex items-center gap-3">
                        <div className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${status === 'open'
                            ? 'bg-emerald-500 animate-pulse-subtle shadow-[0_0_10px_rgba(16,185,129,0.7)]'
                            : isInitialConnecting ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                                : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`} />
                        <span className={`text-[10px] font-bold uppercase tracking-[0.25em] ${status === 'open' ? 'text-emerald-500/90' : 'text-gray-500'}`}>
                            {status === 'open' ? 'Online' : 'Offline'}
                        </span>
                    </div>


                    <div className="w-[1px] h-3 bg-white/10" />

                    <div className="flex items-center gap-6">
                        {/* CPU Metric */}
                        <button
                            onClick={() => togglePanel('cpu')}
                            className={`flex items-center gap-2.5 group h-full px-2 rounded-lg transition-all ${panelState.isOpen && panelState.activeTab === 'cpu' ? 'bg-white/[0.05]' : 'hover:bg-white/[0.02]'}`}
                        >
                            <span className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.15em] group-hover:text-gray-500 transition-colors">CPU</span>
                            <span className="text-[11px] font-bold text-blue-400/90 font-mono tracking-tight group-hover:text-blue-300 transition-colors">
                                {hasMounted ? metrics.cpu.toFixed(0) : '0'}%
                            </span>
                        </button>



                        {/* MEM Metric */}
                        <button
                            onClick={() => togglePanel('mem')}
                            className={`flex items-center gap-2.5 group h-full px-2 rounded-lg transition-all ${panelState.isOpen && panelState.activeTab === 'mem' ? 'bg-white/[0.05]' : 'hover:bg-white/[0.02]'}`}
                        >
                            <span className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.15em] group-hover:text-gray-500 transition-colors">RAM</span>
                            <span className="text-[11px] font-bold text-purple-400/90 font-mono tracking-tight group-hover:text-purple-300 transition-colors">
                                {hasMounted ? metrics.mem.toFixed(0) : '0'}%
                            </span>
                        </button>


                    </div>

                    <div className="w-[1px] h-3 bg-white/10" />

                    {/* NET Metric */}
                    <button
                        onClick={() => togglePanel('network')}
                        className={`flex items-center gap-7 group h-full px-2 rounded-lg transition-all ${panelState.isOpen && panelState.activeTab === 'network' ? 'bg-white/[0.05]' : 'hover:bg-white/[0.02]'}`}
                    >
                        <div className="flex items-center gap-2">
                            <ArrowDown className="w-2.5 h-2.5 text-emerald-500/80" strokeWidth={3} />
                            <span className="text-[11px] font-bold text-emerald-500/90 font-mono tracking-tight group-hover:text-emerald-400 transition-colors">
                                {hasMounted ? formatSpeed(metrics.netIn) : '0 B/s'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <ArrowUp className="w-2.5 h-2.5 text-orange-500/80" strokeWidth={3} />
                            <span className="text-[11px] font-bold text-orange-500/90 font-mono tracking-tight group-hover:text-orange-400 transition-colors">
                                {hasMounted ? formatSpeed(metrics.netOut) : '0 B/s'}
                            </span>
                        </div>

                    </button>
                </div>


                <div className="flex items-center gap-7 h-full">
                    {/* Instruction Status */}
                    <AnimatePresence mode="wait">
                        {instructions.length > 0 && (
                            <motion.button
                                key={instructions[0].id + instructions[0].status}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                onClick={() => togglePanel('instructions')}
                                className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-white/[0.03] transition-all group max-w-[320px] border border-transparent hover:border-white/[0.05]"
                            >
                                <div className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${instructions[0].status === 'running'
                                    ? 'bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                                    : instructions[0].status === 'success'
                                        ? 'bg-emerald-500'
                                        : 'bg-red-500'
                                    }`} />
                                <span className="text-[10px] font-mono text-gray-500 truncate group-hover:text-gray-300 transition-colors uppercase tracking-tight whitespace-nowrap">
                                    {instructions[0].command}
                                </span>
                                {instructions[0].status !== 'running' && (
                                    <span className="text-[9px] text-gray-600 font-bold whitespace-nowrap flex-shrink-0">
                                        {t.instruction.done}
                                    </span>
                                )}
                            </motion.button>
                        )}
                    </AnimatePresence>

                </div>


            </footer>

            <AnimatePresence>
                {panelState.isOpen && panelState.activeTab && (
                    <StatsPanel
                        activeTab={panelState.activeTab}
                        onClose={closePanel}
                        onTabSwitch={openPanel}
                    />
                )}
            </AnimatePresence>
        </>
    );
}
