"use client";

import { useEffect, useCallback } from "react";
import { client } from "@/api/client";
import { useCachedData } from "@/hooks/useCachedData";
import { cacheManager } from "@/lib/cacheManager";

export interface ServiceItem {
    id: string;
    name: string;
    status: string;
    metadata?: Record<string, string>;
}

export function useServiceItems(serviceId: string) {
    const cacheKey = `serviceItems:${serviceId}`;
    
    const {
        data: items,
        loading,
        isRefreshing,
        error,
        refresh: fetchItems,
    } = useCachedData<ServiceItem[]>({
        cacheKey,
        fetchFn: async () => {
            return await client.get<ServiceItem[]>(`/services/${serviceId}/items`);
        },
        initialValue: [],
        onError: (err: unknown) => {
            // 错误时不立即清空 items，避免闪烁
            // useCachedData 会保留旧数据
            console.error(`Failed to fetch items for ${serviceId}:`, err);
        },
    });

    const performItemAction = async (itemId: string, action: string) => {
        try {
            await client.post(`/services/${serviceId}/items/${itemId}/${action}`, {});
            await fetchItems();
            return { success: true };
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : '操作失败';
            return { success: false, error: errorMessage };
        }
    };

    const getItemDetails = useCallback(async (itemId: string) => {
        try {
            return await client.get<Record<string, string>>(`/services/${serviceId}/items/${itemId}`);
        } catch (err) {
            console.error(err);
            return null;
        }
    }, [serviceId]);

    // serviceId 变化时重新获取数据
    useEffect(() => {
        fetchItems();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serviceId]); // 移除 fetchItems 依赖，避免无限循环

    // WebSocket 事件监听
    useEffect(() => {
        const handleUpdate = (event: Event) => {
            try {
                const data = JSON.parse((event as CustomEvent).detail);
                if (data.serviceId === serviceId) {
                    // 更新缓存和状态，使用静默模式避免触发顶部进度条
                    cacheManager.set(cacheKey, data.items);
                    fetchItems(true); // 静默刷新，不显示加载指示
                }
            } catch (e) {
                console.error("Failed to parse items update", e);
            }
        };

        window.addEventListener('minidock:items_update', handleUpdate);
        return () => window.removeEventListener('minidock:items_update', handleUpdate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serviceId, cacheKey]); // 移除 fetchItems 依赖，避免无限循环

    return { items, loading, isRefreshing, error, refresh: fetchItems, performItemAction, getItemDetails };
}
