'use client';

import { useCallback, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useConfirm } from '@/hooks/useConfirm';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { client } from '@/api/client';
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
    Minus,
    Trash2,
    Wrench,
    ChevronLeft,
    X
} from 'lucide-react';
import type { RaidSet, RaidMember, RaidStatus } from '@/types/raid';

interface RaidManagerProps {
    raid: RaidSet;
    onBack: () => void;
    onDeleted?: () => void;
}

export default function RaidManager({ raid, onBack, onDeleted }: RaidManagerProps) {
    const { t } = useTranslation();
    const { confirm, ConfirmDialog } = useConfirm();
    const [isDeleting, setIsDeleting] = useState(false);
    const [isRepairing, setIsRepairing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
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
                return <Shield size={24} className="text-blue-400" />;
            case 'stripe':
                return <Zap size={24} className="text-yellow-400" />;
            case 'concat':
                return <Layers size={24} className="text-purple-400" />;
            default:
                return <Database size={24} className="text-gray-400" />;
        }
    };
    
    const getStatusBadge = (status: RaidStatus) => {
        switch (status) {
            case 'Online':
                return (
                    <span className="flex items-center gap-1 text-sm px-3 py-1 rounded-full bg-green-500/20 text-green-400">
                        <CheckCircle2 size={14} />
                        {t.storage.raid.status_online}
                    </span>
                );
            case 'Degraded':
                return (
                    <span className="flex items-center gap-1 text-sm px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400">
                        <AlertTriangle size={14} />
                        {t.storage.raid.status_degraded}
                    </span>
                );
            case 'Offline':
                return (
                    <span className="flex items-center gap-1 text-sm px-3 py-1 rounded-full bg-red-500/20 text-red-400">
                        <AlertTriangle size={14} />
                        {t.storage.raid.status_offline}
                    </span>
                );
            case 'Rebuilding':
                return (
                    <span className="flex items-center gap-1 text-sm px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 animate-pulse">
                        <RefreshCw size={14} className="animate-spin" />
                        {t.storage.raid.status_rebuilding}
                    </span>
                );
            default:
                return null;
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
    
    const handleDelete = useCallback(async () => {
        const confirmed = await confirm({
            title: t.storage.raid.confirm_delete,
            message: `${t.storage.raid.confirm_delete_description}\n\n${t.storage.raid.data_loss_warning}`,
            confirmText: t.storage.raid.delete,
            cancelText: t.common.cancel,
            variant: 'danger'
        });
        
        if (!confirmed) return;
        
        setIsDeleting(true);
        setError(null);
        try {
            await client.delete(`/raids/${raid.uniqueId}`);
            cacheManager.invalidate('raids');
            cacheManager.invalidate('disks');
            onDeleted?.();
            onBack();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete RAID');
        } finally {
            setIsDeleting(false);
        }
    }, [raid.uniqueId, onBack, onDeleted, confirm, t]);
    
    const handleRepair = useCallback(async (memberDeviceNode: string) => {
        setIsRepairing(true);
        setError(null);
        try {
            await client.post(`/raids/${raid.uniqueId}/repair`, { disk: memberDeviceNode });
            cacheManager.invalidate('raids');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to repair RAID');
        } finally {
            setIsRepairing(false);
        }
    }, [raid.uniqueId]);
    
    const handleRemoveMember = useCallback(async (member: RaidMember) => {
        const confirmed = await confirm({
            title: t.storage.raid.confirm_remove_member,
            message: t.storage.raid.confirm_remove_description.replace('{disk}', member.deviceNode),
            confirmText: t.storage.raid.remove,
            cancelText: t.common.cancel,
            variant: 'warning'
        });
        
        if (!confirmed) return;
        
        setError(null);
        try {
            await client.post(`/raids/${raid.uniqueId}/remove`, { disk: member.deviceNode });
            cacheManager.invalidate('raids');
            cacheManager.invalidate('disks');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to remove member');
        }
    }, [raid.uniqueId, confirm, t]);
    
    const canRemoveMember = raid.type.toLowerCase() === 'mirror' && raid.members.length > 2;
    const needsRepair = raid.status === 'Degraded';
    
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="space-y-4">
                <button 
                    onClick={onBack}
                    className="group flex items-center gap-1 text-sm text-white/40 hover:text-white/80 transition-all"
                >
                    <ChevronLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
                    {t.storage.raid.back_to_storage_pools}
                </button>
                
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="p-3 rounded-xl bg-white/5 backdrop-blur-md border border-white/5 flex-shrink-0">
                            {getTypeIcon(raid.type)}
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-2xl font-bold text-white tracking-tight truncate">{raid.name}</h2>
                            <div className="text-sm text-white/50 truncate">{getTypeLabel(raid.type)}</div>
                        </div>
                    </div>
                    <div className="flex-shrink-0">
                        {getStatusBadge(raid.status)}
                    </div>
                </div>
            </div>
            
            {/* Error Message */}
            {error && (
                <div className="p-4 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 flex items-center gap-2">
                    <AlertTriangle size={18} />
                    {error}
                    <button onClick={() => setError(null)} className="ml-auto">
                        <X size={18} />
                    </button>
                </div>
            )}
            
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4">
                    <div className="text-sm text-white/50 mb-1">{t.storage.raid.total_size}</div>
                    <div className="text-xl font-semibold text-white">{formatBytes(raid.size)}</div>
                </Card>
                <Card className="p-4">
                    <div className="text-sm text-white/50 mb-1">{t.storage.raid.member_count}</div>
                    <div className="text-xl font-semibold text-white">{raid.members.length}</div>
                </Card>
                <Card className="p-4">
                    <div className="text-sm text-white/50 mb-1">{t.storage.raid.device_node}</div>
                    <div className="text-xl font-semibold text-white font-mono">/dev/{raid.deviceNode}</div>
                </Card>
                <Card className="p-4">
                    <div className="text-sm text-white/50 mb-1">{t.storage.raid.rebuild_mode}</div>
                    <div className="text-xl font-semibold text-white">{raid.rebuild}</div>
                </Card>
            </div>
            
            {/* Degraded Warning */}
            {needsRepair && (
                <Card className="p-4 bg-yellow-500/10 border-yellow-500/30">
                    <div className="flex items-start gap-3">
                        <AlertTriangle size={24} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <div className="font-medium text-yellow-400 mb-1">{t.storage.raid.degraded_warning}</div>
                            <div className="text-sm text-yellow-300/70">{t.storage.raid.degraded_description}</div>
                        </div>
                    </div>
                </Card>
            )}
            
            {/* Members */}
            <Card className="p-4">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-white">{t.storage.raid.members}</h3>
                    {raid.type.toLowerCase() === 'mirror' && (
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled
                            title="Coming soon"
                        >
                            <Plus size={16} />
                            {t.storage.raid.add_member}
                        </Button>
                    )}
                </div>
                <div className="space-y-3">
                    {raid.members.map(member => (
                        <div 
                            key={member.uuid}
                            className="flex items-center gap-4 p-3 rounded-lg bg-white/5"
                        >
                            <div className="p-2 rounded-lg bg-white/5">
                                <HardDrive size={20} className="text-white/60" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-mono text-white">{member.deviceNode}</div>
                                <div className="text-sm text-white/50">{formatBytes(member.size)}</div>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full ${
                                member.status === 'Online' 
                                    ? 'bg-green-500/20 text-green-400'
                                    : member.status === 'Failed'
                                    ? 'bg-red-500/20 text-red-400'
                                    : member.status === 'Spare'
                                    ? 'bg-blue-500/20 text-blue-400'
                                    : 'bg-yellow-500/20 text-yellow-400'
                            }`}>
                                {member.status}
                            </span>
                            <div className="flex items-center gap-2">
                                {member.status === 'Failed' && raid.type.toLowerCase() === 'mirror' && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRepair(member.deviceNode)}
                                        disabled={isRepairing}
                                        className="text-yellow-400 hover:text-yellow-300"
                                    >
                                        <Wrench size={16} />
                                    </Button>
                                )}
                                {canRemoveMember && member.status !== 'Failed' && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemoveMember(member)}
                                        className="text-red-400 hover:text-red-300"
                                    >
                                        <Minus size={16} />
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </Card>
            
            {/* UUID Info */}
            <Card className="p-4">
                <div className="text-sm text-white/50 mb-1">UUID</div>
                <div className="font-mono text-white/80 text-sm break-all">{raid.uniqueId}</div>
            </Card>
            
            {/* Danger Zone */}
            <Card className="p-4 border-red-500/20">
                <h3 className="text-lg font-medium text-red-400 mb-4">{t.storage.raid.danger_zone}</h3>
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-white">{t.storage.raid.delete_raid}</div>
                        <div className="text-sm text-white/50">{t.storage.raid.delete_warning}</div>
                    </div>
                    <Button
                        variant="danger"
                        onClick={handleDelete}
                        disabled={isDeleting}
                    >
                        <Trash2 size={16} />
                        {t.storage.raid.delete}
                    </Button>
                </div>
            </Card>
            
            {/* Unified Confirm Dialog */}
            <ConfirmDialog />
        </div>
    );
}
