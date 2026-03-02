"use client";

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from "@/hooks/useTranslation";
import { ExternalLink, Copy, Check, ChevronDown, ChevronRight, CircleCheck, Circle, ListChecks } from 'lucide-react';
import type { ResolvedStep } from '@/lib/setupGuides';

interface SetupGuidePanelProps {
    solutionId: string;
    steps: ResolvedStep[];
}

const STORAGE_KEY_PREFIX = 'minidock_setup_guide_';

export default function SetupGuidePanel({ solutionId, steps }: SetupGuidePanelProps) {
    const { t } = useTranslation();
    const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
    const [expandedStep, setExpandedStep] = useState<string | null>(null);
    const [copiedAddr, setCopiedAddr] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState(false);

    // Load from localStorage
    useEffect(() => {
        try {
            const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${solutionId}`);
            if (stored) {
                setCompletedSteps(new Set(JSON.parse(stored)));
            }
        } catch { /* ignore */ }
    }, [solutionId]);

    // Persist to localStorage
    const persistCompleted = useCallback((newSet: Set<string>) => {
        try {
            localStorage.setItem(
                `${STORAGE_KEY_PREFIX}${solutionId}`,
                JSON.stringify(Array.from(newSet))
            );
        } catch { /* ignore */ }
    }, [solutionId]);

    const toggleStep = useCallback((stepId: string) => {
        setCompletedSteps(prev => {
            const next = new Set(prev);
            if (next.has(stepId)) {
                next.delete(stepId);
            } else {
                next.add(stepId);
            }
            persistCompleted(next);
            return next;
        });
    }, [persistCompleted]);

    const handleCopy = useCallback(async (value: string, key: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopiedAddr(key);
            setTimeout(() => setCopiedAddr(null), 2000);
        } catch { /* ignore */ }
    }, []);

    if (steps.length === 0) return null;

    const completedCount = steps.filter(s => completedSteps.has(s.id)).length;
    const allDone = completedCount === steps.length;

    return (
        <div className="px-6 pb-2">
            {/* Header */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="w-full flex items-center justify-between py-3 group"
            >
                <div className="flex items-center gap-2.5">
                    <ListChecks className="w-4 h-4 text-gray-500" />
                    <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500">
                        {t.solutions.installed.setup_guide}
                    </h4>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                        allDone
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-white/[0.04] text-gray-500'
                    }`}>
                        {completedCount}/{steps.length}
                    </span>
                </div>
                {collapsed
                    ? <ChevronRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition-colors" />
                    : <ChevronDown className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition-colors" />
                }
            </button>

            {/* Steps */}
            {!collapsed && (
                <div className="space-y-1.5 pb-4">
                    {allDone && (
                        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/[0.12]">
                            <CircleCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                            <p className="text-xs text-emerald-400 font-medium">
                                {t.solutions.installed.setup_complete}
                            </p>
                        </div>
                    )}

                    {steps.map((step, idx) => {
                        const isDone = completedSteps.has(step.id);
                        const isExpanded = expandedStep === step.id;

                        return (
                            <div
                                key={step.id}
                                className={`rounded-xl border transition-all duration-200 ${
                                    isDone
                                        ? 'border-white/[0.04] bg-white/[0.01]'
                                        : 'border-white/[0.08] bg-white/[0.02]'
                                }`}
                            >
                                {/* Step Header */}
                                <div className="flex items-start gap-3 px-4 py-3">
                                    {/* Checkbox */}
                                    <button
                                        onClick={() => toggleStep(step.id)}
                                        className="mt-0.5 flex-shrink-0"
                                    >
                                        {isDone
                                            ? <CircleCheck className="w-4.5 h-4.5 text-emerald-400" />
                                            : <Circle className="w-4.5 h-4.5 text-gray-600 hover:text-gray-400 transition-colors" />
                                        }
                                    </button>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <button
                                            onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                                            className="w-full text-left"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                                    isDone ? 'bg-emerald-500/10 text-emerald-400/60' : 'bg-white/[0.06] text-gray-500'
                                                }`}>
                                                    {idx + 1}
                                                </span>
                                                <span className={`text-sm font-medium ${
                                                    isDone ? 'text-gray-500 line-through' : 'text-white/90'
                                                }`}>
                                                    {step.title}
                                                </span>
                                            </div>
                                            <p className={`text-xs mt-1 leading-relaxed ${
                                                isDone ? 'text-gray-600' : 'text-gray-400'
                                            }`}>
                                                {step.description}
                                            </p>
                                        </button>

                                        {/* Expanded: Addresses + Open Button */}
                                        {isExpanded && (
                                            <div className="mt-3 space-y-2">
                                                {step.addresses.length > 0 && (
                                                    <div className="rounded-lg bg-black/20 border border-white/[0.06] p-3 space-y-1.5">
                                                        {step.addresses.map((addr, ai) => {
                                                            const copyKey = `${step.id}-${ai}`;
                                                            return (
                                                                <div key={ai} className="flex items-center justify-between gap-2">
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        <span className="text-[10px] text-gray-500 flex-shrink-0 w-28 text-right">
                                                                            {addr.label}
                                                                        </span>
                                                                        <span className="text-xs font-mono text-gray-300 truncate">
                                                                            {addr.value}
                                                                        </span>
                                                                    </div>
                                                                    {addr.copyable && (
                                                                        <button
                                                                            onClick={() => handleCopy(addr.value, copyKey)}
                                                                            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-all flex-shrink-0"
                                                                        >
                                                                            {copiedAddr === copyKey
                                                                                ? <><Check className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">{t.solutions.installed.step_copied}</span></>
                                                                                : <><Copy className="w-3 h-3" /><span>{t.solutions.installed.step_copy}</span></>
                                                                            }
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {step.targetUrl && (
                                                    <a
                                                        href={step.targetUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-xs font-medium transition-all"
                                                    >
                                                        <ExternalLink className="w-3 h-3" />
                                                        {t.solutions.installed.step_open}
                                                    </a>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Expand indicator */}
                                    <button
                                        onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                                        className="mt-1 flex-shrink-0"
                                    >
                                        {isExpanded
                                            ? <ChevronDown className="w-3.5 h-3.5 text-gray-600" />
                                            : <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
                                        }
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
