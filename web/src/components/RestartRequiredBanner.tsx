"use client";

import { useRestartDetection } from "@/hooks/useRestartDetection";
import { useTranslation } from "@/hooks/useTranslation";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { DEMO_MODE } from "@/demo/demoConfig";

export default function RestartRequiredBanner() {
    const { needsRestart, backendNeedsRestart, dismissNotification } = useRestartDetection();
    const { t } = useTranslation();
    const [isExpanded, setIsExpanded] = useState(false);

    // DEMO_INTEGRATION: hide restart banner in demo mode
    if (DEMO_MODE || !needsRestart) {
        return null;
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ type: "spring", damping: 25, stiffness: 350 }}
                className="fixed top-20 left-1/2 -translate-x-1/2 z-[99] w-full max-w-2xl px-4 sm:top-24 sm:max-w-3xl lg:px-6"
            >
                <div className="
                    px-6 py-4 rounded-2xl border shadow-[0_10px_40px_rgba(0,0,0,0.4)]
                    backdrop-blur-2xl bg-amber-500/10 border-amber-500/30
                    text-amber-100
                ">
                    <div className="flex items-start gap-4">
                        <div className="relative flex items-center justify-center flex-shrink-0 mt-0.5">
                            <div className="absolute inset-0 bg-amber-500/20 blur-md rounded-full animate-pulse" />
                            <svg
                                className="h-5 w-5 text-amber-400 relative z-10"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                />
                            </svg>
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <h3 className="text-[14px] font-bold tracking-tight text-amber-200 mb-1">
                                        {t.common.restart_required_title}
                                    </h3>
                                    <p className="text-[12px] text-amber-300/80 leading-relaxed">
                                        {backendNeedsRestart && t.common.restart_required_backend_desc}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                        onClick={() => setIsExpanded(!isExpanded)}
                                        className="
                                            px-3 py-1.5 rounded-lg text-[11px] font-medium
                                            bg-amber-500/20 hover:bg-amber-500/30
                                            border border-amber-500/30 hover:border-amber-500/50
                                            text-amber-200 transition-all duration-200
                                            active:scale-95
                                        "
                                    >
                                        {isExpanded ? t.common.hide_details : t.common.show_details}
                                    </button>

                                    <button
                                        onClick={dismissNotification}
                                        className="
                                            px-3 py-1.5 rounded-lg text-[11px] font-medium
                                            bg-white/5 hover:bg-white/10
                                            border border-white/10 hover:border-white/20
                                            text-amber-200/80 hover:text-amber-200
                                            transition-all duration-200
                                            active:scale-95
                                        "
                                    >
                                        {t.common.dismiss}
                                    </button>
                                </div>
                            </div>

                            <AnimatePresence>
                                {isExpanded && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="mt-4 pt-4 border-t border-amber-500/20 overflow-hidden"
                                    >
                                        <div className="space-y-3 text-[11px] text-amber-300/70">
                                            <div>
                                                <p className="font-semibold text-amber-200/90 mb-1.5">
                                                    {t.common.restart_instructions_title}
                                                </p>
                                                <ol className="list-decimal list-inside space-y-1.5 ml-2">
                                                    <li>{t.common.restart_step_1}</li>
                                                    <li>{t.common.restart_step_2}</li>
                                                    <li>{t.common.restart_step_3}</li>
                                                </ol>
                                            </div>

                                            <div className="pt-2 border-t border-amber-500/10">
                                                <p className="font-semibold text-amber-200/90 mb-1.5">
                                                    {t.common.restart_why_title}
                                                </p>
                                                <p className="leading-relaxed">
                                                    {t.common.restart_why_desc}
                                                </p>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

