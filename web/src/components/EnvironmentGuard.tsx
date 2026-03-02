import React, { useEffect } from 'react';
import { useEnvironment } from '../hooks/useEnvironment';
import { useTranslation } from '@/hooks/useTranslation';

interface EnvironmentGuardProps {
    feature: string;
    title?: string;
    description?: string;
    children: React.ReactNode;
}

export default function EnvironmentGuard({ feature, title, description, children }: EnvironmentGuardProps) {
    const { statuses, loading, installing, logs, install, refresh } = useEnvironment();
    const { t } = useTranslation();
    const [hasMounted, setHasMounted] = React.useState(false);

    // Refresh status when component mounts to ensure up-to-date
    useEffect(() => {
        setHasMounted(true);
        refresh();
    }, []);

    // Normalize feature name for backward compatibility
    const normalizedFeature = feature === 'utm-vms' ? 'qemu' : feature;
    const status = statuses.find(s => s.name === normalizedFeature);
    const isInstalling = installing[normalizedFeature];
    const log = logs[normalizedFeature];

    const handleInstall = () => {
        install(normalizedFeature);
    };

    // EnvironmentGuard.tsx
    // The previous implementation was good but let's make it more resilient to the initial 'loading' state.
    if (!hasMounted || loading) {
        return (
            <div className="flex items-center justify-center h-full text-zinc-400">
                <div className="w-5 h-5 border-2 border-brand-purple/20 border-t-brand-purple rounded-full animate-spin mr-3" />
                {t.common.loading}
            </div>
        );
    }

    if (status?.isInstalled) {
        return <>{children}</>;
    }

    return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-in fade-in zoom-in-95 duration-300">
            <div className="max-w-md w-full">
                {!isInstalling && !log ? (
                    <>
                        <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 group">
                            <svg className="w-8 h-8 text-blue-400 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        </div>

                        <h2 className="text-2xl font-semibold text-white mb-2">
                            {title || `Enable ${feature.charAt(0).toUpperCase() + feature.slice(1)} Support`}
                        </h2>

                        <p className="text-zinc-400 mb-8 leading-relaxed">
                            {description || `This feature requires ${feature} to be installed on your system.`}
                        </p>

                        <button
                            onClick={handleInstall}
                            disabled={isInstalling}
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-all transform active:scale-95 flex items-center mx-auto"
                        >
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            Initialize Environment
                        </button>
                    </>
                ) : (
                    <div className="text-left w-full">
                        <div className="bg-black/40 rounded-lg border border-white/10 p-4 h-64 overflow-y-auto font-mono text-xs text-zinc-300 mb-4 whitespace-pre-wrap">
                            {log || "Starting installation..."}
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center text-white font-medium">
                                {isInstalling ?
                                    <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    :
                                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                }
                                {isInstalling ? 'Installing...' : 'Installation Log'}
                            </div>
                            {!isInstalling && (
                                <button onClick={handleInstall} className="text-sm text-red-400 hover:text-red-300">Retry</button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
