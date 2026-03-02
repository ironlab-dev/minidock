"use client";

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';

interface AutomationGuideProps {
    triggerType?: 'cron' | 'watch' | 'metric' | 'event';
    scriptType?: 'shell' | 'python' | 'swift';
    defaultExpanded?: boolean;
}

export const AutomationGuide: React.FC<AutomationGuideProps> = ({
    triggerType,
    scriptType,
    defaultExpanded = false
}) => {
    const { t } = useTranslation();
    const [, setIsMobile] = useState(false);
    // 移动端默认折叠，桌面端使用defaultExpanded
    const [expanded, setExpanded] = useState(defaultExpanded && typeof window !== 'undefined' && window.innerWidth >= 768);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
            // 移动端默认折叠
            if (window.innerWidth < 768) {
                setExpanded(false);
            }
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // 获取触发方式说明
    const getTriggerDescription = () => {
        switch (triggerType) {
            case 'cron':
                return t.automation.guide.cron_desc;
            case 'watch':
                return t.automation.guide.watch_desc;
            case 'metric':
                return t.automation.guide.metric_desc;
            case 'event':
                return t.automation.guide.event_desc;
            default:
                return null;
        }
    };

    // 获取实际案例
    const getExample = () => {
        if (!triggerType || !scriptType) return null;

        const key = `${triggerType}_${scriptType}_example` as keyof typeof t.automation.guide;
        const example = t.automation.guide[key];
        
        if (typeof example === 'string') {
            return example;
        }
        return null;
    };

    const triggerDesc = getTriggerDescription();
    const example = getExample();

    // 如果没有内容，不显示组件
    if (!triggerDesc && !example) {
        return null;
    }

    return (
        <div className="mb-4 sm:mb-6">
            {/* 折叠/展开按钮 */}
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 active:bg-white/15 transition-colors group touch-manipulation"
            >
                <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">
                        {t.automation.guide.title}
                    </span>
                </div>
                {expanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                )}
            </button>

            {/* 展开的内容 - 单一展开，直接显示所有模块 */}
            {expanded && (
                <div className="mt-3 sm:mt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    {/* 触发方式说明 */}
                    {triggerDesc && (
                        <div className="bg-white/5 border border-white/10 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
                            <h4 className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <span>•</span>
                                {t.automation.guide.trigger_desc}
                            </h4>
                            <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">{triggerDesc}</p>
                        </div>
                    )}

                    {/* 实际案例 */}
                    {example && (
                        <div className="bg-white/5 border border-white/10 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
                            <h4 className="text-xs font-bold text-yellow-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <span>•</span>
                                {t.automation.guide.examples}
                            </h4>
                            <pre className="bg-black/40 rounded-lg p-2 sm:p-3 text-[10px] sm:text-xs font-mono text-gray-300 overflow-x-auto border border-white/10 whitespace-pre-wrap break-words">
                                {example}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
