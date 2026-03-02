"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { getSolutionIcon } from "@/lib/solutionDefinitions";
import { Layers, ArrowRight, Lock } from 'lucide-react';
import type { SolutionInfo } from '@/types/solution';

interface SolutionOverviewProps {
    solutions: SolutionInfo[];
    onDeploy: (solution: SolutionInfo) => void;
    onManage: (solution: SolutionInfo) => void;
}

const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
    not_installed: { bg: 'bg-gray-500/10', text: 'text-gray-400', dot: 'bg-gray-400' },
    deploying: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
    running: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
    partial: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
    stopped: { bg: 'bg-gray-500/10', text: 'text-gray-400', dot: 'bg-gray-400' },
    error: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
};

export default function SolutionOverview({ solutions, onDeploy, onManage }: SolutionOverviewProps) {
    const { t } = useTranslation();

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {solutions.map((solution) => {
                const isInstalled = solution.status !== 'not_installed';
                const isAvailable = solution.available;
                const colors = statusColors[solution.status] || statusColors.not_installed;

                return (
                    <div
                        key={solution.id}
                        className={`relative group rounded-2xl border transition-all duration-300 overflow-hidden ${
                            isAvailable
                                ? 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04] hover:scale-[1.02] hover:shadow-lg hover:shadow-purple-500/5'
                                : 'border-white/[0.05] bg-white/[0.01] opacity-60'
                        }`}
                    >
                        {/* Coming Soon Overlay */}
                        {!isAvailable && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 backdrop-blur-[2px] rounded-2xl">
                                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.08] border border-white/[0.1]">
                                    <Lock className="w-4 h-4 text-gray-400" />
                                    <span className="text-sm font-semibold text-gray-300">{t.solutions.overview.coming_soon}</span>
                                </div>
                            </div>
                        )}

                        <div className="p-6">
                            {/* Header */}
                            <div className="flex items-start gap-4 mb-4">
                                <div className="w-14 h-14 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center flex-shrink-0 overflow-hidden">
                                    <img
                                        src={getSolutionIcon(solution.icon)}
                                        alt={solution.name}
                                        className="w-9 h-9"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-lg font-bold text-white tracking-tight">{solution.name}</h3>
                                    <p className="text-sm text-gray-400 mt-0.5 line-clamp-2">{solution.description}</p>
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="flex items-center gap-3 mb-5">
                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                                    <Layers className="w-3.5 h-3.5 text-gray-400" />
                                    <span className="text-xs font-medium text-gray-400">
                                        {t.solutions.overview.components_count.replace('{n}', String(solution.componentCount))}
                                    </span>
                                </div>
                                {isInstalled && (
                                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${colors.bg}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${colors.dot} ${solution.status === 'running' ? 'animate-pulse' : ''}`} />
                                        <span className={`text-xs font-medium ${colors.text}`}>
                                            {solution.status === 'partial' && solution.totalCount > 0
                                                ? t.solutions.status.partial_detail
                                                    .replace('{running}', String(solution.runningCount))
                                                    .replace('{total}', String(solution.totalCount))
                                                : (t.solutions.status[solution.status as keyof typeof t.solutions.status] || solution.status)}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Action Button */}
                            {isAvailable && (
                                <button
                                    onClick={() => isInstalled ? onManage(solution) : onDeploy(solution)}
                                    className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 active:scale-95 ${
                                        isInstalled
                                            ? 'bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/[0.08]'
                                            : 'bg-purple-600/80 hover:bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                                    }`}
                                >
                                    {isInstalled ? t.solutions.overview.manage : t.solutions.overview.deploy}
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
