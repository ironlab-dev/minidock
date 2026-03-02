"use client";

import { useEffect, useState } from 'react';

interface ProgressBarProps {
    isLoading: boolean;
    isRefreshing?: boolean;
}

export function ProgressBar({ isLoading, isRefreshing = false }: ProgressBarProps) {
    const [progress, setProgress] = useState(0);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isLoading || isRefreshing) {
            setIsVisible(true);
            // 使用不确定进度条（indeterminate），更符合 HIG 规范
            // 从 0 开始，逐渐增加到 90%，然后保持
            setProgress(0);
            const startTime = Date.now();
            const interval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                // 前 1 秒快速增加到 50%，然后缓慢增加到 90%
                if (elapsed < 1000) {
                    setProgress(prev => Math.min(prev + 2, 50));
                } else {
                    setProgress(prev => Math.min(prev + 0.5, 90));
                }
            }, 50); // 更频繁的更新以获得更平滑的动画
            return () => {
                clearInterval(interval);
            };
        } else {
            // 完成时快速到 100%，然后隐藏
            // 只有在进度条可见时才执行完成动画
            if (isVisible) {
                setProgress(100);
                const timer = setTimeout(() => {
                    setIsVisible(false);
                    setProgress(0);
                }, 300);
                return () => {
                    clearTimeout(timer);
                };
            } else {
                // 如果进度条已经不可见，直接重置进度
                setProgress(0);
            }
        }
    }, [isLoading, isRefreshing, isVisible]);

    if (!isVisible) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-[9999] h-0.5 bg-transparent">
            <div
                className="h-full bg-gradient-to-r from-brand-blue via-brand-purple to-brand-blue transition-all duration-300 ease-out shadow-lg shadow-brand-blue/50"
                style={{
                    width: `${Math.min(progress, 100)}%`,
                    transition: isLoading || isRefreshing 
                        ? 'width 0.2s ease-out' 
                        : 'width 0.3s ease-out'
                }}
            />
        </div>
    );
}

