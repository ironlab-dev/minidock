"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useToastContext, Toast as ToastType } from '@/contexts/ToastContext';

const iconMap = {
    success: CheckCircle2,
    error: XCircle,
    info: Info,
    warning: AlertTriangle,
};

const colorMap = {
    success: {
        bg: 'bg-emerald-500/10',
        text: 'text-emerald-300',
        border: 'border-emerald-500/20',
        icon: 'text-emerald-400',
    },
    error: {
        bg: 'bg-red-500/10',
        text: 'text-red-300',
        border: 'border-red-500/20',
        icon: 'text-red-400',
    },
    info: {
        bg: 'bg-blue-500/10',
        text: 'text-blue-300',
        border: 'border-blue-500/20',
        icon: 'text-blue-400',
    },
    warning: {
        bg: 'bg-amber-500/10',
        text: 'text-amber-300',
        border: 'border-amber-500/20',
        icon: 'text-amber-400',
    },
};

function ToastItem({ toast }: { toast: ToastType }) {
    const { removeToast } = useToastContext();
    const Icon = iconMap[toast.type];
    const colors = colorMap[toast.type];

    return (
        <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className={`relative px-5 py-3.5 rounded-2xl border backdrop-blur-xl shadow-2xl ${colors.bg} ${colors.text} ${colors.border} max-w-md`}
        >
            <button
                onClick={() => removeToast(toast.id)}
                className="absolute top-2 right-2 p-1 rounded-lg hover:bg-white/10 transition-colors text-current opacity-60 hover:opacity-100"
                aria-label="关闭"
            >
                <X size={16} />
            </button>
            
            <div className="flex items-start gap-3 pr-6">
                <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${colors.icon}`} />
                <div className="flex-1 min-w-0">
                    {toast.title && (
                        <div className="text-sm font-semibold mb-1">{toast.title}</div>
                    )}
                    <div className={`text-xs leading-relaxed whitespace-pre-line ${toast.title ? '' : 'mt-0'}`}>
                        {toast.message}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

export function ToastContainer() {
    const { toasts } = useToastContext();

    return (
        <div className="fixed top-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none max-w-md w-full md:w-auto">
            <AnimatePresence mode="popLayout">
                {toasts.map((toast) => (
                    <div key={toast.id} className="pointer-events-auto">
                        <ToastItem toast={toast} />
                    </div>
                ))}
            </AnimatePresence>
        </div>
    );
}

