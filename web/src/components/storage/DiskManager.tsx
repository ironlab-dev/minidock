import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Card } from "@/components/ui/Card";
import { HardDrive, Disc, RefreshCw, Trash2, Power, Play, Square, Monitor, Shield } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Switch } from "@/components/ui/Switch";
import { client } from "@/api/client";
import { useCachedData } from "@/hooks/useCachedData";

interface DiskInfo {
    deviceIdentifier: string;
    volumeName?: string;
    size: number;
    deviceNode: string;
    mountPoint?: string;
    content?: string;
    partitions?: DiskInfo[];
    isInternal: boolean;
    isWholeDisk: boolean;
    // Extended Metadata
    model?: string;
    busProtocol?: string;
    isVirtual?: boolean;
    // Usage Stats
    freeSpace?: number;
    totalSpace?: number;
    // RAID Info
    raidSetId?: string;
    isRaidMember?: boolean;
}

export default function DiskManager() {
    const { t } = useTranslation();
    const [showVirtual, setShowVirtual] = useState(false);
    const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
    const [statusMessage, setStatusMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

    // Erase Dialog State
    const [eraseDialog, setEraseDialog] = useState<{ isOpen: boolean; diskId: string | null; diskName: string | null }>({
        isOpen: false,
        diskId: null,
        diskName: null
    });

    // Use cached data hook for disk list
    const {
        data: disks,
        loading,
        refresh: fetchDisks,
    } = useCachedData<DiskInfo[]>({
        cacheKey: 'disks',
        fetchFn: async () => {
            try {
                return await client.get<DiskInfo[]>('/disks');
            } catch (error) {
                console.error(error);
                setStatusMessage({ text: t.common?.error || "Failed to load disks", type: 'error' });
                throw error;
            }
        },
        initialValue: [],
        ttl: 30000, // 30 seconds cache
    });

    const handleAction = async (id: string, action: 'mount' | 'unmount' | 'eject') => {
        setActionLoading(prev => ({ ...prev, [id]: true }));
        try {
            await client.post(`/disks/${id}/${action}`, {});

            setStatusMessage({ text: t.common?.operation_success || "Successful", type: 'success' });
            fetchDisks();
        } catch (error) {
            console.error(error);
            setStatusMessage({ text: t.common?.operation_failed || "Failed", type: 'error' });
        } finally {
            setActionLoading(prev => ({ ...prev, [id]: false }));
            setTimeout(() => setStatusMessage(null), 3000);
        }
    };

    const handleErase = async () => {
        if (!eraseDialog.diskId) return;

        const id = eraseDialog.diskId;
        setActionLoading(prev => ({ ...prev, [id]: true }));

        try {
            // Defaulting to ExFAT and keeping the same name or "Untitled" for now
            const format = "ExFAT";
            const name = "Untitled";

            await client.post(`/disks/${id}/erase`, { format, name });

            setStatusMessage({ text: t.storage.disks.format_success || "Format successful", type: 'success' });
            fetchDisks();
        } catch (error) {
            console.error(error);
            setStatusMessage({ text: error instanceof Error ? error.message : t.storage.disks.format_failed || "Format failed", type: 'error' });
        } finally {
            setEraseDialog({ isOpen: false, diskId: null, diskName: null });
            setActionLoading(prev => ({ ...prev, [id]: false }));
            setTimeout(() => setStatusMessage(null), 3000);
        }
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1000;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const filteredDisks = disks.filter(d => showVirtual || !d.isVirtual);

    const renderUsageBar = (disk: DiskInfo) => {
        // Only show usage for volumes or containers, not physical whole disks
        if (disk.isWholeDisk && !disk.content?.includes("Container")) return null;
        if (disk.freeSpace === undefined || disk.totalSpace === undefined) return null;
        if (disk.totalSpace === 0) return null;

        const used = disk.totalSpace - disk.freeSpace;
        const percent = Math.min(100, Math.max(0, (used / disk.totalSpace) * 100));
        const color = percent > 90 ? 'bg-red-500' : (percent > 70 ? 'bg-yellow-500' : 'bg-blue-500');

        return (
            <div className="flex flex-col gap-1 w-24 md:w-32 lg:w-48 shrink-0">
                <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                    <span>{t.storage.disks.usage.replace('{percent}', percent.toFixed(0))}</span>
                    <span>{t.storage.disks.free.replace('{size}', formatBytes(disk.freeSpace))}</span>
                </div>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                    <div
                        className={`h-full ${color} rounded-full transition-all duration-500`}
                        style={{ width: `${percent}%` }}
                    />
                </div>
            </div>
        );
    };

    const renderDiskItem = (disk: DiskInfo, isChild = false) => {
        const isMounted = !!disk.mountPoint;
        const isSystem = disk.mountPoint === '/';
        const isContainer = disk.content?.includes("Container") || disk.content === "Apple_APFS"; // Basic container detection

        let icon = <HardDrive className={`w-6 h-6 ${disk.isVirtual ? 'text-purple-400' : (disk.isInternal ? 'text-gray-400' : 'text-orange-400')}`} />;

        if (isChild) {
            // Differentiate generic partitions from "Data" volumes if possible, but Disc is fine
            icon = <Disc className="w-5 h-5 text-gray-500" />;
        } else if (disk.busProtocol === 'Disk Image' || disk.isVirtual) {
            icon = <Monitor className="w-6 h-6 text-purple-400" />;
        }

        const displayName = disk.model || disk.volumeName || disk.content || "Unknown Disk";

        return (
            <div key={disk.deviceIdentifier} className={`group flex flex-col border-b border-white/5 last:border-0 ${isChild ? 'bg-white/[0.02]' : ''}`}>
                <div className={`flex items-center justify-between p-4 ${isChild ? 'pl-12' : ''}`}>
                    <div className="flex items-center gap-4 flex-1">
                        {icon}
                        <div className="flex items-center gap-2 overflow-hidden">
                            <span className="text-white font-medium truncate">{displayName}</span>
                            <span className="text-[10px] bg-white/5 text-gray-500 px-1.5 py-0.5 rounded font-mono shrink-0">
                                {disk.deviceIdentifier}
                            </span>
                            {disk.isInternal && (
                                <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded font-medium shrink-0 uppercase tracking-wider">
                                    {t.storage.disks.internal_label}
                                </span>
                            )}
                            {isSystem && (
                                <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-medium shrink-0 uppercase tracking-wider">
                                    {t.storage.disks.system}
                                </span>
                            )}
                            {disk.busProtocol && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase ${disk.busProtocol === 'Disk Image'
                                    ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                                    : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                    }`}>
                                    {disk.busProtocol}
                                </span>
                            )}
                            {isMounted && !isSystem && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">
                                    {t.storage.disks.mounted_label}
                                </span>
                            )}
                            {disk.isRaidMember && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 uppercase">
                                    <Shield className="w-3 h-3" />
                                    {t.storage.raid?.member || 'RAID'}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Usage Stats (Center-Right) */}
                    {disk.freeSpace !== undefined && (
                        <div className="hidden md:block mr-8">
                            {renderUsageBar(disk)}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">

                        {/* Mount/Unmount Logic */}
                        {!isContainer && !isSystem && (
                            isMounted ? (
                                <button
                                    onClick={() => handleAction(disk.deviceIdentifier, 'unmount')}
                                    disabled={actionLoading[disk.deviceIdentifier]}
                                    className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                    title={t.storage.disks.unmount}
                                >
                                    {actionLoading[disk.deviceIdentifier] ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                                </button>
                            ) : (
                                <button
                                    onClick={() => handleAction(disk.deviceIdentifier, 'mount')}
                                    disabled={actionLoading[disk.deviceIdentifier]}
                                    className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                    title={t.storage.disks.mount}
                                >
                                    {actionLoading[disk.deviceIdentifier] ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                </button>
                            )
                        )}

                        {/* Eject Logic */}
                        {!disk.isInternal && !isChild && (
                            <button
                                onClick={() => handleAction(disk.deviceIdentifier, 'eject')}
                                disabled={actionLoading[disk.deviceIdentifier]}
                                className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                title={t.storage.disks.eject}
                            >
                                <Power className="w-4 h-4" />
                            </button>
                        )}

                        {/* Format Logic */}
                        {!disk.isInternal && !isSystem && disk.deviceIdentifier !== "disk0" && (
                            <button
                                onClick={() => setEraseDialog({
                                    isOpen: true,
                                    diskId: disk.deviceIdentifier,
                                    diskName: displayName
                                })}
                                disabled={actionLoading[disk.deviceIdentifier]}
                                className="p-2 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
                                title={t.storage.disks.format}
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Render Partitions recursively */}
                {disk.partitions && disk.partitions.map(p => renderDiskItem(p, true))}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {statusMessage && (
                <div className={`fixed top-20 right-8 z-50 px-4 py-3 rounded-xl backdrop-blur-md shadow-2xl border text-sm font-medium animate-in slide-in-from-right-4 fade-in duration-300 ${statusMessage.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/10 border-red-500/20 text-red-400'
                    }`}>
                    {statusMessage.text}
                </div>
            )}

            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                    <Switch
                        checked={showVirtual}
                        onChange={setShowVirtual}
                        label={showVirtual ? t.storage.disks.hide_virtual : t.storage.disks.show_virtual}
                    />
                </div>
                <button
                    onClick={() => fetchDisks()}
                    className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    title={t.common.refresh}
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <Card className="p-0 overflow-hidden bg-black/20 backdrop-blur-xl border-white/5">
                {loading && disks.length === 0 ? (
                    <div className="p-12 flex flex-col items-center justify-center text-gray-500 gap-4">
                        <RefreshCw className="w-8 h-8 animate-spin opacity-50" />
                        <p>{t.common.loading}</p>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {filteredDisks.map(disk => renderDiskItem(disk))}
                        {filteredDisks.length === 0 && !loading && (
                            <div className="p-12 text-center text-gray-500">
                                {disks.length > 0 ? t.storage.disks.no_disks : t.storage.disks.no_disks_unknown}
                            </div>
                        )}
                    </div>
                )}
            </Card>

            <ConfirmDialog
                isOpen={eraseDialog.isOpen}
                onClose={() => setEraseDialog({ ...eraseDialog, isOpen: false })}
                onConfirm={handleErase}
                title={t.storage.disks.erase}
                message={t.storage.disks.erase_confirm.replace('{name}', eraseDialog.diskName || '')}
                confirmText={t.storage.disks.erase}
                cancelText={t.common.cancel}
                variant="danger"
                isLoading={actionLoading[eraseDialog.diskId || '']}
            />
        </div>
    );
}
