"use client";

import { useMemo } from 'react';
import { useToastContext } from '@/contexts/ToastContext';

export function useToast() {
    const { addToast } = useToastContext();

    return useMemo(() => ({
        success: (message: string, title?: string, duration?: number) => {
            addToast({ type: 'success', message, title, duration });
        },
        error: (message: string, title?: string, duration?: number) => {
            addToast({ type: 'error', message, title, duration });
        },
        info: (message: string, title?: string, duration?: number) => {
            addToast({ type: 'info', message, title, duration });
        },
        warning: (message: string, title?: string, duration?: number) => {
            addToast({ type: 'warning', message, title, duration });
        },
    }), [addToast]);
}
