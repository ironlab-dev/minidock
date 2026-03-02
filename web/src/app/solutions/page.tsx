"use client";

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useTranslation } from "@/hooks/useTranslation";
import { useToast } from "@/hooks/useToast";
import { useSolutions } from '@/hooks/useSolutions';
import { PageLayout, Tabs, Skeleton } from "@/components/ui";
import SolutionOverview from '@/components/solutions/SolutionOverview';
import SolutionInstalled from '@/components/solutions/SolutionInstalled';
import SolutionDeployWizard from '@/components/solutions/SolutionDeployWizard';
import type { SolutionInfo, SolutionDefinition } from '@/types/solution';

export default function SolutionsPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const { solutions, loading, refresh, getSolutionDetail, deploy, getStatus, performAction, uninstall, preflight, updatePaths } = useSolutions();
    const { t } = useTranslation();
    const toast = useToast();

    const [view, setView] = useState<"overview" | "installed">("overview");
    const [showWizard, setShowWizard] = useState(false);
    const [wizardSolution, setWizardSolution] = useState<SolutionDefinition | null>(null);

    // URL parameter handling
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && ['overview', 'installed'].includes(tab)) {
            setView(tab as "overview" | "installed");
        }
    }, [searchParams]);

    const handleTabChange = (tab: string) => {
        setView(tab as "overview" | "installed");
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', tab);
        router.replace(`${pathname}?${params.toString()}`);
    };

    const handleDeploy = async (solution: SolutionInfo) => {
        try {
            const detail = await getSolutionDetail(solution.id);
            setWizardSolution(detail.definition);
            setShowWizard(true);
        } catch {
            toast.error(t.common.operation_failed);
        }
    };

    const handleManage = (solution: SolutionInfo) => {
        setView("installed");
        const params = new URLSearchParams();
        params.set('tab', 'installed');
        params.set('id', solution.id);
        router.replace(`${pathname}?${params.toString()}`);
    };

    const handleWizardClose = () => {
        setShowWizard(false);
        setWizardSolution(null);
        refresh(true);
    };

    const installedCount = solutions.filter(s => s.status !== 'not_installed').length;

    const tabs = [
        { id: "overview", label: t.solutions.tabs.overview },
        {
            id: "installed",
            label: t.solutions.tabs.installed,
            badge: installedCount > 0 ? `${installedCount}` : undefined,
        },
    ];

    return (
        <PageLayout>
            {/* Tabs */}
            <div className="flex-shrink-0 px-6 lg:px-10 pt-6">
                <Tabs
                    tabs={tabs}
                    activeTab={view}
                    onChange={handleTabChange}
                />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 lg:px-10 py-6">
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => (
                            <Skeleton key={i} className="h-64 rounded-2xl" />
                        ))}
                    </div>
                ) : view === "overview" ? (
                    <SolutionOverview
                        solutions={solutions}
                        onDeploy={handleDeploy}
                        onManage={handleManage}
                    />
                ) : (
                    <SolutionInstalled
                        solutions={solutions.filter(s => s.status !== 'not_installed')}
                        getSolutionDetail={getSolutionDetail}
                        getStatus={getStatus}
                        performAction={performAction}
                        uninstall={uninstall}
                        updatePaths={updatePaths}
                        onRefresh={() => refresh(true)}
                    />
                )}
            </div>

            {/* Deploy Wizard */}
            {showWizard && wizardSolution && (
                <SolutionDeployWizard
                    definition={wizardSolution}
                    onClose={handleWizardClose}
                    onDeploy={deploy}
                    getStatus={getStatus}
                    onPreflight={preflight}
                />
            )}
        </PageLayout>
    );
}
