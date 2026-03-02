"use client";

import { useState, useEffect } from "react";
import { DEMO_MODE } from "@/demo/demoConfig";
import { isClientAuthenticated } from '@/api/client';

const getWsUrl = () => {
    // 1. Always prioritize environment variable if available
    if (process.env.NEXT_PUBLIC_WS_URL) {
        return process.env.NEXT_PUBLIC_WS_URL;
    }

    // 2. Browser-side: always connect to same origin /ws endpoint
    // The frontend server (server.mjs) proxies /ws to the backend
    // This works for both HTTP and HTTPS, and with reverse proxies like Traefik
    if (typeof window !== 'undefined') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host; // includes port if non-standard
        return `${protocol}//${host}/ws`;
    }

    // Server-side fallback
    return "ws://localhost:23000/ws";
};

// Don't calculate WS_URL at module load time - it may run during SSR
// Calculate it dynamically in connect() function when window is available
let WS_URL: string | null = null;

// Global connection state
let socket: WebSocket | null = null;
let currentStatus: "connecting" | "open" | "closed" = "connecting";
let currentMetrics = { cpu: 0, mem: 0, netIn: 0, netOut: 0, cpuModel: '', memTotal: 0, uptime: 0 };
let currentDetails: { type: string, data: { name: string, value: string, in?: string, out?: string, total?: string }[] } | null = null;
export interface Instruction {
    id: string;
    command: string;
    fullCommand?: string;
    status: 'running' | 'success' | 'failure' | 'cancelled';
    startTime: string;
    endTime?: string;
    output: string;
    exitCode?: number;
    progress?: number;
}

let currentInstructions: Instruction[] = [];
let lastMessage: { event: string, data: string } | null = null;
let retryCount = 0;
let hasEverConnected = false;

const listeners = new Set<(data: {
    status: typeof currentStatus;
    metrics: typeof currentMetrics;
    details: typeof currentDetails;
    instructions: Instruction[];
    isInitialConnecting: boolean;
    retryCount: number;
    lastMessage: typeof lastMessage;
}) => void>();

function connect() {
    if (typeof window === 'undefined') return;

    // DEMO_INTEGRATION: use mock WebSocket, see web/src/demo/mockWebSocket.ts
    if (DEMO_MODE) {
        import('@/demo/mockWebSocket').then(({ startMockWebSocket }) => {
            startMockWebSocket(
                (metrics) => {
                    currentMetrics = metrics;
                    notify();
                },
                (status) => {
                    if (status === 'open') {
                        currentStatus = 'open';
                        hasEverConnected = true;
                        retryCount = 0;
                        notify();
                    }
                }
            );
        });
        return;
    }

    // Calculate WS_URL dynamically on each connection attempt (client-side only)
    if (!WS_URL) {
        WS_URL = getWsUrl();
    }

    // Clean up old socket if it exists and is in a closed state
    if (socket) {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            return; // Already connected or connecting
        }
        // Socket is closed, clean it up
        socket = null;
    }

    // This ensures "启动中" only shows on the very first connection attempt
    if (!hasEverConnected) {
        // connectionStartTime = Date.now();
    }

    // Skip connection if the user is not authenticated (no in-memory session token).
    // AuthContext calls reconnectWebSocket() after login to initiate the first connection.
    if (!isClientAuthenticated()) {
        return;
    }

    // Browser automatically sends the httpOnly session cookie with same-origin WebSocket connections.
    // No token in URL needed — keeping tokens out of URLs prevents exposure in server logs.
    socket = new WebSocket(WS_URL!);
    currentStatus = "connecting";
    notify();

    socket.onopen = () => {
        currentStatus = "open";
        hasEverConnected = true; // Mark that we've successfully connected
        retryCount = 0;
        notify();
    };

    socket.onmessage = async (event) => {
        // Handle both string and Blob data (WebSocket proxy may send as Blob)
        let rawData: string;
        if (typeof event.data === 'string') {
            rawData = event.data;
        } else if (event.data instanceof Blob) {
            rawData = await event.data.text();
        } else if (event.data instanceof ArrayBuffer) {
            rawData = new TextDecoder().decode(event.data);
        } else {
            console.error('[WebSocket] Unknown data type:', typeof event.data);
            return;
        }
        
        const colonIndex = rawData.indexOf(":");
        if (colonIndex === -1) return;

        const type = rawData.slice(0, colonIndex);
        const jsonStr = rawData.slice(colonIndex + 1);

        if (type === "system_metrics") {
            try {
                currentMetrics = JSON.parse(jsonStr);
                notify();
            } catch (e) {
                console.error("Failed to parse websocket metrics", e);
            }
        } else if (type === "system_details") {
            try {
                const details = JSON.parse(jsonStr);
                currentDetails = details;
                notify();
            } catch (e) {
                console.error("Failed to parse websocket details", e);
            }
        } else if (type === "instruction_started") {
            try {
                const inst = JSON.parse(jsonStr) as Instruction;
                currentInstructions = [inst, ...currentInstructions].slice(0, 50);
                notify();
            } catch (e) {
                console.error("Failed to parse instruction_started", e);
            }
        } else if (type === "instruction_finished") {
            try {
                const inst = JSON.parse(jsonStr) as Instruction;
                const index = currentInstructions.findIndex(i => i.id === inst.id);
                if (index !== -1) {
                    currentInstructions[index] = inst;
                } else {
                    currentInstructions = [inst, ...currentInstructions].slice(0, 50);
                }
                notify();
            } catch (e) {
                console.error("Failed to parse instruction_finished", e);
            }
        } else if (type === "instruction_output") {
            try {
                const inst = JSON.parse(jsonStr) as Instruction;
                const index = currentInstructions.findIndex(i => i.id === inst.id);
                if (index !== -1) {
                    currentInstructions[index] = inst;
                } else {
                    currentInstructions = [inst, ...currentInstructions].slice(0, 50);
                }
                notify();
            } catch (e) {
                console.error("Failed to parse instruction_output", e);
            }
        } else if (type === "instruction_progress") {
            try {
                const inst = JSON.parse(jsonStr) as Instruction;
                const index = currentInstructions.findIndex(i => i.id === inst.id);
                if (index !== -1) {
                    currentInstructions[index] = inst;
                } else {
                    currentInstructions = [inst, ...currentInstructions].slice(0, 50);
                }
                notify();
            } catch (e) {
                console.error("Failed to parse instruction_progress", e);
            }
        }

        // Update last message generic
        lastMessage = { event: type, data: jsonStr };
        notify();

        // Dispatch global event for other hooks that might not use this metrics state
        window.dispatchEvent(new CustomEvent(`minidock:${type}`, {
            detail: jsonStr
        }));
    };

    socket.onclose = () => {
        currentStatus = "closed";
        // Clean up the socket reference so we can reconnect properly
        socket = null;
        retryCount++;
        // Immediately notify with closed status so UI updates correctly
        notify();
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 30000);
        setTimeout(connect, delay);
    };

    socket.onerror = (err) => {
        console.error("WebSocket error", err);
        socket?.close();
    };
}

function sendRequest(type: string, payload: Record<string, unknown>) {
    // DEMO_INTEGRATION: return mock details instead of real WS request
    if (DEMO_MODE) {
        if (type === 'request_details') {
            import('@/demo/mockWebSocket').then(({ getMockDetails }) => {
                currentDetails = getMockDetails(payload.type as string);
                notify();
            });
        }
        return;
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ event: type, ...payload }));
    }
}

// Force reconnect (e.g. after login when token becomes available)
export function reconnectWebSocket() {
    if (socket) {
        socket.close();
        socket = null;
    }
    retryCount = 0;
    connect();
}

function notify() {
    // Only show "启动中" if:
    // 1. We've never successfully connected before, AND
    // 2. Current status is not open, AND
    // 3. It's been less than 60s since we started trying to connect
    // This prevents showing "启动中" when reconnecting after a successful connection
    // IMPORTANT: If status is 'closed' and we've connected before, we should show as offline, not initial connecting
    // 3. We haven't exceeded the max startup retries (approx 20 * 3s = 60s)
    // This allows for a deterministic "Starting..." state during the initial boot sequence
    const MAX_STARTUP_RETRIES = 20;
    const isInitialConnecting = !hasEverConnected &&
        currentStatus !== 'open' &&
        retryCount < MAX_STARTUP_RETRIES;

    listeners.forEach(listener => listener({
        status: currentStatus,
        metrics: currentMetrics,
        details: currentDetails,
        instructions: currentInstructions,
        isInitialConnecting,
        retryCount,
        lastMessage
    }));
}

export function useWebSocket() {
    const [state, setState] = useState({
        metrics: currentMetrics,
        details: currentDetails,
        instructions: currentInstructions,
        status: currentStatus,
        isInitialConnecting: !hasEverConnected && currentStatus !== 'open' && currentStatus !== 'closed',
        retryCount,
        lastMessage
    });

    useEffect(() => {
        const listener = (s: {
            status: typeof currentStatus;
            metrics: typeof currentMetrics;
            details: typeof currentDetails;
            instructions: Instruction[];
            isInitialConnecting: boolean;
            retryCount: number;
            lastMessage: typeof lastMessage;
        }) => {
            setState({
                status: s.status,
                metrics: s.metrics,
                details: s.details,
                instructions: s.instructions,
                isInitialConnecting: s.isInitialConnecting,
                retryCount: s.retryCount,
                lastMessage: s.lastMessage
            });
        };

        listeners.add(listener);

        // Immediately notify with current state
        notify();

        // Ensure connection is active
        connect();

        return () => {
            listeners.delete(listener);
        };
    }, []);

    return {
        metrics: state.metrics,
        details: state.details,
        instructions: state.instructions,
        status: state.status,
        isInitialConnecting: state.isInitialConnecting,
        retryCount: state.retryCount,
        lastMessage: state.lastMessage,
        sendRequest
    };
}
