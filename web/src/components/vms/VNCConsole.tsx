'use client';

import React from 'react';
import { RemoteConsole } from '@/components/system/RemoteConsole';

interface VNCConsoleProps {
    vmName: string;
    onClose: () => void;
}

export const VNCConsole: React.FC<VNCConsoleProps> = ({ vmName, onClose }) => {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#050505]/95 backdrop-blur-2xl animate-in fade-in duration-700">
            <div className="w-full h-full p-2 md:p-6 flex flex-col">
                <RemoteConsole
                    isHost={false}
                    vmName={vmName}
                    onClose={onClose}
                    title={`${vmName} Console`}
                />
            </div>
        </div>
    );
};
