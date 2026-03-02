"use client";

import React from "react";

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    label?: string;
    className?: string;
}

/**
 * macOS 风格的 Switch 组件
 * 遵循 Apple Human Interface Guidelines
 */
export const Switch: React.FC<SwitchProps> = ({
    checked,
    onChange,
    disabled = false,
    label,
    className = "",
}) => {
    const handleClick = () => {
        if (!disabled) {
            onChange(!checked);
        }
    };

    return (
        <label
            className={`flex items-center gap-2 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
            onClick={disabled ? undefined : handleClick}
        >
            <div
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-200 ${
                    checked
                        ? 'bg-blue-500'
                        : 'bg-white/10'
                } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                role="switch"
                aria-checked={checked}
                aria-disabled={disabled}
            >
                <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-all duration-200 ${
                        checked ? 'translate-x-[18px]' : 'translate-x-0.5'
                    }`}
                />
            </div>
            {label && (
                <span className="text-sm text-gray-400 select-none">
                    {label}
                </span>
            )}
        </label>
    );
};
