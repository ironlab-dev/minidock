"use client";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useTranslation } from "@/hooks/useTranslation";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { DEMO_MODE } from "@/demo/demoConfig";

const PUBLIC_PAGES = ['/login', '/register'];

export default function BackendStatus() {
    const { status, isInitialConnecting, retryCount } = useWebSocket();
    const { t } = useTranslation();
    const pathname = usePathname();

    // Don't show backend status on public pages (login/register)
    // DEMO_INTEGRATION: hide backend status indicator in demo mode
    const isShowing = !DEMO_MODE && status !== 'open' && !PUBLIC_PAGES.includes(pathname);

    return (
        <AnimatePresence>
            {isShowing && (
                <motion.div
                    initial={{ opacity: 0, y: -40, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -40, scale: 0.95 }}
                    transition={{ type: "spring", damping: 25, stiffness: 350 }}
                    className="fixed top-8 left-1/2 -translate-x-1/2 z-[100]"
                >
                    <div className={`
                        px-6 py-3 rounded-full border shadow-[0_10px_40px_rgba(0,0,0,0.3)] 
                        backdrop-blur-2xl flex items-center gap-4 transition-all duration-500
                        ${isInitialConnecting
                            ? "bg-amber-500/10 border-amber-500/20 text-amber-200"
                            : "bg-red-500/15 border-red-500/25 text-red-100"
                        }
                    `}>
                        {isInitialConnecting ? (
                            <div className="relative flex items-center justify-center">
                                <div className="absolute inset-0 bg-amber-500/20 blur-md rounded-full animate-pulse" />
                                <svg className="animate-spin h-4.5 w-4.5 text-amber-500 relative z-10" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                                    <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            </div>
                        ) : (
                            <div className="relative flex items-center justify-center">
                                <div className="absolute inset-0 bg-red-500/40 blur-lg rounded-full animate-pulse" />
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500 relative z-10 shadow-[0_0_12px_rgba(239,68,68,0.8)]" />
                            </div>
                        )}

                        <div className="flex flex-col min-w-0">
                            <span className="text-[13px] font-bold tracking-tight">
                                {isInitialConnecting ? t.common.starting : t.common.offline}
                            </span>
                            {!isInitialConnecting && retryCount > 0 && (
                                <span className="text-[9px] font-bold uppercase tracking-widest opacity-40 -mt-0.5">
                                    {t.common.status} • {retryCount}
                                </span>
                            )}
                        </div>

                        <div className="h-5 w-px bg-white/10" />

                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-[0.1em] opacity-40">
                                {isInitialConnecting ? "Establishing" : "Service Down"}
                            </span>
                            <span className="text-[10px] font-medium opacity-60">
                                {isInitialConnecting ? "Warming up servers..." : "Retrying automatically"}
                            </span>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
