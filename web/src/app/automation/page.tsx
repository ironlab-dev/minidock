"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useAutomation, AutomationTask, ExecutionLog, GitCommit } from "@/hooks/useAutomation";
import { useTranslation } from "@/hooks/useTranslation";
import { PageLayout, Button, Card } from "@/components/ui";
import { Editor } from "@/components/ui/Editor";
import { AutomationGuide } from "@/components/automation/AutomationGuide";
import { DiffViewer } from "@/components/ui/DiffViewer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getNextRunTime, formatTimeAgo } from "@/lib/cronUtils";
import { formatCode, SupportedLanguage } from "@/lib/formatCode";
import { useToast } from "@/hooks/useToast";
import { Edit } from 'lucide-react';

// 获取任务图标
function getTaskIcon(task: AutomationTask) {
    // WATCH类型 - 云和风景图标
    if (task.triggerType === "watch") {
        return (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75c0 2.485 2.085 4.5 4.625 4.5.621 0 1.218-.08 1.787-.24m-3.75-3.75c0-2.485 2.085-4.5 4.625-4.5.621 0 1.218.08 1.787.24m-3.75 0c0-2.485 2.085-4.5 4.625-4.5.621 0 1.218.08 1.787.24M9.75 8.25H15m-5.25 0v9m0-9h-1.5m1.5 0v9m-1.5-9H9m-1.5 0H12m-1.5 0v9m0-9H9m1.5 0H12m-1.5 0v9m0-9H9m1.5 0H12" />
            </svg>
        );
    }
    // WEBHOOK类型 - 链式图标
    if (task.triggerType === "event" || task.eventType) {
        return (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
        );
    }
    // SWIFT类型 - 照片图标
    if (task.scriptType === "swift") {
        return (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75c0 2.485 2.085 4.5 4.625 4.5.621 0 1.218-.08 1.787-.24m-3.75-3.75c0-2.485 2.085-4.5 4.625-4.5.621 0 1.218.08 1.787.24m-3.75 0c0-2.485 2.085-4.5 4.625-4.5.621 0 1.218.08 1.787.24M9.75 8.25H15m-5.25 0v9m0-9h-1.5m1.5 0v9m-1.5-9H9m-1.5 0H12m-1.5 0v9m0-9H9m1.5 0H12m-1.5 0v9m0-9H9m1.5 0H12" />
            </svg>
        );
    }
    // PYTHON类型 - 使用类似的图标
    if (task.scriptType === "python") {
        return (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75c0 2.485 2.085 4.5 4.625 4.5.621 0 1.218-.08 1.787-.24m-3.75-3.75c0-2.485 2.085-4.5 4.625-4.5.621 0 1.218.08 1.787.24m-3.75 0c0-2.485 2.085-4.5 4.625-4.5.621 0 1.218.08 1.787.24M9.75 8.25H15m-5.25 0v9m0-9h-1.5m1.5 0v9m-1.5-9H9m-1.5 0H12m-1.5 0v9m0-9H9m1.5 0H12m-1.5 0v9m0-9H9m1.5 0H12" />
            </svg>
        );
    }
    // 默认图标（shell或cron）- 终端图标
    return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9H3m16.5 9H3m-1.5 0H3m1.5 0h13.5" />
        </svg>
    );
}

export default function AutomationPage() {
    const { t } = useTranslation();
    const toast = useToast();
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const { tasks, loading, isRefreshing, createTask, updateTask, deleteTask, runTask, fetchLogs, fetchHistory, fetchDiff, refresh } = useAutomation();
    const [isAdding, setIsAdding] = useState(false);
    const [editingTask, setEditingTask] = useState<AutomationTask | null>(null);
    const [viewingLogs, setViewingLogs] = useState<string | null>(null);
    const [logs, setLogs] = useState<ExecutionLog[]>([]);
    const [viewingHistory, setViewingHistory] = useState<string | null>(null);
    const [history, setHistory] = useState<GitCommit[]>([]);
    const [showDiff, setShowDiff] = useState(false);
    const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
    const [diffContent, setDiffContent] = useState<string>('');
    const [sortBy] = useState<'name' | 'lastRun' | 'status'>('name');
    const [sortOrder] = useState<'asc' | 'desc'>('asc');
    const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'disabled'>('all');
    const [vimMode, setVimMode] = useState(false);
    const [deleteConfirmTask, setDeleteConfirmTask] = useState<AutomationTask | null>(null);
    const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
    const editFormRef = useRef<HTMLFormElement>(null);
    const createFormRef = useRef<HTMLFormElement>(null);
    const urlParamProcessed = useRef(false);

    const [newTask, setNewTask] = useState<AutomationTask>({
        name: "",
        triggerType: "cron",
        cronExpression: "0 0 * * *",
        scriptType: "shell",
        scriptContent: "#!/bin/zsh\\n# Your script here\\necho \"MiniDock says hello!\"",
        isEnabled: true
    });

    // 从localStorage加载Vim模式偏好
    useEffect(() => {
        const savedVimMode = localStorage.getItem('minidock_vim_mode');
        if (savedVimMode !== null) {
            setVimMode(savedVimMode === 'true');
        }
    }, []);

    const toggleVimMode = () => {
        const newMode = !vimMode;
        setVimMode(newMode);
        localStorage.setItem('minidock_vim_mode', String(newMode));
    };

    // 获取脚本语言对应的Editor语言类型
    const getEditorLanguage = (scriptType: string): 'shell' | 'python' | 'swift' | 'text' => {
        if (scriptType === 'shell') return 'shell';
        if (scriptType === 'python') return 'python';
        if (scriptType === 'swift') return 'swift';
        return 'text';
    };

    // 格式化脚本内容
    const handleFormat = useCallback(async (scriptContent: string, scriptType: string) => {
        try {
            const language = getEditorLanguage(scriptType) as SupportedLanguage;
            if (language === 'text') {
                toast.error(t.common.format_not_supported);
                return scriptContent;
            }

            const result = await formatCode({
                language,
                content: scriptContent,
            });

            if (result.success && result.formatted) {
                toast.success(t.common.format_success);
                return result.formatted;
            } else {
                toast.error(result.error || t.common.format_failed);
                return scriptContent;
            }
        } catch (error) {
            console.error('Format error:', error);
            toast.error(t.common.format_failed + ': ' + ((error as Error).message || String(error)));
            return scriptContent;
        }
    }, [t, toast]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await createTask(newTask);
            setIsAdding(false);
            setNewTask({
                name: "",
                triggerType: "cron",
                cronExpression: "0 0 * * *",
                scriptType: "shell",
                scriptContent: "#!/bin/zsh\\n# Your script here\\necho \"MiniDock says hello!\"",
                isEnabled: true
            });
        } catch (err) {
            // 错误已在 useAutomation 中处理（显示 alert）
            console.error("Failed to create task:", err);
        }
    };

    const handleEdit = useCallback((task: AutomationTask) => {
        setEditingTask({ ...task });
        setIsAdding(false);
        // 滚动到编辑表单位置
        setTimeout(() => {
            if (editFormRef.current) {
                editFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 100);
    }, []);

    // 处理 URL 参数：自动打开指定任务的编辑状态
    useEffect(() => {
        const taskId = searchParams.get('taskId');
        if (taskId && tasks.length > 0 && !urlParamProcessed.current && !loading) {
            const task = tasks.find(t => t.id === taskId);
            if (task) {
                handleEdit(task);
                urlParamProcessed.current = true;
                // 清除 URL 参数，避免影响后续的视图切换
                const params = new URLSearchParams(searchParams.toString());
                params.delete('taskId');
                router.replace(`${pathname}${params.toString() ? '?' + params.toString() : ''}`);
            }
        }
    }, [searchParams, tasks, loading, router, pathname, handleEdit]);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (editingTask && editingTask.id) {
            await updateTask(editingTask.id, editingTask);
            setEditingTask(null);
        }
    };

    const handleCancelEdit = () => {
        setEditingTask(null);
    };

    const handleViewLogs = async (taskId: string) => {
        setViewingLogs(taskId);
        const data = await fetchLogs(taskId);
        setLogs(data);
    };

    const handleViewHistory = async (taskId: string) => {
        setViewingHistory(taskId);
        setShowDiff(false);
        setSelectedCommit(null);
        try {
            const data = await fetchHistory(taskId);
            setHistory(data);
        } catch (e) {
            console.error("Failed to fetch history:", e);
            setHistory([]);
        }
    };

    // 计算统计数据
    const stats = useMemo(() => {
        const total = tasks.length;
        const active = tasks.filter(t => t.isEnabled).length;
        
        // 找到下一个运行时间
        let nextRun: Date | null = null;
        for (const task of tasks) {
            if (task.isEnabled && task.triggerType === "cron" && task.cronExpression) {
                const taskNextRun = getNextRunTime(task.cronExpression);
                if (taskNextRun && (!nextRun || taskNextRun < nextRun)) {
                    nextRun = taskNextRun;
                }
            }
        }
        
        return { total, active, nextRun };
    }, [tasks]);

    // 过滤和排序任务
    const filteredAndSortedTasks = useMemo(() => {
        let filtered = tasks;
        
        // 过滤
        if (filterStatus === 'active') {
            filtered = tasks.filter(t => t.isEnabled);
        } else if (filterStatus === 'disabled') {
            filtered = tasks.filter(t => !t.isEnabled);
        }
        
        // 排序
        const sorted = [...filtered].sort((a, b) => {
            let comparison = 0;
            
            if (sortBy === 'name') {
                comparison = a.name.localeCompare(b.name);
            } else if (sortBy === 'lastRun') {
                const aTime = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
                const bTime = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
                comparison = aTime - bTime;
            } else if (sortBy === 'status') {
                comparison = (a.isEnabled ? 1 : 0) - (b.isEnabled ? 1 : 0);
            }
            
            return sortOrder === 'asc' ? comparison : -comparison;
        });
        
        return sorted;
    }, [tasks, sortBy, sortOrder, filterStatus]);

    const formatNextRun = (date: Date | null): { time: string; period: string } => {
        if (!date) return { time: '--:--', period: '' };
        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        const parts = timeStr.split(' ');
        return {
            time: parts[0] || '--:--',
            period: parts[1] || ''
        };
    };

    return (
        <PageLayout animate={false}>
            {/* Action Button Section */}
            <div className="sticky top-0 z-10 bg-[#0a0a0c]/80 backdrop-blur-md px-4 sm:px-6 lg:px-10 py-3 flex items-center justify-end">
                <Button
                    onClick={() => setIsAdding(!isAdding)}
                    variant={isAdding ? 'secondary' : 'primary'}
                    className="text-xs sm:text-sm"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="hidden sm:inline">{isAdding ? t.automation.cancel : t.automation.create_task}</span>
                    <span className="sm:hidden">{isAdding ? t.automation.cancel : t.automation.create_task}</span>
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-6 sm:p-8 lg:p-10">
                {/* 概览卡片 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                    {/* TOTAL TASKS 卡片 */}
                    <Card className="p-6 relative">
                        <div className="flex items-start justify-between h-full">
                            <div className="flex flex-col">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">{t.automation.total_tasks}</p>
                                <p className="text-2xl font-bold text-white leading-none">{stats.total}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-blue-800 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                </svg>
                            </div>
                        </div>
                    </Card>
                    
                    {/* ACTIVE 卡片 */}
                    <Card className="p-6 relative">
                        <div className="flex items-start justify-between h-full">
                            <div className="flex flex-col">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">{t.automation.active}</p>
                                <p className="text-2xl font-bold text-green-500 leading-none">{stats.active}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-green-800 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            </div>
                        </div>
                    </Card>
                    
                    {/* NEXT RUN 卡片 */}
                    <Card className="p-6 relative">
                        <div className="flex items-start justify-between h-full">
                            <div className="flex flex-col">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">{t.automation.next_run}</p>
                                <div className="flex items-start gap-1.5">
                                    <p className="text-2xl font-bold text-white leading-none">{formatNextRun(stats.nextRun).time}</p>
                                    {formatNextRun(stats.nextRun).period && (
                                        <span className="text-xs font-normal text-gray-400 leading-none mt-0.5">{formatNextRun(stats.nextRun).period}</span>
                                    )}
                                </div>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-purple-800 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        </div>
                    </Card>
                </div>
                {isAdding && (
                    <section className="mb-12 animate-in fade-in slide-in-from-top-4 duration-500">
                        <form ref={createFormRef} onSubmit={handleCreate} className="bg-white/5 border border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 backdrop-blur-2xl">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">{t.automation.task_name}</label>
                                    <input
                                        required
                                        value={newTask.name}
                                        onChange={e => setNewTask({ ...newTask, name: e.target.value })}
                                        placeholder="e.g. Daily Reboot"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">{t.automation.script_language}</label>
                                    <select
                                        value={newTask.scriptType}
                                        onChange={e => setNewTask({ ...newTask, scriptType: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                                    >
                                        <option value="shell">Shell (zsh)</option>
                                        <option value="python">Python 3</option>
                                        <option value="swift">Swift</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">{t.automation.trigger_type}</label>
                                    <select
                                        value={newTask.triggerType}
                                        onChange={e => setNewTask({ ...newTask, triggerType: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                                    >
                                        <option value="cron">Cron Schedule</option>
                                        <option value="watch">File Watcher</option>
                                        <option value="metric">System Metric</option>
                                        <option value="event">System Event</option>
                                    </select>
                                </div>
                                {newTask.triggerType === "cron" && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">{t.automation.cron_expression}</label>
                                        <input
                                            required
                                            value={newTask.cronExpression}
                                            onChange={e => setNewTask({ ...newTask, cronExpression: e.target.value })}
                                            placeholder="0 0 * * *"
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                                        />
                                    </div>
                                )}
                                {newTask.triggerType === "watch" && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">{t.automation.watch_path}</label>
                                        <input
                                            required
                                            value={newTask.watchPath}
                                            onChange={e => setNewTask({ ...newTask, watchPath: e.target.value })}
                                            placeholder="/Users/name/data"
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2 mb-6">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">{t.automation.script_content}</label>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const formatted = await handleFormat(newTask.scriptContent, newTask.scriptType);
                                                setNewTask({ ...newTask, scriptContent: formatted });
                                            }}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all bg-white/[0.05] hover:bg-white/[0.1] text-gray-400 hover:text-white border border-transparent"
                                        >
                                            {t.common.format}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={toggleVimMode}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${vimMode ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/[0.05] hover:bg-white/[0.1] text-gray-400 border border-transparent'}`}
                                        >
                                            VIM {vimMode ? 'ON' : 'OFF'}
                                        </button>
                                    </div>
                                </div>
                                <div className="h-48 sm:h-64 rounded-2xl overflow-hidden border border-white/10 bg-black/40">
                                    <Editor
                                        value={newTask.scriptContent}
                                        onChange={(value) => setNewTask({ ...newTask, scriptContent: value })}
                                        language={getEditorLanguage(newTask.scriptType)}
                                        vimMode={vimMode}
                                        onToggleVimMode={toggleVimMode}
                                        className="h-full"
                                    />
                                </div>
                            </div>

                            {/* 使用指南 - 放在脚本编辑器下方 */}
                            <AutomationGuide 
                                triggerType={newTask.triggerType as 'cron' | 'watch' | 'metric' | 'event'}
                                scriptType={newTask.scriptType as 'shell' | 'python' | 'swift'}
                                defaultExpanded={false}
                            />

                            <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6">
                                <button type="button" onClick={() => setIsAdding(false)} className="w-full sm:w-auto px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl bg-gray-800/50 text-white font-bold text-xs sm:text-sm tracking-widest uppercase hover:bg-gray-700/50 transition-colors active:scale-95">
                                    {t.automation.cancel}
                                </button>
                                <button type="submit" className="w-full sm:w-auto px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl bg-white text-black font-bold text-xs sm:text-sm tracking-widest uppercase hover:bg-gray-200 transition-colors active:scale-95">
                                    {t.automation.save}
                                </button>
                            </div>
                        </form>
                    </section>
                )}

                {editingTask && (
                    <section className="mb-12 animate-in fade-in slide-in-from-top-4 duration-500">
                        <form ref={editFormRef} onSubmit={handleUpdate} className="bg-white/5 border border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 backdrop-blur-2xl">
                            <div className="flex items-center justify-between mb-4 sm:mb-6">
                                <h2 className="text-base sm:text-lg font-bold text-white">{t.automation.edit_task || "编辑任务"}</h2>
                                <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    className="p-2 rounded-lg hover:bg-white/5 text-gray-400"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">{t.automation.task_name}</label>
                                    <input
                                        required
                                        value={editingTask.name}
                                        onChange={e => setEditingTask({ ...editingTask, name: e.target.value })}
                                        placeholder="e.g. Daily Reboot"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">{t.automation.script_language}</label>
                                    <select
                                        value={editingTask.scriptType}
                                        onChange={e => setEditingTask({ ...editingTask, scriptType: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:border-blue-500/50 transition-colors appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 12 12%22%3E%3Cpath fill=%22%23ffffff%22 d=%22M6 9L1 4h10z%22/%3E%3C/svg%3E')] bg-no-repeat bg-[length:12px_12px] bg-[right_12px_center]"
                                    >
                                        <option value="shell">Shell (zsh)</option>
                                        <option value="python">Python 3</option>
                                        <option value="swift">Swift</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">{t.automation.trigger_type}</label>
                                    <select
                                        value={editingTask.triggerType}
                                        onChange={e => setEditingTask({ ...editingTask, triggerType: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:border-blue-500/50 transition-colors appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 12 12%22%3E%3Cpath fill=%22%23ffffff%22 d=%22M6 9L1 4h10z%22/%3E%3C/svg%3E')] bg-no-repeat bg-[length:12px_12px] bg-[right_12px_center]"
                                    >
                                        <option value="cron">Cron Schedule</option>
                                        <option value="watch">File Watcher</option>
                                        <option value="metric">System Metric</option>
                                        <option value="event">System Event</option>
                                    </select>
                                </div>
                                {editingTask.triggerType === "cron" && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">{t.automation.cron_expression}</label>
                                        <input
                                            required
                                            value={editingTask.cronExpression || ""}
                                            onChange={e => setEditingTask({ ...editingTask, cronExpression: e.target.value })}
                                            placeholder="0 0 * * *"
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                                        />
                                    </div>
                                )}
                                {editingTask.triggerType === "watch" && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">{t.automation.watch_path}</label>
                                        <input
                                            required
                                            value={editingTask.watchPath || ""}
                                            onChange={e => setEditingTask({ ...editingTask, watchPath: e.target.value })}
                                            placeholder="/Users/name/data"
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                                        />
                                    </div>
                                )}
                                {(editingTask.triggerType === "event" || editingTask.triggerType === "metric") && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">{editingTask.triggerType === "event" ? "事件类型" : "指标条件"}</label>
                                        <input
                                            value={editingTask.eventType || ""}
                                            onChange={e => setEditingTask({ ...editingTask, eventType: e.target.value })}
                                            placeholder={editingTask.triggerType === "event" ? "/hooks/deploy" : "cpu > 80"}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2 mb-8">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">{t.automation.script_content}</label>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const formatted = await handleFormat(editingTask.scriptContent, editingTask.scriptType);
                                                setEditingTask({ ...editingTask, scriptContent: formatted });
                                            }}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all bg-white/[0.05] hover:bg-white/[0.1] text-gray-400 hover:text-white border border-transparent"
                                        >
                                            {t.common.format}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={toggleVimMode}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${vimMode ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/[0.05] hover:bg-white/[0.1] text-gray-400 border border-transparent'}`}
                                        >
                                            VIM {vimMode ? 'ON' : 'OFF'}
                                        </button>
                                    </div>
                                </div>
                                <div className="h-48 sm:h-64 rounded-2xl overflow-hidden border border-white/10 bg-black/40">
                                    <Editor
                                        value={editingTask.scriptContent}
                                        onChange={(value) => setEditingTask({ ...editingTask, scriptContent: value })}
                                        language={getEditorLanguage(editingTask.scriptType)}
                                        vimMode={vimMode}
                                        onToggleVimMode={toggleVimMode}
                                        className="h-full"
                                    />
                                </div>
                            </div>

                            {/* 使用指南 - 放在脚本编辑器下方 */}
                            <AutomationGuide 
                                triggerType={editingTask.triggerType as 'cron' | 'watch' | 'metric' | 'event'}
                                scriptType={editingTask.scriptType as 'shell' | 'python' | 'swift'}
                                defaultExpanded={false}
                            />

                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-6">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={editingTask.isEnabled}
                                        onChange={e => setEditingTask({ ...editingTask, isEnabled: e.target.checked })}
                                        className="w-4 h-4 rounded bg-black/40 border border-white/10 text-blue-500 focus:ring-blue-500"
                                    />
                                    <span className="text-xs sm:text-sm text-gray-300">{t.automation.enabled}</span>
                                </label>
                                <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-3">
                                    <button type="button" onClick={handleCancelEdit} className="w-full sm:w-auto px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl bg-gray-800/50 text-white font-bold text-xs sm:text-sm tracking-widest uppercase hover:bg-gray-700/50 transition-colors active:scale-95">
                                        {t.automation.cancel}
                                    </button>
                                    <button type="submit" className="w-full sm:w-auto px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl bg-white text-black font-bold text-xs sm:text-sm tracking-widest uppercase hover:bg-gray-200 transition-colors active:scale-95">
                                        {t.automation.save}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </section>
                )}

                {/* SCHEDULED JOBS 部分 */}
                <div className="mb-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t.automation.scheduled_jobs}</h3>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    const nextFilter = filterStatus === 'all' ? 'active' : filterStatus === 'active' ? 'disabled' : 'all';
                                    setFilterStatus(nextFilter);
                                }}
                                className={`p-1.5 transition-colors relative ${
                                    filterStatus !== 'all' 
                                        ? 'text-white' 
                                        : 'text-gray-400 hover:text-white'
                                }`}
                                title={filterStatus === 'all' ? '显示全部' : filterStatus === 'active' ? '仅显示活跃' : '仅显示已禁用'}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h12M4 14h8M4 18h4" />
                                </svg>
                                {filterStatus !== 'all' && (
                                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />
                                )}
                            </button>
                            <button
                                onClick={() => refresh()}
                                className="p-1.5 text-gray-400 hover:text-white transition-colors"
                                title="刷新"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                {loading && !isRefreshing && tasks.length === 0 ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredAndSortedTasks.map((task) => {
                            const scriptTypeUpper = task.scriptType.toUpperCase();
                            const badgeColors: Record<string, string> = {
                                'SHELL': 'bg-gray-500/20 text-gray-400',
                                'PYTHON': 'bg-blue-500/20 text-blue-400',
                                'SWIFT': 'bg-amber-500/20 text-amber-400'
                            };
                            
                            let triggerDisplay = '';
                            let triggerIcon = null;
                            if (task.triggerType === 'cron' && task.cronExpression) {
                                triggerIcon = (
                                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                );
                                triggerDisplay = `CRON ${task.cronExpression}`;
                            } else if (task.triggerType === 'watch' && task.watchPath) {
                                triggerIcon = (
                                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                );
                                triggerDisplay = `WATCH ${task.watchPath}`;
                            } else if (task.triggerType === 'event' || task.eventType) {
                                triggerIcon = (
                                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                    </svg>
                                );
                                triggerDisplay = `WEBHOOK: ${task.eventType || '/hooks/deploy'}`;
                            }
                            
                            return (
                                <Card key={task.id} className={`p-4 sm:p-5 relative group overflow-hidden ${task.isEnabled ? 'border-l-2 border-l-green-500' : 'border-l-2 border-l-transparent'}`} hoverable>
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between relative z-10 gap-4">
                                        <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 w-full sm:w-auto">
                                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gray-800/50 flex items-center justify-center flex-shrink-0">
                                                <div className="text-white">
                                                    {getTaskIcon(task)}
                                                </div>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                                                    <button
                                                        onClick={() => handleEdit(task)}
                                                        className="text-sm sm:text-base font-semibold text-blue-400 hover:text-blue-300 leading-tight transition-colors flex items-center gap-1.5 group/name hover:underline cursor-pointer"
                                                        title={t.automation.click_to_edit}
                                                    >
                                                        <span>{task.name}</span>
                                                        <Edit size={12} className="opacity-0 group-hover/name:opacity-100 transition-opacity flex-shrink-0" />
                                                    </button>
                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${badgeColors[scriptTypeUpper] || badgeColors['SHELL']}`}>
                                                        {scriptTypeUpper}
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-1.5 text-gray-400 text-xs">
                                                    {triggerIcon && <span className="flex-shrink-0">{triggerIcon}</span>}
                                                    <span className="font-mono break-all">{triggerDisplay}</span>
                                                    {task.lastRunAt && (
                                                        <>
                                                            <span className="w-1 h-1 rounded-full bg-gray-500 flex-shrink-0" />
                                                            <span className="text-gray-500">
                                                                Last run: {formatTimeAgo(task.lastRunAt)}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-shrink-0 w-full sm:w-auto">
                                            <div className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 border ${
                                                task.isEnabled 
                                                    ? 'bg-green-900/50 border-green-500/30' 
                                                    : 'bg-gray-500 border-gray-400/30'
                                            }`}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${
                                                    task.isEnabled ? 'bg-green-400' : 'bg-gray-300'
                                                }`} />
                                                <span className={`text-xs font-medium ${
                                                    task.isEnabled ? 'text-green-400' : 'text-gray-300'
                                                }`}>
                                                    {task.isEnabled ? 'Active' : 'Disabled'}
                                                </span>
                                            </div>
                                            <div className="hidden sm:block w-px h-6 bg-gray-500/50" />
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={async () => {
                                                        if (task.id) {
                                                            setRunningTaskId(task.id);
                                                            try {
                                                                await runTask(task.id);
                                                                toast.success(t.automation.task_executed_success || "任务执行已启动", t.automation.task_executed || "任务执行");
                                                                
                                                                // 如果日志面板已打开，自动刷新日志
                                                                if (viewingLogs === task.id) {
                                                                    // 等待一小段时间让后端完成执行和日志保存
                                                                    setTimeout(async () => {
                                                                        const updatedLogs = await fetchLogs(task.id ?? '');
                                                                        setLogs(updatedLogs);
                                                                    }, 500);
                                                                }
                                                            } catch (error) {
                                                                toast.error((error instanceof Error ? error.message : t.automation.task_execute_failed) || "任务执行失败", t.automation.task_execute_error || "执行错误");
                                                            } finally {
                                                                setRunningTaskId(null);
                                                            }
                                                        }
                                                    }}
                                                    disabled={runningTaskId === task.id}
                                                    className="w-8 h-8 sm:w-8 sm:h-8 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 text-white transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="立即运行"
                                                >
                                                    {runningTaskId === task.id ? (
                                                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    ) : (
                                                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                                            <path d="M8 5v14l11-7z" />
                                                        </svg>
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => task.id && handleViewLogs(task.id)}
                                                    className="w-8 h-8 sm:w-8 sm:h-8 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 text-white transition-all flex items-center justify-center"
                                                    title="查看日志"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={() => task.id && handleViewHistory(task.id)}
                                                    className="w-8 h-8 sm:w-8 sm:h-8 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 text-white transition-all flex items-center justify-center"
                                                    title="Git 历史"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={() => setDeleteConfirmTask(task)}
                                                    className="w-8 h-8 sm:w-8 sm:h-8 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 text-white transition-all flex items-center justify-center"
                                                    title="删除"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            );
                        })}

                        {tasks.length === 0 && !isAdding && (
                            <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-3xl text-gray-600 bg-white/[0.01] animate-in fade-in zoom-in-95 duration-500">
                                <div className="w-16 h-16 rounded-3xl bg-white/[0.02] border border-white/5 flex items-center justify-center mb-6 text-gray-700 shadow-inner">
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                    </svg>
                                </div>
                                <p className="font-bold uppercase tracking-[0.2em] text-xs mb-2 text-gray-400/80">{t.automation.no_tasks}</p>
                                <p className="text-sm text-gray-600 font-medium">{t.automation.no_tasks_desc}</p>
                            </div>
                        )}
                        
                        {/* 底部添加任务按钮 */}
                        {tasks.length > 0 && !isAdding && (
                            <button
                                onClick={() => setIsAdding(true)}
                                className="w-full mt-4 p-6 border-2 border-dashed border-white/10 rounded-2xl bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/20 transition-all flex flex-col items-center justify-center gap-3 group"
                            >
                                <div className="w-12 h-12 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center group-hover:bg-white/[0.05] transition-colors">
                                    <svg className="w-6 h-6 text-gray-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                </div>
                                <span className="text-sm font-medium text-gray-400 group-hover:text-white transition-colors">
                                    {t.automation.add_another_task}
                                </span>
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Logs Modal */}
            {viewingLogs && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-[#0f0f11] border border-white/10 rounded-3xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
                        <div className="p-6 border-b border-white/10 flex items-center justify-between">
                            <h2 className="text-xl font-bold tracking-tight">{t.automation.logs_title}</h2>
                            <button onClick={() => setViewingLogs(null)} className="p-2 rounded-lg hover:bg-white/5 text-gray-400">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {logs.length === 0 ? (
                                <p className="text-center py-12 text-gray-500 text-sm font-medium italic">{t.automation.no_logs}</p>
                            ) : (
                                logs.map(log => (
                                    <div key={log.id} className="bg-black/40 border border-white/5 rounded-2xl p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-widest ${log.status === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                                {log.status} (Code {log.exitCode})
                                            </span>
                                            <span className="text-xs font-medium text-gray-600">
                                                {new Date(log.executedAt).toLocaleString()}
                                            </span>
                                        </div>
                                        <pre className="text-xs font-mono leading-relaxed text-gray-300 bg-black/20 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
                                            {log.output || "No output captured."}
                                        </pre>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Git History Panel */}
            {viewingHistory && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-[#0f0f11] border border-white/10 rounded-3xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
                        <div className="p-6 border-b border-white/10 flex items-center justify-between">
                            <h2 className="text-xl font-bold tracking-tight">Git 历史日志</h2>
                            <button onClick={() => {
                                setViewingHistory(null);
                                setShowDiff(false);
                                setSelectedCommit(null);
                            }} className="p-2 rounded-lg hover:bg-white/5 text-gray-400">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        {!showDiff ? (
                            <div className="flex-1 overflow-y-auto p-6">
                                {history.length > 0 ? (
                                    <div className="divide-y divide-white/5">
                                        {history.map((commit, idx) => (
                                            <button
                                                key={idx}
                                                onClick={async () => {
                                                    if (!viewingHistory) return;
                                                    try {
                                                        setSelectedCommit(commit.hash);
                                                        const diff = await fetchDiff(viewingHistory, commit.hash);
                                                        setDiffContent(diff);
                                                        setShowDiff(true);
                                                    } catch (e) {
                                                        console.error("Failed to fetch diff:", e);
                                                    }
                                                }}
                                                className="w-full px-4 py-3 text-left hover:bg-white/[0.03] transition-colors group"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="font-mono text-xs text-orange-400/80">{commit.hash}</span>
                                                            <span className="text-xs text-gray-500">{new Date(commit.date).toLocaleString('zh-CN')}</span>
                                                        </div>
                                                        <div className="text-sm text-gray-300 group-hover:text-white transition-colors line-clamp-2">
                                                            {commit.message}
                                                        </div>
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            {commit.author}
                                                        </div>
                                                    </div>
                                                    <svg className="w-4 h-4 text-gray-500 group-hover:text-gray-300 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-4 text-center text-gray-500 text-sm">未找到历史记录。</div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col h-full">
                                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                                    <button
                                        onClick={() => {
                                            setShowDiff(false);
                                            setSelectedCommit(null);
                                        }}
                                        className="text-xs text-gray-500 hover:text-white flex items-center gap-1"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                        </svg>
                                        返回
                                    </button>
                                    <span className="text-xs font-mono text-gray-500">差异: {selectedCommit}</span>
                                </div>
                                <div className="flex-1 overflow-hidden p-6">
                                    <div className="overflow-hidden max-h-full rounded-lg border border-white/5 bg-black/30 backdrop-blur-sm">
                                        <DiffViewer content={diffContent || ''} className="max-h-full" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            <ConfirmDialog
                isOpen={deleteConfirmTask !== null}
                onClose={() => setDeleteConfirmTask(null)}
                onConfirm={async () => {
                    if (deleteConfirmTask?.id) {
                        try {
                            await deleteTask(deleteConfirmTask.id);
                            setDeleteConfirmTask(null);
                        } catch (err) {
                            // 错误已在 useAutomation 中处理（显示 alert）
                            console.error("Failed to delete task:", err);
                        }
                    }
                }}
                title="删除自动化任务"
                message={deleteConfirmTask ? `确定要删除任务 "${deleteConfirmTask.name}" 吗？\n\n此操作将：\n• 删除任务配置和脚本文件\n• 删除所有执行日志\n• 提交删除操作到 Git（如果已配置同步）\n\n此操作不可撤销。` : ''}
                confirmText="删除"
                cancelText="取消"
                variant="danger"
            />
        </PageLayout>
    );
}
