import { useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Card } from "@/components/ui/Card";
import { HardDrive, Server, Database } from "lucide-react";
import { client } from "@/api/client";
import { useCachedData } from "@/hooks/useCachedData";
import type { RaidSet } from "@/types/raid";

interface DiskInfo {
    deviceIdentifier: string;
    size: number;
    isInternal: boolean;
    isVirtual?: boolean;
    isWholeDisk?: boolean;
    partitions?: DiskInfo[];
    isRaidMember?: boolean;
}

export default function StorageDashboard() {
    const { t } = useTranslation();
    
    // 使用 useCachedData 与 DiskManager 共享 'disks' 缓存
    const { data: disks, loading: disksLoading } = useCachedData<DiskInfo[]>({
        cacheKey: 'disks',
        fetchFn: async () => await client.get<DiskInfo[]>('/disks'),
        initialValue: [],
        ttl: 30000,
    });
    
    // 获取 RAID 数据
    const { data: raids, loading: raidsLoading } = useCachedData<RaidSet[]>({
        cacheKey: 'raids',
        fetchFn: async () => await client.get<RaidSet[]>('/raids'),
        initialValue: [],
        ttl: 30000,
    });
    
    const loading = disksLoading || raidsLoading;

    // 使用 useMemo 从 disks 计算统计信息
    const stats = useMemo(() => {
        let internalTotal = 0;
        let externalTotal = 0;
        let internalCount = 0;
        let externalCount = 0;

        disks.forEach(d => {
            // Only count physical whole disks to avoid double counting partitions
            // Skip virtual disks (APFS containers, disk images, etc.)
            // Skip partitions (only count the parent whole disk)
            if (d.isVirtual || !d.isWholeDisk) {
                return;
            }

            if (d.isInternal) {
                internalTotal += d.size;
                internalCount++;
            } else {
                externalTotal += d.size;
                externalCount++;
            }
        });

        return {
            internalTotal,
            externalTotal,
            internalCount,
            externalCount
        };
    }, [disks]);
    
    // 计算 RAID 统计信息
    const raidStats = useMemo(() => {
        let totalSize = 0;
        let onlineCount = 0;
        let degradedCount = 0;
        
        raids.forEach(r => {
            totalSize += r.size;
            if (r.status === 'Online') {
                onlineCount++;
            } else if (r.status === 'Degraded') {
                degradedCount++;
            }
        });
        
        return {
            totalSize,
            count: raids.length,
            onlineCount,
            degradedCount
        };
    }, [raids]);

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1000;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {[1, 2, 3].map(i => (
                    <Card key={i} className="p-6 animate-pulse">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-full bg-white/10" />
                            <div className="space-y-2">
                                <div className="h-3 w-16 bg-white/10 rounded" />
                                <div className="h-6 w-24 bg-white/10 rounded" />
                            </div>
                        </div>
                        <div className="h-3 w-20 bg-white/10 rounded" />
                    </Card>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="p-6 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 rounded-full bg-blue-500/20 text-blue-400">
                        <HardDrive size={24} />
                    </div>
                    <div>
                        <div className="text-sm text-blue-200/60 font-medium uppercase tracking-wider">{t.storage.overview.internal}</div>
                        <div className="text-2xl font-bold text-white">{formatBytes(stats.internalTotal)}</div>
                    </div>
                </div>
                <div className="text-xs text-blue-300/50">
                    {t.storage.disks.internal_count.replace('{count}', stats.internalCount.toString())}
                </div>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 rounded-full bg-orange-500/20 text-orange-400">
                        <Server size={24} />
                    </div>
                    <div>
                        <div className="text-sm text-orange-200/60 font-medium uppercase tracking-wider">{t.storage.overview.external}</div>
                        <div className="text-2xl font-bold text-white">{formatBytes(stats.externalTotal)}</div>
                    </div>
                </div>
                <div className="text-xs text-orange-300/50">
                    {t.storage.disks.external_count.replace('{count}', stats.externalCount.toString())}
                </div>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 rounded-full bg-purple-500/20 text-purple-400">
                        <Database size={24} />
                    </div>
                    <div>
                        <div className="text-sm text-purple-200/60 font-medium uppercase tracking-wider">{t.storage.overview.storage_pools}</div>
                        <div className="text-2xl font-bold text-white">
                            {raidStats.count > 0 ? formatBytes(raidStats.totalSize) : '--'}
                        </div>
                    </div>
                </div>
                <div className="text-xs text-purple-300/50">
                    {raidStats.count > 0 ? (
                        <>
                            {t.storage.raid.pool_count.replace('{count}', raidStats.count.toString())}
                            {raidStats.degradedCount > 0 && (
                                <span className="text-yellow-400 ml-2">
                                    ({raidStats.degradedCount} {t.storage.raid.degraded})
                                </span>
                            )}
                        </>
                    ) : (
                        t.storage.raid.no_pools
                    )}
                </div>
            </Card>
        </div>
    );
}
