'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ExternalLink, Search, Download, HardDrive, Cpu, Loader2, CheckCircle2, X, RefreshCcw, History, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import { communityVMs, CommunityVM } from '@/lib/communityVMs';
import { useToast } from "@/hooks/useToast";
import ImageWithFallback from './ImageWithFallback';
import { client, getBackendBaseUrl } from '@/api/client';
import { useTranslation } from "@/hooks/useTranslation";
import { useVersion } from '@/hooks/useVersion';
import { useGitOps } from '@/hooks/useGitOps';

interface VersionBadgeProps {
    vm: CommunityVM;
}

function VersionBadge({ vm }: VersionBadgeProps) {
    const { t } = useTranslation();
    const { latestVersion, loading } = useVersion(undefined, vm.id);

    const hasUpdate = vm.currentVersion && latestVersion && vm.currentVersion !== latestVersion;

    if (loading) {
        return (
            <Badge variant="gray" className="text-[9px] py-0 px-1.5 opacity-40 italic">
                {t.docker.image_status.checking}
            </Badge>
        );
    }

    if (hasUpdate) {
        return (
            <Badge variant="amber" className="text-[9px] py-0 px-1.5 bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse">
                <RefreshCcw size={8} className="mr-1" />
                {latestVersion}
            </Badge>
        );
    }

    if (latestVersion) {
        return (
            <Badge variant="gray" className="text-[9px] py-0 px-1.5 opacity-60">
                <CheckCircle2 size={8} className="mr-1" />
                {latestVersion}
            </Badge>
        );
    }

    return null;
}

// Types for ISO status
interface ISOStatus {
    exists: boolean;
    downloading: boolean;
    progress: number;
    stage?: string;
    path?: string; // Add path to store absolute path from backend
}

// Define the shape of data passed to wizard
export interface WizardInitialData {
    name: string;
    preset: 'linux' | 'windows' | 'macos' | 'other';
    arch: string;
    ram: number;
    cpuCount: number;
    diskSize: number;
    isoPath: string;
}

interface VMCommunityProps {
    onInstall: (data: WizardInitialData) => void;
}

export default function VMCommunity({ onInstall }: VMCommunityProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [isoStatus, setIsoStatus] = useState<Record<string, ISOStatus>>({});
    const [showingDetailVM, setShowingDetailVM] = useState<CommunityVM | null>(null);
    const toast = useToast();
    const { t } = useTranslation();
    const { vmBasePath } = useGitOps();

    // WebSocket for download progress
    useEffect(() => {
        // Determine WebSocket URL
        const backendUrl = getBackendBaseUrl();
        const protocol = backendUrl.startsWith('https') ? 'wss:' : 'ws:';
        const wsHost = backendUrl.replace(/^https?:\/\//, '');
        const wsUrl = `${protocol}//${wsHost}/ws`;

        let ws: WebSocket | null = null;
        try {
            ws = new WebSocket(wsUrl);

            ws.onmessage = (event) => {
                try {
                    const rawData = typeof event.data === 'string' ? event.data : '';
                    const colonIndex = rawData.indexOf(":");
                    if (colonIndex === -1) return;

                    const type = rawData.slice(0, colonIndex);
                    const jsonStr = rawData.slice(colonIndex + 1);

                    if (type === 'iso_download_progress') {
                        const payload = JSON.parse(jsonStr);
                        const { filename, stage, percent, error } = payload;

                        // Find VM with this filename
                        const vm = communityVMs.find(v => v.filename === filename);
                        if (vm) {
                            setIsoStatus(prev => ({
                                ...prev,
                                [vm.id]: {
                                    exists: stage === 'finished',
                                    downloading: stage === 'downloading' || stage === 'decompressing',
                                    progress: percent,
                                    stage: stage
                                }
                            }));

                            if (stage === 'finished') {
                                toast.success(t.common.operation_success);
                            } else if (stage === 'error') {
                                toast.error((t.common.operation_failed) + `: ${error || "Unknown error"}`);
                                setIsoStatus(prev => ({
                                    ...prev,
                                    [vm.id]: { exists: false, downloading: false, progress: 0 }
                                }));
                            }
                        }
                    }
                } catch {
                    console.error("WS Parse error");
                }
            };
        } catch {
            console.error("WS Connection error");
        }

        return () => {
            if (ws) ws.close();
        }
    }, [toast]);

    // Check existing ISOs on load
    useEffect(() => {
        client.get<string[]>('/vms/services/isos')
            .then((isos) => {
                const status: Record<string, ISOStatus> = {};
                communityVMs.forEach(vm => {
                    const fullPath = isos.find(path => path.endsWith(vm.filename));
                    const exists = !!fullPath;
                    status[vm.id] = { exists, downloading: false, progress: 0, path: fullPath };
                });
                setIsoStatus(prev => ({ ...prev, ...status }));
            })
            .catch(err => console.error("Failed to list ISOs", err));
    }, []);

    const handleInstall = async (vm: CommunityVM) => {
        if (!vm.downloadUrl) {
            window.open(vm.website, '_blank');
            return;
        }

        const status = isoStatus[vm.id];

        if (status?.exists) {
            // Trigger install flow in parent
            onInstall({
                name: vm.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                preset: vm.category.toLowerCase() === 'windows' ? 'windows' : vm.category.toLowerCase() === 'macos' ? 'macos' : 'linux', // Simple mapping
                arch: 'aarch64', // Defaulting to arm64 for now as per our focus
                ram: vm.defaultRam,
                cpuCount: vm.defaultCpu,
                diskSize: vm.defaultDisk,
                isoPath: status.path || ''
            });
            return;
        }

        // Start download
        try {
            setIsoStatus(prev => ({
                ...prev,
                [vm.id]: { exists: false, downloading: true, progress: 0 }
            }));

            const downloadFilename = vm.downloadUrl.toLowerCase().endsWith('.gz') && !vm.filename.endsWith('.gz')
                ? `${vm.filename}.gz`
                : vm.filename;


            await client.post('/vms/services/isos/download', {
                url: vm.downloadUrl,
                filename: downloadFilename
            });

            toast.success(t.vms.community.downloading);

        } catch {
            toast.error(t.common.operation_failed);
            setIsoStatus(prev => ({
                ...prev,
                [vm.id]: { exists: false, downloading: false, progress: 0 }
            }));
        }
    };

    const filteredVMs = communityVMs.filter(vm =>
        (selectedCategory ? vm.category === selectedCategory : true) &&
        (vm.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            vm.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const categories = Array.from(new Set(communityVMs.map(vm => vm.category)));

    return (
        <div className='space-y-6 animate-in fade-in duration-500'>
            <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white/5 backdrop-blur-sm p-4 rounded-xl border border-white/5 shadow-sm">
                <div className="relative w-full md:w-96 group">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-white/50 transition-colors group-hover:text-brand-purple" />
                    <input
                        placeholder={t.vms.community.search_placeholder}
                        className="w-full bg-black/20 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-brand-purple/50 transition-all duration-300 placeholder:text-white/30"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                    <Button
                        variant={selectedCategory === null ? "primary" : "ghost"}
                        onClick={() => setSelectedCategory(null)}
                        size="sm"
                        className="rounded-full"
                    >
                        {t.vms.community.all_categories}
                    </Button>
                    {categories.map(cat => (
                        <Button
                            key={cat}
                            variant={selectedCategory === cat ? "primary" : "ghost"}
                            onClick={() => setSelectedCategory(cat)}
                            size="sm"
                            className="rounded-full shrink-0"
                        >
                            {cat}
                        </Button>
                    ))}
                </div>
                <Link
                    href={`/files?tab=files&path=${vmBasePath}/ISOs`}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-purple/10 border border-brand-purple/20 text-xs font-bold text-brand-purple hover:bg-brand-purple/20 transition-all group shrink-0"
                >
                    <FolderOpen size={14} className="group-hover:scale-110 transition-transform" />
                    <span>{t.vms.manage_isos}</span>
                </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredVMs.map(vm => {
                    const status = isoStatus[vm.id];
                    // Retrieve localized description if available, fallback to default English description
                    const localizedDesc = t.vms.community.items[vm.id as keyof typeof t.vms.community.items]?.description || vm.description;

                    return (
                        <Card
                            key={vm.id}
                            className="group hover:shadow-xl transition-all duration-300 bg-white/5 backdrop-blur-sm border-white/10 overflow-hidden hover:-translate-y-1 p-6 cursor-pointer"
                            hoverable
                            onClick={() => setShowingDetailVM(vm)}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-12 h-12 bg-white rounded-xl shadow-sm p-2 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                    <ImageWithFallback
                                        src={vm.logo}
                                        alt={vm.name}
                                        className="w-full h-full object-contain"
                                        fallbackText={vm.name}
                                        fallbackClassName="w-full h-full flex items-center justify-center text-brand-purple font-bold text-lg"
                                    />
                                </div>
                                <div className="flex gap-1">
                                    {vm.downloadUrl ? (
                                        <Badge variant={status?.exists ? 'emerald' : 'blue'} className={status?.exists ? "bg-green-500/10 text-green-500" : "bg-blue-500/10 text-blue-500"}>
                                            {status?.exists ? t.vms.community.ready : t.vms.community.downloadable}
                                        </Badge>
                                    ) : (
                                        <Badge variant="amber" className="text-amber-500 bg-amber-500/10">{t.vms.community.manual}</Badge>
                                    )}
                                    <VersionBadge vm={vm} />
                                </div>
                            </div>

                            <h3 className="font-bold text-lg mb-2 line-clamp-1 text-white group-hover:text-brand-purple transition-colors">{vm.name}</h3>
                            <p className="text-sm text-gray-400 mb-4 h-10 line-clamp-2">{localizedDesc}</p>

                            <div className="flex gap-4 mb-4 text-xs text-gray-500">
                                <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded-md border border-white/5">
                                    <Cpu className="w-3 h-3 text-brand-purple/70" />
                                    <span>{vm.defaultCpu} Core</span>
                                </div>
                                <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded-md border border-white/5">
                                    <HardDrive className="w-3 h-3 text-brand-purple/70" />
                                    <span>{vm.defaultDisk}GB</span>
                                </div>
                            </div>

                            <div className="flex justify-between items-center gap-2 mt-auto pt-4 border-t border-white/5">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="shrink-0 hover:bg-brand-purple/10 hover:text-brand-purple p-2"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(vm.website, '_blank');
                                    }}
                                >
                                    <ExternalLink className="w-4 h-4" />
                                </Button>

                                <Button
                                    className={`flex-1 shadow-sm transition-all duration-300`}
                                    variant={status?.exists ? "primary" : "secondary"}
                                    size="sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleInstall(vm);
                                    }}
                                    disabled={status?.downloading}
                                >
                                    {status?.downloading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            {status.stage === 'decompressing' ? t.vms.community.decompressing : `${status.progress}%`}
                                        </>
                                    ) : status?.exists ? (
                                        <>
                                            <CheckCircle2 className="w-4 h-4 mr-2" />
                                            {t.vms.community.create_vm}
                                        </>
                                    ) : !vm.downloadUrl ? (
                                        <>
                                            <ExternalLink className="w-4 h-4 mr-2" />
                                            {t.vms.community.visit_site}
                                        </>
                                    ) : (
                                        <>
                                            <Download className="w-4 h-4 mr-2" />
                                            {t.vms.community.download}
                                        </>
                                    )}
                                </Button>
                            </div>
                        </Card>
                    )
                })}
            </div>

            {/* Detail Modal */}
            {showingDetailVM && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="w-full max-w-2xl bg-[#1c1c1e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-50 duration-300 relative">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="absolute top-4 right-4 text-gray-500 hover:text-white"
                            onClick={() => setShowingDetailVM(null)}
                        >
                            <X className="w-5 h-5" />
                        </Button>

                        <div className="p-8">
                            <div className="flex gap-6 mb-8">
                                <div className="w-24 h-24 bg-white rounded-2xl shadow-lg p-4 flex items-center justify-center shrink-0">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={showingDetailVM.logo} alt={showingDetailVM.name} className="w-full h-full object-contain" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-white mb-2">{showingDetailVM.name}</h2>
                                    <div className="flex gap-2 items-center mb-3">
                                        <Badge variant="purple">{showingDetailVM.category}</Badge>
                                        <VersionBadge vm={showingDetailVM} />
                                        {showingDetailVM.lastVerified && (
                                            <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                                <History size={10} />
                                                Verified: {showingDetailVM.lastVerified}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-gray-400 leading-relaxed">
                                        {t.vms.community.items[showingDetailVM.id as keyof typeof t.vms.community.items]?.description || showingDetailVM.description}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{t.vms.community.cpu}</div>
                                    <div className="text-xl font-mono text-white flex items-center gap-2">
                                        <Cpu className="w-5 h-5 text-brand-purple" />
                                        {showingDetailVM.defaultCpu} Cores
                                    </div>
                                </div>
                                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{t.vms.community.memory}</div>
                                    <div className="text-xl font-mono text-white flex items-center gap-2">
                                        <div className="w-5 h-5 rounded-full border-2 border-brand-purple flex items-center justify-center text-[10px] font-bold text-brand-purple">M</div>
                                        {showingDetailVM.defaultRam} MB
                                    </div>
                                </div>
                                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{t.vms.community.disk}</div>
                                    <div className="text-xl font-mono text-white flex items-center gap-2">
                                        <HardDrive className="w-5 h-5 text-brand-purple" />
                                        {showingDetailVM.defaultDisk} GB
                                    </div>
                                </div>
                            </div>

                            {!showingDetailVM.downloadUrl && (
                                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-8 text-amber-500 text-sm">
                                    <div className="flex gap-2">
                                        <span className="shrink-0">⚠️</span>
                                        <span>
                                            {(t.vms.community.items[showingDetailVM.id as keyof typeof t.vms.community.items] as Record<string, string>)?.manual_guide || t.vms.community.detail_modal.manual_install_guide}
                                        </span>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-3 pt-6 border-t border-white/10">
                                <Button
                                    variant="secondary"
                                    onClick={() => window.open(showingDetailVM.website, '_blank')}
                                >
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    {t.vms.community.visit_site}
                                </Button>
                                {isoStatus[showingDetailVM.id]?.exists ? (
                                    <Button
                                        variant="primary"
                                        onClick={() => {
                                            handleInstall(showingDetailVM);
                                            setShowingDetailVM(null);
                                        }}
                                    >
                                        <CheckCircle2 className="w-4 h-4 mr-2" />
                                        {t.vms.community.detail_modal.install}
                                    </Button>
                                ) : showingDetailVM.downloadUrl ? (
                                    <Button
                                        variant="primary"
                                        onClick={() => {
                                            handleInstall(showingDetailVM);
                                            setShowingDetailVM(null);
                                        }}
                                        disabled={isoStatus[showingDetailVM.id]?.downloading}
                                    >
                                        {isoStatus[showingDetailVM.id]?.downloading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                {t.vms.community.downloading}...
                                            </>
                                        ) : (
                                            <>
                                                <Download className="w-4 h-4 mr-2" />
                                                {t.vms.community.detail_modal.download_and_install}
                                            </>
                                        )}
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            )}


        </div>
    );
}
