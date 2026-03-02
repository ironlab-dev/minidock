"use client";

import { useState, useEffect } from 'react';
import { client } from '@/api/client';

export interface ImageStatus {
    exists: boolean;
    size?: string;
    id?: string;
}

export function useImageStatus(imageName: string | null) {
    const [status, setStatus] = useState<ImageStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!imageName) {
            setStatus(null);
            return;
        }

        const fetchStatus = async () => {
            setLoading(true);
            try {
                const data = await client.get<ImageStatus>(`/docker/services/images/status?image=${encodeURIComponent(imageName)}`);
                setStatus(data);
                setError(null);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
                setStatus(null);
            } finally {
                setLoading(false);
            }
        };

        fetchStatus();
    }, [imageName]);

    return { status, loading, error };
}
