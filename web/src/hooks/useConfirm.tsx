"use client";

import { useState, useCallback } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
}

export function useConfirm() {
    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState<ConfirmOptions | null>(null);
    const [resolveRef, setResolveRef] = useState<((value: boolean) => void) | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
        return new Promise((res) => {
            setOptions(opts);
            setResolveRef(() => res);
            setIsOpen(true);
        });
    }, []);

    const handleConfirm = useCallback(async () => {
        if (resolveRef) {
            setIsLoading(true);
            resolveRef(true);
            setIsOpen(false);
            setResolveRef(null);
            setOptions(null);
            setIsLoading(false);
        }
    }, [resolveRef]);

    const handleCancel = useCallback(() => {
        if (resolveRef) {
            resolveRef(false);
            setIsOpen(false);
            setResolveRef(null);
            setOptions(null);
        }
    }, [resolveRef]);

    const ConfirmDialogComponent = () => {
        if (!options) return null;
        return (
            <ConfirmDialog
                isOpen={isOpen}
                onClose={handleCancel}
                onConfirm={handleConfirm}
                title={options.title}
                message={options.message}
                confirmText={options.confirmText}
                cancelText={options.cancelText}
                variant={options.variant || 'danger'}
                isLoading={isLoading}
            />
        );
    };

    return {
        confirm,
        ConfirmDialog: ConfirmDialogComponent,
    };
}
