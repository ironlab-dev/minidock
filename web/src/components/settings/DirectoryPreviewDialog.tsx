"use client";

import { motion, AnimatePresence } from 'framer-motion';
import { FolderOpen, GitBranch, AlertCircle, X, CheckCircle2 } from 'lucide-react';
import type { DirectoryPreview } from '@/types/settings';

interface DirectoryPreviewDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    preview: DirectoryPreview | null;
    directoryPath: string;
    directoryType: 'docker' | 'vm';
    isLoading?: boolean;
}

export function DirectoryPreviewDialog({
    isOpen,
    onClose,
    onConfirm,
    preview,
    directoryPath,
    directoryType,
    isLoading = false
}: DirectoryPreviewDialogProps) {
    if (!isOpen || !preview) return null;

    const itemLabel = directoryType === 'docker' ? '服务' : '虚拟机';

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
                            className="w-full max-w-2xl bg-[#1c1c1e] border border-white/10 rounded-2xl shadow-2xl pointer-events-auto overflow-hidden"
                        >
                            <div className="p-6">
                                {/* Header */}
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="flex-shrink-0 w-10 h-10 rounded-xl text-blue-500 bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                                        <FolderOpen size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg font-bold text-white mb-1">目录预览确认</h3>
                                        <p className="text-sm text-gray-400 leading-relaxed break-all">
                                            {directoryPath}
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

                                {/* Content */}
                                <div className="space-y-4 mb-6">
                                    {/* Directory Status */}
                                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                                        {preview.exists ? (
                                            <>
                                                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                                                <span className="text-sm text-gray-300">目录已存在</span>
                                            </>
                                        ) : (
                                            <>
                                                <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                                                <span className="text-sm text-gray-300">目录不存在，将自动创建</span>
                                            </>
                                        )}
                                    </div>

                                    {/* Git Status */}
                                    {preview.exists && (
                                        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                                            <GitBranch className="w-5 h-5 text-blue-500 flex-shrink-0" />
                                            <div className="flex-1">
                                                <span className="text-sm text-gray-300">
                                                    {preview.isGitRepo ? '已是 Git 仓库' : '将初始化 Git 仓库'}
                                                </span>
                                                {preview.hasUncommittedChanges && (
                                                    <span className="text-xs text-amber-500 block mt-1">
                                                        检测到未提交的更改
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Items List */}
                                    {preview.items.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                <FolderOpen className="w-3 h-3" />
                                                <span>发现 {preview.items.length} 个{itemLabel}</span>
                                            </div>
                                            <div className="max-h-48 overflow-y-auto space-y-1 p-3 rounded-xl bg-black/40 border border-white/10">
                                                {preview.items.map((item) => (
                                                    <div
                                                        key={item.name}
                                                        className="flex items-center gap-2 text-sm text-gray-300 py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors"
                                                    >
                                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                                                        <span className="font-mono">{item.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    {preview.actions.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                将执行的操作
                                            </div>
                                            <div className="space-y-1.5">
                                                {preview.actions.map((action) => (
                                                    <div
                                                        key={action}
                                                        className="flex items-start gap-2 text-sm text-gray-400 py-2 px-3 rounded-lg bg-white/5"
                                                    >
                                                        <div className="w-1 h-1 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                                                        <span>{action}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                                    <button
                                        onClick={onClose}
                                        disabled={isLoading}
                                        className="px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-50"
                                    >
                                        取消
                                    </button>
                                    <button
                                        onClick={onConfirm}
                                        disabled={isLoading}
                                        className="px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest border transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500 hover:text-white"
                                    >
                                        {isLoading && (
                                            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        )}
                                        确认保存
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
