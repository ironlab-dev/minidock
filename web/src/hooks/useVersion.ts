/**
 * useVersion Hook
 * Fetches and manages version information for Docker images and VMs.
 */

import { useState, useEffect } from 'react';
import { versionService } from '@/api/versionService';

export function useVersion(imageName?: string, distroId?: string) {
    const [latestVersion, setLatestVersion] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!imageName && !distroId) return;

        const checkVersion = async () => {
            setLoading(true);
            setError(null);
            try {
                let ver: string | null = null;
                if (imageName) {
                    ver = await versionService.getLatestDockerTag(imageName);
                } else if (distroId) {
                    ver = await versionService.getLatestVMVersion(distroId);
                }
                setLatestVersion(ver);
            } catch {
                setError('Failed to fetch version');
            } finally {
                setLoading(false);
            }
        };

        checkVersion();
    }, [imageName, distroId]);

    return { latestVersion, loading, error };
}
