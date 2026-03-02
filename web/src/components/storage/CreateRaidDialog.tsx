'use client';

import { useCallback, useState, useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { client } from '@/api/client';
import { useCachedData } from '@/hooks/useCachedData';
import { cacheManager } from '@/lib/cacheManager';
import { 
    HardDrive, 
    Shield, 
    Zap, 
    Layers, 
    AlertTriangle, 
    CheckCircle2,
    RefreshCw,
    X,
    Info
} from 'lucide-react';
import type { CreateRaidRequest } from '@/types/raid';

interface DiskInfo {
    deviceIdentifier: string;
    volumeName?: string;
    size: number;
    deviceNode: string;
    mountPoint?: string;
    content?: string;
    isInternal: boolean;
    isWholeDisk?: boolean;
    isVirtual?: boolean;
    isRaidMember?: boolean;
    partitions?: DiskInfo[];
}

interface CreateRaidDialogProps {
    onClose: () => void;
    onCreated?: () => void;
}

type RaidType = 'mirror' | 'stripe' | 'concat';

export default function CreateRaidDialog({ onClose, onCreated }: CreateRaidDialogProps) {
    const { t } = useTranslation();
    const [step, setStep] = useState(1);
    const [raidType, setRaidType] = useState<RaidType>('mirror');
    const [raidName, setRaidName] = useState('');
    const [selectedDisks, setSelectedDisks] = useState<string[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const { data: disks, loading } = useCachedData<DiskInfo[]>({
        cacheKey: 'disks',
        fetchFn: async () => await client.get<DiskInfo[]>('/disks'),
        initialValue: [],
        ttl: 30000,
    });
    
    // Filter available disks (physical, external, not RAID members, not mounted)
    const availableDisks = useMemo(() => {
        const result: DiskInfo[] = [];
        
        const findAvailablePartitions = (disk: DiskInfo, isParentExternal: boolean) => {
            // Check if this partition is available for RAID
            if (!disk.isWholeDisk && !disk.isVirtual && !disk.isRaidMember) {
                // Skip system partitions
                const skipContents = ['EFI', 'Apple_Boot', 'Apple_APFS_ISC', 'Apple_APFS_Recovery'];
                if (disk.content && skipContents.some(s => disk.content?.includes(s))) {
                    return;
                }
                // Skip mounted partitions (in use)
                if (disk.mountPoint) {
                    return;
                }
                result.push({ ...disk, isInternal: !isParentExternal });
            }
            
            // Recursively check partitions
            disk.partitions?.forEach(p => findAvailablePartitions(p, isParentExternal));
        };
        
        disks.forEach(disk => {
            if (disk.isWholeDisk && !disk.isVirtual) {
                findAvailablePartitions(disk, !disk.isInternal);
            }
        });
        
        return result;
    }, [disks]);
    
    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1000;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };
    
    const toggleDisk = useCallback((deviceId: string) => {
        setSelectedDisks(prev => 
            prev.includes(deviceId) 
                ? prev.filter(d => d !== deviceId)
                : [...prev, deviceId]
        );
    }, []);
    
    const calculatedSize = useMemo(() => {
        if (selectedDisks.length === 0) return 0;
        
        const selectedDiskSizes = selectedDisks.map(id => {
            const disk = availableDisks.find(d => d.deviceIdentifier === id);
            return disk?.size || 0;
        });
        
        switch (raidType) {
            case 'mirror':
                return Math.min(...selectedDiskSizes);
            case 'stripe':
            case 'concat':
                return selectedDiskSizes.reduce((a, b) => a + b, 0);
            default:
                return 0;
        }
    }, [selectedDisks, availableDisks, raidType]);
    
    const canCreate = raidName.trim().length > 0 && selectedDisks.length >= 2;
    
    const handleCreate = useCallback(async () => {
        if (!canCreate) return;
        
        setIsCreating(true);
        setError(null);
        
        try {
            const request: CreateRaidRequest = {
                type: raidType,
                name: raidName.trim(),
                disks: selectedDisks
            };
            await client.post('/raids', request);
            cacheManager.invalidate('raids');
            cacheManager.invalidate('disks');
            onCreated?.();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create RAID');
        } finally {
            setIsCreating(false);
        }
    }, [canCreate, raidType, raidName, selectedDisks, onClose, onCreated]);
    
    const raidTypes = [
        {
            id: 'mirror' as RaidType,
            name: 'RAID 1 (Mirror)',
            icon: <Shield size={24} className="text-blue-400" />,
            description: t.storage.raid.mirror_description,
            selectedClass: 'border-blue-500/50 bg-blue-500/10',
            checkClass: 'text-blue-400'
        },
        {
            id: 'stripe' as RaidType,
            name: 'RAID 0 (Stripe)',
            icon: <Zap size={24} className="text-yellow-400" />,
            description: t.storage.raid.stripe_description,
            selectedClass: 'border-yellow-500/50 bg-yellow-500/10',
            checkClass: 'text-yellow-400'
        },
        {
            id: 'concat' as RaidType,
            name: 'JBOD (Concat)',
            icon: <Layers size={24} className="text-purple-400" />,
            description: t.storage.raid.concat_description,
            selectedClass: 'border-purple-500/50 bg-purple-500/10',
            checkClass: 'text-purple-400'
        }
    ];
    
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10">
                    <h2 className="text-xl font-semibold text-white">{t.storage.raid.create_new}</h2>
                    <button onClick={onClose} className="text-white/60 hover:text-white">
                        <X size={24} />
                    </button>
                </div>
                
                {/* Progress Steps */}
                <div className="flex items-center gap-4 px-6 py-4 border-b border-white/10">
                    {[1, 2, 3].map(s => (
                        <div key={s} className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                                step >= s 
                                    ? 'bg-blue-500 text-white' 
                                    : 'bg-white/10 text-white/40'
                            }`}>
                                {s}
                            </div>
                            <span className={`text-sm ${step >= s ? 'text-white' : 'text-white/40'}`}>
                                {s === 1 ? t.storage.raid.step_type : s === 2 ? t.storage.raid.step_disks : t.storage.raid.step_confirm}
                            </span>
                            {s < 3 && <div className="w-8 h-px bg-white/10" />}
                        </div>
                    ))}
                </div>
                
                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Error Message */}
                    {error && (
                        <div className="mb-4 p-4 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 flex items-center gap-2">
                            <AlertTriangle size={18} />
                            {error}
                            <button onClick={() => setError(null)} className="ml-auto">
                                <X size={18} />
                            </button>
                        </div>
                    )}
                    
                    {/* Step 1: Select RAID Type */}
                    {step === 1 && (
                        <div className="space-y-4">
                            <p className="text-white/70 mb-4">{t.storage.raid.select_type}</p>
                            {raidTypes.map(type => (
                                <div
                                    key={type.id}
                                    onClick={() => setRaidType(type.id)}
                                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                                        raidType === type.id
                                            ? type.selectedClass
                                            : 'border-white/10 hover:border-white/20 bg-white/5'
                                    }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 rounded-lg bg-white/5">
                                            {type.icon}
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-medium text-white">{type.name}</div>
                                            <div className="text-sm text-white/60">{type.description}</div>
                                        </div>
                                        {raidType === type.id && (
                                            <CheckCircle2 size={24} className={type.checkClass} />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {/* Step 2: Select Disks */}
                    {step === 2 && (
                        <div className="space-y-4">
                            <p className="text-white/70 mb-4">{t.storage.raid.select_disks}</p>
                            
                            {loading ? (
                                <div className="text-center py-8 text-white/60">
                                    <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                                    {t.common.loading}
                                </div>
                            ) : availableDisks.length === 0 ? (
                                <div className="text-center py-8">
                                    <HardDrive size={48} className="mx-auto text-white/20 mb-4" />
                                    <p className="text-white/60">{t.storage.raid.no_available_disks}</p>
                                    <p className="text-sm text-white/40 mt-2">{t.storage.raid.no_available_disks_hint}</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {availableDisks.map(disk => (
                                        <div
                                            key={disk.deviceIdentifier}
                                            onClick={() => toggleDisk(disk.deviceIdentifier)}
                                            className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                                selectedDisks.includes(disk.deviceIdentifier)
                                                    ? 'border-blue-500/50 bg-blue-500/10'
                                                    : 'border-white/10 hover:border-white/20 bg-white/5'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                                                    selectedDisks.includes(disk.deviceIdentifier)
                                                        ? 'border-blue-500 bg-blue-500'
                                                        : 'border-white/30'
                                                }`}>
                                                    {selectedDisks.includes(disk.deviceIdentifier) && (
                                                        <CheckCircle2 size={14} className="text-white" />
                                                    )}
                                                </div>
                                                <HardDrive size={18} className="text-white/60" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-mono text-white">{disk.deviceIdentifier}</div>
                                                    <div className="text-sm text-white/50">
                                                        {formatBytes(disk.size)}
                                                        {disk.content && <span className="ml-2">({disk.content})</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            
                            {selectedDisks.length > 0 && (
                                <div className="mt-4 p-3 rounded-lg bg-white/5">
                                    <div className="text-sm text-white/60">{t.storage.raid.selected}: {selectedDisks.length} {t.storage.raid.disks}</div>
                                    <div className="text-lg font-medium text-white">{t.storage.raid.estimated_size}: {formatBytes(calculatedSize)}</div>
                                </div>
                            )}
                            
                            {selectedDisks.length < 2 && (
                                <div className="flex items-start gap-2 text-sm text-yellow-400/80 mt-4">
                                    <Info size={16} className="flex-shrink-0 mt-0.5" />
                                    {t.storage.raid.min_disks_warning}
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Step 3: Confirm */}
                    {step === 3 && (
                        <div className="space-y-4">
                            <p className="text-white/70 mb-4">{t.storage.raid.confirm_settings}</p>
                            
                            {/* Name Input */}
                            <div>
                                <label className="block text-sm text-white/60 mb-2">{t.storage.raid.raid_name}</label>
                                <input
                                    type="text"
                                    value={raidName}
                                    onChange={e => setRaidName(e.target.value.replace(/\s/g, ''))}
                                    placeholder="MyRaid1"
                                    className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-blue-500/50 focus:outline-none"
                                />
                            </div>
                            
                            {/* Summary */}
                            <Card className="p-4 bg-white/5">
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <span className="text-white/60">{t.storage.raid.type}</span>
                                        <span className="text-white font-medium">
                                            {raidTypes.find(r => r.id === raidType)?.name}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-white/60">{t.storage.raid.disks}</span>
                                        <span className="text-white font-medium">{selectedDisks.length}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-white/60">{t.storage.raid.total_size}</span>
                                        <span className="text-white font-medium">{formatBytes(calculatedSize)}</span>
                                    </div>
                                </div>
                            </Card>
                            
                            {/* Warning */}
                            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                                <div className="flex items-start gap-3">
                                    <AlertTriangle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <div className="font-medium text-red-400">{t.storage.raid.warning}</div>
                                        <div className="text-sm text-red-300/70 mt-1">{t.storage.raid.create_warning}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Footer */}
                <div className="flex items-center justify-between p-6 border-t border-white/10">
                    <Button
                        variant="ghost"
                        onClick={() => step > 1 ? setStep(step - 1) : onClose()}
                    >
                        {step > 1 ? t.common.back : t.common.cancel}
                    </Button>
                    
                    {step < 3 ? (
                        <Button
                            variant="primary"
                            onClick={() => setStep(step + 1)}
                            disabled={step === 2 && selectedDisks.length < 2}
                        >
                            {t.common.next}
                        </Button>
                    ) : (
                        <Button
                            variant="primary"
                            onClick={handleCreate}
                            disabled={!canCreate || isCreating}
                        >
                            {isCreating ? (
                                <>
                                    <RefreshCw size={16} className="animate-spin" />
                                    {t.storage.raid.creating}
                                </>
                            ) : (
                                t.storage.raid.create
                            )}
                        </Button>
                    )}
                </div>
            </Card>
        </div>
    );
}
