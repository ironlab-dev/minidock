"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useDevInfo } from "@/hooks/useDevInfo";

const DEFAULT_TITLE = "MiniDock | Mac Mini NAS Console";

export default function DocumentTitle() {
    const { isDevMode, workingDirectory, loading } = useDevInfo();
    const pathname = usePathname();
    const prevTitleRef = useRef<string>("");
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const observerRef = useRef<MutationObserver | null>(null);
    
    const updateTitle = useCallback(() => {
        if (loading) {
            return;
        }
        
        let newTitle: string;
        if (isDevMode && workingDirectory) {
            const directoryName = workingDirectory.split('/').pop() || workingDirectory;
            newTitle = `MiniDock | ${directoryName} | Mac Mini NAS Console`;
        } else {
            newTitle = DEFAULT_TITLE;
        }
        
        // 强制更新标题，确保在 Next.js 路由切换后也能正确显示
        if (document.title !== newTitle) {
            document.title = newTitle;
            prevTitleRef.current = newTitle;
        }
    }, [isDevMode, workingDirectory, loading]);
    
    useEffect(() => {
        // 立即更新
        updateTitle();
        
        // 使用多层延迟确保在 Next.js 路由切换完成后更新
        const rafId1 = requestAnimationFrame(() => {
            updateTitle();
            const rafId2 = requestAnimationFrame(() => {
                updateTitle();
            });
            return () => cancelAnimationFrame(rafId2);
        });
        
        // 使用 setTimeout 作为备用方案
        const timeoutId1 = setTimeout(() => {
            updateTitle();
        }, 0);
        
        const timeoutId2 = setTimeout(() => {
            updateTitle();
        }, 100);
        
        const timeoutId3 = setTimeout(() => {
            updateTitle();
        }, 300);
        
        // 使用 MutationObserver 监听标题变化，确保标题被覆盖后立即恢复
        if (isDevMode && workingDirectory) {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
            
            observerRef.current = new MutationObserver(() => {
                const expectedTitle = isDevMode && workingDirectory
                    ? `MiniDock | ${workingDirectory.split('/').pop() || workingDirectory} | Mac Mini NAS Console`
                    : DEFAULT_TITLE;
                
                if (document.title !== expectedTitle && !loading) {
                    document.title = expectedTitle;
                }
            });
            
            // 监听 document.title 的变化（通过监听 head 中的 title 元素）
            const titleElement = document.querySelector('title');
            if (titleElement) {
                observerRef.current.observe(titleElement, {
                    childList: true,
                    characterData: true,
                    subtree: true
                });
            }
        }
        
        // 使用轮询机制确保标题在路由切换后保持正确（仅在开发模式下）
        if (isDevMode && workingDirectory) {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            intervalRef.current = setInterval(() => {
                updateTitle();
            }, 500);
        }
        
        return () => {
            cancelAnimationFrame(rafId1);
            clearTimeout(timeoutId1);
            clearTimeout(timeoutId2);
            clearTimeout(timeoutId3);
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
            }
        };
    }, [updateTitle, pathname, isDevMode, workingDirectory, loading]);
    
    return null;
}

