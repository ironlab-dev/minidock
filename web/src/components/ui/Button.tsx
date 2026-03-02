import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
    size?: 'sm' | 'md' | 'lg' | 'icon-sm';
    isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    variant = 'primary',
    size = 'md',
    isLoading = false,
    className = '',
    disabled,
    ...props
}) => {
    const baseStyles = 'rounded-xl font-bold uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2';

    const variants = {
        primary: 'bg-brand-blue hover:bg-brand-blue/90 text-white shadow-lg shadow-brand-blue/20',
        secondary: 'bg-white/[0.03] text-gray-400 hover:text-white border border-white/5',
        danger: 'bg-brand-red/10 text-brand-red border border-brand-red/20 hover:bg-brand-red hover:text-white',
        success: 'bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/20 hover:bg-brand-emerald hover:text-white',
        ghost: 'text-gray-500 hover:text-white hover:bg-white/5'
    };

    const sizes = {
        sm: 'px-3 py-1.5 text-[11px]',
        md: 'px-4 py-2 text-xs',
        lg: 'px-6 py-3 text-sm',
        'icon-sm': 'p-1.5 min-w-[32px] min-h-[32px]'
    };

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading && (
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            )}
            {children}
        </button>
    );
};
