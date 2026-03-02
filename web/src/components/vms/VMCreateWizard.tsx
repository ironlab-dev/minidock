"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { type Dispatch, type SetStateAction } from 'react';
import { Button } from '@/components/ui/Button';
import { X, Cpu, HardDrive, Monitor, ChevronRight, Check, Laptop, Terminal, Layers, FileCode } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { client } from '@/api/client';

interface VMCreateWizardProps {
    onClose: () => void;
    onCreate: (config: { name: string; arch: string; ram: number; cpuCount: number; diskSize: number; preset: string; uefi: boolean; networkMode: string; bridgeInterface?: string, isoPath?: string }) => Promise<void>;
    initialData?: {
        name?: string;
        preset?: PresetType;
        arch?: string;
        ram?: number;
        cpuCount?: number;
        diskSize?: number;
        isoPath?: string;
    }
}

type PresetType = 'linux' | 'windows' | 'macos' | 'other';

export function VMCreateWizard({ onClose, onCreate, initialData }: VMCreateWizardProps) {
    const [step, setStep] = useState(0); // Start at Step 0: Operating System
    const [isLoading, setIsLoading] = useState(false);

    // Form State
    const [name, setName] = useState(initialData?.name || '');
    const [arch, setArch] = useState(initialData?.arch || 'aarch64');
    const [ram, setRam] = useState(initialData?.ram || 2048);
    const [cpuCount, setCpuCount] = useState(initialData?.cpuCount || 2);
    const [diskSize, setDiskSize] = useState(initialData?.diskSize || 20); // GB
    const [preset, setPreset] = useState<PresetType>(initialData?.preset || 'linux');
    const [uefi, setUefi] = useState(false);
    const [networkMode, setNetworkMode] = useState<'user' | 'bridge'>('user');
    const [bridgeInterface, setBridgeInterface] = useState('');
    const [interfaces, setInterfaces] = useState<{ device: string, name: string, address?: string, ipAddress?: string, isActive?: boolean }[]>([]);
    const [isoPath, setIsoPath] = useState(initialData?.isoPath || '');
    const [availableIsos, setAvailableIsos] = useState<string[]>([]);
    const [isLoadingIsos, setIsLoadingIsos] = useState(false);

    const totalSteps = 5; // 0: OS, 1: Basics, 2: System, 3: Network, 4: Storage, 5: Summary

    // Apply preset defaults
    useEffect(() => {
        if (preset === 'windows') {
            setRam(4096);
            setCpuCount(4);
            setDiskSize(64);
            setUefi(true);
        } else if (preset === 'linux') {
            setRam(2048);
            setCpuCount(2);
            setDiskSize(20);
            setUefi(true); // Default to UEFI for Linux as well
        } else if (preset === 'macos') {
            setArch('aarch64');
            setRam(4096);
            setCpuCount(4);
            setDiskSize(64);
            setUefi(true);
        }
    }, [preset]);

    const handleNext = () => {
        if (step < totalSteps) setStep(step + 1);
    };

    const handleBack = () => {
        if (step > 0) setStep(step - 1);
    };

    const handleSubmit = async () => {
        setIsLoading(true);
        try {
            await onCreate({
                name,
                arch,
                ram,
                cpuCount,
                diskSize,
                preset,
                uefi,
                networkMode,
                bridgeInterface: networkMode === 'bridge' ? bridgeInterface : undefined,
                isoPath: isoPath || undefined
            });
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const variants = {
        enter: (direction: number) => ({
            x: direction > 0 ? 50 : -50,
            opacity: 0,
            filter: "blur(10px)",
        }),
        center: {
            zIndex: 1,
            x: 0,
            opacity: 1,
            filter: "blur(0px)",
        },
        exit: (direction: number) => ({
            zIndex: 0,
            x: direction < 0 ? 50 : -50,
            opacity: 0,
            filter: "blur(10px)",
        })
    };

    const [direction, setDirection] = useState(0);

    const paginate = (newDirection: number) => {
        setDirection(newDirection);
        if (newDirection > 0) handleNext();
        else handleBack();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-2xl bg-[#1c1c1e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-brand-purple/20 flex items-center justify-center text-brand-purple">
                            <Monitor size={18} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white leading-tight">Create Virtual Machine</h2>
                            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Step {step} of {totalSteps}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Progress Bar */}
                <div className="h-1 bg-white/5 w-full">
                    <motion.div
                        className="h-full bg-brand-purple"
                        initial={{ width: "0%" }}
                        animate={{ width: `${(step / totalSteps) * 100}%` }}
                        transition={{ duration: 0.3 }}
                    />
                </div>

                {/* Content */}
                <div className="flex-1 p-8 overflow-y-auto min-h-[400px] relative">
                    <AnimatePresence initial={false} custom={direction} mode="wait">
                        {step === 0 && (
                            <motion.div
                                key="step0"
                                custom={direction}
                                variants={variants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                className="absolute inset-0 p-8 space-y-6"
                            >
                                <div className="space-y-4">
                                    <h3 className="text-xl font-bold text-white">Select Operating System</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        {[
                                            { id: 'linux', label: 'Linux', icon: Terminal, sub: 'Generic, Ubuntu, Debian...' },
                                            { id: 'windows', label: 'Windows', icon: Laptop, sub: 'Windows 10, 11...' },
                                            { id: 'macos', label: 'macOS', icon: Monitor, sub: 'Apple Silicon Virtualization' },
                                            { id: 'other', label: 'Other', icon: Layers, sub: 'Empty configuration' }
                                        ].map((item) => (
                                            <button
                                                key={item.id}
                                                onClick={() => setPreset(item.id as PresetType)}
                                                className={`p-5 rounded-xl border flex flex-col gap-3 transition-all text-left ${preset === item.id ? 'bg-brand-purple/10 border-brand-purple ring-1 ring-brand-purple/50' : 'bg-white/[0.02] border-white/5 text-gray-400 hover:bg-white/[0.05]'}`}
                                            >
                                                <item.icon size={24} className={preset === item.id ? 'text-brand-purple' : 'opacity-40'} />
                                                <div>
                                                    <span className={`block text-sm font-bold ${preset === item.id ? 'text-white' : ''}`}>{item.label}</span>
                                                    <span className="text-[10px] opacity-60 font-medium">{item.sub}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 1 && (
                            <motion.div
                                key="step1"
                                custom={direction}
                                variants={variants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                className="absolute inset-0 p-8 space-y-6"
                            >
                                <div className="space-y-4">
                                    <h3 className="text-xl font-bold text-white">Basic Information</h3>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Name</label>
                                        <input
                                            autoFocus
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder={`${preset}-vm`}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-lg focus:outline-none focus:border-brand-purple/50 transition-all font-medium"
                                        />
                                    </div>

                                    <div className="space-y-1.5 pt-4">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Architecture</label>
                                        <div className="grid grid-cols-2 gap-4">
                                            <button
                                                onClick={() => setArch('aarch64')}
                                                className={`p-4 rounded-xl border flex flex-col gap-2 transition-all ${arch === 'aarch64' ? 'bg-brand-purple/10 border-brand-purple text-white' : 'bg-white/[0.02] border-white/5 text-gray-400 hover:bg-white/[0.05]'}`}
                                            >
                                                <span className="text-sm font-bold">ARM64 (aarch64)</span>
                                                <span className="text-[10px] opacity-70">Native on Apple Silicon</span>
                                            </button>
                                            <button
                                                disabled={preset === 'macos'}
                                                onClick={() => setArch('x86_64')}
                                                className={`p-4 rounded-xl border flex flex-col gap-2 transition-all ${preset === 'macos' ? 'opacity-30 cursor-not-allowed' : ''} ${arch === 'x86_64' ? 'bg-brand-purple/10 border-brand-purple text-white' : 'bg-white/[0.02] border-white/5 text-gray-400 hover:bg-white/[0.05]'}`}
                                            >
                                                <span className="text-sm font-bold">Intel (x86_64)</span>
                                                <span className="text-[10px] opacity-70">Emulated (TCI/Slow)</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 2 && (
                            <motion.div
                                key="step2"
                                custom={direction}
                                variants={variants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                className="absolute inset-0 p-8 space-y-6"
                            >
                                <div className="space-y-6">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                        <Cpu className="text-brand-purple" size={24} /> System
                                    </h3>

                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Memory</label>
                                            <span className="font-mono text-brand-purple font-bold text-lg">{ram} MB</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="512"
                                            max="16384"
                                            step="512"
                                            value={ram}
                                            onChange={(e) => setRam(Number(e.target.value))}
                                            className="w-full accent-brand-purple h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>

                                    <div className="space-y-4 pt-4">
                                        <div className="flex justify-between items-center">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">CPU Cores</label>
                                            <span className="font-mono text-brand-purple font-bold text-lg">{cpuCount} Cores</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="1"
                                            max="8"
                                            step="1"
                                            value={cpuCount}
                                            onChange={(e) => setCpuCount(Number(e.target.value))}
                                            className="w-full accent-brand-purple h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>

                                    <div className="pt-4 flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                        <div>
                                            <h4 className="text-sm font-bold text-white">UEFI Boot</h4>
                                            <p className="text-[10px] text-gray-500">Requires EDK2 firmware</p>
                                        </div>
                                        <button
                                            onClick={() => setUefi(!uefi)}
                                            className={`w-12 h-6 rounded-full transition-all relative ${uefi ? 'bg-brand-purple' : 'bg-white/10'}`}
                                        >
                                            <motion.div
                                                className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm"
                                                animate={{ x: uefi ? 24 : 0 }}
                                            />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 3 && (
                            <NetworkStep
                                direction={direction}
                                variants={variants}
                                networkMode={networkMode}
                                setNetworkMode={setNetworkMode}
                                bridgeInterface={bridgeInterface}
                                setBridgeInterface={setBridgeInterface}
                                interfaces={interfaces}
                                setInterfaces={setInterfaces}
                                client={client}
                            />
                        )}

                        {step === 4 && (
                            <StorageStep
                                direction={direction}
                                variants={variants}
                                diskSize={diskSize}
                                setDiskSize={setDiskSize}
                                isoPath={isoPath}
                                setIsoPath={setIsoPath}
                                availableIsos={availableIsos}
                                setAvailableIsos={setAvailableIsos}
                                isLoadingIsos={isLoadingIsos}
                                setIsLoadingIsos={setIsLoadingIsos}
                                client={client}
                            />
                        )}

                        {step === 5 && (
                            <motion.div
                                key="step5"
                                custom={direction}
                                variants={variants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                className="absolute inset-0 p-8 space-y-6"
                            >
                                <div className="space-y-6">
                                    <h3 className="text-xl font-bold text-white">Summary</h3>

                                    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                                        <div className="space-y-1">
                                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Name</span>
                                            <p className="text-white font-medium">{name}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">OS Preset</span>
                                            <p className="text-white font-medium capitalize">{preset}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Architecture</span>
                                            <p className="text-white font-medium font-mono text-sm">{arch}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">System</span>
                                            <p className="text-white font-medium">{cpuCount} Cores, {ram} MB</p>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Network</span>
                                            <p className="text-white font-medium capitalize">{networkMode} {networkMode === 'bridge' ? `(${bridgeInterface})` : ''}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Storage</span>
                                            <p className="text-white font-medium">{diskSize} GB {isoPath ? `+ ISO` : ''}</p>
                                        </div>
                                        {isoPath && (
                                            <div className="space-y-1 col-span-2">
                                                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Boot Media (ISO)</span>
                                                <p className="text-brand-purple font-medium text-xs truncate">{isoPath}</p>
                                            </div>
                                        )}
                                        <div className="space-y-1">
                                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">UEFI</span>
                                            <p className="text-white font-medium">{uefi ? 'Enabled' : 'Disabled'}</p>
                                        </div>
                                    </div>

                                    <div className="mt-8 p-4 rounded-xl bg-brand-purple/10 border border-brand-purple/20">
                                        <p className="text-xs text-brand-purple/80 leading-relaxed font-medium">
                                            Ready to initialize your virtual machine. Disk creation may take a few seconds depending on the size.
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-white/5 bg-white/[0.02] flex justify-between items-center">
                    <Button
                        onClick={() => paginate(-1)}
                        variant="ghost"
                        disabled={isLoading}
                        className={step === 0 ? 'invisible' : ''}
                    >
                        Back
                    </Button>

                    {step < totalSteps ? (
                        <Button
                            onClick={() => paginate(1)}
                            disabled={step === 1 && name === ''}
                        >
                            Continue <ChevronRight size={16} className="ml-1" />
                        </Button>
                    ) : (
                        <Button
                            onClick={handleSubmit}
                            isLoading={isLoading}
                            variant="primary"
                        >
                            Create VM <Check size={16} className="ml-1" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

interface NetworkInterface {
    device: string;
    name: string;
    address?: string;
    ipAddress?: string;
    isActive?: boolean;
}

interface NetworkStepProps {
    direction: number;
    variants: Variants;
    networkMode: string;
    setNetworkMode: Dispatch<SetStateAction<'user' | 'bridge'>>;
    bridgeInterface: string;
    setBridgeInterface: (iface: string) => void;
    interfaces: NetworkInterface[];
    setInterfaces: Dispatch<SetStateAction<NetworkInterface[]>>;
    client: typeof client;
}

function NetworkStep({ direction, variants, networkMode, setNetworkMode, bridgeInterface, setBridgeInterface, interfaces, setInterfaces, client }: NetworkStepProps) {
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (networkMode === 'bridge' && interfaces.length === 0) {
            fetchInterfaces();
        }
    }, [networkMode]);

    const fetchInterfaces = async () => {
        setIsLoading(true);
        try {
            const data = await client.get('/system/interfaces') as { device: string, name: string, address?: string, ipAddress?: string, isActive?: boolean }[];

            // 排序：active 的接口在顶部，已选中的接口也在前面
            const sortedData = [...data].sort((a, b) => {
                const aIsSelected = bridgeInterface === a.device;
                const bIsSelected = bridgeInterface === b.device;
                const aIsActive = a.isActive ?? false;
                const bIsActive = b.isActive ?? false;

                // 已选中且 active 的排最前
                if (aIsSelected && aIsActive && !(bIsSelected && bIsActive)) return -1;
                if (bIsSelected && bIsActive && !(aIsSelected && aIsActive)) return 1;

                // 已选中的排在前面
                if (aIsSelected && !bIsSelected) return -1;
                if (bIsSelected && !aIsSelected) return 1;

                // active 的排在前面
                if (aIsActive && !bIsActive) return -1;
                if (bIsActive && !aIsActive) return 1;

                return 0;
            });

            setInterfaces(sortedData);
            if (sortedData.length > 0 && !bridgeInterface) {
                // 优先选择 active 的接口，否则选择第一个
                const activeInterface = sortedData.find(iface => iface.isActive);
                setBridgeInterface(activeInterface?.device || sortedData[0].device);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <motion.div
            key="step3"
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute inset-0 p-8 space-y-6"
        >
            <div className="space-y-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Layers className="text-brand-purple" size={24} /> Network
                </h3>

                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={() => setNetworkMode('user')}
                        className={`p-5 rounded-xl border flex flex-col gap-3 transition-all text-left ${networkMode === 'user' ? 'bg-brand-purple/10 border-brand-purple ring-1 ring-brand-purple/50' : 'bg-white/[0.02] border-white/5 text-gray-400 hover:bg-white/[0.05]'}`}
                    >
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${networkMode === 'user' ? 'bg-brand-purple/20 text-brand-purple' : 'bg-white/5 opacity-40'}`}>
                            <Terminal size={20} />
                        </div>
                        <div>
                            <span className={`block text-sm font-bold ${networkMode === 'user' ? 'text-white' : ''}`}>Shared (SLIRP)</span>
                            <span className="text-[10px] opacity-60 font-medium tracking-tight">NAT, host access, internal only.</span>
                        </div>
                    </button>
                    <button
                        onClick={() => setNetworkMode('bridge')}
                        className={`p-5 rounded-xl border flex flex-col gap-3 transition-all text-left ${networkMode === 'bridge' ? 'bg-brand-purple/10 border-brand-purple ring-1 ring-brand-purple/50' : 'bg-white/[0.02] border-white/5 text-gray-400 hover:bg-white/[0.05]'}`}
                    >
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${networkMode === 'bridge' ? 'bg-brand-purple/20 text-brand-purple' : 'bg-white/5 opacity-40'}`}>
                            <Layers size={20} />
                        </div>
                        <div>
                            <span className={`block text-sm font-bold ${networkMode === 'bridge' ? 'text-white' : ''}`}>Bridged (LAN)</span>
                            <span className="text-[10px] opacity-60 font-medium tracking-tight">Direct LAN access, gets own IP.</span>
                        </div>
                    </button>
                </div>

                {networkMode === 'bridge' && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-3 pt-2"
                    >
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Select Interface</label>
                        {isLoading ? (
                            <div className="h-24 flex items-center justify-center bg-white/[0.02] border border-white/5 rounded-xl animate-pulse">
                                <span className="text-xs text-gray-600">Discovering interfaces...</span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                                {interfaces.map((iface: { device: string, name: string, address?: string, ipAddress?: string, isActive?: boolean }) => (
                                    <button
                                        key={iface.device}
                                        onClick={() => setBridgeInterface(iface.device)}
                                        className={`px-4 py-3 rounded-xl border text-left transition-all flex items-center justify-between ${bridgeInterface === iface.device ? 'bg-brand-purple/10 border-brand-purple text-white' : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'}`}
                                    >
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold">{iface.name}</span>
                                                {iface.isActive !== undefined && (
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${iface.isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                                        {iface.isActive ? t.vms.config_editor.network.active || 'Active' : t.vms.config_editor.network.inactive || 'Inactive'}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[10px] opacity-50 font-mono tracking-tight">
                                                {iface.device}
                                                {iface.ipAddress && <span className="text-brand-purple ml-1">• {iface.ipAddress}</span>}
                                                {iface.address && <span className="ml-1 opacity-70">• {iface.address}</span>}
                                            </span>
                                        </div>
                                        {bridgeInterface === iface.device && <Check size={14} className="text-brand-purple" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}
            </div>
        </motion.div>
    );
}
interface StorageStepProps {
    direction: number;
    variants: Variants;
    diskSize: number;
    setDiskSize: (size: number) => void;
    isoPath: string;
    setIsoPath: (path: string) => void;
    availableIsos: string[];
    setAvailableIsos: (isos: string[]) => void;
    isLoadingIsos: boolean;
    setIsLoadingIsos: (loading: boolean) => void;
    client: typeof client;
}

function StorageStep({ direction, variants, diskSize, setDiskSize, isoPath, setIsoPath, availableIsos, setAvailableIsos, isLoadingIsos, setIsLoadingIsos, client }: StorageStepProps) {
    useEffect(() => {
        if (availableIsos.length === 0) {
            fetchIsos();
        }
    }, []);

    const fetchIsos = async () => {
        setIsLoadingIsos(true);
        try {
            const data = await client.get('/vms/services/isos') as string[];
            setAvailableIsos(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingIsos(false);
        }
    };

    return (
        <motion.div
            key="step4"
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute inset-0 p-8 space-y-6"
        >
            <div className="space-y-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <HardDrive className="text-brand-purple" size={24} /> Storage
                </h3>

                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-bold text-white">Main Drive</h4>
                            <p className="text-xs text-gray-500">VirtIO Block Device</p>
                        </div>
                        <div className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-gray-300">
                            data.qcow2
                        </div>
                    </div>

                    <div className="pt-2 space-y-4">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Size</label>
                            <span className="font-mono text-brand-purple font-bold text-lg">{diskSize} GB</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="128"
                            step="4"
                            value={diskSize}
                            onChange={(e) => setDiskSize(Number(e.target.value))}
                            className="w-full accent-brand-purple h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                </div>

                <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between pl-1">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Installation ISO (Optional)</label>
                        {isLoadingIsos && <span className="text-[10px] text-brand-purple animate-pulse">Searching...</span>}
                    </div>

                    {availableIsos.length > 0 ? (
                        <div className="grid grid-cols-1 gap-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                            {availableIsos.map((iso: string) => (
                                <button
                                    key={iso}
                                    onClick={() => setIsoPath(isoPath === iso ? '' : iso)}
                                    className={`px-4 py-3 rounded-xl border text-left transition-all flex items-center justify-between ${isoPath === iso ? 'bg-brand-purple/10 border-brand-purple text-white shadow-lg' : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'}`}
                                >
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className={`p-2 rounded-lg ${isoPath === iso ? 'bg-brand-purple/20 text-brand-purple' : 'bg-white/5'}`}>
                                            <FileCode size={14} />
                                        </div>
                                        <span className="text-xs font-medium truncate">{iso.split('/').pop()}</span>
                                    </div>
                                    {isoPath === iso && <Check size={14} className="text-brand-purple" />}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="p-8 rounded-xl border border-dashed border-white/10 bg-white/[0.01] flex flex-col items-center justify-center gap-2 text-center">
                            <FileCode size={32} className="opacity-20" />
                            <p className="text-xs text-gray-500 font-medium">No ISO files found</p>
                            <p className="text-[10px] text-gray-600 max-w-[200px]">Upload ISO files through the web interface to use them here.</p>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
