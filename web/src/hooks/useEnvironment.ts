import { useState, useEffect, useCallback } from 'react';
import { client } from '@/api/client';
import { useWebSocket } from './useWebSocket';

export interface ComponentStatus {
    name: string;
    isInstalled: boolean;
    version?: string;
    path?: string;
}

export function useEnvironment() {
    const [statuses, setStatuses] = useState<ComponentStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [installing, setInstalling] = useState<Record<string, boolean>>({});
    const [logs, setLogs] = useState<Record<string, string>>({}); // component -> logs

    const { lastMessage } = useWebSocket();

    const fetchStatus = useCallback(async () => {
        try {
            const data = await client.get<ComponentStatus[]>('/system/environment');
            setStatuses(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    // Handle WebSocket messages
    useEffect(() => {
        if (!lastMessage) return;
        const { event, data } = lastMessage;

        if (event === 'env_install_progress') {
            try {
                const payload = JSON.parse(data);
                // payload: { component: string, log: string }
                setLogs(prev => ({
                    ...prev,
                    [payload.component]: (prev[payload.component] || '') + payload.log
                }));
            } catch (e) {
                console.error("Failed to parse env_install_progress", e);
            }
        }
        else if (event === 'env_install_complete') {
            try {
                const payload = JSON.parse(data);
                // payload: { component: string, success: boolean }
                setInstalling(prev => ({ ...prev, [payload.component]: false }));
                fetchStatus();
            } catch (e) {
                console.error("Failed to parse env_install_complete", e);
            }
        }
    }, [lastMessage]);

    const install = async (component: string) => {
        setInstalling(prev => ({ ...prev, [component]: true }));
        setLogs(prev => ({ ...prev, [component]: '' }));
        try {
            await client.post(`/system/environment/${component}/install`, {});
        } catch (e) {
            console.error("Failed to trigger install", e);
            setInstalling(prev => ({ ...prev, [component]: false }));
            setLogs(prev => ({ ...prev, [component]: (prev[component] || '') + '\nFailed to start installation.' }));
        }
    };

    return { statuses, loading, installing, logs, install, refresh: fetchStatus };
}
