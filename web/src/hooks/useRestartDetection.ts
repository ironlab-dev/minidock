"use client";

import { useState, useEffect, useCallback } from "react";
import { client } from "@/api/client";

export interface BuildInfo {
    binaryTimestamp: number;
    sourceTimestamp: number;
    needsRebuild: boolean;
    binaryPath: string;
    latestSourcePath: string;
}

export interface RestartDetectionState {
    backendNeedsRestart: boolean;
    frontendNeedsRestart: boolean;
    isChecking: boolean;
    lastCheckTime: number | null;
}

const POLL_INTERVAL = 5000; // 5 seconds
const STORAGE_KEY = "minidock_restart_dismissed";

export function useRestartDetection() {
    const [state, setState] = useState<RestartDetectionState>({
        backendNeedsRestart: false,
        frontendNeedsRestart: false,
        isChecking: false,
        lastCheckTime: null,
    });

    const [isDismissed, setIsDismissed] = useState(false);

    // Check if user has dismissed the notification
    useEffect(() => {
        if (typeof window !== "undefined") {
            const dismissed = localStorage.getItem(STORAGE_KEY);
            if (dismissed) {
                const dismissedTime = parseInt(dismissed, 10);
                // Re-show after 10 minutes
                if (Date.now() - dismissedTime < 10 * 60 * 1000) {
                    setIsDismissed(true);
                } else {
                    localStorage.removeItem(STORAGE_KEY);
                }
            }
        }
    }, []);

    const checkBackendBuildInfo = useCallback(async () => {
        try {
            setState((prev) => ({ ...prev, isChecking: true }));
            const buildInfo = await client.get<BuildInfo>("/system/dev/build-info");
            
            setState((prev) => ({
                ...prev,
                backendNeedsRestart: buildInfo.needsRebuild,
                lastCheckTime: Date.now(),
                isChecking: false,
            }));
        } catch {
            // Silently fail - backend might not be available or endpoint might not exist
            setState((prev) => ({
                ...prev,
                isChecking: false,
                lastCheckTime: Date.now(),
            }));
        }
    }, []);


    useEffect(() => {
        // Only check in development mode
        // Check via window.location (more reliable in browser)
        if (typeof window === "undefined") {
            return;
        }
        
        // Development mode detection: localhost or 127.0.0.1
        const isDevMode = window.location.hostname === "localhost" || 
                         window.location.hostname === "127.0.0.1" ||
                         process.env.NODE_ENV === "development";
        
        if (!isDevMode) {
            return;
        }

        // Initial check
        checkBackendBuildInfo();

        // Set up polling
        const interval = setInterval(() => {
            if (!isDismissed) {
                checkBackendBuildInfo();
            }
        }, POLL_INTERVAL);

        return () => {
            clearInterval(interval);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDismissed]); // 移除 checkBackendBuildInfo 依赖，避免无限循环

    const dismissNotification = useCallback(() => {
        setIsDismissed(true);
        if (typeof window !== "undefined") {
            localStorage.setItem(STORAGE_KEY, Date.now().toString());
        }
    }, []);

    const needsRestart = state.backendNeedsRestart || state.frontendNeedsRestart;

    return {
        ...state,
        needsRestart: needsRestart && !isDismissed,
        dismissNotification,
        checkBackendBuildInfo,
    };
}

