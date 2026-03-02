"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type PanelTab = 'cpu' | 'mem' | 'network' | 'instructions';

interface SidebarContextType {
    isCollapsed: boolean;
    toggleCollapse: () => void;
    panelState: {
        isOpen: boolean;
        activeTab: PanelTab | null;
    };
    openPanel: (tab: PanelTab) => void;
    closePanel: () => void;
    togglePanel: (tab: PanelTab) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

const STORAGE_KEY = "minidock_sidebar_collapsed";

export function SidebarProvider({ children }: { children: ReactNode }) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved !== null) {
                setIsCollapsed(saved === "true");
            }
        } catch (error) {
            console.warn("Failed to read sidebar state from localStorage:", error);
        }
    }, []);

    const toggleCollapse = () => {
        setIsCollapsed((prev) => {
            const newState = !prev;
            if (isMounted) {
                try {
                    localStorage.setItem(STORAGE_KEY, String(newState));
                } catch (error) {
                    console.warn("Failed to save sidebar state to localStorage:", error);
                }
            }
            return newState;
        });
    };

    const [panelState, setPanelState] = useState<{ isOpen: boolean; activeTab: PanelTab | null }>({
        isOpen: false,
        activeTab: null
    });

    const openPanel = (tab: PanelTab) => setPanelState({ isOpen: true, activeTab: tab });
    const closePanel = () => setPanelState({ isOpen: false, activeTab: null });
    const togglePanel = (tab: PanelTab) => {
        if (panelState.isOpen && panelState.activeTab === tab) {
            closePanel();
        } else {
            openPanel(tab);
        }
    };

    return (
        <SidebarContext.Provider value={{
            isCollapsed,
            toggleCollapse,
            panelState,
            openPanel,
            closePanel,
            togglePanel
        }}>
            {children}
        </SidebarContext.Provider>
    );
}

export function useSidebar() {
    const context = useContext(SidebarContext);
    if (context === undefined) {
        throw new Error("useSidebar must be used within a SidebarProvider");
    }
    return context;
}

