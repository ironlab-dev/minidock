"use client";

import React from "react";
import type { Translations } from "@/locales/zh";
import { ServiceInfo } from "@/types/service";
import { motion } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";

interface ServiceCardProps {
    service: ServiceInfo;
    onAction: (id: string, action: "start" | "stop" | "restart") => Promise<void>;
    hideControls?: boolean;
}

// Pre-computed sort priority list (avoids re-creating on every render)
const STAT_PRIORITY = [
    'hostname', 'uptime', 'memorysize', 'processorcount',
    'containers running', 'containers total', 'vms running', 'vms total'
];

function ServiceCard({ service, onAction, hideControls }: ServiceCardProps) {
    const { t } = useTranslation();
    const localizedInfo = (t.dashboard as Record<string, unknown>).services as Record<string, Record<string, string>> | undefined;
    const displayName = localizedInfo?.[service.id]?.name || service.name;
    const displayDescription = localizedInfo?.[service.id]?.description || service.description || t.dashboard.manage_monitor.replace("{name}", displayName);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.01 }}
            transition={{ duration: 0.2 }}
            className="relative group overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] p-4 sm:p-5 backdrop-blur-xl transition-all hover:bg-white/[0.05] hover:border-white/10 h-full flex flex-col"
        >
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-xl scale-90 origin-left ${getTypeColor(service.type)}`}>
                        {getTypeIcon(service.type)}
                    </div>
                    <div>
                        <h3 className="font-bold text-base group-hover:text-blue-400 transition-colors tracking-tight leading-tight">{displayName}</h3>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-[0.15em] mt-0.5">{service.type}</p>
                    </div>
                </div>
                <StatusBadge status={service.status} />
            </div>

            <p className="text-xs text-gray-500 mb-4 line-clamp-2 leading-snug">
                {displayDescription}
            </p>

            {service.stats && Object.keys(service.stats).length > 0 && (
                <div className="grid grid-cols-2 gap-1.5 mt-auto">
                    {Object.entries(service.stats)
                        .sort(([keyA], [keyB]) => {
                            const indexA = STAT_PRIORITY.indexOf(keyA.toLowerCase().replace('_', ' '));
                            const indexB = STAT_PRIORITY.indexOf(keyB.toLowerCase().replace('_', ' '));
                            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                            if (indexA !== -1) return -1;
                            if (indexB !== -1) return 1;
                            return keyA.localeCompare(keyB);
                        })
                        .slice(0, 4) // Limit to top 4 metrics for density
                        .map(([key, value]) => (
                            <div key={key} className="px-2 py-1.5 rounded-lg bg-white/[0.02] border border-white/5 flex flex-col">
                                <span className="text-xs text-gray-600 font-bold uppercase tracking-wider mb-0.5 truncate">{getMetricLabel(t, key)}</span>
                                <span className="text-xs font-mono text-blue-400/90 font-medium truncate" title={value.toString()}>{formatMetricValue(key, value)}</span>
                            </div>
                        ))}
                </div>
            )}

            {!hideControls && (
                <div className="flex gap-2">
                    <button
                        onClick={() => onAction(service.id, service.status === "running" ? "stop" : "start")}
                        className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all active:scale-95 ${service.status === "running"
                            ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                            : "bg-green-500/10 text-green-500 hover:bg-green-500/20"
                            }`}
                    >
                        {service.status === "running" ? t.common.stop : t.common.start}
                    </button>
                    <button
                        onClick={() => onAction(service.id, "restart")}
                        className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all active:scale-95"
                        title={t.common.restart}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>
            )}

            {service.status === "not_installed" && (
                <div className="absolute inset-0 bg-neutral-900/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-10 animate-in fade-in">
                    <div className="w-12 h-12 rounded-full bg-yellow-500/20 text-yellow-500 flex items-center justify-center mb-3">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h4 className="text-white font-medium mb-1">{t.dashboard.service_required.replace("{name}", service.name)}</h4>
                    <p className="text-xs text-gray-400 mb-4">{t.dashboard.service_required_desc}</p>
                    <a
                        href={(() => {
                            if (service.id === 'docker-engine') {
                                const engine = service.stats?.engine_type;
                                if (engine === 'orbstack') return 'https://orbstack.dev';
                                if (engine === 'docker-desktop') return 'https://www.docker.com/products/docker-desktop/';
                                return 'https://colima.dev'; // Default for generic/colima
                            }
                            return service.type === 'vm' ? 'https://mac.getutm.app' : 'https://www.docker.com';
                        })()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                        {t.common.download_install}
                    </a>
                </div>
            )}
        </motion.div>
    );
}

function StatusBadge({ status }: { status: ServiceInfo["status"] }) {
    const { t } = useTranslation();
    const configs = {
        running: { dot: "bg-green-500", text: "text-green-500", label: t.common.running },
        stopped: { dot: "bg-gray-500", text: "text-gray-500", label: t.common.stopped },
        error: { dot: "bg-red-500", text: "text-red-500", label: t.common.error },
        starting: { dot: "bg-yellow-500", text: "text-yellow-500", label: t.common.starting },
        stopping: { dot: "bg-yellow-500", text: "text-yellow-500", label: t.common.stopping },
        unknown: { dot: "bg-gray-700", text: "text-gray-700", label: t.common.unknown },
        not_installed: { dot: "bg-orange-500", text: "text-orange-500", label: t.common.missing },
    };

    const config = configs[status];

    return (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/[0.03] border border-white/5 shrink-0 whitespace-nowrap scale-90 origin-right">
            <div className={`w-1.5 h-1.5 rounded-full ${config.dot} ${status === "running" || status === "starting" ? "animate-pulse shadow-[0_0_6px_rgba(34,197,94,0.4)]" : ""}`} />
            <span className={`text-xs font-bold uppercase tracking-wider ${config.text}`}>{config.label}</span>
        </div>
    );
}

function getTypeColor(type: string) {
    switch (type) {
        case "docker": return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
        case "vm": return "bg-purple-500/10 text-purple-400 border border-purple-500/20 text-blue-400";
        case "system": return "bg-orange-500/10 text-orange-400 border border-orange-500/20 text-blue-400";
        default: return "bg-gray-500/10 text-gray-400 border border-gray-500/20 text-blue-400";
    }
}

function getTypeIcon(type: string) {
    switch (type) {
        case "docker":
            return <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M13.983 11.078h2.119c.695 0 1.259.564 1.259 1.259 0 .694-.564 1.259-1.259 1.259h-2.119a1.259 1.259 0 0 1-1.259-1.259c0-.695.564-1.259 1.259-1.259zm-3.177 0h2.119a1.259 1.259 0 0 1 1.259 1.259c0 .694-.564 1.259-1.259 1.259h-2.119a1.259 1.259 0 0 1-1.259-1.259c0-.695.564-1.259 1.259-1.259zm-3.177 0h2.119a1.259 1.259 0 0 1 1.259 1.259c0 .694-.564 1.259-1.259 1.259H7.629a1.259 1.259 0 0 1-1.259-1.259c0-.695.564-1.259 1.259-1.259zm-3.176 0h2.118a1.259 1.259 0 0 1 1.259 1.259c0 .694-.564 1.259-1.259 1.259H4.453a1.259 1.259 0 0 1-1.259-1.259c0-.695.564-1.259 1.259-1.259zm0-3.176h2.118a1.259 1.259 0 0 1 1.259 1.259c0 .694-.564 1.259-1.259 1.259H4.453a1.259 1.259 0 0 1-1.259-1.259c0-.695.564-1.259 1.259-1.259zm3.176 0h2.119a1.259 1.259 0 0 1 1.259 1.259c0 .694-.564 1.259-1.259 1.259H7.629a1.259 1.259 0 0 1-1.259-1.259c0-.695.564-1.259 1.259-1.259zm3.177 0h2.119a1.259 1.259 0 0 1 1.259 1.259c0 .694-.564 1.259-1.259 1.259h-2.119a1.259 1.259 0 0 1-1.259-1.259c0-.695.564-1.259 1.259-1.259zm0-3.177h2.119a1.259 1.259 0 0 1 1.259 1.259c0 .694-.564 1.259-1.259 1.259h-2.119a1.259 1.259 0 0 1-1.259-1.259c0-.695.564-1.259 1.259-1.259zm-3.177 0h2.119a1.259 1.259 0 0 1 1.259 1.259c0 .694-.564 1.259-1.259 1.259H7.629a1.259 1.259 0 0 1-1.259-1.259c0-.695.564-1.259 1.259-1.259zM22.047 13.04c-.114-1.24-.343-2.316-1.144-3.238-.802-.922-1.89-1.465-3.094-1.85-.75-.24-1.53-.39-2.31-.444-.22-1.396-1.026-2.544-2.227-3.023h.001l-.22-.09c-1.21-.497-2.61-.418-3.758.214a4.192 4.192 0 0 0-2.002 4.18c-3.29.35-6.023 2.593-6.286 5.864-.047.584-.047 1.17 0 1.75.263 3.27 2.996 5.513 6.286 5.864.114.012.228.02.343.02h7.629c.114 0 .229-.008.343-.02 3.29-.35 6.023-2.593 6.286-5.864.047-.58-.047-1.166 0-1.75z" /></svg>;
        case "vm":
            return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;
        case "system":
            return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>;
        default:
            return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>;
    }
}

function formatMetricValue(key: string, value: string): string {
    if (key === 'uptime') {
        const seconds = parseFloat(String(value));
        if (isNaN(seconds)) return value.toString();
        if (seconds < 60) return `${Math.round(seconds)}秒`;
        if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`;
        if (seconds < 86400) return `${Math.round(seconds / 3600)}小时`;
        return `${Math.round(seconds / 86400)}天`;
    }
    if (key.includes('memory')) {
        const bytes = parseFloat(String(value));
        if (bytes > 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
        return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    }
    return value.toString();
}

function getMetricLabel(t: Translations, key: string): string {
    const map: Record<string, string> = {
        'uptime': t.dashboard.metrics.uptime,
        'memorysize': t.dashboard.metrics.memorysize,
        'processcount': t.dashboard.metrics.processcount,
        'activeprocessorcount': t.dashboard.metrics.activeprocessorcount,
        'vms_running': t.dashboard.metrics.vms_running,
        'vms total': t.dashboard.metrics.vms_total,
        'containers total': t.dashboard.metrics.containers_total,
        'containers running': t.dashboard.metrics.containers_running,
        'hostname': t.dashboard.metrics.hostname,
    };
    return map[key.toLowerCase().replace('_', ' ')] || key.replace('_', ' ').toUpperCase();
}

export default React.memo(ServiceCard);
