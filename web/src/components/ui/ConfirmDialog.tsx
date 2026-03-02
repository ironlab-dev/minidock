"use client";

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
    isLoading?: boolean;
}

export function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = '确认',
    cancelText = '取消',
    variant = 'danger',
    isLoading = false
}: ConfirmDialogProps) {
    if (!isOpen) return null;

    const variantStyles = {
        danger: {
            icon: 'text-red-500',
            button: 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500 hover:text-white',
            accent: 'border-red-500/20'
        },
        warning: {
            icon: 'text-amber-500',
            button: 'bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500 hover:text-white',
            accent: 'border-amber-500/20'
        },
        info: {
            icon: 'text-blue-500',
            button: 'bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500 hover:text-white',
            accent: 'border-blue-500/20'
        }
    };

    const styles = variantStyles[variant];

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
                    />

                    {/* Dialog */}
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ type: "spring", duration: 0.3 }}
                            className="w-full max-w-md bg-[#1c1c1e] border border-white/10 rounded-2xl shadow-2xl pointer-events-auto overflow-hidden"
                        >
                            <div className="p-6">
                                {/* Header */}
                                <div className="flex items-start gap-4 mb-4">
                                    <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${styles.icon} bg-current/10 flex items-center justify-center border ${styles.accent}`}>
                                        <AlertTriangle size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg font-bold text-white mb-1">{title}</h3>
                                        <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-line">
                                            {message}
                                        </p>
                                    </div>
                                    <button
                                        onClick={onClose}
                                        disabled={isLoading}
                                        className="flex-shrink-0 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-white/5">
                                    <button
                                        onClick={onClose}
                                        disabled={isLoading}
                                        className="px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-50"
                                    >
                                        {cancelText}
                                    </button>
                                    <button
                                        onClick={onConfirm}
                                        disabled={isLoading}
                                        className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest border transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${styles.button}`}
                                    >
                                        {isLoading && (
                                            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        )}
                                        {confirmText}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}


