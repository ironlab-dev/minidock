"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { getComponentIcon } from "@/lib/solutionDefinitions";
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import type { ExternalContainer } from '@/types/solution';

interface ExternalContainerCardProps {
    container: ExternalContainer;
}

export default function ExternalContainerCard({ container }: ExternalContainerCardProps) {
    const { t } = useTranslation();

    return (
        <div className="group flex items-center gap-3.5 p-4 rounded-xl border border-dashed border-white/[0.1] bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/[0.15] transition-all duration-200">
            {/* Icon */}
            <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-dashed border-white/[0.08] flex items-center justify-center flex-shrink-0 overflow-hidden">
                <img src={getComponentIcon(container.componentId)} alt={container.componentName} className="w-6 h-6 opacity-60" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white/80">{container.componentName}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-white/[0.04] text-gray-500 border border-white/[0.06]">
                        {t.solutions.installed.independent_deploy}
                    </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-600 font-mono">{container.containerName}</span>
                    {container.port && (
                        <span className="text-xs text-gray-500 font-mono">:{container.port}</span>
                    )}
                </div>
            </div>

            {/* Status */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${
                container.isRunning ? 'bg-emerald-500/10' : 'bg-gray-500/10'
            }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${
                    container.isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-gray-400'
                }`} />
                <span className={`text-xs font-medium ${
                    container.isRunning ? 'text-emerald-400' : 'text-gray-400'
                }`}>
                    {container.isRunning
                        ? t.solutions.component_status.running
                        : t.solutions.component_status.stopped}
                </span>
            </div>

            {/* Manage in Docker */}
            <Link
                href={`/docker?container=${container.containerId}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs font-medium text-gray-400 hover:text-white transition-all"
            >
                <ExternalLink className="w-3 h-3" />
                {t.solutions.installed.manage_in_docker}
            </Link>
        </div>
    );
}
