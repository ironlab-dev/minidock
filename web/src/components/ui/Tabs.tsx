"use client";

import React, { useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { LucideIcon } from "lucide-react";

export interface TabItem {
    id: string;
    label: string | React.ReactNode;
    icon?: LucideIcon | React.ReactNode;
}

interface TabsProps {
    tabs: TabItem[];
    activeTab: string;
    onChange: (id: string) => void;
    variant?: "blue" | "purple" | "emerald" | "gray";
    paramName?: string; // If provided, will sync with URL parameter
    className?: string;
    actions?: React.ReactNode;
    sticky?: boolean;
}

export function Tabs({
    tabs,
    activeTab,
    onChange,
    variant = "blue",
    paramName,
    className = "",
    actions,
    sticky = true,
}: TabsProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const initialSyncDone = useRef(false);

    // Sync with URL parameter if paramName is provided
    useEffect(() => {
        if (paramName && !initialSyncDone.current) {
            const paramValue = searchParams.get(paramName);
            if (paramValue && tabs.some((t) => t.id === paramValue)) {
                onChange(paramValue);
            }
            initialSyncDone.current = true;
        }
    }, [paramName, searchParams, tabs, onChange]);

    const handleTabChange = (id: string) => {
        onChange(id);
        if (paramName) {
            const params = new URLSearchParams(searchParams.toString());
            params.set(paramName, id);
            // Optionally remove other exclusive params if needed, but keeping it simple for now
            router.replace(`${pathname}?${params.toString()}`);
        }
    };

    const variantStyles = {
        blue: "bg-brand-blue shadow-brand-blue/20",
        purple: "bg-brand-purple shadow-brand-purple/20",
        emerald: "bg-brand-emerald shadow-brand-emerald/20",
        gray: "bg-gray-600 shadow-gray-600/20",
    };

    const containerClasses = sticky
        ? "sticky top-0 z-20 bg-[#0a0a0c]/80 backdrop-blur-md px-6 sm:px-10 py-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-white/5"
        : `flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 ${className}`;

    return (
        <div className={containerClasses}>
            <div className="flex bg-white/[0.03] border border-white/5 p-1 rounded-xl backdrop-blur-md gap-1 overflow-x-auto no-scrollbar">
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    const Icon = tab.icon;

                    let renderedIcon: React.ReactNode = null;
                    if (Icon) {
                        if (React.isValidElement(Icon)) {
                            renderedIcon = Icon;
                        } else if (typeof Icon === 'function' || (typeof Icon === 'object' && Icon !== null)) {
                            const Component = Icon as React.ElementType;
                            renderedIcon = <Component size={14} className={isActive ? "text-white" : "text-gray-500"} />;
                        } else {
                            renderedIcon = <span>{Icon}</span>;
                        }
                    }

                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 whitespace-nowrap ${isActive
                                ? `${variantStyles[variant]} text-white shadow-lg`
                                : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.02]"
                                }`}
                        >
                            {renderedIcon}
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {actions && (
                <div className="flex items-center gap-3 shrink-0">
                    {actions}
                </div>
            )}
        </div>
    );
}
