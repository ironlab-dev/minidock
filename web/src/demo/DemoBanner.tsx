"use client";

import { useEffect } from 'react';
import { useToastContext } from '@/contexts/ToastContext';
import { setDemoToastFn } from './demoClient';
import { DEMO_MODE } from './demoConfig';

export default function DemoBanner() {
    const { addToast } = useToastContext();

    useEffect(() => {
        setDemoToastFn(addToast);
    }, [addToast]);

    if (!DEMO_MODE) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-[200] h-10 flex items-center justify-center gap-3 bg-gradient-to-r from-purple-600/90 via-blue-600/90 to-purple-600/90 backdrop-blur-xl border-b border-white/10 text-white text-xs font-medium">
            <span className="font-bold tracking-wide">Interactive Demo</span>
            <span className="hidden sm:inline text-white/60">|</span>
            <span className="hidden sm:inline text-white/70">Exploring with mock data. Write operations are disabled.</span>
            <a
                href="https://minidock.net"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white text-[11px] font-bold transition-all active:scale-95"
            >
                Get MiniDock &rarr;
            </a>
        </div>
    );
}
