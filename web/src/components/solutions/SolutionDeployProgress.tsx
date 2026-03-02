"use client";

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from "@/hooks/useTranslation";
import { getComponentIcon } from "@/lib/solutionDefinitions";
import { X, Check, Loader2, AlertCircle, ArrowRight, Clock } from 'lucide-react';
import type { DeploymentProgress, ComponentStatus } from '@/types/solution';

interface SolutionDeployProgressProps {
    solutionId: string;
    solutionName: string;
    initialProgress: DeploymentProgress;
    getStatus: (id: string) => Promise<DeploymentProgress>;
    onClose: () => void;
}

const statusIcons: Record<ComponentStatus, React.ReactNode> = {
    waiting: <Clock className="w-4 h-4 text-gray-500" />,
    pulling: <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />,
    installing: <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />,
    starting: <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />,
    running: <Check className="w-4 h-4 text-emerald-400" />,
    stopped: <div className="w-4 h-4 rounded-full bg-gray-500" />,
    error: <AlertCircle className="w-4 h-4 text-red-400" />,
};

export default function SolutionDeployProgress({ solutionId, initialProgress, getStatus, onClose }: SolutionDeployProgressProps) {
    const { t } = useTranslation();
    const [progress, setProgress] = useState<DeploymentProgress>(initialProgress);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const isComplete = progress.overallPercent >= 100 ||
        progress.components.every(c => c.status === 'running' || c.status === 'error');

    useEffect(() => {
        pollingRef.current = setInterval(async () => {
            try {
                const status = await getStatus(solutionId);
                setProgress(status);

                // Stop polling when complete
                if (status.overallPercent >= 100 ||
                    status.components.every(c => c.status === 'running' || c.status === 'error')) {
                    if (pollingRef.current) clearInterval(pollingRef.current);
                }
            } catch {
                // Silently ignore polling errors
            }
        }, 2000);

        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [solutionId, getStatus]);

    const hasErrors = progress.components.some(c => c.status === 'error');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />

            {/* Modal */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="relative w-full max-w-lg bg-[#141416] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/[0.06]">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-white">
                            {isComplete ? t.solutions.progress.complete : t.solutions.progress.title}
                        </h2>
                        {isComplete && (
                            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors">
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="px-6 py-5 space-y-5">
                    {/* Progress Bar */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-400">{t.solutions.progress.overall_progress}</span>
                            <span className="text-xs font-bold text-white">{progress.overallPercent}%</span>
                        </div>
                        <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                            <motion.div
                                className={`h-full rounded-full ${hasErrors ? 'bg-amber-500' : 'bg-purple-500'}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${progress.overallPercent}%` }}
                                transition={{ duration: 0.5, ease: 'easeOut' }}
                            />
                        </div>
                        <p className="text-xs text-gray-500 mt-1.5">{progress.currentStep}</p>
                    </div>

                    {/* Component List */}
                    <div className="space-y-2">
                        {progress.components.map(comp => (
                            <div
                                key={comp.componentId}
                                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all ${
                                    comp.status === 'running' ? 'border-emerald-500/20 bg-emerald-500/[0.04]' :
                                    comp.status === 'error' ? 'border-red-500/20 bg-red-500/[0.04]' :
                                    comp.status === 'waiting' ? 'border-white/[0.04] bg-white/[0.01]' :
                                    'border-purple-500/20 bg-purple-500/[0.04]'
                                }`}
                            >
                                <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0 overflow-hidden">
                                    <img src={getComponentIcon(comp.componentId)} alt={comp.componentId} className="w-4.5 h-4.5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium text-white">{comp.componentId}</span>
                                    {comp.message && (
                                        <p className="text-xs text-gray-500 truncate">{comp.message}</p>
                                    )}
                                </div>
                                <div className="flex-shrink-0">
                                    {statusIcons[comp.status as ComponentStatus] || statusIcons.waiting}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Complete Actions */}
                    {isComplete && (
                        <button
                            onClick={onClose}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-purple-600 hover:bg-purple-500 text-white transition-all active:scale-95 shadow-lg shadow-purple-600/20"
                        >
                            {t.solutions.progress.go_to_manage}
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
