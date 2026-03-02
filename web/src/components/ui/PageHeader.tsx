import { Activity } from 'lucide-react';
import { useSidebar } from "@/contexts/SidebarContext";
import { useWebSocket } from "@/hooks/useWebSocket";

export interface PageHeaderProps {
    title: string;
    subtitle?: string;
    badge?: string;
    variant?: 'blue' | 'purple' | 'emerald';
    statusBadges?: React.ReactNode;
    children?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    subtitle,
    badge,
    variant = 'blue',
    statusBadges,
    children
}) => {
    const { panelState, togglePanel } = useSidebar();
    const { instructions } = useWebSocket();
    const runningTasks = instructions.filter(i => i.status === 'running').length;

    const accentColors = {
        blue: 'bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]',
        purple: 'bg-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.5)]',
        emerald: 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
    };

    return (
        <header className="sticky top-0 z-20 w-full bg-[#0a0a0c]/80 backdrop-blur-md border-b border-white/[0.05] px-10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 py-4">
                <div className={`w-1.5 h-6 rounded-full ${accentColors[variant]}`} />
                <div className="flex flex-col">
                    <h2 className="text-xl font-bold tracking-tight text-white">
                        {title}
                    </h2>
                    {subtitle && (
                        <p className="text-sm text-gray-500 font-medium mt-0.5">
                            {subtitle}
                        </p>
                    )}
                </div>

                {badge && (
                    <div className="ml-3 px-3 py-1 bg-white/5 border border-white/10 rounded-full">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] leading-none">
                            {badge}
                        </span>
                    </div>
                )}
            </div>
            <div className="flex items-center gap-4">
                {statusBadges && (
                    <div className="flex items-center gap-2 pr-4 border-r border-white/5">
                        {statusBadges}
                    </div>
                )}

                {/* Task Center Trigger */}
                <button
                    onClick={() => togglePanel('instructions')}
                    className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-all duration-200 group relative active:scale-95 ${panelState.isOpen && panelState.activeTab === 'instructions' ? "bg-blue-500/10 text-blue-400" : "text-gray-500 hover:text-white hover:bg-white/5"}`}
                    title="任务中心"
                >
                    <div className="relative">
                        <Activity className={`w-5 h-5 ${(panelState.isOpen && panelState.activeTab === 'instructions') || runningTasks > 0 ? "text-blue-400" : "text-gray-400 group-hover:text-white"}`} strokeWidth={2.5} />
                        {runningTasks > 0 && (
                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full border-2 border-[#0a0a0c] animate-pulse" />
                        )}
                    </div>
                    {runningTasks > 0 && (
                        <span className="text-[10px] font-black tabular-nums">
                            {runningTasks}
                        </span>
                    )}
                </button>

                {children}
            </div>
        </header>
    );
};
