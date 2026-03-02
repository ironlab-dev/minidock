"use client";

import React from 'react';
import { Card, Button, Badge } from "@/components/ui";
import { useTranslation } from "@/hooks/useTranslation";
import { SystemSetting } from '@/hooks/useSettings';
import { Settings, Plus, Edit2, Trash2 } from 'lucide-react';

interface AdvancedSettingsProps {
    settings: SystemSetting[];
    setEditing: (setting: SystemSetting | null) => void;
    deleteSetting: (key: string) => Promise<void>;
    confirm: (options: { title: string, message: string, variant: 'danger' | 'warning' | 'info' }) => Promise<boolean>;
}

export default function AdvancedSettings({
    settings,
    setEditing,
    deleteSetting,
    confirm
}: AdvancedSettingsProps) {
    const { t } = useTranslation();

    return (
        <Card className="p-8 border-none bg-white/[0.02] backdrop-blur-xl">
            <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-gray-500/10 text-gray-400 border border-gray-500/20">
                        <Settings className="w-6 h-6" />
                    </div>
                    <div className="flex items-center gap-4">
                        <h3 className="text-lg font-bold text-white leading-none">{t.settings.raw_settings}</h3>
                        <Badge variant="gray" className="bg-white/5 border-white/10 text-gray-400">{settings.length} Items</Badge>
                    </div>
                </div>
                <Button
                    onClick={() => setEditing({ key: '', value: '', category: 'custom', isSecret: false })}
                    variant="secondary"
                    size="sm"
                    className="flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    {t.settings.add_setting}
                </Button>
            </div>

            <div className="overflow-x-auto -mx-2">
                <table className="w-full text-left border-separate border-spacing-y-2">
                    <thead>
                        <tr>
                            <th className="px-6 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">{t.settings.col_key}</th>
                            <th className="px-6 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">{t.settings.col_value}</th>
                            <th className="px-6 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">{t.settings.col_category}</th>
                            <th className="px-6 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] text-right">{t.settings.col_actions}</th>
                        </tr>
                    </thead>
                    <tbody className="text-xs">
                        {settings.map((s) => (
                            <tr key={s.key} className="group bg-white/[0.01] hover:bg-white/[0.03] transition-all duration-300">
                                <td className="px-6 py-4 font-mono font-bold text-gray-300 rounded-l-2xl border-y border-l border-white/5">{s.key}</td>
                                <td className="px-6 py-4 max-w-xs truncate text-gray-500 font-medium border-y border-white/5">
                                    {s.isSecret ? '••••••••••••' : s.value}
                                </td>
                                <td className="px-6 py-4 border-y border-white/5">
                                    <Badge variant="gray" className="bg-white/5 border-white/5 px-2 py-0.5 text-[10px]">{s.category || 'custom'}</Badge>
                                </td>
                                <td className="px-6 py-4 text-right space-x-1 rounded-r-2xl border-y border-r border-white/5">
                                    <button
                                        onClick={() => setEditing(s)}
                                        className="p-2 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={async () => {
                                            const confirmed = await confirm({
                                                title: '确认删除',
                                                message: t.settings.confirm_delete,
                                                variant: 'danger',
                                            });
                                            if (confirmed) deleteSetting(s.key);
                                        }}
                                        className="p-2 rounded-lg hover:bg-red-500/10 text-gray-700 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}
