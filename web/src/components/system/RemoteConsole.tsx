'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getBackendBaseUrl } from '@/api/client';

interface RemoteConsoleProps {
    title?: string;
    onClose?: () => void;
    // For host desktop, we don't need vmName
    isHost?: boolean;
    vmName?: string;
    customHost?: string;
    customPort?: number;
    password?: string;
    onConnected?: () => void;
}

export const RemoteConsole: React.FC<RemoteConsoleProps> = ({
    title,
    onClose,
    isHost = true,
    vmName,
    customHost,
    customPort,
    password,
    onConnected
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const lastStatusRef = useRef<string>('connecting');
    const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
    const onConnectedRef = useRef(onConnected);

    // Update ref when prop changes
    useEffect(() => {
        onConnectedRef.current = onConnected;
    }, [onConnected]);

    // Get Backend URL for WebSocket connections
    // WebSocket cannot be proxied, so we always use direct backend URL
    const getBackendUrl = useCallback(() => {
        return getBackendBaseUrl();
    }, []);

    // Build WebSocket URL
    const getWebSocketUrl = useCallback(() => {
        const backendUrl = getBackendUrl();
        const url = new URL(backendUrl);
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

        if (isHost) {
            let wsPath = `${protocol}//${url.host}/system/console/proxy`;
            const params = new URLSearchParams();
            if (customHost) {
                params.set('host', customHost);
                // Always include port if customHost is specified, even if it's 5900
                // This ensures the backend knows we want to connect to a specific host
                if (customPort) {
                    params.set('port', String(customPort));
                }
            } else if (customPort && customPort !== 5900) {
                // Only add port if no customHost and port is not default
                params.set('port', String(customPort));
            }
            const queryString = params.toString();
            if (queryString) {
                wsPath += `?${queryString}`;
            }
            return wsPath;
        } else {
            return `${protocol}//${url.host}/vms/services/${vmName}/console/proxy`;
        }
    }, [isHost, vmName, getBackendUrl, customHost, customPort]);

    // Build VNC Page URL
    const getVNCPageUrl = useCallback(() => {
        const wsUrl = getWebSocketUrl();
        const vmParam = isHost ? 'host' : (vmName || 'unknown');
        // Add resize=scale to ensure the remote desktop scales to fit the iframe/viewport
        // quality=6 and compression=2 provide a good balance for remote desktop
        let url = `/novnc/vnc.html?autoconnect=true&resize=scale&quality=6&compression=2&vm=${encodeURIComponent(vmParam)}&ws=${encodeURIComponent(wsUrl)}`;
        if (password) {
            url += `&password=${encodeURIComponent(password)}`;
        }
        
        return url;
    }, [isHost, vmName, getWebSocketUrl, password]);

    const disconnectVNC = useCallback(() => {
        if (iframeRef.current?.contentWindow) {
            const targetOrigin = window.location.origin;
            iframeRef.current.contentWindow.postMessage(
                { type: 'vnc-disconnect' },
                targetOrigin
            );
        }
    }, []);

    const handleMessage = useCallback((event: MessageEvent) => {
        if (iframeRef.current && event.source !== iframeRef.current.contentWindow) {
            return;
        }

        if (event.data?.type === 'vnc-status') {
            const { status: newStatus, message } = event.data;

            if (newStatus === 'credentials-required') {
                if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
                // We do NOT treat this as fully connected for history purpose yet
                // The user still needs to enter password (if not provided/wrong)
                // But we set UI to connected so the iframe is visible (showing the auth dialog)
                setStatus('connected');
                setErrorMessage(null);
                lastStatusRef.current = newStatus;
                return;
            }

            if (newStatus === 'disconnected' || newStatus === 'error') {
                // Give it a small grace period to see if it auto-reconnects or changes state
                // This prevents the error UI from flashing during handshakes
                // noVNC will handle auto-reconnect, so we wait a bit before showing error
                if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
                retryTimerRef.current = setTimeout(() => {
                    // Only show error if still disconnected after grace period
                    // This allows noVNC's auto-reconnect to work
                    if (lastStatusRef.current === 'disconnected' || lastStatusRef.current === 'error') {
                        setStatus(newStatus);
                        if (newStatus === 'error') {
                            setErrorMessage(message || 'VNC connection error');
                        }
                    }
                }, 3000); // 3s grace period to allow auto-reconnect
            } else {
                if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
                // If transitioning to connected for the first time
                if (newStatus === 'normal' || newStatus === 'connected') {
                    if (lastStatusRef.current !== 'connected' && lastStatusRef.current !== 'normal') {
                        onConnectedRef.current?.();
                    }
                }

                setStatus(newStatus === 'normal' ? 'connected' : newStatus);
                setErrorMessage(null);

                // Auto-focus the iframe when connected
                if (newStatus === 'normal' || newStatus === 'connected') {
                    setTimeout(() => {
                        iframeRef.current?.focus();
                    }, 500);
                }
            }
            lastStatusRef.current = newStatus;
        }
    }, []);

    // Lifecycle: Message Listener & Cleanup
    useEffect(() => {
        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('message', handleMessage);
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            disconnectVNC();
        };
    }, [handleMessage, disconnectVNC]);

    // Connection Timeout Handler
    useEffect(() => {
        let connectionTimeout: NodeJS.Timeout | null = null;
        if (status === 'connecting') {
            connectionTimeout = setTimeout(() => {
                if (status === 'connecting') {
                    console.warn('[RemoteConsole] Connection timeout hit');
                    setStatus('error');
                    setErrorMessage('连接超时。请确保宿主机已开启「屏幕共享」，并检查网络连接。');
                }
            }, 15000); // 15s timeout (increased from 10s)
        }
        return () => {
            if (connectionTimeout) clearTimeout(connectionTimeout);
        };
    }, [status]);

    // UI Helpers: Fullscreen
    useEffect(() => {
        const handleFullscreenChange = () => {
            const isNowFullscreen = !!document.fullscreenElement;
            setIsFullscreen(isNowFullscreen);
            if (isNowFullscreen) {
                // Focus iframe immediately when entering fullscreen
                iframeRef.current?.focus();
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, []);

    const handleSendCtrlAltDel = useCallback(() => {
        if (iframeRef.current?.contentWindow) {
            const targetOrigin = window.location.origin;
            iframeRef.current.contentWindow.postMessage(
                { type: 'vnc-ctrl-alt-del' },
                targetOrigin
            );
        }
    }, []);

    const toggleFullscreen = useCallback(async () => {
        if (!containerRef.current) return;
        try {
            if (!document.fullscreenElement) {
                await containerRef.current.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch (err) {
            console.error(`Error toggling fullscreen: ${err}`);
        }
    }, []);

    const handleRetry = useCallback(() => {
        setStatus('connecting');
        setErrorMessage(null);
        if (iframeRef.current) {
            iframeRef.current.src = getVNCPageUrl();
        }
    }, [getVNCPageUrl]);

    return (
        <div
            ref={containerRef}
            className={`flex flex-col bg-[#050505] transition-all duration-700 group overflow-hidden relative ${isFullscreen ? 'fixed inset-0 z-[100]' : 'w-full flex-1 h-[75vh] min-h-[600px] rounded-[inherit] border border-white/10 shadow-[0_32px_128px_-32px_rgba(0,0,0,0.8)]'}`}
            onClick={() => {
                // Ensure iframe is focused when user clicks the console area
                if (status === 'connected') {
                    iframeRef.current?.focus();
                }
            }}
        >
            {/* Toolbar */}
            <div className={`flex items-center justify-between bg-white/[0.04] border-b border-white/[0.08] px-8 py-5 backdrop-blur-3xl transition-all duration-500 ease-in-out pointer-events-auto ${isFullscreen ? 'hidden' : 'relative'}`}>
                <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-sm tracking-tight">{title || (isHost ? "macOS Desktop" : `${vmName} Console`)}</h3>
                        <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${status === 'connected' ? 'bg-emerald-500' : status === 'connecting' ? 'bg-amber-500' : 'bg-red-500'}`} />
                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{status}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {status === 'connected' && (
                        <button
                            onClick={handleSendCtrlAltDel}
                            className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold text-gray-400 hover:text-white hover:bg-white/10 transition-all uppercase tracking-wider"
                        >
                            Ctrl+Alt+Del
                        </button>
                    )}
                    <button
                        onClick={toggleFullscreen}
                        className="p-2 text-gray-400 hover:text-white transition-all hover:scale-110 active:scale-90"
                        title={isFullscreen ? '退出全屏' : '全屏显示'}
                    >
                        {isFullscreen ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 9L4 4m0 0v4m0-4h4m12 0l-5 5m5-5v4m0-4h-4M4 20l5-5m-5 5v-4m0 4h4m11 0l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                        )}
                    </button>
                    {onClose && (
                        <>
                            <div className="w-[1px] h-6 bg-white/10 mx-2" />
                            <button
                                onClick={onClose}
                                className="p-2.5 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-2xl transition-all active:scale-90 shadow-lg shadow-red-500/10"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Canvas Container */}
            <div className="flex-1 overflow-hidden relative min-h-0 flex flex-col rounded-[inherit]">
                <iframe
                    ref={iframeRef}
                    src={getVNCPageUrl()}
                    className="w-full border-0 flex-1 min-h-0 rounded-[inherit]"
                    allow="clipboard-read; clipboard-write; fullscreen"
                    title="VNC Console"
                />

                {status === 'connecting' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
                        <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4" />
                        <span className="text-white font-bold text-sm tracking-widest uppercase">Initializing VNC Bridge...</span>
                    </div>
                )}

                {(status === 'error' || status === 'disconnected') && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md px-6 text-center">
                        <div className="w-16 h-16 rounded-3xl bg-red-500/10 flex items-center justify-center text-red-500 mb-6 border border-red-500/20">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h2 className="text-white text-xl font-bold mb-2">Connection Problem</h2>
                        <p className="text-gray-500 text-sm mb-8 max-w-sm">
                            {customHost && customHost !== '127.0.0.1'
                                ? (errorMessage || `无法连接至远程主机 ${customHost}。请检查 IP 地址是否正确，且目标主机已开启 VNC 服务。`)
                                : (isHost
                                    ? "无法连接到 macOS 屏幕共享。请确保已在「系统设置 > 共享」中开启屏幕共享，并且没有被其他客户端占用。"
                                    : (errorMessage || 'The VNC bridge was closed or the VM is not responding.'))}
                        </p>
                        <button
                            onClick={handleRetry}
                            className="px-8 py-3 bg-white text-black font-bold rounded-2xl hover:bg-blue-500 hover:text-white transition-all active:scale-95"
                        >
                            Retry Connection
                        </button>
                    </div>
                )}
            </div>

            {/* Small Indicator */}
            <div className="absolute bottom-4 right-6 pointer-events-none opacity-20 group-hover:opacity-100 transition-opacity">
                <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] font-medium">MiniDock VNC Bridge</p>
            </div>
        </div>
    );
};
