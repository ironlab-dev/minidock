"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { PageLayout, Tabs } from "@/components/ui";
import FileBrowser from "@/components/FileBrowser";
import StorageDashboard from "@/components/storage/StorageDashboard";
import DiskManager from "@/components/storage/DiskManager";
import RaidOverview from "@/components/storage/RaidOverview";
import RaidManager from "@/components/storage/RaidManager";
import CreateRaidDialog from "@/components/storage/CreateRaidDialog";
import { useTranslation } from "@/hooks/useTranslation";
import type { RaidSet } from "@/types/raid";

export default function StoragePage() {
    const { t } = useTranslation();
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const [view, setView] = useState<"overview" | "disks" | "files">("overview");
    const [initialPath, setInitialPath] = useState<string | undefined>(undefined);
    const [selectedRaid, setSelectedRaid] = useState<RaidSet | null>(null);
    const [showCreateRaid, setShowCreateRaid] = useState(false);

    // Initialize view and path from URL param
    useEffect(() => {
        const tab = searchParams.get('tab');
        const path = searchParams.get('path');
        if (tab && ['overview', 'disks', 'files'].includes(tab)) {
            setView(tab as "overview" | "disks" | "files");
        }
        if (path) {
            setInitialPath(path);
        }
    }, [searchParams]);
    
    const handleSelectRaid = useCallback((raid: RaidSet) => {
        setSelectedRaid(raid);
    }, []);
    
    const handleBackFromRaid = useCallback(() => {
        setSelectedRaid(null);
    }, []);

    return (
        <PageLayout>
            <Tabs
                tabs={[
                    { id: "overview", label: t.storage.tabs.overview || "Overview" },
                    { id: "disks", label: t.storage.tabs.disks || "Disks" },
                    { id: "files", label: t.storage.tabs.files || "Files" },
                ]}
                activeTab={view}
                onChange={(id) => {
                    setView(id as "overview" | "disks" | "files");
                    // Update URL tab param
                    const params = new URLSearchParams(searchParams.toString());
                    params.set('tab', id);
                    router.push(`${pathname}?${params.toString()}`);
                }}
                paramName="tab"
                variant="blue"
            />

            <div className="flex-1 overflow-y-auto no-scrollbar p-10">
                {view === "overview" && (
                    <div className="space-y-8">
                        <StorageDashboard />
                        {selectedRaid ? (
                            <RaidManager 
                                raid={selectedRaid} 
                                onBack={handleBackFromRaid}
                                onDeleted={handleBackFromRaid}
                            />
                        ) : (
                            <RaidOverview 
                                onSelectRaid={handleSelectRaid}
                                onCreateRaid={() => setShowCreateRaid(true)}
                            />
                        )}
                    </div>
                )}
                
                {showCreateRaid && (
                    <CreateRaidDialog 
                        onClose={() => setShowCreateRaid(false)}
                        onCreated={() => setShowCreateRaid(false)}
                    />
                )}

                {view === "disks" && (
                    <DiskManager />
                )}

                {view === "files" && (
                    <div className="flex flex-col h-full bg-black/20 rounded-2xl border border-white/5 overflow-hidden">
                        <FileBrowser
                            mode="system"
                            basePath={initialPath}
                            onPathChange={(path) => {
                                // Update URL path param shallowly to allow deep linking and history navigation
                                const params = new URLSearchParams(searchParams.toString());
                                params.set('path', path);
                                router.push(`${pathname}?${params.toString()}`);
                            }}
                        />
                    </div>
                )}
            </div>
        </PageLayout>
    );
}
