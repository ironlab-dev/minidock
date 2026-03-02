"use client";

import { ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui';

interface AboutSettingsProps {
    currentVersion: string;
}

export default function AboutSettings({ currentVersion }: AboutSettingsProps) {
    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
            {/* Product Identity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="p-8 border-none bg-white/[0.02] backdrop-blur-xl">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-14 h-14 rounded-2xl bg-purple-600 flex items-center justify-center font-bold text-white text-2xl shadow-lg shadow-purple-600/30 flex-shrink-0">
                            M
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">MiniDock</h3>
                            <p className="text-xs text-gray-500 mt-0.5">v{currentVersion}</p>
                        </div>
                    </div>
                    <p className="text-sm text-gray-400 leading-relaxed mb-6">
                        Transform your Mac mini into the ultimate home server. Manage Docker, VMs, automation, and more — through a beautiful web interface.
                    </p>
                    <div className="space-y-2 pt-4 border-t border-white/5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">License</span>
                            <span className="text-xs text-gray-400 font-mono">Apache 2.0</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">开发方</span>
                            <a href="https://ironlab.cc" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">IronLab</a>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">官方网站</span>
                            <a href="https://minidock.net" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">minidock.net</a>
                        </div>
                    </div>
                </Card>

                {/* Support Channels */}
                <Card className="p-8 border-none bg-white/[0.02] backdrop-blur-xl">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-[0.15em] mb-6">支持与社区</h3>
                    <div className="space-y-3">
                        <a href="https://github.com/ironlab-dev/minidock/discussions" target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/10 hover:bg-white/[0.05] transition-all group">
                            <span className="text-lg">💬</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white">GitHub Discussions</p>
                                <p className="text-xs text-gray-500">社区论坛与问答</p>
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 flex-shrink-0" />
                        </a>
                        <a href="https://github.com/ironlab-dev/minidock/issues" target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/10 hover:bg-white/[0.05] transition-all group">
                            <span className="text-lg">🐛</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white">GitHub Issues</p>
                                <p className="text-xs text-gray-500">Bug 报告与功能请求</p>
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 flex-shrink-0" />
                        </a>
                        <a href="mailto:minidock@ironlab.cc"
                            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/10 hover:bg-white/[0.05] transition-all group">
                            <span className="text-lg">📧</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white">联系支持</p>
                                <p className="text-xs text-gray-500 font-mono">minidock@ironlab.cc</p>
                            </div>
                        </a>
                        <a href="https://github.com/ironlab-dev/minidock/tree/master/docs" target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/10 hover:bg-white/[0.05] transition-all group">
                            <span className="text-lg">📖</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white">文档</p>
                                <p className="text-xs text-gray-500">安装指南、API 参考与开发者指南</p>
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 flex-shrink-0" />
                        </a>
                    </div>
                </Card>
            </div>

            {/* Open Source + IronLab Attribution */}
            <Card className="p-6 border-none bg-white/[0.02] backdrop-blur-xl">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <p className="text-sm text-gray-300">MiniDock 是 <a href="https://github.com/ironlab-dev/minidock" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">100% 开源</a>，基于 Apache 2.0 许可证。由 <a href="https://ironlab.cc" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">IronLab</a> 独立开发与维护。</p>
                        <p className="text-xs text-gray-600">如果 MiniDock 对你有帮助，请考虑购买终身授权支持我们的开发。</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <a href="https://github.com/ironlab-dev/minidock" target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-xs font-semibold transition-all">
                            <ExternalLink className="w-3.5 h-3.5" />
                            GitHub
                        </a>
                        <a href="https://minidock.net/pro" target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 hover:text-blue-300 text-xs font-semibold transition-all">
                            获取 Pro 授权 →
                        </a>
                    </div>
                </div>
            </Card>
        </div>
    );
}
