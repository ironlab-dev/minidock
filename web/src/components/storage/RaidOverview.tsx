'use client';

import { useCallback, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { client } from '@/api/client';
import { useCachedData } from '@/hooks/useCachedData';
import { cacheManager } from '@/lib/cacheManager';
import { 
    Database, 
    HardDrive, 
    Shield, 
    Zap, 
    Layers, 
    AlertTriangle, 
    CheckCircle2,
    RefreshCw,
    Plus,
    ChevronRight
} from 'lucide-react';
import type { RaidSet, RaidStatus } from '@/types/raid';

interface RaidOverviewProps {
    onSelectRaid?: (raid: RaidSet) => void;
    onCreateRaid?: () => void;
}

export default function RaidOverview({ onSelectRaid, onCreateRaid }: RaidOverviewProps) {
    const { t } = useTranslation();
    const [expandedRaid, setExpandedRaid] = useState<string | null>(null);
    
    const { data: raids, loading, isRefreshing, refresh } = useCachedData<RaidSet[]>({
        cacheKey: 'raids',
        fetchFn: async () => await client.get<RaidSet[]>('/raids'),
        initialValue: [],
        ttl: 30000,
    });
    
    const handleRefresh = useCallback(async () => {
        cacheManager.invalidate('raids');
        await refresh();
    }, [refresh]);
    
    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1000;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };
    
    const getTypeIcon = (type: string) => {
        switch (type.toLowerCase()) {
            case 'mirror':
                return <Shield size={18} className="text-blue-400" />;
            case 'stripe':
                return <Zap size={18} className="text-yellow-400" />;
            case 'concat':
                return <Layers size={18} className="text-purple-400" />;
            default:
                return <Database size={18} className="text-gray-400" />;
        }
    };
    
    const getStatusBadge = (status: RaidStatus) => {
        switch (status) {
            case 'Online':
                return (
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                        <CheckCircle2 size={12} />
                        {t.storage.raid.status_online}
                    </span>
                );
            case 'Degraded':
                return (
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
                        <AlertTriangle size={12} />
                        {t.storage.raid.status_degraded}
                    </span>
                );
            case 'Offline':
                return (
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                        <AlertTriangle size={12} />
                        {t.storage.raid.status_offline}
                    </span>
                );
            case 'Rebuilding':
                return (
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 animate-pulse">
                        <RefreshCw size={12} className="animate-spin" />
                        {t.storage.raid.status_rebuilding}
                    </span>
                );
            default:
                return (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-500/20 text-gray-400">
                        {status}
                    </span>
                );
        }
    };
    
    const getTypeLabel = (type: string) => {
        switch (type.toLowerCase()) {
            case 'mirror':
                return 'RAID 1 (Mirror)';
            case 'stripe':
                return 'RAID 0 (Stripe)';
            case 'concat':
                return 'JBOD (Concat)';
            default:
                return type;
        }
    };
    
    if (loading) {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">{t.storage.raid.title}</h3>
                </div>
                {[1, 2].map(i => (
                    <Card key={i} className="p-4 animate-pulse">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-white/10" />
                            <div className="flex-1 space-y-2">
                                <div className="h-4 w-32 bg-white/10 rounded" />
                                <div className="h-3 w-24 bg-white/10 rounded" />
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        );
    }
    
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">{t.storage.raid.title}</h3>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="text-white/60 hover:text-white"
                    >
                        <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                    </Button>
                    {onCreateRaid && (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={onCreateRaid}
                        >
                            <Plus size={16} />
                            {t.storage.raid.create}
                        </Button>
                    )}
                </div>
            </div>
            
            {raids.length === 0 ? (
                <Card className="p-8 text-center">
                    <Database size={48} className="mx-auto text-white/20 mb-4" />
                    <p className="text-white/60 mb-4">{t.storage.raid.no_pools}</p>
                    {onCreateRaid && (
                        <Button variant="primary" onClick={onCreateRaid}>
                            <Plus size={16} />
                            {t.storage.raid.create_first}
                        </Button>
                    )}
                </Card>
            ) : (
                <div className="space-y-3">
                    {raids.map(raid => (
                        <Card 
                            key={raid.uniqueId}
                            className="p-4 hover:bg-white/5 transition-colors cursor-pointer"
                            onClick={() => {
                                if (onSelectRaid) {
                                    onSelectRaid(raid);
                                } else {
                                    setExpandedRaid(expandedRaid === raid.uniqueId ? null : raid.uniqueId);
                                }
                            }}
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-2.5 rounded-lg bg-white/5">
                                    {getTypeIcon(raid.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-medium text-white truncate">{raid.name}</span>
                                        {getStatusBadge(raid.status)}
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-white/50">
                                        <span>{getTypeLabel(raid.type)}</span>
                                        <span>•</span>
                                        <span>{formatBytes(raid.size)}</span>
                                        <span>•</span>
                                        <span>{raid.members.length} {t.storage.raid.disks}</span>
                                    </div>
                                </div>
                                <ChevronRight 
                                    size={20} 
                                    className={`text-white/30 transition-transform ${
                                        expandedRaid === raid.uniqueId ? 'rotate-90' : ''
                                    }`} 
                                />
                            </div>
                            
                            {expandedRaid === raid.uniqueId && (
                                <div className="mt-4 pt-4 border-t border-white/10">
                                    <div className="text-sm text-white/60 mb-2">{t.storage.raid.members}:</div>
                                    <div className="space-y-2">
                                        {raid.members.map(member => (
                                            <div 
                                                key={member.uuid}
                                                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5"
                                            >
                                                <HardDrive size={16} className="text-white/40" />
                                                <span className="font-mono text-sm text-white/80">
                                                    {member.deviceNode}
                                                </span>
                                                <span className={`text-xs px-2 py-0.5 rounded ${
                                                    member.status === 'Online' 
                                                        ? 'bg-green-500/20 text-green-400'
                                                        : member.status === 'Failed'
                                                        ? 'bg-red-500/20 text-red-400'
                                                        : 'bg-yellow-500/20 text-yellow-400'
                                                }`}>
                                                    {member.status}
                                                </span>
                                                <span className="ml-auto text-sm text-white/50">
                                                    {formatBytes(member.size)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-3 text-xs text-white/40">
                                        <span>UUID: {raid.uniqueId}</span>
                                        <span className="ml-4">Device: /dev/{raid.deviceNode}</span>
                                        <span className="ml-4">Rebuild: {raid.rebuild}</span>
                                    </div>
                                </div>
                            )}
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
