"use client";

import { useCallback } from 'react';
import { client } from '@/api/client';
import { useCachedData } from './useCachedData';
import type { SolutionInfo, SolutionDetail, SolutionDeployment, DeploymentProgress, DeployRequest, PreflightResult } from '@/types/solution';

export function useSolutions() {
    const {
        data: solutions,
        loading,
        error,
        refresh,
    } = useCachedData<SolutionInfo[]>({
        cacheKey: 'solutions',
        fetchFn: () => client.get<SolutionInfo[]>('/solutions'),
        initialValue: [],
        autoFetch: true,
    });

    const getSolutionDetail = useCallback(async (id: string): Promise<SolutionDetail> => {
        return client.get<SolutionDetail>(`/solutions/${id}`);
    }, []);

    const deploy = useCallback(async (id: string, request: DeployRequest): Promise<DeploymentProgress> => {
        return client.post<DeploymentProgress>(`/solutions/${id}/deploy`, request);
    }, []);

    const getStatus = useCallback(async (id: string): Promise<DeploymentProgress> => {
        return client.get<DeploymentProgress>(`/solutions/${id}/status`);
    }, []);

    const performAction = useCallback(async (id: string, action: string): Promise<{ message: string }> => {
        return client.post<{ message: string }>(`/solutions/${id}/action`, { action });
    }, []);

    const uninstall = useCallback(async (id: string): Promise<void> => {
        await client.delete(`/solutions/${id}`);
    }, []);

    const preflight = useCallback(async (id: string): Promise<PreflightResult> => {
        return client.get<PreflightResult>(`/solutions/${id}/preflight`);
    }, []);

    const updatePaths = useCallback(async (id: string, mediaPath: string, downloadsPath: string): Promise<SolutionDeployment> => {
        return client.put<SolutionDeployment>(`/solutions/${id}/paths`, { mediaPath, downloadsPath });
    }, []);

    return {
        solutions,
        loading,
        error,
        refresh,
        getSolutionDetail,
        deploy,
        getStatus,
        performAction,
        uninstall,
        preflight,
        updatePaths,
    };
}
