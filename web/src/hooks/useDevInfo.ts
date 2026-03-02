"use client";

import { useDevInfoContext } from "@/contexts/DevInfoContext";

/**
 * Hook to access development information.
 * 
 * This hook provides access to dev mode status and working directory
 * from the global DevInfoContext, ensuring consistent state across
 * all components and route changes.
 * 
 * @returns {Object} Dev info including isDevMode, workingDirectory, and loading state
 */
export function useDevInfo() {
    return useDevInfoContext();
}

