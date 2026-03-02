"use client";

import { client } from "@/api/client";
import { useCachedData } from "@/hooks/useCachedData";

export interface AutomationTask {
    id?: string;
    name: string;
    triggerType: string; // "cron", "watch", "event", "metric"
    cronExpression?: string;
    watchPath?: string;
    eventType?: string;
    scriptType: string; // "shell", "python", "swift"
    scriptContent: string;
    isEnabled: boolean;
    lastRunAt?: string;
}

export interface ExecutionLog {
    id: string;
    executedAt: string;
    output: string;
    exitCode: number;
    status: string;
}

export interface GitCommit {
    hash: string;
    date: string;
    message: string;
    author: string;
}

export function useAutomation() {
    const cacheKey = 'automationTasks';
    
    const {
        data: tasks,
        loading,
        isRefreshing,
        error,
        refresh: fetchTasks,
    } = useCachedData<AutomationTask[]>({
        cacheKey,
        fetchFn: async () => {
            return await client.get<AutomationTask[]>('/automation/tasks');
        },
        initialValue: [],
    });

    const createTask = async (task: AutomationTask): Promise<AutomationTask> => {
        try {
            const response = await client.post<AutomationTask>('/automation/tasks', task);
            await fetchTasks();
            return response;
        } catch (err) {
            console.error(err instanceof Error ? err.message : err);
            throw err;
        }
    };

    const updateTask = async (id: string, task: AutomationTask) => {
        try {
            await client.put(`/automation/tasks/${id}`, task);
            await fetchTasks();
        } catch (err) {
            console.error(err instanceof Error ? err.message : err);
        }
    };

    const deleteTask = async (id: string) => {
        try {
            await client.delete(`/automation/tasks/${id}`);
            await fetchTasks();
        } catch (err) {
            console.error(err instanceof Error ? err.message : err);
        }
    };

    const runTask = async (id: string) => {
        try {
            await client.post(`/automation/tasks/${id}/run`, {});
            await fetchTasks();
        } catch (err) {
            console.error(err instanceof Error ? err.message : err);
            throw err;
        }
    };

    const fetchLogs = async (id: string): Promise<ExecutionLog[]> => {
        try {
            return await client.get<ExecutionLog[]>(`/automation/tasks/${id}/logs`);
        } catch (err) {
            console.error(err);
            return [];
        }
    };

    const fetchHistory = async (id: string): Promise<GitCommit[]> => {
        try {
            return await client.get<GitCommit[]>(`/automation/tasks/${id}/history`);
        } catch (err) {
            console.error(err);
            return [];
        }
    };

    const fetchDiff = async (id: string, hash: string): Promise<string> => {
        try {
            const response = await client.get<{ content: string }>(`/automation/tasks/${id}/diff/${hash}`);
            return response.content;
        } catch (err) {
            console.error(err);
            return '';
        }
    };

    const toggleTask = async (task: AutomationTask) => {
        if (!task.id) return;
        await updateTask(task.id, { ...task, isEnabled: !task.isEnabled });
    };

    return { tasks, loading, isRefreshing, error, createTask, updateTask, deleteTask, runTask, toggleTask, fetchLogs, fetchHistory, fetchDiff, refresh: fetchTasks };
}
