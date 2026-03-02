import React from 'react';
import { useEnvironment } from '@/hooks/useEnvironment';
import { Card, Button } from '@/components/ui';
import { useTranslation } from "@/hooks/useTranslation";
import { Layers } from 'lucide-react';

export default function EnvironmentManager() {
    const { t } = useTranslation();
    const { statuses, installing, install, refresh } = useEnvironment();

    const components = ['brew', 'docker', 'qemu', 'node'];

    const getStatus = (name: string) => statuses.find(s => s.name === name);

    return (
        <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
                        <Layers className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-white leading-none">{t.settings.env_dep_title}</h3>
                        <p className="text-xs text-gray-500 mt-1">{t.settings.env_dep_desc}</p>
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={refresh}
                >
                    {t.common.refresh}
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {components.map(comp => {
                    const status = getStatus(comp);
                    const isInstalling = installing[comp];

                    return (
                        <div key={comp} className="bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden flex flex-col items-center text-center p-6 transition-all hover:bg-white/[0.04]">
                            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center font-bold text-xl uppercase text-gray-400 mb-4 shadow-inner border border-white/5">
                                {comp.slice(0, 2)}
                            </div>

                            <h4 className="text-lg font-bold text-white capitalize mb-1">{comp}</h4>

                            <div className="text-xs text-gray-500 font-mono mb-6 min-h-[2.5em] line-clamp-2 px-2" title={status?.version}>
                                {status?.isInstalled ?
                                    `${t.settings.env_status_installed} ${status.version ? `(v${status.version})` : ''}` :
                                    t.settings.env_status_not_installed
                                }
                            </div>

                            <div className="mt-auto w-full">
                                {status?.isInstalled ? (
                                    <div className="flex items-center justify-center gap-2 py-2 px-4 bg-emerald-500/10 text-emerald-400 rounded-xl text-xs font-bold uppercase tracking-wider border border-emerald-500/20">
                                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                        {t.settings.env_status_ready}
                                    </div>
                                ) : (
                                    <Button
                                        size="sm"
                                        disabled={isInstalling}
                                        onClick={() => install(comp)}
                                        variant="primary"
                                        className="w-full shadow-lg shadow-brand-blue/20"
                                    >
                                        {isInstalling ? t.settings.env_installing : t.settings.env_install}
                                    </Button>
                                )}
                            </div>

                            {/* Logs Popover - Simplification: removed inline log view for cleaner UI, could be a modal or separate log view if essential */}
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}
