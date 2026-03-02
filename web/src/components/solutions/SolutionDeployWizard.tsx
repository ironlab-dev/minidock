"use client";

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from "@/hooks/useTranslation";
import { useToast } from "@/hooks/useToast";
import { getComponentIcon } from "@/lib/solutionDefinitions";
import { X, Check, ChevronRight, ChevronLeft, ChevronDown, Cpu, HardDrive, Zap, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import SolutionDeployProgress from './SolutionDeployProgress';
import type { SolutionDefinition, SolutionComponentDef, DeployRequest, DeploymentProgress, PreflightResult, ComponentPreflight } from '@/types/solution';

interface SolutionDeployWizardProps {
    definition: SolutionDefinition;
    onClose: () => void;
    onDeploy: (id: string, request: DeployRequest) => Promise<DeploymentProgress>;
    getStatus: (id: string) => Promise<DeploymentProgress>;
    onPreflight: (id: string) => Promise<PreflightResult>;
}

export default function SolutionDeployWizard({ definition, onClose, onDeploy, getStatus, onPreflight }: SolutionDeployWizardProps) {
    const { t } = useTranslation();
    const toast = useToast();

    const [step, setStep] = useState(0);
    const [preflightResult, setPreflightResult] = useState<PreflightResult | null>(null);
    const [preflightLoading, setPreflightLoading] = useState(true);
    const [selectedComponents, setSelectedComponents] = useState<Set<string>>(() => {
        return new Set(definition.components.map(c => c.id));
    });

    // Load preflight data on mount
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const result = await onPreflight(definition.id);
                if (cancelled) return;
                setPreflightResult(result);
                // Deselect components that already have an existing container
                setSelectedComponents(prev => {
                    const next = new Set(prev);
                    for (const comp of result.components) {
                        if (comp.existingContainer) {
                            const def = definition.components.find(c => c.id === comp.componentId);
                            if (def && !def.required) {
                                next.delete(comp.componentId);
                            }
                        }
                    }
                    return next;
                });
            } catch {
                // Preflight failed — continue without conflict data
            } finally {
                if (!cancelled) setPreflightLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [definition.id, definition.components, onPreflight]);

    const preflightMap = useMemo(() => {
        if (!preflightResult) return new Map<string, ComponentPreflight>();
        return new Map(preflightResult.components.map(c => [c.componentId, c]));
    }, [preflightResult]);

    const conflictCount = useMemo(() => {
        if (!preflightResult) return 0;
        return preflightResult.components.filter(c => c.existingContainer || c.portConflict).length;
    }, [preflightResult]);
    const [mediaPath, setMediaPath] = useState('/opt/minidock/media');
    const [downloadsPath, setDownloadsPath] = useState('/opt/minidock/downloads');
    const [portOverrides, setPortOverrides] = useState<Record<string, number>>({});
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [deploying, setDeploying] = useState(false);
    const [deployProgress, setDeployProgress] = useState<DeploymentProgress | null>(null);

    const toggleComponent = (id: string) => {
        const comp = definition.components.find(c => c.id === id);
        if (comp?.required) return;
        // Block toggling for components that already have an existing container
        const pf = preflightResult?.components.find(c => c.componentId === id);
        if (pf?.existingContainer) return;
        setSelectedComponents(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const selected = useMemo(() =>
        definition.components.filter(c => selectedComponents.has(c.id)),
        [selectedComponents, definition.components]
    );

    const totalRam = useMemo(() => selected.reduce((s, c) => s + c.estimatedRam, 0), [selected]);
    const totalDisk = useMemo(() => selected.reduce((s, c) => s + c.estimatedDisk, 0), [selected]);

    const grouped = useMemo(() => ({
        core: definition.components.filter(c => c.tier === 'core'),
        recommended: definition.components.filter(c => c.tier === 'recommended'),
        optional: definition.components.filter(c => c.tier === 'optional'),
    }), [definition.components]);

    const handleDeploy = async () => {
        setDeploying(true);
        try {
            const request: DeployRequest = {
                components: Array.from(selectedComponents),
                mediaPath,
                downloadsPath,
                portOverrides: Object.keys(portOverrides).length > 0 ? portOverrides : undefined,
            };
            const progress = await onDeploy(definition.id, request);
            setDeployProgress(progress);
        } catch {
            toast.error(t.common.operation_failed);
            setDeploying(false);
        }
    };

    const slideVariants = {
        enter: (direction: number) => ({ x: direction > 0 ? 300 : -300, opacity: 0, filter: 'blur(4px)' }),
        center: { x: 0, opacity: 1, filter: 'blur(0px)' },
        exit: (direction: number) => ({ x: direction > 0 ? -300 : 300, opacity: 0, filter: 'blur(4px)' }),
    };

    const [direction, setDirection] = useState(0);

    const goNext = () => {
        setDirection(1);
        // When going from step 0 → step 1, auto-open advanced and suggest ports for conflicts
        if (step === 0) {
            const conflictedSelected = Array.from(selectedComponents).filter(id => {
                const pf = preflightMap.get(id);
                return pf?.portConflict;
            });
            if (conflictedSelected.length > 0) {
                setShowAdvanced(true);
                setPortOverrides(prev => {
                    const next = { ...prev };
                    for (const id of conflictedSelected) {
                        if (!(id in next)) {
                            const comp = definition.components.find(c => c.id === id);
                            if (comp) next[id] = comp.defaultPort + 1;
                        }
                    }
                    return next;
                });
            }
        }
        setStep(s => Math.min(s + 1, 2));
    };
    const goBack = () => { setDirection(-1); setStep(s => Math.max(s - 1, 0)); };

    // If deploying, show progress view
    if (deployProgress) {
        return (
            <SolutionDeployProgress
                solutionId={definition.id}
                solutionName={definition.name}
                initialProgress={deployProgress}
                getStatus={getStatus}
                onClose={onClose}
            />
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="relative w-full max-w-2xl max-h-[85vh] bg-[#141416] border border-white/[0.08] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
                    <div>
                        <h2 className="text-lg font-bold text-white">{t.solutions.wizard.title}: {definition.name}</h2>
                        <div className="flex items-center gap-2 mt-1">
                            {[t.solutions.wizard.step_components, t.solutions.wizard.step_storage, t.solutions.wizard.step_confirm].map((label, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                        i === step ? 'bg-purple-600 text-white' :
                                        i < step ? 'bg-emerald-500/20 text-emerald-400' :
                                        'bg-white/[0.06] text-gray-500'
                                    }`}>
                                        {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                                    </div>
                                    <span className={`text-xs font-medium ${i === step ? 'text-white' : 'text-gray-500'}`}>{label}</span>
                                    {i < 2 && <ChevronRight className="w-3 h-3 text-gray-600" />}
                                </div>
                            ))}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Step Content */}
                <div className="flex-1 overflow-y-auto px-6 py-5">
                    <AnimatePresence mode="wait" custom={direction}>
                        <motion.div
                            key={step}
                            custom={direction}
                            variants={slideVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        >
                            {step === 0 && (
                                <StepComponents
                                    grouped={grouped}
                                    selected={selectedComponents}
                                    onToggle={toggleComponent}
                                    totalRam={totalRam}
                                    totalDisk={totalDisk}
                                    preflightMap={preflightMap}
                                    preflightLoading={preflightLoading}
                                    conflictCount={conflictCount}
                                    t={t}
                                />
                            )}
                            {step === 1 && (
                                <StepStorage
                                    mediaPath={mediaPath}
                                    setMediaPath={setMediaPath}
                                    downloadsPath={downloadsPath}
                                    setDownloadsPath={setDownloadsPath}
                                    showAdvanced={showAdvanced}
                                    setShowAdvanced={setShowAdvanced}
                                    portOverrides={portOverrides}
                                    setPortOverrides={setPortOverrides}
                                    components={selected}
                                    preflightMap={preflightMap}
                                    t={t}
                                />
                            )}
                            {step === 2 && (
                                <StepConfirm
                                    definition={definition}
                                    selected={selected}
                                    mediaPath={mediaPath}
                                    downloadsPath={downloadsPath}
                                    portOverrides={portOverrides}
                                    totalRam={totalRam}
                                    totalDisk={totalDisk}
                                    t={t}
                                />
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06]">
                    <button
                        onClick={step === 0 ? onClose : goBack}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        {step === 0 ? t.common.cancel : t.common.back}
                    </button>
                    <button
                        onClick={step === 2 ? handleDeploy : goNext}
                        disabled={deploying || selectedComponents.size === 0}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 shadow-lg shadow-purple-600/20"
                    >
                        {step === 2 ? (
                            deploying ? t.solutions.progress.deploying : t.solutions.wizard.start_deploy
                        ) : t.common.next}
                        {step < 2 && <ChevronRight className="w-4 h-4" />}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}

// --- Step Sub-Components ---

function StepComponents({ grouped, selected, onToggle, totalRam, totalDisk, preflightMap, preflightLoading, conflictCount, t }: {
    grouped: { core: SolutionComponentDef[]; recommended: SolutionComponentDef[]; optional: SolutionComponentDef[] };
    selected: Set<string>;
    onToggle: (id: string) => void;
    totalRam: number;
    totalDisk: number;
    preflightMap: Map<string, ComponentPreflight>;
    preflightLoading: boolean;
    conflictCount: number;
    t: ReturnType<typeof useTranslation>['t'];
}) {
    const isInstalled = (compId: string) => {
        const pf = preflightMap.get(compId);
        return !preflightLoading && !!pf?.existingContainer;
    };

    const hasPortConflict = (compId: string) => {
        const pf = preflightMap.get(compId);
        return !preflightLoading && !!pf?.portConflict;
    };

    const renderPreflightBadge = (comp: SolutionComponentDef) => {
        if (preflightLoading) {
            return <Loader2 className="w-3 h-3 text-gray-500 animate-spin flex-shrink-0" />;
        }
        const pf = preflightMap.get(comp.id);
        if (!pf) return null;

        if (pf.existingContainer) {
            const portLabel = pf.existingPort ? `:${pf.existingPort}` : '';
            return (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 flex-shrink-0">
                    <CheckCircle2 className="w-3 h-3" />
                    {t.solutions.preflight.installed}{portLabel}
                </span>
            );
        }

        if (pf.portConflict) {
            const label = pf.portConflictProcess
                ? t.solutions.preflight.port_conflict.replace('{port}', String(comp.defaultPort)).replace('{process}', pf.portConflictProcess)
                : t.solutions.preflight.port_conflict_unknown.replace('{port}', String(comp.defaultPort));
            return (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1 flex-shrink-0">
                    <AlertTriangle className="w-3 h-3" />
                    {label}
                </span>
            );
        }

        return null;
    };

    const renderGroup = (title: string, components: SolutionComponentDef[]) => {
        if (components.length === 0) return null;
        return (
            <div className="mb-5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">{title}</h3>
                <div className="space-y-2">
                    {components.map(comp => {
                        const installed = isInstalled(comp.id);
                        const portConflicted = hasPortConflict(comp.id);
                        const disabled = comp.required || installed;
                        return (
                        <button
                            key={comp.id}
                            onClick={() => onToggle(comp.id)}
                            className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl border transition-all duration-200 text-left ${
                                installed
                                    ? 'border-emerald-500/20 bg-emerald-500/[0.03] opacity-60'
                                    : selected.has(comp.id)
                                    ? 'border-purple-500/30 bg-purple-500/[0.06]'
                                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                            } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
                        >
                            {/* Checkbox */}
                            <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all ${
                                installed
                                    ? 'bg-emerald-600/30 border-emerald-600/30'
                                    : selected.has(comp.id)
                                    ? 'bg-purple-600 border-purple-600'
                                    : 'border-2 border-white/[0.15]'
                            }`}>
                                {installed && <Check className="w-3 h-3 text-emerald-400" />}
                                {!installed && selected.has(comp.id) && <Check className="w-3 h-3 text-white" />}
                            </div>

                            {/* Icon */}
                            <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0 overflow-hidden">
                                <img src={getComponentIcon(comp.icon)} alt={comp.name} className="w-6 h-6" />
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-sm font-semibold ${installed ? 'text-gray-400' : 'text-white'}`}>{comp.name}</span>
                                    {comp.type === 'native' && (
                                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                            {t.solutions.wizard.native_hint}
                                        </span>
                                    )}
                                    {renderPreflightBadge(comp)}
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                                    {installed
                                        ? t.solutions.preflight.installed_hint
                                        : comp.description}
                                </p>
                                {portConflicted && selected.has(comp.id) && (
                                    <p className="text-[11px] text-amber-400/80 mt-1">{t.solutions.preflight.port_conflict_hint}</p>
                                )}
                            </div>

                            {/* Resource */}
                            <div className="flex items-center gap-3 flex-shrink-0 text-xs text-gray-500">
                                <span className="flex items-center gap-1"><Cpu className="w-3 h-3" />{comp.estimatedRam}MB</span>
                                <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" />{comp.estimatedDisk}MB</span>
                            </div>
                        </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div>
            <p className="text-sm text-gray-400 mb-5">
                {preflightLoading ? t.solutions.preflight.checking : t.solutions.wizard.select_components}
            </p>
            {renderGroup(t.solutions.wizard.core_components, grouped.core)}
            {renderGroup(t.solutions.wizard.recommended_components, grouped.recommended)}
            {renderGroup(t.solutions.wizard.optional_components, grouped.optional)}

            {/* Conflict Summary */}
            {conflictCount > 0 && !preflightLoading && (
                <div className="mt-3 p-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
                    <div className="flex items-center gap-2 text-sm text-amber-400">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        <span>{t.solutions.preflight.conflict_summary.replace('{count}', String(conflictCount))}</span>
                    </div>
                </div>
            )}

            {/* Resource Estimate */}
            <div className="mt-4 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold text-gray-300">{t.solutions.wizard.resource_estimate}</span>
                </div>
                <div className="flex items-center gap-6 text-sm">
                    <span className="text-gray-400">{t.solutions.wizard.ram}: <span className="text-white font-semibold">{totalRam}MB</span></span>
                    <span className="text-gray-400">{t.solutions.wizard.disk}: <span className="text-white font-semibold">{totalDisk}MB</span></span>
                </div>
            </div>
        </div>
    );
}

function StepStorage({ mediaPath, setMediaPath, downloadsPath, setDownloadsPath, showAdvanced, setShowAdvanced, portOverrides, setPortOverrides, components, preflightMap, t }: {
    mediaPath: string;
    setMediaPath: (v: string) => void;
    downloadsPath: string;
    setDownloadsPath: (v: string) => void;
    showAdvanced: boolean;
    setShowAdvanced: (v: boolean) => void;
    portOverrides: Record<string, number>;
    setPortOverrides: (v: Record<string, number>) => void;
    components: SolutionComponentDef[];
    preflightMap: Map<string, ComponentPreflight>;
    t: ReturnType<typeof useTranslation>['t'];
}) {
    return (
        <div className="space-y-5">
            <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">{t.solutions.wizard.media_path}</label>
                <input
                    type="text"
                    value={mediaPath}
                    onChange={e => setMediaPath(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm font-mono focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all"
                />
            </div>

            <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">{t.solutions.wizard.downloads_path}</label>
                <input
                    type="text"
                    value={downloadsPath}
                    onChange={e => setDownloadsPath(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm font-mono focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all"
                />
            </div>

            {/* Advanced */}
            <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
            >
                <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                {t.solutions.wizard.advanced_settings}
            </button>

            {showAdvanced && (
                <div className="space-y-3 pl-2">
                    <p className="text-xs text-gray-500 mb-2">{t.solutions.wizard.port_override}</p>
                    {components.map(comp => {
                        const pf = preflightMap.get(comp.id);
                        const isConflicted = !!pf?.portConflict;
                        return (
                            <div key={comp.id}>
                                <div className="flex items-center gap-3">
                                    <span className="text-sm text-gray-400 w-28">{comp.name}</span>
                                    <input
                                        type="number"
                                        value={portOverrides[comp.id] ?? comp.defaultPort}
                                        onChange={e => {
                                            const port = parseInt(e.target.value);
                                            if (!isNaN(port)) {
                                                setPortOverrides({ ...portOverrides, [comp.id]: port });
                                            }
                                        }}
                                        className={`w-24 px-3 py-1.5 rounded-lg bg-white/[0.04] border text-white text-sm font-mono focus:outline-none focus:border-purple-500/50 transition-all ${
                                            isConflicted ? 'border-amber-500/40' : 'border-white/[0.08]'
                                        }`}
                                    />
                                </div>
                                {isConflicted && (
                                    <p className="text-[10px] text-amber-400/70 mt-0.5 ml-[7.75rem]">
                                        {t.solutions.preflight.port_adjusted_hint
                                            .replace('{port}', String(comp.defaultPort))
                                            .replace('{process}', pf?.portConflictProcess || t.solutions.preflight.unknown_process)}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function StepConfirm({ selected, mediaPath, downloadsPath, portOverrides, totalRam, totalDisk, t }: {
    definition: SolutionDefinition;
    selected: SolutionComponentDef[];
    mediaPath: string;
    downloadsPath: string;
    portOverrides: Record<string, number>;
    totalRam: number;
    totalDisk: number;
    t: ReturnType<typeof useTranslation>['t'];
}) {
    return (
        <div className="space-y-5">
            <h3 className="text-base font-bold text-white">{t.solutions.wizard.confirm_title}</h3>

            {/* Selected Components */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">{t.solutions.wizard.selected_components}</h4>
                <div className="space-y-2">
                    {selected.map(comp => (
                        <div key={comp.id} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                                <img src={getComponentIcon(comp.icon)} alt={comp.name} className="w-5 h-5" />
                                <span className="text-white font-medium">{comp.name}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                    comp.type === 'native' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'
                                }`}>
                                    {t.solutions.type[comp.type as keyof typeof t.solutions.type]}
                                </span>
                            </div>
                            <span className="text-gray-500 font-mono text-xs">:{portOverrides[comp.id] ?? comp.defaultPort}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Storage */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-gray-400">{t.solutions.wizard.media_path}</span>
                    <span className="text-white font-mono text-xs">{mediaPath}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">{t.solutions.wizard.downloads_path}</span>
                    <span className="text-white font-mono text-xs">{downloadsPath}</span>
                </div>
            </div>

            {/* Resources */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">{t.solutions.wizard.resource_estimate}</h4>
                <div className="flex items-center gap-6 text-sm">
                    <span className="text-gray-400">{t.solutions.wizard.ram}: <span className="text-white font-semibold">{totalRam}MB</span></span>
                    <span className="text-gray-400">{t.solutions.wizard.disk}: <span className="text-white font-semibold">{totalDisk}MB</span></span>
                </div>
            </div>
        </div>
    );
}
