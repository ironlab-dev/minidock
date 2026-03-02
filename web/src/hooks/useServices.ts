"use client";

import { useEffect } from "react";
import { ServiceInfo } from "@/types/service";
import { client } from "@/api/client";
import { useCachedData } from "@/hooks/useCachedData";
import { cacheManager } from "@/lib/cacheManager";

export function useServices() {
    const {
        data: services,
        loading,
        isRefreshing,
        error,
        lastRefreshTime,
        refresh: fetchServices,
    } = useCachedData<ServiceInfo[]>({
        cacheKey: 'services',
        fetchFn: async () => {
            try {
                return await client.get<ServiceInfo[]>('/services');
            } catch (err) {
                console.error(err);
                // Fallback to mock data for development if backend is not yet ready
                const fallbackData: ServiceInfo[] = [
                    { id: "system-core", name: "macOS System", type: "system", status: "running", description: "Native macOS system orchestration and monitoring.", stats: { uptime: "N/A" } },
                    { id: "docker-engine", name: "Docker Engine", type: "docker", status: "stopped", description: "Manage and monitor Docker containers and health.", stats: { containers: "0" } },
                    { id: "utm-vms", name: "UTM Virtual Machines", type: "vm", status: "stopped", description: "Manage and monitor UTM Virtual Machines instances and health.", stats: { vms: "0" } },
                ];
                // 将 fallback 数据也存入缓存
                cacheManager.set('services', fallbackData);
                return fallbackData;
            }
        },
        initialValue: [],
    });

    const performAction = async (id: string, action: "start" | "stop" | "restart") => {
        try {
            await client.post(`/services/${id}/${action}`, {});
            await fetchServices(); // Refresh list
        } catch (err) {
            console.error(err instanceof Error ? err.message : err);
        }
    };

    // WebSocket 事件监听
    useEffect(() => {
        const handleUpdate = (event: Event) => {
            try {
                const newServices = JSON.parse((event as CustomEvent).detail);
                // 更新缓存和状态，使用静默模式避免触发顶部进度条
                cacheManager.set('services', newServices);
                fetchServices(true); // 静默刷新，不显示加载指示
            } catch (e) {
                console.error("Failed to parse services update", e);
            }
        };

        window.addEventListener('minidock:services_update', handleUpdate);
        return () => window.removeEventListener('minidock:services_update', handleUpdate);
    }, [fetchServices]);

    return { services, loading, isRefreshing, error, lastRefreshTime, refresh: fetchServices, performAction };
}
