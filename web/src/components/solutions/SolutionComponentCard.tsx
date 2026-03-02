"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { getComponentIcon } from "@/lib/solutionDefinitions";
import { ExternalLink, Link2 } from 'lucide-react';
import type { DeployedComponent } from '@/types/solution';

interface SolutionComponentCardProps {
    component: DeployedComponent;
    customUrl?: string;
    onEditUrl?: () => void;
}

const statusStyles: Record<string, { bg: string; text: string; dot: string }> = {
    running: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
    stopped: { bg: 'bg-gray-500/10', text: 'text-gray-400', dot: 'bg-gray-400' },
    error: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
    starting: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
    pulling: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400' },
    installing: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
    waiting: { bg: 'bg-gray-500/10', text: 'text-gray-400', dot: 'bg-gray-400' },
};

export default function SolutionComponentCard({ component, customUrl, onEditUrl }: SolutionComponentCardProps) {
    const { t } = useTranslation();
    const style = statusStyles[component.status] || statusStyles.stopped;
    const openUrl = customUrl || component.webUIUrl;

    return (
        <div className="group flex items-center gap-3.5 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-200">
            {/* Icon */}
            <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.06] flex items-center justify-center flex-shrink-0 overflow-hidden">
                <img src={getComponentIcon(component.componentId)} alt={component.name} className="w-6 h-6" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{component.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        component.type === 'native' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    }`}>
                        {t.solutions.type[component.type as keyof typeof t.solutions.type]}
                    </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500 font-mono">:{component.port}</span>
                    {customUrl && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono truncate max-w-[200px]">
                            {customUrl}
                        </span>
                    )}
                    {component.error && (
                        <span className="text-xs text-red-400 truncate">{component.error}</span>
                    )}
                </div>
            </div>

            {/* Status */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${style.bg}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${style.dot} ${component.status === 'running' ? 'animate-pulse' : ''}`} />
                <span className={`text-xs font-medium ${style.text}`}>
                    {t.solutions.component_status[component.status as keyof typeof t.solutions.component_status] || component.status}
                </span>
            </div>

            {/* Edit URL */}
            {onEditUrl && (
                <button
                    onClick={onEditUrl}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06] transition-all"
                    title={t.solutions.installed.custom_url}
                >
                    <Link2 className="w-3.5 h-3.5" />
                </button>
            )}

            {/* Open WebUI */}
            {openUrl && component.status === 'running' && (
                <a
                    href={openUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs font-medium text-gray-400 hover:text-white transition-all"
                >
                    <ExternalLink className="w-3 h-3" />
                    {t.solutions.installed.open_webui}
                </a>
            )}
        </div>
    );
}
