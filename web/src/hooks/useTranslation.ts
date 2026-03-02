"use client";

import { zh } from "@/locales/zh";

// In a real app, this would use a context to switch languages.
// For now, we default to Chinese as requested.
export function useTranslation() {
    const t = zh;
    return { t };
}
