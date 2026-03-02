import React from 'react';

interface PageLayoutProps {
    children: React.ReactNode;
    animate?: boolean;
}

export const PageLayout: React.FC<PageLayoutProps> = ({ children, animate = true }) => {
    return (
        <div className={`flex flex-col flex-1 min-h-0 w-full ${animate ? 'animate-in fade-in slide-in-from-bottom-2 duration-300' : ''}`}>
            {children}
        </div>
    );
};
