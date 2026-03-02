"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { client } from "@/api/client";

interface DevInfo {
    isDevMode: boolean;
    workingDirectory: string;
}

interface DevInfoContextType {
    isDevMode: boolean;
    workingDirectory: string | null;
    loading: boolean;
}

const DevInfoContext = createContext<DevInfoContextType | undefined>(undefined);

export function DevInfoProvider({ children }: { children: ReactNode }) {
    const [devInfo, setDevInfo] = useState<DevInfo | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDevInfo = async () => {
            try {
                const data = await client.get<DevInfo>('/system/dev-info');
                setDevInfo(data);
            } catch (err) {
                console.error("Failed to fetch dev info:", err);
                setDevInfo(null);
            } finally {
                setLoading(false);
            }
        };

        fetchDevInfo();
    }, []);

    const value: DevInfoContextType = {
        isDevMode: devInfo?.isDevMode ?? false,
        workingDirectory: devInfo?.workingDirectory ?? null,
        loading
    };

    return (
        <DevInfoContext.Provider value={value}>
            {children}
        </DevInfoContext.Provider>
    );
}

export function useDevInfoContext() {
    const context = useContext(DevInfoContext);
    if (context === undefined) {
        throw new Error("useDevInfoContext must be used within a DevInfoProvider");
    }
    return context;
}

