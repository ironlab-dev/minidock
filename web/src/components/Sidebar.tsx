"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useDevInfo } from "@/hooks/useDevInfo";
import { useAuth } from "@/contexts/AuthContext";
import { DEMO_MODE } from "@/demo/demoConfig";
import { useToastContext } from "@/contexts/ToastContext";
import { isAuthRoute } from "@/lib/routeConfig";

import { useSidebar } from "@/contexts/SidebarContext";
import {
    LayoutDashboard,
    Box,
    Sparkles,
    Cpu,
    Zap,
    Monitor,
    Settings,
    ChevronRight,
    ChevronLeft,
    Terminal,
    Users,
    Folder,
    ExternalLink
} from "lucide-react";

export default function Sidebar() {
    const pathname = usePathname();
    const { t } = useTranslation();
    const { isCollapsed, toggleCollapse } = useSidebar();
    const { isDevMode, workingDirectory } = useDevInfo();
    const { user, logout } = useAuth();
    const { addToast } = useToastContext();
    const [showUserMenu, setShowUserMenu] = useState(false);

    // Extract directory name from full path
    const directoryName = workingDirectory ? workingDirectory.split('/').pop() || workingDirectory : null;

    // DEMO_INTEGRATION: show toast instead of real sign-out in demo mode
    const handleSignOut = async () => {
        if (DEMO_MODE) {
            addToast({ type: 'info', message: 'This action is disabled in demo mode' });
            setShowUserMenu(false);
            return;
        }
        try {
            await logout();
        } catch (err) {
            console.error("Sign out failed", err);
        }
    };

    const navItems = [
        { name: t.sidebar.dashboard, href: "/", icon: LayoutDashboard },
        { name: t.sidebar.docker, href: "/docker", icon: Box },
        { name: t.sidebar.vms, href: "/vms", icon: Cpu },
        { name: t.sidebar.automation, href: "/automation", icon: Zap },
        { name: t.sidebar.files, href: "/files", icon: Folder },
        { name: t.sidebar.solutions, href: "/solutions", icon: Sparkles },
        { name: t.sidebar.remote, href: "/remote", icon: Monitor },
        { name: t.sidebar.terminal, href: "/terminal", icon: Terminal },
        { name: t.sidebar.settings, href: "/settings", icon: Settings },
    ];

    if (isAuthRoute(pathname)) return null;

    const sidebarWidth = isCollapsed ? "w-20" : "w-64";

    return (
        <>
            {/* Desktop Sidebar */}
            <aside className={`hidden lg:flex ${sidebarWidth} flex flex-col h-screen fixed z-30 transition-all duration-300 ease-in-out`}>
                <div className="flex-1 flex flex-col glass-card border-r border-white/[0.05]">
                    {/* Logo Section */}
                    <div className={`p-6 ${isCollapsed ? "px-4" : ""}`}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3.5 flex-1 min-w-0">
                                <div className="w-10 h-10 rounded-[12px] bg-purple-600 flex items-center justify-center font-bold flex-shrink-0 text-white shadow-lg shadow-purple-600/30">
                                    M
                                </div>
                                {!isCollapsed && (
                                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                                        <span className="font-bold text-lg tracking-tight whitespace-nowrap text-white">MiniDock</span>
                                        {isDevMode && directoryName && (
                                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm">
                                                <div className="w-1 h-1 rounded-full bg-blue-500/70" />
                                                <span className="text-[9px] font-medium text-gray-400 tracking-wide" title={workingDirectory || undefined}>
                                                    {directoryName}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {!isCollapsed && <div className="mx-6 my-2 h-[1px] bg-white/[0.03]" />}

                    {/* Navigation */}
                    <nav className={`flex-1 py-2 space-y-1 overflow-y-auto no-scrollbar ${isCollapsed ? "px-2" : "px-3"}`}>
                        {navItems.map((item) => {
                            const isActive = pathname === item.href;
                            const Icon = item.icon;
                            const isSettings = item.href === "/settings";

                            return (
                                <React.Fragment key={item.href}>
                                    {isSettings && !isCollapsed && (
                                        <div className="mx-4 my-4 h-[1px] bg-white/[0.03]" />
                                    )}
                                    <Link
                                        href={item.href}
                                        title={isCollapsed ? item.name : undefined}
                                        className={`flex items-center ${isCollapsed ? "justify-center px-2" : "gap-3.5 px-4"} py-2.5 rounded-xl transition-all duration-200 group relative active:scale-[0.98] ${isActive
                                            ? "bg-gray-800/50 text-white"
                                            : "text-white hover:text-white hover:bg-white/5"
                                            }`}
                                    >
                                        {isActive && (
                                            <div className="absolute left-0 w-[3px] h-6 rounded-r-full bg-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.5)]" />
                                        )}
                                        <Icon className={`w-5 h-5 flex-shrink-0 transition-all duration-300 ${isActive ? "text-blue-400" : "text-gray-400 group-hover:text-gray-300"}`} strokeWidth={isActive ? 2.5 : 2} />
                                        {!isCollapsed && (
                                            <span className={`font-semibold text-sm tracking-tight whitespace-nowrap text-white`}>{item.name}</span>
                                        )}
                                        {isCollapsed && (
                                            <div className="absolute left-full ml-4 px-3 py-1.5 bg-[#1c1c1e] border border-white/10 shadow-2xl rounded-lg text-xs font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50">
                                                {item.name}
                                                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#1c1c1e]"></div>
                                            </div>
                                        )}
                                    </Link>
                                </React.Fragment>
                            );
                        })}
                    </nav>

                    {/* User Section */}
                    <div className={`mt-auto px-3 py-3 space-y-2`}>

                        {user && (
                            <div className="relative">
                                <button
                                    onClick={() => setShowUserMenu(!showUserMenu)}
                                    className={`w-full flex items-center transition-all duration-200 rounded-xl hover:bg-white/5 group active:scale-[0.98] ${isCollapsed ? "justify-center px-1 py-2" : "gap-3 px-3 py-2.5"}`}
                                >
                                    <div className="w-8 h-8 rounded-full p-[1px] bg-gradient-to-b from-white/10 to-transparent border border-white/5 flex-shrink-0">
                                        <div className="w-full h-full rounded-full bg-[#1c1c21] overflow-hidden border border-white/5 group-hover:border-white/20 transition-all">
                                            <div className="w-full h-full rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center">
                                                <span className="text-[11px] font-bold text-white/80 uppercase select-none">
                                                    {user.username.charAt(0)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {!isCollapsed && (
                                        <>
                                            <div className="flex-1 text-left min-w-0">
                                                <p className="text-xs font-bold text-white truncate">{user.username}</p>
                                                <p className="text-[10px] text-gray-500 font-medium truncate capitalize">{user.role}</p>
                                            </div>
                                        </>
                                    )}

                                    {isCollapsed && (
                                        <div className="absolute left-full ml-4 px-3 py-1.5 bg-[#1c1c1e] border border-white/10 shadow-2xl rounded-lg text-xs font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50">
                                            {user.username}
                                        </div>
                                    )}
                                </button>

                                {showUserMenu && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                                        <div className={`absolute ${isCollapsed ? "left-full ml-2 bottom-0" : "left-0 bottom-full mb-2"} w-48 bg-[#1c1c1e]/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200`}>
                                            <div className="p-3 border-b border-white/5 bg-white/5">
                                                <p className="text-xs font-bold text-white truncate">{user.username}</p>
                                                <p className="text-[10px] text-gray-500 font-medium mt-0.5 truncate capitalize">{user.role}</p>
                                            </div>
                                            <div className="p-1.5">
                                                {user.role === 'admin' && (
                                                    <Link
                                                        href="/admin/users"
                                                        onClick={() => setShowUserMenu(false)}
                                                        className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/10 transition-all group"
                                                    >
                                                        <Users className="w-4 h-4 transition-colors group-hover:text-blue-400" />
                                                        <span>{t.admin.user_management}</span>
                                                    </Link>
                                                )}
                                                <a
                                                    href="https://minidock.net"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={() => setShowUserMenu(false)}
                                                    className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/10 transition-all group"
                                                >
                                                    <ExternalLink className="w-4 h-4 transition-colors group-hover:text-blue-400" />
                                                    <span>{t.sidebar.visit_website}</span>
                                                </a>
                                                <a
                                                    href="https://ironlab.cc"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={() => setShowUserMenu(false)}
                                                    className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-xs text-gray-600 hover:text-gray-400 hover:bg-white/5 transition-all"
                                                >
                                                    <ExternalLink className="w-3 h-3 opacity-50" />
                                                    <span>by IronLab · ironlab.cc</span>
                                                </a>
                                                <div className="h-px bg-white/5 my-1" />
                                                <button
                                                    onClick={handleSignOut}
                                                    className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm text-red-400/80 hover:text-red-400 hover:bg-white/10 transition-all font-medium"
                                                >
                                                    <ChevronRight className="w-4 h-4 rotate-180" />
                                                    <span>{t.auth.logout}</span>
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Sidebar Collapse Toggle */}
                    <div className={`p-4 border-t border-white/[0.05] ${isCollapsed ? "px-2" : ""}`}>
                        <button
                            onClick={toggleCollapse}
                            className={`w-full flex items-center ${isCollapsed ? "justify-center" : "gap-2.5 px-3"} py-2 rounded-xl text-gray-500 hover:text-white hover:bg-white/5 transition-all duration-200 group active:scale-95`}
                            aria-label={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
                        >
                            {isCollapsed ? <ChevronRight size={18} /> : (
                                <>
                                    <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
                                    <span className="text-[10px] font-bold tracking-[0.15em] uppercase">
                                        {t.sidebar.collapse || "收起"}
                                    </span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </aside>

            {/* Mobile Tab Bar */}
            <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-[72px] glass-card border-t border-white/5 flex items-center justify-around px-2 z-50 pb-[env(safe-area-inset-bottom)]">
                {navItems.slice(0, 4).map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex flex-col items-center justify-center gap-1.5 min-w-[56px] transition-all duration-200 active:scale-95 ${isActive ? "text-blue-400" : "text-gray-500"}`}
                        >
                            <div className={`p-1.5 rounded-lg transition-all ${isActive ? "bg-blue-500/10" : ""}`}>
                                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                            </div>
                            <span className="text-[8px] font-bold uppercase tracking-widest leading-none">{item.name}</span>
                        </Link>
                    );
                })}

                <div className="flex items-center justify-center min-w-[56px]">
                    <button
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className={`flex flex-col items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 ${showUserMenu ? "text-blue-400" : "text-gray-500"}`}
                    >
                        <div className={`p-1 rounded-full border-2 transition-all ${showUserMenu ? "border-blue-400" : "border-transparent"}`}>
                            <div className="w-6 h-6 rounded-full overflow-hidden">
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center"><span className="text-[9px] font-bold text-white/80 uppercase select-none">{user?.username?.charAt(0) || 'G'}</span></div>
                            </div>
                        </div>
                        <span className="text-[8px] font-bold uppercase tracking-widest leading-none">Me</span>
                    </button>
                </div>
            </nav>

        </>
    );
}
