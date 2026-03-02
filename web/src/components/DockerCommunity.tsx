"use client";

import { useState, useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { Search, ExternalLink, Download, ArrowRight, Info } from 'lucide-react';
import { communityApps, CommunityApp } from '@/lib/communityApps';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { useImageStatus } from '@/hooks/useImageStatus';
import { useVersion } from '@/hooks/useVersion';
import { RefreshCcw, CheckCircle2 } from 'lucide-react';

interface VersionBadgeProps {
    app: CommunityApp;
}

function VersionBadge({ app }: VersionBadgeProps) {
    const { t } = useTranslation();
    const cleanImage = app.primaryImage.split(':')[0];
    const { latestVersion, loading } = useVersion(cleanImage);

    // If we have a current version in the metadata, we can compare
    const hasUpdate = app.currentVersion && latestVersion && app.currentVersion !== latestVersion;

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
            <Badge variant="gray" className="text-[9px] py-0 px-1.5 opacity-80 bg-white/10 text-white/90">
                <CheckCircle2 size={8} className="mr-1" />
                {latestVersion}
            </Badge>
        );
    }

    return null;
}

interface ImageStatusBadgeProps {
    imageName: string;
}

function ImageStatusBadge({ imageName }: ImageStatusBadgeProps) {
    const { t } = useTranslation();
    const { status, loading } = useImageStatus(imageName);

    if (loading) {
        return (
            <Badge variant="gray" className="text-[9px] py-0 px-1.5 opacity-50 animate-pulse">
                {t.docker.image_status.checking}
            </Badge>
        );
    }

    if (!status) return null;

    if (status.exists) {
        return (
            <Badge variant="blue" className="text-[9px] py-0 px-1.5 bg-blue-500/10 text-blue-400 border-blue-500/20">
                {t.docker.image_status.ready}
            </Badge>
        );
    }

    return (
        <Badge variant="gray" className="text-[9px] py-0 px-1.5 opacity-60">
            {t.docker.image_status.not_pulled}
        </Badge>
    );
}

interface DockerCommunityProps {
    onInstall: (app: CommunityApp) => void;
    initialSelectedAppId?: string;
}

export default function DockerCommunity({ onInstall, initialSelectedAppId }: DockerCommunityProps) {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [selectedArch, setSelectedArch] = useState<string>('all');
    const [selectedApp, setSelectedApp] = useState<CommunityApp | null>(() => {
        if (initialSelectedAppId) {
            return communityApps.find(app => app.id === initialSelectedAppId) || null;
        }
        return null;
    });

    const categories = [
        { id: 'all', name: t.docker.community.all_categories },
        { id: 'media', name: t.docker.community.categories.media },
        { id: 'tools', name: t.docker.community.categories.tools },
        { id: 'network', name: t.docker.community.categories.network },
        { id: 'productivity', name: t.docker.community.categories.productivity },
        { id: 'smart_home', name: t.docker.community.categories.smart_home },
        { id: 'other', name: t.docker.community.categories.other },
    ];

    const architectures = [
        { id: 'all', name: t.docker.community.platforms.all },
        { id: 'arm64', name: 'ARM64' },
        { id: 'amd64', name: 'X86_64' },
    ];

    const filteredApps = useMemo(() => {
        return communityApps.filter(app => {
            const matchesSearch = app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                app.description.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesCategory = selectedCategory === 'all' || app.category === selectedCategory;
            const matchesArch = selectedArch === 'all' || (selectedArch !== 'all' && app.architectures.includes(selectedArch as 'arm64' | 'amd64'));
            return matchesSearch && matchesCategory && matchesArch;
        });
    }, [searchQuery, selectedCategory, selectedArch]);

    return (
        <div className="flex flex-col h-full gap-6">
            <div className="flex flex-col gap-4">
                <h2 className="text-2xl font-bold tracking-tight text-white">{t.docker.community.title}</h2>
                <p className="text-sm text-gray-400 max-w-2xl">{t.docker.community.subtitle}</p>
            </div>

            {/* Filters and Search */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="flex overflow-x-auto no-scrollbar gap-2 w-full md:w-auto py-2">
                        {categories.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 border ${selectedCategory === cat.id
                                    ? "bg-brand-blue/10 border-brand-blue/30 text-brand-blue"
                                    : "bg-white/[0.03] border-white/5 text-gray-500 hover:text-gray-300 hover:bg-white/[0.05]"
                                    }`}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>

                    <div className="relative w-full md:w-64 lg:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                        <input
                            type="text"
                            placeholder={t.docker.community.search_placeholder}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white/[0.03] border border-white/5 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-blue/50 transition-all shadow-inner"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3 border-t border-white/5 pt-4">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-none">{t.docker.community.platforms.title}</span>
                    <div className="flex gap-1.5">
                        {architectures.map(arch => (
                            <button
                                key={arch.id}
                                onClick={() => setSelectedArch(arch.id)}
                                className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${selectedArch === arch.id
                                    ? "bg-brand-blue text-white shadow-lg shadow-brand-blue/20"
                                    : "bg-white/[0.03] text-gray-500 hover:text-gray-300 hover:bg-white/5"
                                    }`}
                            >
                                {arch.name}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* App Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredApps.map(app => (
                    <Card
                        key={app.id}
                        className="group relative overflow-hidden bg-white/[0.02] hover:bg-white/[0.04] border-white/5 hover:border-brand-blue/30 transition-all duration-300 flex flex-col p-5 h-full cursor-pointer"
                        onClick={() => setSelectedApp(app)}
                    >
                        {/* Hover Gradient Effect */}
                        <div className="absolute inset-0 bg-gradient-to-br from-brand-blue/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                        <div className="flex items-start gap-4 mb-4 relative z-10">
                            <div className="w-12 h-12 rounded-2xl bg-white/[0.05] p-2 flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform duration-300 shadow-xl">
                                <img src={app.icon} alt={app.name} className="w-full h-full object-contain filter drop-shadow-md" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-bold text-white truncate group-hover:text-brand-blue transition-colors">{app.name}</h3>
                                <div className="mt-1 flex gap-1 items-center">
                                    <Badge variant="gray" className="text-[10px] py-0 px-2 opacity-70">
                                        {t.docker.community.categories[app.category]}
                                    </Badge>
                                    <ImageStatusBadge imageName={app.primaryImage} />
                                    <div className="flex gap-0.5 ml-1">
                                        {app.architectures.includes('arm64') && (
                                            <div className="w-4 h-4 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center" title="ARM64 Support">
                                                <span className="text-[7px] font-black text-emerald-400">A</span>
                                            </div>
                                        )}
                                        {app.architectures.includes('amd64') && (
                                            <div className="w-4 h-4 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center" title="X86_64 Support">
                                                <span className="text-[7px] font-black text-blue-400">X</span>
                                            </div>
                                        )}
                                    </div>
                                    <VersionBadge app={app} />
                                </div>
                            </div>
                        </div>

                        <p className="text-xs text-gray-500 line-clamp-2 mb-6 flex-1 relative z-10">
                            {app.description}
                        </p>

                        <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5 relative z-10">
                            <button className="text-[10px] font-bold text-brand-blue uppercase tracking-widest flex items-center gap-1.5 hover:translate-x-1 transition-transform">
                                {t.docker.community.view_details}
                                <ArrowRight size={12} />
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onInstall(app);
                                }}
                                className="p-2 rounded-lg bg-brand-blue/10 hover:bg-brand-blue text-brand-blue hover:text-white transition-all shadow-lg shadow-brand-blue/10"
                            >
                                <Download size={14} />
                            </button>
                        </div>
                    </Card>
                ))}

                {filteredApps.length === 0 && (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center text-gray-500">
                        <Info size={40} className="mb-4 opacity-20" />
                        <p className="text-sm">{t.docker.community.no_apps_found}</p>
                    </div>
                )}
            </div>

            {/* App Detail Modal */}
            {selectedApp && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all duration-300 animate-in fade-in">
                    <div
                        className="bg-[#121214] border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl shadow-black/50 animate-in zoom-in-95"
                        onClick={(ev) => ev.stopPropagation()}
                    >
                        <div className="p-8">
                            <div className="flex items-start justify-between mb-8">
                                <div className="flex gap-6 items-center">
                                    <div className="w-20 h-20 rounded-2xl bg-white/[0.05] p-4 flex items-center justify-center border border-white/10 shadow-2xl">
                                        <img src={selectedApp.icon} alt={selectedApp.name} className="w-full h-full object-contain" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold text-white mb-2">{selectedApp.name}</h3>
                                        <div className="flex gap-2 items-center">
                                            <Badge variant="gray" className="text-xs py-1 px-3">
                                                {t.docker.community.categories[selectedApp.category]}
                                            </Badge>
                                            <div className="flex gap-1">
                                                {selectedApp.architectures.map(arch => (
                                                    <span key={arch} className="text-[10px] font-bold text-gray-500 bg-white/[0.05] px-2 py-0.5 rounded border border-white/5 uppercase">
                                                        {arch}
                                                    </span>
                                                ))}
                                            </div>
                                            <div className="mt-1">
                                                <ImageStatusBadge imageName={selectedApp.primaryImage} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedApp(null)}
                                    className="p-2 hover:bg-white/5 rounded-full text-gray-500 hover:text-white transition-colors"
                                >
                                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M13.5 4.5L4.5 13.5M4.5 4.5L13.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </button>
                            </div>

                            <div className="flex gap-4 mb-6 pb-6 border-b border-white/5 overflow-x-auto no-scrollbar">
                                <div className="flex flex-col gap-1 min-w-24">
                                    <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">{(t.docker.community.categories as Record<string, string>).title || 'Category'}</span>
                                    <span className="text-sm text-white font-medium">{(t.docker.community.categories as Record<string, string>)[selectedApp.category]}</span>
                                </div>
                                <div className="flex flex-col gap-1 min-w-24">
                                    <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Latest Version</span>
                                    <span className="text-sm text-brand-blue font-bold flex items-center gap-1.5">
                                        {selectedApp.currentVersion || 'Checking...'}
                                        <VersionBadge app={selectedApp} />
                                    </span>
                                </div>
                                <div className="flex flex-col gap-1 min-w-24">
                                    <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Architectures</span>
                                    <div className="flex gap-1 mt-0.5">
                                        {selectedApp.architectures.map(arch => (
                                            <span key={arch} className="text-[9px] font-black px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-gray-400 uppercase">
                                                {arch}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <p className="text-sm text-gray-400 leading-relaxed mb-8">
                                {selectedApp.description}
                            </p>

                            <div className="bg-brand-blue/5 border border-brand-blue/10 rounded-2xl p-4 flex gap-4 mb-8 items-start">
                                <Info className="text-brand-blue shrink-0 mt-0.5" size={18} />
                                <p className="text-xs text-brand-blue/80 leading-relaxed">
                                    {t.docker.community.install_desc}
                                </p>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => onInstall(selectedApp)}
                                    className="flex-1 bg-brand-blue hover:bg-brand-blue-hover text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-brand-blue/20 flex items-center justify-center gap-2"
                                >
                                    <Download size={18} />
                                    {t.docker.community.install}
                                </button>
                                <a
                                    href={selectedApp.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={t.docker.community.visit_website}
                                    className="px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 text-white rounded-xl transition-all flex items-center justify-center"
                                >
                                    <ExternalLink size={18} />
                                </a>
                                <a
                                    href={(() => {
                                        const cleanImage = selectedApp.primaryImage.split(':')[0].split('@')[0];
                                        const repoPath = cleanImage.includes('/') ? cleanImage : `library/${cleanImage}`;
                                        return `https://hub.docker.com/r/${repoPath}`;
                                    })()}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={t.docker.community.visit_dockerhub}
                                    className="px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 text-white rounded-xl transition-all flex items-center justify-center"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M22 7.7c0-1.1-.9-2-2-2h-3.3c-.6 0-1.1-.5-1.1-1.1V1h-4.4v3.3c0 .6-.5 1.1-1.1 1.1H6.7c-1.1 0-2 .9-2 2v3.3h-4v4.4h4v3.3c0 1.1.9 2 2 2h3.3c.6 0 1.1.5 1.1 1.1V22h4.4v-3.3c0-.6.5-1.1 1.1-1.1h3.3c1.1 0 2-.9 2-2v-3.3h4V7.7h-4z" />
                                    </svg>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
