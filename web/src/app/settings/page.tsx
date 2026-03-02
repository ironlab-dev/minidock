"use client";

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSettings, SystemSetting } from '@/hooks/useSettings';
import BootSettings from './BootSettings';
import { ConnectivitySettings } from '@/components/settings/ConnectivitySettings';
import { useTranslation } from "@/hooks/useTranslation";
import { client } from "@/api/client";
import { PageLayout, Button, Card, Tabs } from "@/components/ui";
import EnvironmentManager from '@/components/EnvironmentManager';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';

// New Modular Components
import NotificationSettings from '@/components/settings/NotificationSettings';
import AppManagementSettings from '@/components/settings/AppManagementSettings';
import AdvancedSettings from '@/components/settings/AdvancedSettings';
import HardwareInfo from '@/components/settings/HardwareInfo';
import { DirectoryPreviewDialog } from '@/components/settings/DirectoryPreviewDialog';
import { RemoteAccessSettings } from '@/components/settings/RemoteAccessSettings';
import AboutSettings from '@/components/settings/AboutSettings';
import type { DirectoryPreview } from '@/types/settings';

// Icons
import {
    Settings,
    Zap,
    Network,
    Shield,
    HardDrive,
    Cpu,
    Info,
    ExternalLink,
    Globe,
    X,
} from 'lucide-react';

type TabType = 'general' | 'remote' | 'connectivity' | 'boot' | 'apps' | 'hardware' | 'advanced' | 'about';

interface ServiceWithStats {
    id: string;
    stats?: { version?: string };
}

interface GitOpsDefaults {
    dockerDefaultBranch: string;
    vmDefaultBranch: string;
    automationDefaultBranch: string;
}

export default function SettingsPage() {
    const searchParams = useSearchParams();
    const { settings, saveSetting, deleteSetting, testNotification, previewDirectory } = useSettings();
    const [editing, setEditing] = useState<SystemSetting | null>(null);
    const [isTestLoading, setIsTestLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('general');
    const { t } = useTranslation();
    const toast = useToast();
    const { confirm, ConfirmDialog: ConfirmDialogComponent } = useConfirm();
    const urlParamProcessed = useRef(false);
    
    // Directory Preview Dialog State
    const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
    const [previewData, setPreviewData] = useState<DirectoryPreview | null>(null);
    const [pendingSaveAction, setPendingSaveAction] = useState<(() => Promise<void>) | null>(null);
    const [previewDirectoryPath, setPreviewDirectoryPath] = useState('');
    const [previewDirectoryType, setPreviewDirectoryType] = useState<'docker' | 'vm'>('docker');
    const [previewConfirmLoading, setPreviewConfirmLoading] = useState(false);

    // URL parameter handling for initial load
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && !urlParamProcessed.current) {
            if (['general', 'remote', 'connectivity', 'boot', 'apps', 'hardware', 'advanced', 'about'].includes(tab)) {
                setActiveTab(tab as TabType);
                urlParamProcessed.current = true;
            }
        }
    }, [searchParams]);

    // System States
    const [webhookUrl, setWebhookUrl] = useState('');
    const [currentVersion, setCurrentVersion] = useState('0.0.0');

    // GitOps States
    const [dockerBasePath, setDockerBasePath] = useState('');
    const [dockerGitRemote, setDockerGitRemote] = useState('');
    const [dockerGitBranch, setDockerGitBranch] = useState('');
    const [isDockerSaving, setIsDockerSaving] = useState(false);

    const [vmBasePath, setVMBasePath] = useState('');
    const [vmGitRemote, setVMGitRemote] = useState('');
    const [vmGitBranch, setVMGitBranch] = useState('');
    const [isVMSaving, setIsVMSaving] = useState(false);

    const [automationBasePath, setAutomationBasePath] = useState('');
    const [automationGitRemote, setAutomationGitRemote] = useState('');
    const [automationGitBranch, setAutomationGitBranch] = useState('');
    const [isAutomationSaving, setIsAutomationSaving] = useState(false);

    const [gitOpsDefaults, setGitOpsDefaults] = useState({
        dockerDefaultBranch: 'main',
        vmDefaultBranch: 'main',
        automationDefaultBranch: 'main'
    });

    // Sync settings-dependent state
    useEffect(() => {
        const webhookSetting = settings.find(s => s.key === 'FEISHU_BOT_WEBHOOK_URL');
        if (webhookSetting) setWebhookUrl(webhookSetting.value);

        setDockerBasePath(settings.find(s => s.key === 'DOCKER_BASE_PATH')?.value || '');
        setDockerGitRemote(settings.find(s => s.key === 'DOCKER_GIT_REMOTE')?.value || '');
        setDockerGitBranch(settings.find(s => s.key === 'DOCKER_GIT_BRANCH')?.value || '');

        setVMBasePath(settings.find(s => s.key === 'VM_BASE_PATH')?.value || '');
        setVMGitRemote(settings.find(s => s.key === 'VM_GIT_REMOTE')?.value || '');
        setVMGitBranch(settings.find(s => s.key === 'VM_GIT_BRANCH')?.value || '');

        setAutomationBasePath(settings.find(s => s.key === 'AUTOMATION_BASE_PATH')?.value || '');
        setAutomationGitRemote(settings.find(s => s.key === 'AUTOMATION_GIT_REMOTE')?.value || '');
        setAutomationGitBranch(settings.find(s => s.key === 'AUTOMATION_GIT_BRANCH')?.value || '');
    }, [settings]);

    // Fetch version and GitOps defaults on mount
    useEffect(() => {
        const fetchVersion = async () => {
            try {
                const services = await client.get<ServiceWithStats[]>('/services');
                const updateService = services.find(s => s.id === 'system-update');
                if (updateService?.stats?.version) setCurrentVersion(updateService.stats.version);
            } catch (e) {
                console.error('[Settings] Failed to fetch current version', e);
            }
        };

        const fetchGitOpsDefaults = async () => {
            try {
                const defaults = await client.get<GitOpsDefaults>('/settings/gitops-defaults');
                setGitOpsDefaults(defaults);
            } catch (e) {
                console.error('[Settings] Failed to fetch GitOps defaults', e);
            }
        };

        fetchVersion();
        fetchGitOpsDefaults();
    }, []);

    // Handlers (Moved from original page)
    const handleSaveWebhook = async () => {
        try {
            await saveSetting({ key: 'FEISHU_BOT_WEBHOOK_URL', value: webhookUrl, category: 'notification', isSecret: true });
            toast.success(t.settings.save_success);
        } catch (e) {
            toast.error(t.settings.save_error + ": " + e);
        }
    };

    const handleSaveGitOps = async (category: 'docker' | 'vm' | 'automation', basePath: string, remote: string, branch: string, setIsSaving: (s: boolean) => void) => {
        // Skip preview for automation category
        if (category === 'automation') {
            await executeSaveGitOps(category, basePath, remote, branch, setIsSaving);
            return;
        }

        // Check if directory exists and has content
        try {
            const preview = await previewDirectory(basePath, category);
            
            // If directory exists and has items, show preview dialog
            if (preview.exists && preview.items.length > 0) {
                setPreviewData(preview);
                setPreviewDirectoryPath(basePath);
                setPreviewDirectoryType(category);
                setPendingSaveAction(() => () => executeSaveGitOps(category, basePath, remote, branch, setIsSaving));
                setPreviewDialogOpen(true);
            } else {
                // No content, proceed directly
                await executeSaveGitOps(category, basePath, remote, branch, setIsSaving);
            }
        } catch (e) {
            // If preview fails, still allow save (might be permission issue or directory doesn't exist yet)
            console.warn('[Settings] Preview failed, proceeding with save:', e);
            await executeSaveGitOps(category, basePath, remote, branch, setIsSaving);
        }
    };

    const executeSaveGitOps = async (category: 'docker' | 'vm' | 'automation', basePath: string, remote: string, branch: string, setIsSaving: (s: boolean) => void) => {
        setIsSaving(true);
        const prefix = category.toUpperCase();
        try {
            await saveSetting({ key: `${prefix}_BASE_PATH`, value: basePath, category, isSecret: false });
            await saveSetting({ key: `${prefix}_GIT_REMOTE`, value: remote, category, isSecret: false });
            const trimmedBranch = branch.trim();
            if (trimmedBranch) {
                await saveSetting({ key: `${prefix}_GIT_BRANCH`, value: trimmedBranch, category, isSecret: false });
            } else {
                await deleteSetting(`${prefix}_GIT_BRANCH`);
            }
            toast.success(t.settings.save_success);
        } catch (e) {
            toast.error(t.settings.save_error + ": " + e);
        } finally {
            setIsSaving(false);
        }
    };

    const handlePreviewConfirm = async () => {
        if (pendingSaveAction) {
            setPreviewConfirmLoading(true);
            try {
                await pendingSaveAction();
            } finally {
                setPreviewConfirmLoading(false);
                setPreviewDialogOpen(false);
                setPendingSaveAction(null);
            }
        } else {
            setPreviewDialogOpen(false);
        }
    };

    const handlePreviewCancel = () => {
        setPreviewDialogOpen(false);
        setPreviewData(null);
        setPendingSaveAction(null);
    };

    const handleTestNotification = async (title: string, message: string) => {
        setIsTestLoading(true);
        try {
            await testNotification(title, message);
        } finally {
            setIsTestLoading(false);
        }
    };

    return (
        <>
            <PageLayout animate={false}>
                {/* iPhone style sticky top navigation */}
                <Tabs
                    tabs={[
                        { id: 'general', label: t.settings.tab_general, icon: <Settings className="w-4 h-4" /> },
                        { id: 'remote', label: t.settings.tab_remote, icon: <Globe className="w-4 h-4" /> },
                        { id: 'connectivity', label: t.settings.tab_connectivity, icon: <Network className="w-4 h-4" /> },
                        { id: 'boot', label: t.settings.tab_boot, icon: <Zap className="w-4 h-4" /> },
                        { id: 'apps', label: t.settings.tab_apps, icon: <Cpu className="w-4 h-4" /> },
                        { id: 'hardware', label: t.settings.hardware.title, icon: <HardDrive className="w-4 h-4" /> },
                        { id: 'advanced', label: t.settings.tab_advanced, icon: <Shield className="w-4 h-4" /> },
                        { id: 'about', label: t.settings.tab_about, icon: <Info className="w-4 h-4" /> },
                    ]}
                    activeTab={activeTab}
                    onChange={(id) => setActiveTab(id as TabType)}
                    paramName="tab"
                    variant="blue"
                    sticky={true}
                />

                <div className="flex-1 overflow-y-auto no-scrollbar">
                    <div className="max-w-[1800px] mx-auto p-6 space-y-8 pb-20">
                        {activeTab === 'general' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <EnvironmentManager />
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    <Card className="p-8 border-none bg-white/[0.02] backdrop-blur-xl">
                                        <div className="flex items-center gap-4 mb-6">
                                            <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                <Info className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-white leading-none">{t.settings.version_info_title}</h3>
                                                <p className="text-xs text-gray-500 mt-2 font-mono">Current: v{currentVersion}</p>
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-400 leading-relaxed mb-4">
                                            {t.settings.version_sparkle_desc}
                                        </p>
                                        <a
                                            href="https://minidock.net"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 hover:text-blue-300 text-xs font-semibold transition-all"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            {t.sidebar.visit_website}
                                        </a>
                                    </Card>
                                    <NotificationSettings
                                        {...{
                                            webhookUrl, setWebhookUrl, handleSaveWebhook,
                                            testNotification: handleTestNotification, isTestLoading
                                        }}
                                    />
                                </div>
                            </div>
                        )}

                        {activeTab === 'remote' && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <RemoteAccessSettings />
                            </div>
                        )}

                        {activeTab === 'connectivity' && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <ConnectivitySettings />
                            </div>
                        )}

                        {activeTab === 'boot' && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <BootSettings />
                            </div>
                        )}

                        {activeTab === 'apps' && (
                            <AppManagementSettings
                                {...{
                                    dockerBasePath, setDockerBasePath, dockerGitRemote, setDockerGitRemote, dockerGitBranch, setDockerGitBranch, isDockerSaving,
                                    handleSaveDockerGitOps: () => handleSaveGitOps('docker', dockerBasePath, dockerGitRemote, dockerGitBranch, setIsDockerSaving),
                                    vmBasePath, setVMBasePath, vmGitRemote, setVMGitRemote, vmGitBranch, setVMGitBranch, isVMSaving,
                                    handleSaveVMGitOps: () => handleSaveGitOps('vm', vmBasePath, vmGitRemote, vmGitBranch, setIsVMSaving),
                                    automationBasePath, setAutomationBasePath, automationGitRemote, setAutomationGitRemote, automationGitBranch, setAutomationGitBranch, isAutomationSaving,
                                    handleSaveAutomationGitOps: () => handleSaveGitOps('automation', automationBasePath, automationGitRemote, automationGitBranch, setIsAutomationSaving),
                                    gitOpsDefaults
                                }}
                            />
                        )}

                        {activeTab === 'hardware' && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <HardwareInfo />
                            </div>
                        )}

                        {activeTab === 'advanced' && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <AdvancedSettings
                                    settings={settings}
                                    setEditing={setEditing}
                                    deleteSetting={deleteSetting}
                                    confirm={confirm}
                                />
                            </div>
                        )}

                        {activeTab === 'about' && (
                            <AboutSettings currentVersion={currentVersion} />
                        )}
                    </div>
                </div>

                {/* Edit Modal (Keeping it original but styled) */}
                {
                    editing && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
                            <Card className="w-full max-w-lg border-white/10 shadow-2xl p-0 overflow-hidden">
                                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                                    <h2 className="text-lg font-bold tracking-tight text-white">{t.settings.edit_setting}</h2>
                                    <button onClick={() => setEditing(null)} className="p-2 rounded-xl hover:bg-white/5 text-gray-400 transition-colors">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                                <form onSubmit={(e) => { e.preventDefault(); saveSetting(editing); setEditing(null); }} className="p-8 space-y-6">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em] ml-1">{t.settings.col_key}</label>
                                            <input
                                                required
                                                value={editing.key}
                                                onChange={e => setEditing({ ...editing, key: e.target.value.toUpperCase().replace(/\s/g, '_') })}
                                                placeholder="SETTING_KEY"
                                                className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-brand-blue/50 transition-all font-mono"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em] ml-1">{t.settings.col_value}</label>
                                            <textarea
                                                required
                                                value={editing.value}
                                                onChange={e => setEditing({ ...editing, value: e.target.value })}
                                                placeholder="Setting value..."
                                                className="w-full h-40 bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-brand-blue/50 transition-all resize-none shadow-inner"
                                            />
                                        </div>
                                        <div className="flex items-center gap-4 pt-2">
                                            <div className="relative inline-flex items-center cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    checked={editing.isSecret}
                                                    onChange={e => setEditing({ ...editing, isSecret: e.target.checked })}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-11 h-6 bg-white/5 border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-500 peer-checked:after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 shadow-lg"></div>
                                                <span className="ml-3 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] group-hover:text-gray-300 transition-colors">{t.settings.is_secret}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex justify-end pt-4 gap-4">
                                        <Button
                                            type="button"
                                            onClick={() => setEditing(null)}
                                            variant="ghost"
                                            className="text-gray-400 hover:text-white"
                                        >
                                            {t.common.cancel || "Cancel"}
                                        </Button>
                                        <Button
                                            type="submit"
                                            className="px-10 bg-brand-blue hover:bg-brand-blue/80 shadow-lg shadow-brand-blue/20"
                                        >
                                            {t.common.save}
                                        </Button>
                                    </div>
                                </form>
                            </Card>
                        </div>
                    )
                }
            </PageLayout>
            <ConfirmDialogComponent />
            <DirectoryPreviewDialog
                isOpen={previewDialogOpen}
                onClose={handlePreviewCancel}
                onConfirm={handlePreviewConfirm}
                preview={previewData}
                directoryPath={previewDirectoryPath}
                directoryType={previewDirectoryType}
                isLoading={previewConfirmLoading}
            />
        </>
    );
}
