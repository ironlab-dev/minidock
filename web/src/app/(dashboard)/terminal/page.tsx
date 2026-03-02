'use client';

import { DEMO_MODE } from '@/demo/demoConfig';
import { TerminalComponent } from '@/components/terminal/Terminal';
import { Terminal } from 'lucide-react';

export default function TerminalPage() {
    // DEMO_INTEGRATION: show placeholder instead of real terminal
    if (DEMO_MODE) {
        return (
            <div className="flex flex-col h-full w-full items-center justify-center p-12">
                <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center text-gray-500 mb-8 border border-white/10">
                    <Terminal className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-4 uppercase tracking-tight">Terminal</h2>
                <p className="text-gray-500 text-sm font-medium max-w-md text-center">
                    Terminal is not available in demo mode. Install MiniDock to access the full terminal experience.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full w-full">
            <div className="flex-1 w-full h-[calc(100vh-2rem)] rounded-2xl overflow-hidden glass-card shadow-2xl border border-white/5">
                <TerminalComponent />
            </div>
        </div>
    );
}
