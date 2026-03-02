"use client";

import { useCachedData } from "./useCachedData";
import { client } from "@/api/client";

export interface LocalIPInfo {
    name: string;
    address: string;
    device: string;
}

export interface IPInfo {
    localIP: string | null;
    publicIP: string | null;
    publicIPDomestic: string | null;
    publicIPOverseas: string | null;
    localIPs: LocalIPInfo[];
}

export function useIPInfo() {
    const { data, loading, isRefreshing, error, lastRefreshTime, refresh } = useCachedData<IPInfo>({
        cacheKey: "ip-info",
        fetchFn: async () => {
            return await client.get<IPInfo>("/system/ip-info");
        },
        initialValue: { localIP: null, publicIP: null, publicIPDomestic: null, publicIPOverseas: null, localIPs: [] },
        ttl: 300000, // 5 minutes
        autoFetch: true,
    });

    return {
        ipInfo: data,
        loading,
        isRefreshing,
        error,
        lastRefreshTime,
        refresh,
    };
}
