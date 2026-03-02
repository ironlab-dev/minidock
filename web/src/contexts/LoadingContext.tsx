"use client";

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";

interface LoadingState {
    isLoading: boolean;
    isRefreshing: boolean;
}

interface LoadingContextType {
    registerLoading: (key: string, state: LoadingState) => void;
    unregisterLoading: (key: string) => void;
    globalLoading: boolean;
    globalRefreshing: boolean;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export function LoadingProvider({ children }: { children: ReactNode }) {
    const [loadingStates, setLoadingStates] = useState<Record<string, LoadingState>>({});

    const registerLoading = useCallback((key: string, state: LoadingState) => {
        setLoadingStates(prev => ({
            ...prev,
            [key]: state
        }));
    }, []);

    const unregisterLoading = useCallback((key: string) => {
        setLoadingStates(prev => {
            const newStates = { ...prev };
            delete newStates[key];
            return newStates;
        });
    }, []);

    // 聚合所有加载状态：任一数据源在加载或刷新时，全局显示进度条
    // 使用 useMemo 优化性能，避免每次渲染都重新计算
    const globalLoading = useMemo(() => 
        Object.values(loadingStates).some(state => state.isLoading),
        [loadingStates]
    );
    const globalRefreshing = useMemo(() => 
        Object.values(loadingStates).some(state => state.isRefreshing),
        [loadingStates]
    );

    return (
        <LoadingContext.Provider value={{ 
            registerLoading, 
            unregisterLoading, 
            globalLoading, 
            globalRefreshing 
        }}>
            {children}
        </LoadingContext.Provider>
    );
}

export function useLoadingContext() {
    const context = useContext(LoadingContext);
    if (context === undefined) {
        throw new Error("useLoadingContext must be used within a LoadingProvider");
    }
    return context;
}

