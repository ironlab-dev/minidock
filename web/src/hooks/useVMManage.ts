import { useEffect } from 'react';
import { client } from '@/api/client';
import { useCachedData } from '@/hooks/useCachedData';
import { DEMO_MODE } from '@/demo/demoConfig';

export interface VMServiceItem {
    name: string;  // 显示名称
    directoryName: string;  // 目录名（用于 API 调用）
    uuid: string;
    architecture: string;
    isRunning: boolean;
    path: string;
    vncPort?: number;
    ipAddress?: string;
    macAddress?: string;
    cpuUsage?: string;
    memoryUsage?: string;
    qgaVerified?: boolean;
    configChanged?: boolean;
    configDifferences?: string[];
    vncBindAddress?: string;
    isManaged?: boolean;  // 是否在 MiniDock 配置目录中管理
}

export interface GitCommit {
    hash: string;
    date: string;
    message: string;
    author: string;
}

export function useVMManage() {
    const cacheKey = 'vmServices';
    
    const {
        data: vms,
        loading,
        isRefreshing,
        refresh: fetchVMs,
    } = useCachedData<VMServiceItem[]>({
        cacheKey,
        fetchFn: async () => {
            return await client.get<VMServiceItem[]>('/vms/services');
        },
        initialValue: [],
    });

    // DEMO_INTEGRATION: skip VM polling in demo mode
    useEffect(() => {
        if (DEMO_MODE) return;

        // useCachedData 会自动进行初始获取，这里不需要手动调用
        // 定时轮询使用静默模式，避免触发顶部进度条
        const interval = setInterval(() => fetchVMs(true), 5000);

        // WebSocket 更新也使用静默模式
        const handleUpdate = (event: Event) => {
            try {
                const data = JSON.parse((event as CustomEvent).detail);
                if (data.serviceId === 'native-vm') {
                    fetchVMs(true); // 静默刷新，不显示加载指示
                }
            } catch (error) {
                console.error('[useVMManage] Failed to parse WebSocket event:', error);
            }
        };

        window.addEventListener('minidock:items_update', handleUpdate);
        return () => {
            clearInterval(interval);
            window.removeEventListener('minidock:items_update', handleUpdate);
        };
    }, [fetchVMs]);

    const performAction = async (name: string, action: 'start' | 'stop') => {
        return await client.post(`/vms/services/${name}/action`, { action });
    };

    const importVM = async (sourcePath: string) => {
        return await client.post('/vms/services/import', { sourcePath });
    };

    const createVM = async (name: string, arch: string, ram: number, cpuCount: number, diskSize: number, preset?: string, uefi?: boolean, networkMode?: string, bridgeInterface?: string, isoPath?: string) => {
        return await client.post('/vms/services', { name, arch, ram, cpuCount, diskSize, preset, uefi, networkMode, bridgeInterface, isoPath });
    };

    const getConfig = async (name: string) => {
        const data = await client.get<{ content: string }>(`/vms/services/${name}/config`);
        return data.content;
    };

    const saveConfig = async (name: string, content: string) => {
        return await client.put(`/vms/services/${name}/config`, { content });
    };

    const fetchHistory = async (name: string) => {
        return await client.get<GitCommit[]>(`/vms/services/${name}/history`);
    };

    const fetchDiff = async (name: string, hash: string) => {
        const data = await client.get<{ content: string }>(`/vms/services/${name}/diff/${hash}`);
        return data.content;
    };

    const deleteVM = async (name: string) => {
        await client.delete(`/vms/services/${name}`);
    };

    return {
        vms,
        loading,
        isRefreshing,
        fetchVMs,
        performAction,
        importVM,
        createVM,
        getConfig,
        saveConfig,
        fetchHistory,
        fetchDiff,
        deleteVM
    };
}
