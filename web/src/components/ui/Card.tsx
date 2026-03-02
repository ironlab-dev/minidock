import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    className?: string;
    hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', hoverable = false, ...props }) => {
    return (
        <div
            {...props}
            className={`
                rounded-2xl border border-ui-card-border bg-ui-card-bg backdrop-blur-xl transition-all
                ${hoverable ? 'hover:bg-ui-hover-bg hover:border-ui-hover-border' : ''}
                ${className}
            `}
        >
            {children}
        </div>
    );
};
