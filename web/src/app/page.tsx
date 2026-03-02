"use client";

import { useServices } from "@/hooks/useServices";
import { PageLayout } from "@/components/ui";
import { SystemHealthWidget } from "@/components/dashboard/SystemHealthWidget";
import { DockerStatusWidget } from "@/components/dashboard/DockerStatusWidget";
import { VMListWidget } from "@/components/dashboard/VMListWidget";
import { AutomationWidget } from "@/components/dashboard/AutomationWidget";
import { useEffect, useState } from "react";

export default function Dashboard() {
  const { services, loading, isRefreshing, performAction } = useServices();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Prioritize "system-core" for uptime and system stats
  const systemService = services.find(s => s.id === 'system-core') || services.find(s => s.type === 'system');
  const dockerService = services.find(s => s.id === 'docker-engine') || services.find(s => s.type === 'docker');

  if (!hasMounted) return null;

  return (
    <PageLayout animate={false}>
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 md:p-8">

        {loading && !isRefreshing && services.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* System Health Section */}
            <section>
              <SystemHealthWidget systemService={systemService} />
            </section>

            {/* Main Grid: Docker & VMs on left, Automation on right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
              <div className="lg:col-span-8 flex flex-col gap-6 md:gap-8">
                <DockerStatusWidget service={dockerService} onAction={performAction} />
                <VMListWidget />
              </div>
              <div className="lg:col-span-4">
                <AutomationWidget />
              </div>
            </div>
          </div>
        )}
      </div>

    </PageLayout>
  );
}
