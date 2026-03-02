"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cacheManager } from "@/lib/cacheManager";
import { useLoadingContext } from "@/contexts/LoadingContext";

interface UseCachedDataOptions<T> {
    cacheKey: string;
    fetchFn: () => Promise<T>;
    initialValue?: T;
    ttl?: number;
    autoFetch?: boolean;
    onSuccess?: (data: T) => void;
    onError?: (error: unknown) => void;
}

interface UseCachedDataReturn<T> {
    data: T;
    loading: boolean;
    isRefreshing: boolean;
    error: string | null;
    lastRefreshTime: Date | null;
    refresh: (silent?: boolean) => Promise<void>;
    invalidate: () => void;
}

/**
 * 通用的缓存数据 Hook
 * 封装数据获取、缓存管理和加载状态
 */
export function useCachedData<T>(
    options: UseCachedDataOptions<T>
): UseCachedDataReturn<T> {
    const {
        cacheKey,
        fetchFn,
        initialValue,
        ttl,
        autoFetch = true,
        onSuccess,
        onError,
    } = options;

    const { registerLoading, unregisterLoading } = useLoadingContext();
    
    // 从缓存读取初始值
    const cachedData = cacheManager.get<T>(cacheKey);
    const initialData = cachedData ?? initialValue ?? ([] as unknown as T);
    
    const [data, setData] = useState<T>(initialData);
    const [loading, setLoading] = useState(() => !cachedData);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSilentMode, setIsSilentMode] = useState(false);
    const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(() => {
        // 如果有缓存数据，从缓存管理器获取时间戳
        const timestamp = cacheManager.getTimestamp(cacheKey);
        return timestamp ? new Date(timestamp) : null;
    });
    
    const hasLoadedRef = useRef(!!cachedData);
    const fetchingRef = useRef(false);
    const prevCacheKeyRef = useRef(cacheKey);
    const autoFetchedRef = useRef(false);
    const mountedRef = useRef(true);
    
    // 使用 ref 存储回调函数，避免 refresh 函数引用变化
    const fetchFnRef = useRef(fetchFn);
    const onSuccessRef = useRef(onSuccess);
    const onErrorRef = useRef(onError);
    const ttlRef = useRef(ttl);
    
    // 更新 ref 值
    useEffect(() => {
        fetchFnRef.current = fetchFn;
        onSuccessRef.current = onSuccess;
        onErrorRef.current = onError;
        ttlRef.current = ttl;
    }, [fetchFn, onSuccess, onError, ttl]);

    // Track mounted state to prevent state updates after unmount
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // 当 cacheKey 变化时，重新读取缓存并更新状态
    useEffect(() => {
        if (prevCacheKeyRef.current !== cacheKey) {
            const newCachedData = cacheManager.get<T>(cacheKey);
            if (newCachedData) {
                setData(newCachedData);
                setLoading(false);
                hasLoadedRef.current = true;
            } else {
                setData(initialValue ?? ([] as unknown as T));
                setLoading(true);
                hasLoadedRef.current = false;
            }
            prevCacheKeyRef.current = cacheKey;
            // 重置 autoFetched，允许新 cacheKey 自动获取
            autoFetchedRef.current = false;
        }
    }, [cacheKey, initialValue]);

    const refresh = useCallback(async (silent = false) => {
        // 防止重复调用
        if (fetchingRef.current) {
            return;
        }
        fetchingRef.current = true;
        
        // 设置静默模式状态
        if (silent) {
            setIsSilentMode(true);
        }

        const isFirstLoad = !hasLoadedRef.current;

        if (!silent) {
            if (!isFirstLoad) {
                setIsRefreshing(true);
            } else {
                setLoading(true);
            }
        }

        try {
            const fetchedData = await fetchFnRef.current();

            // 更新缓存
            cacheManager.set(cacheKey, fetchedData, ttlRef.current);

            // Guard against state updates after unmount
            if (!mountedRef.current) return;

            setData(fetchedData);
            setError(null);
            hasLoadedRef.current = true;
            setLastRefreshTime(new Date());

            onSuccessRef.current?.(fetchedData);
        } catch (err) {
            if (!mountedRef.current) return;
            console.error(`Failed to fetch data for ${cacheKey}:`, err);
            const errorMessage = err instanceof Error ? err.message : '获取数据失败';
            setError(errorMessage);
            onErrorRef.current?.(err);
        } finally {
            fetchingRef.current = false;
            if (!mountedRef.current) return;
            if (!silent) {
                setLoading(false);
                setIsRefreshing(false);
            } else {
                // 静默刷新完成后，重置静默模式状态
                setIsSilentMode(false);
            }
        }
    }, [cacheKey]);

    const invalidate = useCallback(() => {
        cacheManager.invalidate(cacheKey);
        hasLoadedRef.current = false;
    }, [cacheKey]);

    // 自动获取数据 - 只在首次加载时执行一次
    useEffect(() => {
        if (autoFetch && !hasLoadedRef.current && !autoFetchedRef.current) {
            autoFetchedRef.current = true;
            refresh();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoFetch, cacheKey]); // 移除 refresh 依赖，避免无限循环

    // 上报加载状态到全局 Context
    // 只有在非静默模式下才注册，避免后台刷新触发顶部进度条
    useEffect(() => {
        // 如果正在进行静默刷新，不注册到全局 LoadingContext
        if (isSilentMode) {
            return;
        }
        registerLoading(cacheKey, { isLoading: loading, isRefreshing });
        return () => {
            unregisterLoading(cacheKey);
        };
    }, [cacheKey, loading, isRefreshing, isSilentMode, registerLoading, unregisterLoading]);

    return {
        data,
        loading,
        isRefreshing,
        error,
        lastRefreshTime,
        refresh,
        invalidate,
    };
}

