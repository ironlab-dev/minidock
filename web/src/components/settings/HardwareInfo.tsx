"use client";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

import { useState, useEffect } from 'react';
import { client } from "@/api/client";
import { Card, Badge } from "@/components/ui";
import { zh } from '@/locales/zh';
import {
    Network,
    Usb,
    Zap,
    HardDrive,
    Monitor,
    Layers,
    Box,
    Activity,
    Loader2,
    ChevronRight,
    ChevronDown,
    Wifi,
    EthernetPort,
} from 'lucide-react';

function cn(...classes: (string | undefined | null | false)[]) {
    return classes.filter(Boolean).join(' ');
}

// Helper to translate keys
const getLocalizedKey = (key: string) => {
    const k = key.toLowerCase();
    const map = zh.settings.hardware.keys as Record<string, string>;
    if (map[k]) {
        return map[k];
    }
    // Fallback: capitalized format
    return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const HARDWARE_CATEGORIES = [
    { id: 'SPHardwareDataType', label: zh.settings.hardware.tab_overview, icon: <Activity className="w-4 h-4" /> },
    { id: 'SPNetworkDataType', label: zh.settings.hardware.tab_network, icon: <Network className="w-4 h-4" /> },
    { id: 'SPUSBDataType', label: zh.settings.hardware.tab_usb, icon: <Usb className="w-4 h-4" /> },
    { id: 'SPThunderboltDataType', label: zh.settings.hardware.tab_thunderbolt, icon: <Zap className="w-4 h-4" /> },
    { id: 'SPPowerDataType', label: zh.settings.hardware.tab_power, icon: <Box className="w-4 h-4" /> },
    { id: 'SPStorageDataType', label: zh.settings.hardware.tab_storage, icon: <HardDrive className="w-4 h-4" /> },
    { id: 'SPMemoryDataType', label: zh.settings.hardware.tab_memory, icon: <Layers className="w-4 h-4" /> },
    { id: 'SPDisplaysDataType', label: zh.settings.hardware.tab_graphics, icon: <Monitor className="w-4 h-4" /> },
];

interface HardwareInfoProps {
    className?: string;
}

export default function HardwareInfo({ className }: HardwareInfoProps) {
    const [activeCategory, setActiveCategory] = useState('SPHardwareDataType');
    const [data, setData] = useState<JsonValue | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchData(activeCategory);
    }, [activeCategory]);

    const fetchData = async (type: string) => {
        setLoading(true);
        setError(null);
        setData(null);
        try {
            const response = await client.get<JsonValue>(`/services/system-core/hardware/${type}`);
            setData(response);
        } catch (err) {
            console.error("Failed to fetch hardware info:", err);
            setError(err instanceof Error ? err.message : "Failed to load hardware information");
        } finally {
            setLoading(false);
        }
    };

    const currentCategory = HARDWARE_CATEGORIES.find(c => c.id === activeCategory);

    return (
        // Unified Card Container for standard "Mac App" feel
        // Adjusted background transparency to match site theme better (aligned with sidebar usually)
        <Card className={cn("flex overflow-hidden border-white/10 h-[calc(100vh-200px)] min-h-[600px] shadow-2xl bg-[#0a0a0a]/90 backdrop-blur-3xl", className)}>

            {/* Sidebar Column */}
            <div className="w-64 flex flex-col border-r border-white/10 bg-white/[0.02]">
                <div className="p-4 pt-6">
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 mb-2">
                        {zh.settings.hardware.title}
                    </h2>
                </div>
                <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
                    {HARDWARE_CATEGORIES.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all w-full text-left",
                                activeCategory === cat.id
                                    ? "bg-brand-blue text-white shadow-md shadow-brand-blue/10"
                                    : "text-gray-400 hover:text-gray-100 hover:bg-white/5"
                            )}
                        >
                            {cat.icon}
                            <span>{cat.label}</span>
                        </button>
                    ))}
                </div>
                {/* Optional Status Footnote in Sidebar */}
                <div className="p-4 border-t border-white/5 text-[10px] text-center text-gray-600">
                    MiniDock System Profiler
                </div>
            </div>

            {/* Main Content Column */}
            <div className="flex-1 flex flex-col relative bg-transparent">
                {/* Header */}
                <div className="h-14 border-b border-white/10 flex justify-between items-center px-6 bg-white/[0.01]">
                    <h3 className="font-semibold text-lg text-white flex items-center gap-2">
                        {currentCategory?.icon}
                        <span>{currentCategory?.label}</span>
                    </h3>
                    <Badge variant={loading ? "amber" : "emerald"} className="capitalize px-2 py-0.5 text-xs">
                        {loading ? zh.settings.hardware.loading : zh.settings.hardware.live}
                    </Badge>
                </div>

                {/* Scrollable Data Area */}
                <div className="flex-1 overflow-y-auto p-0 relative">
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[#1e1e1e]/50 backdrop-blur-[2px] z-10 transition-all duration-300">
                            <div className="flex flex-col items-center gap-2 text-white/50">
                                <Loader2 className="animate-spin w-8 h-8 text-brand-blue" />
                                <span className="text-xs tracking-widest uppercase">{zh.settings.hardware.loading}</span>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="text-red-400 p-10 text-center flex flex-col items-center gap-2 h-full justify-center">
                            <div className="text-3xl mb-2">⚠️</div>
                            <div className="font-bold">{zh.common.error}</div>
                            <div className="text-sm opacity-70 mb-4">{error}</div>
                            <button
                                onClick={() => fetchData(activeCategory)}
                                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors"
                            >
                                {zh.common.refresh}
                            </button>
                        </div>
                    )}

                    {!loading && !error && data && (
                        <div className="animate-in fade-in duration-300 p-6 pb-20 max-w-5xl">
                            {/* Check if root array is empty or contains empty object/array */}
                            {(
                                (typeof data === 'object' && data !== null && !Array.isArray(data) && (data as Record<string, JsonValue>)[activeCategory] && Array.isArray((data as Record<string, JsonValue>)[activeCategory]) && ((data as Record<string, JsonValue>)[activeCategory] as JsonValue[]).length === 0) ||
                                (Array.isArray(data) && data.length === 0)
                            ) ? (
                                <div className="text-gray-500 text-center flex flex-col items-center justify-center h-64 gap-4">
                                    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-2">
                                        {currentCategory?.icon}
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <p className="font-medium text-gray-300 text-lg">{zh.settings.hardware.no_devices}</p>
                                        {activeCategory === 'SPUSBDataType' && (
                                            <p className="text-sm text-gray-500 max-w-sm mx-auto">{zh.settings.hardware.apple_silicon_usb_hint}</p>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <JsonViewer data={data} rootKey={activeCategory} />
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Card>
    );
}

// Collapsible Item Component
function CollapsibleItem({ item, level }: { item: JsonValue, level: number }) {
    const [isOpen, setIsOpen] = useState(level === 0);

    // Attempt to extract Summary details
    const obj = item as Record<string, JsonValue>;
    const name = String(obj?._name || obj?.device_name || (typeof item === 'string' ? item : "Unnamed Info"));
    const interfaceName = obj?.interface as string | undefined;
    const ip = (obj?.ip_address as JsonValue[] | undefined)?.[0] as string | undefined;

    // Determine icon based on name
    const getIcon = (n: string) => {
        const lower = n.toLowerCase();
        if (lower.includes('wi-fi') || lower.includes('airport')) return <Wifi className="w-4 h-4 text-brand-blue" />;
        if (lower.includes('ethernet') || lower.includes('100/1000')) return <EthernetPort className="w-4 h-4 text-brand-emerald" />;
        return <div className="w-2 h-2 rounded-full bg-white/20" />;
    }

    return (
        <div className={cn("border-b border-white/5 transition-colors bg-transparent", isOpen ? "bg-white/[0.02]" : "hover:bg-white/[0.01]")}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 px-6 transition-colors text-left group outline-none"
            >
                <div className="flex items-center gap-3">
                    {level === 0 && <span className="opacity-70 group-hover:opacity-100 transition-opacity">{getIcon(name)}</span>}
                    <span className={cn("font-medium text-gray-200", level === 0 ? "text-sm" : "text-xs")}>{name}</span>

                    {/* Summary badges */}
                    <div className="flex items-center gap-2 ml-2">
                        {interfaceName && <Badge variant="gray" className="hidden md:inline-flex text-[10px] h-5 px-1.5">{interfaceName}</Badge>}
                        {ip && <Badge variant="blue" className="hidden md:inline-flex text-[10px] h-5 px-1.5">{ip}</Badge>}
                    </div>
                </div>
                {isOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-600" />}
            </button>

            {isOpen && (
                <div className="px-6 pb-6 pt-0 bg-black/10 shadow-inner border-t border-white/5">
                    <div className="pl-2 pt-4">
                        <JsonViewer data={item} level={level + 1} />
                    </div>
                </div>
            )}
        </div>
    );
}

function JsonViewer({ data, rootKey, level = 0 }: { data: JsonValue, rootKey?: string, level?: number }) {
    if (data === null || data === undefined) return <span className="text-gray-600">null</span>;

    // Handle Array
    if (Array.isArray(data)) {
        if (data.length === 0) return <span className="text-gray-600">[]</span>;

        return (
            <div className="">
                {data.map((item, idx) => (
                    <div key={idx}>
                        {typeof item === 'object' && item !== null ? (
                            <CollapsibleItem item={item} level={level} />
                        ) : (
                            <div className="pl-4 border-l border-white/10 py-1">
                                <JsonViewer data={item} level={level + 1} />
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    }

    // Handle Object
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        const dataObj = data as Record<string, JsonValue>;
        // Root Logic
        if (level === 0 && rootKey && dataObj[rootKey]) {
            let items: JsonValue = dataObj[rootKey];
            if (Array.isArray(items)) {
                // Sorting Logic
                let sortFn = null;
                if (rootKey === 'SPNetworkDataType') {
                    sortFn = (a: JsonValue, b: JsonValue) => {
                        const objA = a as Record<string, JsonValue>; const objB = b as Record<string, JsonValue>;
                        const hasIpA = objA.ip_address && (objA.ip_address as JsonValue[]).length > 0;
                        const hasIpB = objB.ip_address && (objB.ip_address as JsonValue[]).length > 0;
                        if (!hasIpA && hasIpB) return 1;
                        const nameA = String(objA._name || objA.interface || "");
                        const nameB = String(objB._name || objB.interface || "");
                        return nameA.localeCompare(nameB);
                    };
                } else if (rootKey === 'SPStorageDataType') {
                    sortFn = (a: JsonValue, b: JsonValue) => {
                        const objA = a as Record<string, JsonValue>; const objB = b as Record<string, JsonValue>;
                        const mountA = objA.mount_point ? 1 : 0; const mountB = objB.mount_point ? 1 : 0;
                        if (mountA !== mountB) return mountB - mountA;
                        return String(objA._name || "").localeCompare(String(objB._name || ""));
                    };
                }
                if (sortFn) items = [...items].sort(sortFn);
            }
            return <JsonViewer data={items} level={level} />;
        }

        return (
            <div className="grid grid-cols-1 gap-y-0.5 text-sm">
                {Object.entries(dataObj).map(([key, value]) => {
                    if (key.startsWith('_items')) return (
                        <div key={key} className="mt-2 mb-1">
                            <div className="text-gray-500 font-medium text-[10px] uppercase tracking-wider mb-2 pl-1 pt-2">
                                {getLocalizedKey(key.replace('_items', 'Details'))}
                            </div>
                            <div className="border-l-2 border-white/5 pl-3">
                                <JsonViewer data={value} level={level + 1} />
                            </div>
                        </div>
                    );
                    if (key === '_name') return null;
                    if (value === null || value === "") return null;
                    if ((key === 'interface' || key === 'ip_address' || key === 'device_name') && level > 0) { }

                    return (
                        <div key={key} className="grid grid-cols-12 gap-4 py-2 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] transition-colors rounded px-2 -mx-2 items-start group">
                            <div className="col-span-4 font-medium text-gray-500 capitalize truncate text-xs pt-0.5 group-hover:text-gray-400 transition-colors" title={key}>
                                {getLocalizedKey(key)}
                            </div>
                            <div className="col-span-8 text-gray-300 break-words font-mono text-xs select-text">
                                {typeof value === 'object' ? (
                                    <JsonViewer data={value} level={level + 1} />
                                ) : (
                                    String(value)
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    return <span>{String(data)}</span>;
}
