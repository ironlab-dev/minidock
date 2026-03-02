import React from 'react';

interface BadgeProps {
    children: React.ReactNode;
    variant?: 'blue' | 'emerald' | 'purple' | 'amber' | 'red' | 'gray';
    pulse?: boolean;
    className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'blue', pulse = false, className = '' }) => {
    const colors = {
        blue: 'bg-brand-blue/10 text-brand-blue border-brand-blue/20',
        emerald: 'bg-brand-emerald/10 text-brand-emerald border-brand-emerald/20',
        purple: 'bg-brand-purple/10 text-brand-purple border-brand-purple/20',
        amber: 'bg-brand-amber/10 text-brand-amber border-brand-amber/20',
        red: 'bg-brand-red/10 text-brand-red border-brand-red/20',
        gray: 'bg-white/[0.03] text-gray-500 border-white/5'
    };

    const dotColors = {
        blue: 'bg-brand-blue',
        emerald: 'bg-brand-emerald',
        purple: 'bg-brand-purple',
        amber: 'bg-brand-amber',
        red: 'bg-brand-red',
        gray: 'bg-gray-600'
    };

    return (
        <div className={`px-2 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${colors[variant]} ${className}`}>
            {pulse && (
                <div className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]} animate-pulse shadow-[0_0_8px_currentColor]`} />
            )}
            {children}
        </div>
    );
};
