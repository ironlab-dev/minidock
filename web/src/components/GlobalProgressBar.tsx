"use client";

import { useLoadingContext } from "@/contexts/LoadingContext";
import { ProgressBar } from "@/components/ui/ProgressBar";

export function GlobalProgressBar() {
    const { globalLoading, globalRefreshing } = useLoadingContext();
    return <ProgressBar isLoading={globalLoading} isRefreshing={globalRefreshing} />;
}

