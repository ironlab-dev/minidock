"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui";

// Docker container inspect response (partial)
interface ContainerInfo {
    Config?: {
        Labels?: Record<string, string>;
        Image?: string;
        Env?: string[];
    };
    State?: {
        Running?: boolean;
        Status?: string;
    };
    NetworkSettings?: {
        IPAddress?: string;
        Ports?: Record<string, Array<{ HostPort: string }> | null>;
    };
    Mounts?: Array<{ Source: string; Destination: string; Type: string; RW: boolean }>;
    [key: string]: unknown;
}

interface ContainerDetailsProps {
    itemId: string;
    onClose: () => void;
    getItemDetails: (itemId: string) => Promise<Record<string, string> | null>;
    onEditService?: (serviceName: string) => void;
}

export default function ContainerDetails({ itemId, onClose, getItemDetails, onEditService }: ContainerDetailsProps) {
    const [details, setDetails] = useState<ContainerInfo | null>(null);
    const [loading, setLoading] = useState(true);

    const projectName = details?.Config?.Labels?.["com.docker.compose.project"];

    useEffect(() => {
        const fetchDetails = async () => {
            setLoading(true);
            const data = await getItemDetails(itemId);
            if (data?.raw) {
                try {
                    const parsed = JSON.parse(data.raw);
                    setDetails(Array.isArray(parsed) ? parsed[0] : parsed);
                } catch (e) {
                    console.error("Failed to parse container details", e);
                }
            }
            setLoading(false);
        };
        fetchDetails();
    }, [itemId, getItemDetails]);

    if (!itemId) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm transition-opacity duration-300">
            {/* Backdrop click to close */}
            <div className="absolute inset-0" onClick={onClose} />

            <div className="relative w-full max-w-2xl bg-[#1A1A1A] border-l border-white/10 shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-300">
                <div className="p-6 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
                    <div>
                        <h2 className="text-xl font-bold text-white/90">Container Details</h2>
                        <p className="text-xs font-mono text-gray-500 mt-1 uppercase tracking-widest">{itemId.substring(0, 12)}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-white/5 text-gray-400 hover:text-white transition-all"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                    {loading ? (
                        <div className="flex items-center justify-center h-40">
                            <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                        </div>
                    ) : details ? (
                        <>
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">State</p>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${details.State?.Running ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                                        <span className="text-sm font-medium text-white/80">{details.State?.Status || "Unknown"}</span>
                                    </div>
                                </div>
                                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Image</p>
                                    <p className="text-sm font-medium text-white/80 truncate" title={details.Config?.Image}>{details.Config?.Image || "Unknown"}</p>
                                </div>
                            </div>

                            {/* Network */}
                            <section>
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">Network</h3>
                                <div className="rounded-2xl border border-white/5 bg-white/[0.02] divide-y divide-white/5">
                                    <div className="p-4 flex justify-between items-center text-sm">
                                        <span className="text-gray-500">IP Address</span>
                                        <span className="font-mono text-white/80">{details.NetworkSettings?.IPAddress || "N/A"}</span>
                                    </div>
                                    <div className="p-4 flex justify-between items-center text-sm">
                                        <span className="text-gray-500">Ports</span>
                                        <div className="flex flex-wrap gap-2 justify-end">
                                            {Object.keys(details.NetworkSettings?.Ports || {}).length > 0 ? (
                                                Object.entries(details.NetworkSettings!.Ports!).map(([port, bindings]) => (
                                                    <span key={port} className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-xs font-mono text-white/70">
                                                        {port} → {bindings?.[0]?.HostPort || 'None'}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-gray-600 italic">None</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Mounts */}
                            <section>
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">Mounts</h3>
                                <div className="space-y-2">
                                    {(details.Mounts || []).length > 0 ? (details.Mounts || []).map((mount, i: number) => (
                                        <div key={i} className="p-4 rounded-2xl border border-white/5 bg-white/[0.02] text-sm">
                                            <div className="flex justify-between mb-1">
                                                <span className="text-gray-500">Source</span>
                                                <span className="font-mono text-white/80 break-all text-right max-w-[70%]">{mount.Source}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">Destination</span>
                                                <span className="font-mono text-blue-400/80 break-all text-right max-w-[70%]">{mount.Destination}</span>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="p-4 rounded-2xl border border-white/5 bg-white/[0.02] text-sm text-gray-500 italic text-center">
                                            No mounts configured
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Environment */}
                            <section>
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">Environment</h3>
                                <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
                                    <div className="max-h-60 overflow-y-auto no-scrollbar">
                                        <div className="divide-y divide-white/5">
                                            {(details.Config?.Env || []).map((env: string, i: number) => {
                                                const [key, ...value] = env.split('=');
                                                return (
                                                    <div key={i} className="p-4 flex flex-col gap-1 text-sm bg-white/[0.01]">
                                                        <span className="font-bold text-gray-500 text-[10px] uppercase tracking-wider">{key}</span>
                                                        <span className="font-mono text-white/70 break-all">{value.join('=')}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Raw Data (Foldable/Scrollable) */}
                            <section className="mt-8">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">Raw Config</h3>
                                <div className="rounded-2xl border border-white/5 bg-black p-4 overflow-x-auto">
                                    <pre className="text-[11px] font-mono text-gray-400 leading-relaxed whitespace-pre">
                                        {JSON.stringify(details, null, 2)}
                                    </pre>
                                </div>
                            </section>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-40 text-gray-500">
                            <p>Failed to load container details.</p>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-white/[0.08] bg-white/[0.02] flex gap-4">
                    {projectName && onEditService && (
                        <Button
                            onClick={() => onEditService(projectName)}
                            variant="primary"
                            className="flex-1 h-12 rounded-2xl font-bold uppercase tracking-widest text-xs bg-blue-600 hover:bg-blue-500"
                        >
                            Edit Service Configuration
                        </Button>
                    )}
                    <Button
                        onClick={onClose}
                        variant="secondary"
                        className={`${projectName ? 'w-32' : 'w-full'} h-12 rounded-2xl font-bold uppercase tracking-widest text-xs`}
                    >
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
}
