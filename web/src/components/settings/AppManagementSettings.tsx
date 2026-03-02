"use client";

import React from 'react';
import { Card, Button } from "@/components/ui";
import { useTranslation } from "@/hooks/useTranslation";
import { Layout, Globe, GitBranch, HardDrive } from 'lucide-react';

interface AppManagementSettingsProps {
    // Docker
    dockerBasePath: string;
    setDockerBasePath: (v: string) => void;
    dockerGitRemote: string;
    setDockerGitRemote: (v: string) => void;
    dockerGitBranch: string;
    setDockerGitBranch: (v: string) => void;
    isDockerSaving: boolean;
    handleSaveDockerGitOps: () => Promise<void>;

    // VM
    vmBasePath: string;
    setVMBasePath: (v: string) => void;
    vmGitRemote: string;
    setVMGitRemote: (v: string) => void;
    vmGitBranch: string;
    setVMGitBranch: (v: string) => void;
    isVMSaving: boolean;
    handleSaveVMGitOps: () => Promise<void>;

    // Automation
    automationBasePath: string;
    setAutomationBasePath: (v: string) => void;
    automationGitRemote: string;
    setAutomationGitRemote: (v: string) => void;
    automationGitBranch: string;
    setAutomationGitBranch: (v: string) => void;
    isAutomationSaving: boolean;
    handleSaveAutomationGitOps: () => Promise<void>;

    gitOpsDefaults: { dockerDefaultBranch: string, vmDefaultBranch: string, automationDefaultBranch: string };
}

export default function AppManagementSettings({
    dockerBasePath, setDockerBasePath, dockerGitRemote, setDockerGitRemote, dockerGitBranch, setDockerGitBranch, isDockerSaving, handleSaveDockerGitOps,
    vmBasePath, setVMBasePath, vmGitRemote, setVMGitRemote, vmGitBranch, setVMGitBranch, isVMSaving, handleSaveVMGitOps,
    automationBasePath, setAutomationBasePath, automationGitRemote, setAutomationGitRemote, automationGitBranch, setAutomationGitBranch, isAutomationSaving, handleSaveAutomationGitOps,
    gitOpsDefaults
}: AppManagementSettingsProps) {
    const { t } = useTranslation();

    const renderGitOpsCard = (
        title: string,
        desc: string,
        icon: React.ReactNode,
        basePath: string,
        setBasePath: (v: string) => void,
        gitRemote: string,
        setGitRemote: (v: string) => void,
        gitBranch: string,
        setGitBranch: (v: string) => void,
        isSaving: boolean,
        onSave: () => void,
        defaultBranch: string,
        colorClass: string,
        basePathHelp: string,
        gitRemoteHelp: string
    ) => (
        <Card className={`p-8 border-none bg-white/[0.02] backdrop-blur-xl mb-8`}>
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl bg-${colorClass}-500/10 text-${colorClass}-400 border border-${colorClass}-500/20`}>
                        {icon}
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">{title}</h3>
                        <p className="text-xs text-gray-500 mt-1">{desc}</p>
                    </div>
                </div>
                <Button onClick={onSave} isLoading={isSaving} className="px-6">
                    {t.common.save}
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-3">
                    <div className="flex items-center gap-2 ml-1 text-xs font-bold text-gray-500 uppercase tracking-widest">
                        <HardDrive className="w-3 h-3" />
                        <label>{t.settings.docker_base_path || "Base Path"}</label>
                    </div>
                    <input
                        type="text"
                        value={basePath}
                        onChange={e => setBasePath(e.target.value)}
                        placeholder="/Users/name/minidock-data"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/20 transition-all duration-300"
                    />
                    <p className="text-[10px] text-gray-600 ml-1 leading-relaxed">{basePathHelp}</p>
                </div>
                <div className="space-y-3">
                    <div className="flex items-center gap-2 ml-1 text-xs font-bold text-gray-500 uppercase tracking-widest">
                        <Globe className="w-3 h-3" />
                        <label>{t.settings.docker_git_remote || "Git Remote"}</label>
                    </div>
                    <input
                        type="text"
                        value={gitRemote}
                        onChange={e => setGitRemote(e.target.value)}
                        placeholder="git@github.com:name/repo.git"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/20 transition-all duration-300"
                    />
                    <p className="text-[10px] text-gray-600 ml-1 leading-relaxed">{gitRemoteHelp}</p>
                </div>
                <div className="space-y-3">
                    <div className="flex items-center gap-2 ml-1 text-xs font-bold text-gray-500 uppercase tracking-widest">
                        <GitBranch className="w-3 h-3" />
                        <label>Git Branch</label>
                    </div>
                    <input
                        type="text"
                        value={gitBranch}
                        onChange={e => setGitBranch(e.target.value)}
                        placeholder={`Auto (${defaultBranch})`}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/20 transition-all duration-300"
                    />
                    <p className="text-[10px] text-gray-600 ml-1 leading-relaxed">Default branch for push operations (default: hostname-based).</p>
                </div>
            </div>
        </Card>
    );

    return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {renderGitOpsCard(
                t.settings.docker_mgmt,
                t.settings.docker_mgmt_desc,
                <Layout className="w-6 h-6" />,
                dockerBasePath, setDockerBasePath,
                dockerGitRemote, setDockerGitRemote,
                dockerGitBranch, setDockerGitBranch,
                isDockerSaving, handleSaveDockerGitOps,
                gitOpsDefaults.dockerDefaultBranch,
                "blue",
                t.settings.docker_base_path_help,
                t.settings.docker_git_remote_help
            )}

            {renderGitOpsCard(
                "VM Management (GitOps)",
                "Configure storage path and remote git repository for Virtual Machines.",
                <Layout className="w-6 h-6 rotate-90" />,
                vmBasePath, setVMBasePath,
                vmGitRemote, setVMGitRemote,
                vmGitBranch, setVMGitBranch,
                isVMSaving, handleSaveVMGitOps,
                gitOpsDefaults.vmDefaultBranch,
                "purple",
                t.settings.vm_base_path_help,
                "Remote repository URL for backing up VM configurations."
            )}

            {renderGitOpsCard(
                t.settings.automation_mgmt,
                t.settings.automation_mgmt_desc,
                <Layout className="w-6 h-6" />,
                automationBasePath, setAutomationBasePath,
                automationGitRemote, setAutomationGitRemote,
                automationGitBranch, setAutomationGitBranch,
                isAutomationSaving, handleSaveAutomationGitOps,
                gitOpsDefaults.automationDefaultBranch,
                "orange",
                t.settings.automation_base_path_help,
                t.settings.automation_git_remote_help
            )}
        </div>
    );
}

// Fix theme color classes for Tailwind
// bg-blue-500/10 text-blue-400 border-blue-500/20
// bg-purple-500/10 text-purple-400 border-purple-500/20
// bg-orange-500/10 text-orange-400 border-orange-500/20
