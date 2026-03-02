"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { generateUUID } from '@/lib/uuid';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
    id: string;
    type: ToastType;
    message: string;
    title?: string;
    duration?: number;
}

interface ToastContextType {
    toasts: Toast[];
    addToast: (toast: Omit<Toast, 'id'>) => void;
    removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const MAX_TOASTS = 5;
const DEFAULT_DURATION = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
        const id = generateUUID();
        const newToast: Toast = {
            ...toast,
            id,
            duration: toast.duration ?? DEFAULT_DURATION,
        };

        setToasts((prev) => {
            const updated = [newToast, ...prev];
            return updated.slice(0, MAX_TOASTS);
        });

        if ((newToast.duration ?? 0) > 0) {
            setTimeout(() => {
                removeToast(id);
            }, newToast.duration);
        }
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
            {children}
        </ToastContext.Provider>
    );
}

export function useToastContext() {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error('useToastContext must be used within a ToastProvider');
    }
    return context;
}

