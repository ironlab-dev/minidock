"use client";

import { useAutomation } from "@/hooks/useAutomation";
import { Zap, Bot, ChevronRight, AlertCircle, RefreshCw } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import Link from "next/link";
import { useMemo } from "react";
import { formatTimeAgo } from "@/lib/cronUtils";

export function AutomationWidget() {
    const { t } = useTranslation();
    const { tasks, loading, isRefreshing, error } = useAutomation();
    
    const activeTasks = useMemo(() => tasks.filter(t => t.isEnabled), [tasks]);
    const displayedTasks = useMemo(() => tasks.slice(0, 5), [tasks]);
    const hasMoreTasks = tasks.length > 5;

    const getTaskIcon = (task: { triggerType: string; eventType?: string }) => {
        if (task.triggerType === "watch") {
            return (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
            );
        }
        if (task.triggerType === "event" || task.eventType) {
            return (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
            );
        }
        return (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        );
    };

    const getScriptTypeBadge = (scriptType: string) => {
        const type = scriptType.toUpperCase();
        const colors: Record<string, string> = {
            'SHELL': 'bg-gray-500/20 text-gray-400',
            'PYTHON': 'bg-blue-500/20 text-blue-400',
            'SWIFT': 'bg-amber-500/20 text-amber-400'
        };
        return colors[type] || colors['SHELL'];
    };

    return (
        <div className="glass-card rounded-[32px] p-6 sm:p-8 h-full flex flex-col hover:border-white/10 transition-all duration-300">
            <Link 
                href="/automation" 
                className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8 cursor-pointer group transition-all duration-200 active:scale-[0.98]"
                aria-label={`跳转到${t.sidebar.automation}页面`}
            >
                <div className="p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/10 group-hover:bg-amber-500/15 transition-all flex-shrink-0">
                    <Zap className="w-5 h-5 text-amber-500 fill-current glow-amber" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight group-hover:text-amber-400 transition-colors truncate">
                        {t.sidebar.automation}
                    </h3>
                    <p className="text-[10px] sm:text-[11px] text-gray-500 font-semibold uppercase tracking-[0.1em] mt-1.5">
                        {activeTasks.length} {t.automation.task_name}
                    </p>
                </div>
            </Link>

            <div className="flex-1 min-h-0 flex flex-col">
                {loading && !isRefreshing && tasks.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                ) : error ? (
                    <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-red-500/20 rounded-[24px] sm:rounded-[32px] p-6 sm:p-8 bg-red-500/5 -m-1">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-4 sm:mb-6 border border-red-500/20">
                            <AlertCircle className="w-8 h-8 sm:w-10 sm:h-10 text-red-400" />
                        </div>
                        <h4 className="text-sm sm:text-base font-bold text-red-400 mb-2 text-center">
                            {t.automation.error_loading || "加载失败"}
                        </h4>
                        <p className="text-xs sm:text-sm text-gray-400 text-center max-w-[240px] leading-relaxed mb-4 sm:mb-6">
                            {error.includes("timeout") || error.includes("timed out") 
                                ? (t.automation.offline_message || "服务端可能未启动，请检查后端服务")
                                : error}
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 sm:px-8 py-2.5 sm:py-3 bg-red-600/20 text-red-400 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em] rounded-[12px] sm:rounded-[16px] border border-red-500/30 hover:bg-red-600/30 active:scale-95 transition-all flex items-center gap-2"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            {t.automation.retry || "重试"}
                        </button>
                    </div>
                ) : tasks.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-white/[0.05] rounded-[24px] sm:rounded-[32px] p-6 sm:p-10 bg-white/[0.01] -m-1">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-800/50 rounded-full flex items-center justify-center mb-4 sm:mb-6 shadow-inner border border-white/5">
                            <Bot className="w-8 h-8 sm:w-10 sm:h-10 text-white opacity-80" />
                        </div>
                        <h4 className="text-sm sm:text-base font-bold text-white mb-2 tracking-tight text-center">
                            {t.automation.no_tasks}
                        </h4>
                        <p className="text-xs sm:text-sm text-gray-400 text-center max-w-[200px] leading-relaxed mb-6 sm:mb-8">
                            {t.automation.no_tasks_desc}
                        </p>
                        <Link
                            href="/automation"
                            className="px-6 sm:px-8 py-2.5 sm:py-3 bg-blue-600 text-white text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em] rounded-[12px] sm:rounded-[16px] shadow-[0_8px_30px_rgba(37,99,235,0.25)] hover:shadow-[0_12px_40px_rgba(37,99,235,0.35)] hover:brightness-110 active:scale-95 transition-all"
                        >
                            {t.automation.create_task}
                        </Link>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 flex flex-col">
                        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 sm:space-y-3 -mx-1 px-1">
                            {displayedTasks.map((task) => (
                                <Link
                                    key={task.id}
                                    href={task.id ? `/automation?taskId=${task.id}` : "/automation"}
                                    className="block p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all group active:scale-[0.98]"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                            task.isEnabled ? 'bg-green-500/10 text-green-400' : 'bg-gray-800/50 text-gray-500'
                                        }`}>
                                            {getTaskIcon(task)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2 mb-1.5">
                                                <h4 className="text-sm sm:text-base font-semibold text-white group-hover:text-amber-400 transition-colors truncate">
                                                    {task.name}
                                                </h4>
                                                <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                                                    task.isEnabled ? 'bg-green-400' : 'bg-gray-500'
                                                }`} />
                                            </div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium ${getScriptTypeBadge(task.scriptType)}`}>
                                                    {task.scriptType.toUpperCase()}
                                                </span>
                                                {task.lastRunAt && (
                                                    <span className="text-[10px] sm:text-xs text-gray-500">
                                                        {formatTimeAgo(task.lastRunAt)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 group-hover:text-white transition-colors flex-shrink-0 mt-1" />
                                    </div>
                                </Link>
                            ))}
                        </div>
                        {hasMoreTasks && (
                            <Link
                                href="/automation"
                                className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-white/5 text-center"
                            >
                                <span className="text-xs sm:text-sm text-gray-400 hover:text-white transition-colors inline-flex items-center gap-1.5">
                                    {t.automation.view_all || "查看全部"} ({tasks.length})
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </span>
                            </Link>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
