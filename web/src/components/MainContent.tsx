"use client";

import { useSidebar } from "@/contexts/SidebarContext";
import { isAuthRoute } from "@/lib/routeConfig";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export default function MainContent({ children }: { children: ReactNode }) {
    const { isCollapsed } = useSidebar();
    const pathname = usePathname();
    const hasSidebar = !isAuthRoute(pathname);
    const marginLeft = hasSidebar ? (isCollapsed ? "lg:ml-20" : "lg:ml-64") : "";

    return (
        <div className={`flex-1 ${marginLeft} flex flex-col min-w-0 transition-all duration-300 ease-in-out`}>
            {children}
        </div>
    );
}

