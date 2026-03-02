"use client";

import React from 'react';
import { Card, Button } from "@/components/ui";
import { useTranslation } from "@/hooks/useTranslation";
import { Bell } from 'lucide-react';

interface NotificationSettingsProps {
    webhookUrl: string;
    setWebhookUrl: (url: string) => void;
    handleSaveWebhook: () => Promise<void>;
    testNotification: (title: string, message: string) => void;
    isTestLoading: boolean;
}

export default function NotificationSettings({
    webhookUrl,
    setWebhookUrl,
    handleSaveWebhook,
    testNotification,
    isTestLoading
}: NotificationSettingsProps) {
    const { t } = useTranslation();

    return (
        <Card className="p-8 border-none bg-white/[0.02] backdrop-blur-xl">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <Bell className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white leading-none">{t.settings.notification_title}</h3>
                        <p className="text-xs text-gray-500 mt-2">Configure how MiniDock sends alerts and updates.</p>
                    </div>
                </div>
                <Button
                    onClick={() => testNotification('MiniDock', '这是一条测试通知')}
                    variant="ghost"
                    size="sm"
                    className="text-xs font-bold uppercase tracking-widest hover:bg-emerald-500/10 hover:text-emerald-400"
                    isLoading={isTestLoading}
                >
                    {t.settings.test_notify}
                </Button>
            </div>

            <div className="space-y-6">
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 block ml-1">
                        Feishu Webhook URL
                    </label>
                    <div className="flex gap-3">
                        <input
                            type="password"
                            value={webhookUrl}
                            onChange={(e) => setWebhookUrl(e.target.value)}
                            placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all duration-300"
                        />
                        <Button
                            onClick={handleSaveWebhook}
                            variant="secondary"
                            className="px-6"
                        >
                            {t.common.save}
                        </Button>
                    </div>
                </div>
                <div className="p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 text-xs text-emerald-400/80 leading-relaxed italic">
                    {t.settings.notification_help}
                </div>
            </div>
        </Card>
    );
}
