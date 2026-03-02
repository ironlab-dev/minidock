import { useState, useEffect } from 'react';

export type LayoutMode = 'grid' | 'list';

const STORAGE_KEY_PREFIX = 'minidock_layout_';

/**
 * Hook for managing layout preference (grid/list) with localStorage persistence
 * @param pageKey Unique key for the page (e.g., 'docker', 'vms')
 * @param defaultMode Default layout mode (can be responsive based on screen size)
 */
export function useLayoutPreference(
    pageKey: string,
    defaultMode: LayoutMode | (() => LayoutMode) = 'list'
): [LayoutMode, (mode: LayoutMode) => void] {
    const storageKey = `${STORAGE_KEY_PREFIX}${pageKey}`;

    // Get initial mode: check localStorage first, then use default
    const getInitialMode = (): LayoutMode => {
        if (typeof window === 'undefined') {
            return typeof defaultMode === 'function' ? defaultMode() : defaultMode;
        }

        const stored = localStorage.getItem(storageKey);
        if (stored === 'grid' || stored === 'list') {
            return stored as LayoutMode;
        }

        return typeof defaultMode === 'function' ? defaultMode() : defaultMode;
    };

    const [layoutMode, setLayoutModeState] = useState<LayoutMode>(getInitialMode);

    // Sync with localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem(storageKey);
        if (stored === 'grid' || stored === 'list') {
            setLayoutModeState(stored as LayoutMode);
        }
    }, [storageKey]);

    const setLayoutMode = (mode: LayoutMode) => {
        setLayoutModeState(mode);
        if (typeof window !== 'undefined') {
            localStorage.setItem(storageKey, mode);
        }
    };

    return [layoutMode, setLayoutMode];
}
