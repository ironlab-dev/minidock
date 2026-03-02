import { useState, useEffect } from 'react';
import { client } from '../api/client';
import type { DirectoryPreview } from '../types/settings';

export interface SystemSetting {
    id?: string;
    key: string;
    value: string;
    category: 'automation' | 'notification' | 'system' | 'docker' | 'vm' | 'custom';
    isSecret: boolean;
}

export function useSettings() {
    const [settings, setSettings] = useState<SystemSetting[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSettings = async () => {
        try {
            const data = await client.get<SystemSetting[]>('/settings');
            setSettings(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    const saveSetting = async (setting: SystemSetting) => {
        try {
            await client.post('/settings', setting);
            await fetchSettings();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            throw err;
        }
    };

    const deleteSetting = async (key: string) => {
        try {
            await client.delete(`/settings/${key}`);
            await fetchSettings();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            throw err;
        }
    };

    const testNotification = async (title: string, message: string) => {
        try {
            await client.post(`/settings/test-notification`, { title, message });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            throw err;
        }
    }

    const previewDirectory = async (path: string, type: 'docker' | 'vm') => {
        try {
            return await client.post<DirectoryPreview>('/settings/preview-directory', { path, type });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            throw err;
        }
    }

    useEffect(() => {
        fetchSettings();
    }, []);

    return { settings, loading, error, saveSetting, deleteSetting, testNotification, previewDirectory, refresh: fetchSettings };
}
