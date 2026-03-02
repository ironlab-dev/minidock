import React from 'react';

interface SkeletonProps {
    className?: string;
    variant?: 'rectangular' | 'circular' | 'text';
    animation?: 'pulse' | 'wave' | 'none';
}

export const Skeleton: React.FC<SkeletonProps> = ({
    className = '',
    variant = 'rectangular',
    animation = 'pulse',
}) => {
    const baseStyles = 'bg-white/5';
    const animationStyles = {
        pulse: 'animate-pulse',
        wave: 'relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/[0.03] before:to-transparent',
        none: '',
    };

    const variantStyles = {
        rectangular: 'rounded-lg',
        circular: 'rounded-full',
        text: 'rounded h-4 w-full mb-2',
    };

    return (
        <div
            className={`${baseStyles} ${animationStyles[animation]} ${variantStyles[variant]} ${className}`}
        />
    );
};
