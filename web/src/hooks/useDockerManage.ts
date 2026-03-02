import { useCallback } from 'react';
import { client } from '@/api/client';
import { useCachedData } from '@/hooks/useCachedData';

export interface DockerServiceItem {
    name: string;
    isManaged: boolean;
    isRunning: boolean;
    expectedImage?: string;
    actualImage?: string;
    isImageMismatch?: boolean;
    expectedPorts?: string;
    actualPorts?: string;
    isPortMismatch?: boolean;
    configChanged?: boolean;
    configDifferences?: string;
}

export interface GitCommit {
    hash: string;
    date: string;
    message: string;
    author: string;
}

export interface FileItem {
    name: string;
    type: 'file' | 'directory';
    path: string;
    size?: number;
}

export function useDockerManage() {
    const cacheKey = 'dockerServices';

    const {
        data: services,
        loading,
        isRefreshing,
        refresh: refreshServices,
    } = useCachedData<DockerServiceItem[]>({
        cacheKey,
        fetchFn: async () => {
            return await client.get<DockerServiceItem[]>('/docker/services');
        },
        initialValue: [],
    });

    // 保持 fetchServices API 兼容性，支持 isInitialLoad 参数（已废弃，保留以兼容）
    // 现在支持 silent 参数用于静默刷新
    const fetchServices = useCallback(async (isInitialLoadOrSilent: boolean = false) => {
        // 如果传入 true，使用静默模式（不显示加载指示）
        await refreshServices(isInitialLoadOrSilent);
        // 返回最新的 services 数据（从 useCachedData 的 data 状态获取）
        // 注意：这里不能直接返回 services，因为它是闭包中的旧值
        // 需要通过回调或者等待状态更新来获取最新值
        // 由于 refresh 是异步的，我们需要等待状态更新
        // 这里返回 services 虽然可能是旧值，但调用方应该从 hook 返回的 services 中获取最新值
        return services;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshServices]); // 移除 services 依赖，避免无限循环

    const getFile = useCallback(async (name: string, file: string) => {
        const encodedFile = encodeURIComponent(file);
        return await client.get<{ content: string }>(`/docker/services/${name}/files?file=${encodedFile}`);
    }, []);

    const validateFile = useCallback(async (name: string, file: string, content: string) => {
        return await client.post<{ valid: boolean; errors?: string[] }>(`/docker/services/${name}/validate/file`, { file, content });
    }, []);

    const saveFile = useCallback(async (name: string, file: string, content: string) => {
        const encodedFile = encodeURIComponent(file);
        await client.post(`/docker/services/${name}/files?file=${encodedFile}`, { content });
    }, []);

    const performAction = useCallback(async (name: string, action: 'start' | 'stop' | 'restart' | 'down') => {
        return await client.post<{ content: string }>(`/docker/services/${name}/action`, { action });
    }, []);

    const fetchLogs = useCallback(async (name: string, tail: number = 100) => {
        return await client.get<{ content: string }>(`/docker/services/${name}/logs?tail=${tail}`);
    }, []);

    const fetchContainerLogs = useCallback(async (id: string, tail: number = 100) => {
        return await client.get<{ content: string }>(`/services/docker-engine/items/${id}/logs?tail=${tail}`);
    }, []);

    const fetchHistory = useCallback(async (name: string) => {
        return await client.get<GitCommit[]>(`/docker/services/${name}/history`);
    }, []);

    const fetchDiff = useCallback(async (name: string, hash: string) => {
        return await client.get<{ content: string }>(`/docker/services/${name}/diff/${hash}`);
    }, []);

    const deleteService = useCallback(async (name: string) => {
        await client.delete(`/docker/services/${name}`);
    }, []);

    const listDirectory = useCallback(async (name: string, path: string = '') => {
        const queryParam = path ? `?path=${encodeURIComponent(path)}` : '';
        return await client.get<FileItem[]>(`/docker/services/${name}/files${queryParam}`);
    }, []);

    const readFileByPath = useCallback(async (name: string, filePath: string) => {
        const encodedFile = encodeURIComponent(filePath);
        return await client.get<{ content: string }>(`/docker/services/${name}/files?file=${encodedFile}`);
    }, []);

    const saveFileByPath = useCallback(async (name: string, filePath: string, content: string) => {
        const encodedFile = encodeURIComponent(filePath);
        await client.post(`/docker/services/${name}/files?file=${encodedFile}`, { content });
    }, []);

    const deleteFile = useCallback(async (name: string, filePath: string) => {
        const encodedFile = encodeURIComponent(filePath);
        await client.delete(`/docker/services/${name}/files?file=${encodedFile}`);
    }, []);

    const renameFile = useCallback(async (name: string, oldName: string, newName: string) => {
        await client.post(`/docker/services/${name}/files/rename`, { oldName, newName });
    }, []);

    const createDirectory = useCallback(async (name: string, path: string) => {
        await client.post(`/docker/services/${name}/directories`, { path });
    }, []);

    return {
        services,
        loading,
        isRefreshing,
        fetchServices,
        getFile,
        saveFile,
        validateFile,
        performAction,
        fetchLogs,
        fetchContainerLogs,
        fetchHistory,
        fetchDiff,
        deleteService,
        listDirectory,
        readFileByPath,
        saveFileByPath,
        deleteFile,
        renameFile,
        createDirectory
    };
}
