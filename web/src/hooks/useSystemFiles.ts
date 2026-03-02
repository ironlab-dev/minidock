import { useCallback } from 'react';
import { client } from '@/api/client';

export interface FileItem {
    name: string;
    type: 'file' | 'directory';
    path: string;
    size?: number;
}

export interface FileInfo {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
    created?: string;
    modified?: string;
    permissions?: string;
    owner?: string;
    extension?: string;
    mimeType?: string;
}

export function useSystemFiles() {
    const listDirectory = useCallback(async (path: string = '') => {
        const queryParam = path ? `?path=${encodeURIComponent(path)}` : '';
        const url = `/files${queryParam}`;
        const result = await client.get<FileItem[]>(url);
        // 确保返回的是数组
        if (Array.isArray(result)) {
            return result;
        }
        // 如果返回的不是数组，尝试从对象中提取数据
        if (result && typeof result === 'object' && 'data' in result) {
            const data = (result as { data: unknown }).data;
            if (Array.isArray(data)) {
                return data;
            }
        }
        console.error('[useSystemFiles] Unexpected response format from /files API:', { path, result, resultType: typeof result });
        return [];
    }, []);

    const readFileByPath = useCallback(async (filePath: string) => {
        const encodedFile = encodeURIComponent(filePath);
        return await client.get<{ content: string }>(`/files?file=${encodedFile}`);
    }, []);

    const saveFileByPath = useCallback(async (filePath: string, content: string) => {
        const encodedFile = encodeURIComponent(filePath);
        await client.put(`/files?file=${encodedFile}`, { content });
    }, []);

    const deleteFile = useCallback(async (filePath: string) => {
        const encodedFile = encodeURIComponent(filePath);
        await client.delete(`/files?file=${encodedFile}`);
    }, []);

    const renameFile = useCallback(async (oldPath: string, newName: string) => {
        await client.post(`/files/rename`, { oldPath, newName });
    }, []);

    const createDirectory = useCallback(async (path: string) => {
        await client.post(`/files/directories`, { path });
    }, []);

    const getFileInfo = useCallback(async (filePath: string) => {
        const encodedFile = encodeURIComponent(filePath);
        return await client.get<FileInfo>(`/files/info?file=${encodedFile}`);
    }, []);

    return {
        listDirectory,
        readFileByPath,
        saveFileByPath,
        deleteFile,
        renameFile,
        createDirectory,
        getFileInfo
    };
}
