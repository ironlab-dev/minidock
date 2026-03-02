import { useState, useEffect } from 'react';
import { ServiceBootConfig, bootConfigApi } from '../../api/bootConfig';
import { useServices } from '../../hooks/useServices';
import { client } from '../../api/client';
import { ServiceItem } from '../../types/service';

interface BootItem {
    id: string; // Composite key: serviceId:itemId or serviceId:main
    serviceId: string;
    itemId?: string;
    name: string;
    type: string;
    config?: ServiceBootConfig;
}

import { useTranslation } from "@/hooks/useTranslation";
import { useToast } from "@/hooks/useToast";

export default function BootSettings() {
    const { t } = useTranslation();
    const toast = useToast();
    const { services, loading: servicesLoading } = useServices();
    const [, setConfigs] = useState<ServiceBootConfig[]>([]);
    const [items, setItems] = useState<BootItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [, setSaving] = useState<string | null>(null);

    // Fetch all data
    useEffect(() => {
        if (servicesLoading) return;

        let isMounted = true;

        const fetchData = async () => {
            try {
                // 1. Fetch Configs
                const fetchedConfigs = await bootConfigApi.list();
                if (!isMounted) return;
                setConfigs(fetchedConfigs);

                // 2. Build Items List from Services + SubItems
                const allItems: BootItem[] = [];
                const bootableServices = ['docker-engine', 'utm-vms'];

                // Prepare promises for parallel fetching
                const itemFetchPromises: Promise<void>[] = [];

                for (const s of services) {
                    if (bootableServices.includes(s.id)) {
                        allItems.push({
                            id: `${s.id}:main`,
                            serviceId: s.id,
                            itemId: undefined,
                            name: s.name,
                            type: s.type,
                            config: fetchedConfigs.find(c => c.serviceId === s.id && !c.itemId)
                        });
                    }

                    // Add item-level boot configs (containers/VMs)
                    if (s.type === 'docker' || s.type === 'vm') {
                        // Push promise to array instead of awaiting immediately
                        itemFetchPromises.push((async () => {
                            try {
                                const serviceItems: ServiceItem[] = await client.get(`/services/${s.id}/items`);
                                if (!isMounted) return;
                                serviceItems.forEach(item => {
                                    allItems.push({
                                        id: `${s.id}:${item.id}`,
                                        serviceId: s.id,
                                        itemId: item.id,
                                        name: `${s.name} / ${item.name}`,
                                        type: s.type,
                                        config: fetchedConfigs.find(c => c.serviceId === s.id && c.itemId === item.id)
                                    });
                                });
                            } catch (e) {
                                console.error(`Failed to fetch items for ${s.id}`, e);
                            }
                        })());
                    }
                }

                // Wait for all item fetches to complete
                await Promise.all(itemFetchPromises);

                if (isMounted) {
                    setItems(allItems);
                }
            } catch (error) {
                console.error("Failed to load boot data", error);
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        fetchData();

        return () => {
            isMounted = false;
        };
    }, [services, servicesLoading]);

    const handleUpdate = async (item: BootItem, updates: Partial<ServiceBootConfig>) => {
        setSaving(item.id);
        try {
            const newConfig: ServiceBootConfig = {
                serviceId: item.serviceId,
                itemId: item.itemId,
                itemName: item.name,
                autoStart: item.config?.autoStart ?? false,
                bootPriority: item.config?.bootPriority ?? 100,
                bootDelay: item.config?.bootDelay ?? 0,
                ...updates
            };

            const saved = await bootConfigApi.save(newConfig);

            // Update local state
            setItems(prev => prev.map(i =>
                i.id === item.id ? { ...i, config: saved } : i
            ));
        } catch {
            toast.error(t.settings.save_error);
        } finally {
            setSaving(null);
        }
    };

    if (loading || servicesLoading) {
        return (
            <div className="space-y-6 animate-pulse">
                {/* Warning Banner Skeleton */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 h-20"></div>

                {/* Main Card Skeleton */}
                <div className="p-8 rounded-3xl bg-white/[0.03] border border-white/5 shadow-2xl space-y-8">
                    <div className="space-y-2">
                        <div className="h-5 w-48 bg-white/10 rounded"></div>
                        <div className="h-3 w-96 bg-white/5 rounded"></div>
                    </div>

                    {/* Table Skeleton */}
                    <div className="space-y-4">
                        <div className="h-4 w-24 bg-white/10 rounded mb-4"></div>
                        <div className="rounded-2xl border border-white/5 bg-black/20 overflow-hidden">
                            <div className="h-10 bg-white/5 border-b border-white/5"></div>
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-16 border-b border-white/5 flex items-center px-4 gap-4">
                                    <div className="w-1/3">
                                        <div className="h-4 w-32 bg-white/10 rounded mb-2"></div>
                                        <div className="h-3 w-20 bg-white/5 rounded"></div>
                                    </div>
                                    <div className="h-6 w-12 bg-white/10 rounded-full mx-auto"></div>
                                    <div className="h-8 w-24 bg-white/10 rounded-xl"></div>
                                    <div className="h-8 w-24 bg-white/10 rounded-xl"></div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Separate service-level and item-level configs
    const serviceLevelItems = items.filter(item => !item.itemId);
    const itemLevelItems = items.filter(item => item.itemId);
    const hasAutoStartEnabled = items.some(item => item.config?.autoStart);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {hasAutoStartEnabled && (
                <div className="p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 backdrop-blur-xl">
                    <div className="flex items-start gap-3">
                        <div className="text-yellow-500 text-lg">⚠️</div>
                        <div className="flex-1">
                            <p className="text-xs font-bold text-yellow-400 mb-1">自动启动已启用</p>
                            <p className="text-xs text-yellow-300/80 leading-relaxed">
                                系统启动时会自动启动已启用的服务和应用。这可能会启动 OrbStack 或 UTM 等系统应用。
                                如果不需要自动启动，请关闭相应的开关。
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="p-8 rounded-3xl bg-white/[0.03] border border-white/5 backdrop-blur-xl shadow-2xl">
                <h3 className="text-base font-bold text-white/90 mb-1">{t.settings.boot_config.title}</h3>
                <p className="text-xs text-gray-500 mb-8 font-medium leading-relaxed">
                    {t.settings.boot_config.subtitle}
                </p>

                {serviceLevelItems.length > 0 && (
                    <div className="mb-6">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">服务级别</h4>
                        <div className="rounded-2xl border border-white/5 bg-black/20 overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-white/5 bg-white/5">
                                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-[0.2em]">{t.settings.boot_config.service_item}</th>
                                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-[0.2em] text-center">{t.settings.boot_config.auto_start}</th>
                                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-[0.2em] w-32">{t.settings.boot_config.priority}</th>
                                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-[0.2em] w-32">{t.settings.boot_config.delay}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {serviceLevelItems.map(item => (
                                        <tr key={item.id} className="group hover:bg-white/[0.02] transition-colors">
                                            <td className="p-4">
                                                <div className="text-xs text-white font-bold mb-0.5">{item.name}</div>
                                                <div className="text-[10px] text-gray-600 font-mono tracking-tighter uppercase opacity-50">{item.serviceId}</div>
                                            </td>
                                            <td className="p-4 text-center">
                                                <label className="relative inline-flex items-center cursor-pointer active:scale-95 transition-transform">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={item.config?.autoStart || false}
                                                        onChange={(e) => handleUpdate(item, { autoStart: e.target.checked })}
                                                    />
                                                    <div className="w-10 h-5 bg-white/5 border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-500 peer-checked:after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600/80"></div>
                                                </label>
                                            </td>
                                            <td className="p-4">
                                                <input
                                                    type="number"
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs text-white text-center focus:border-blue-500/50 outline-none font-mono transition-colors"
                                                    value={item.config?.bootPriority ?? 100}
                                                    onChange={(e) => handleUpdate(item, { bootPriority: parseInt(e.target.value) })}
                                                />
                                            </td>
                                            <td className="p-4">
                                                <input
                                                    type="number"
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs text-white text-center focus:border-blue-500/50 outline-none font-mono transition-colors"
                                                    value={item.config?.bootDelay ?? 0}
                                                    onChange={(e) => handleUpdate(item, { bootDelay: parseInt(e.target.value) })}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {itemLevelItems.length > 0 && (
                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">项目级别</h4>
                        <div className="rounded-2xl border border-white/5 bg-black/20 overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-white/5 bg-white/5">
                                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-[0.2em]">{t.settings.boot_config.service_item}</th>
                                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-[0.2em] text-center">{t.settings.boot_config.auto_start}</th>
                                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-[0.2em] w-32">{t.settings.boot_config.priority}</th>
                                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-[0.2em] w-32">{t.settings.boot_config.delay}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {itemLevelItems.map(item => (
                                        <tr key={item.id} className="group hover:bg-white/[0.02] transition-colors">
                                            <td className="p-4">
                                                <div className="text-xs text-white font-bold mb-0.5">{item.name}</div>
                                                <div className="text-[10px] text-gray-600 font-mono tracking-tighter uppercase opacity-50">{item.id}</div>
                                            </td>
                                            <td className="p-4 text-center">
                                                <label className="relative inline-flex items-center cursor-pointer active:scale-95 transition-transform">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={item.config?.autoStart || false}
                                                        onChange={(e) => handleUpdate(item, { autoStart: e.target.checked })}
                                                    />
                                                    <div className="w-10 h-5 bg-white/5 border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-500 peer-checked:after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600/80"></div>
                                                </label>
                                            </td>
                                            <td className="p-4">
                                                <input
                                                    type="number"
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs text-white text-center focus:border-blue-500/50 outline-none font-mono transition-colors"
                                                    value={item.config?.bootPriority ?? 100}
                                                    onChange={(e) => handleUpdate(item, { bootPriority: parseInt(e.target.value) })}
                                                />
                                            </td>
                                            <td className="p-4">
                                                <input
                                                    type="number"
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs text-white text-center focus:border-blue-500/50 outline-none font-mono transition-colors"
                                                    value={item.config?.bootDelay ?? 0}
                                                    onChange={(e) => handleUpdate(item, { bootDelay: parseInt(e.target.value) })}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {serviceLevelItems.length === 0 && itemLevelItems.length === 0 && (
                    <div className="rounded-2xl border border-white/5 bg-black/20 p-12 text-center">
                        <p className="text-gray-600 text-xs font-medium italic">
                            No bootable items found. Start Docker/UTM to see items here.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
