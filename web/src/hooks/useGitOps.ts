import { useState, useEffect } from 'react';
import { client } from '../api/client';

export interface GitOpsDefaults {
    dockerDefaultBranch: string;
    vmDefaultBranch: string;
    automationDefaultBranch: string;
    dockerBasePath: string;
    vmBasePath: string;
}

export function useGitOps() {
    const [defaults, setDefaults] = useState<GitOpsDefaults>({
        dockerDefaultBranch: 'main',
        vmDefaultBranch: 'main',
        automationDefaultBranch: 'main',
        dockerBasePath: '/Users/shared/minidock/docker',
        vmBasePath: '/Users/shared/minidock/vms'
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDefaults = async () => {
            try {
                const data = await client.get<GitOpsDefaults>('/settings/gitops-defaults');
                setDefaults({
                    dockerDefaultBranch: data.dockerDefaultBranch || 'main',
                    vmDefaultBranch: data.vmDefaultBranch || 'main',
                    automationDefaultBranch: data.automationDefaultBranch || 'main',
                    dockerBasePath: data.dockerBasePath || '/Users/shared/minidock/docker',
                    vmBasePath: data.vmBasePath || '/Users/shared/minidock/vms'
                });
            } catch (error) {
                console.error('Failed to fetch GitOps defaults:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchDefaults();
    }, []);

    return { ...defaults, loading };
}
