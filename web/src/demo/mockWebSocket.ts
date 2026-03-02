type MetricsCallback = (metrics: {
    cpu: number;
    mem: number;
    netIn: number;
    netOut: number;
    cpuModel: string;
    memTotal: number;
    uptime: number;
}) => void;

type StatusCallback = (status: 'open' | 'closed') => void;

let intervalId: ReturnType<typeof setInterval> | null = null;
let uptimeBase = 86400 * 14; // 14 days uptime

// Random walk helper
function randomWalk(current: number, min: number, max: number, step: number): number {
    const delta = (Math.random() - 0.5) * 2 * step;
    return Math.min(max, Math.max(min, current + delta));
}

let cpuVal = 18;
let memVal = 62;
let netInVal = 1200;
let netOutVal = 450;

export function startMockWebSocket(onMetrics: MetricsCallback, onStatus: StatusCallback) {
    // Immediately mark as connected
    onStatus('open');

    // Emit metrics every 2 seconds
    intervalId = setInterval(() => {
        cpuVal = randomWalk(cpuVal, 5, 45, 3);
        memVal = randomWalk(memVal, 50, 75, 2);
        netInVal = randomWalk(netInVal, 200, 5000, 400);
        netOutVal = randomWalk(netOutVal, 100, 2000, 200);
        uptimeBase += 2;

        onMetrics({
            cpu: Math.round(cpuVal * 10) / 10,
            mem: Math.round(memVal * 10) / 10,
            netIn: Math.round(netInVal),
            netOut: Math.round(netOutVal),
            cpuModel: 'Apple M4',
            memTotal: 16 * 1024 * 1024 * 1024, // 16 GB
            uptime: uptimeBase,
        });
    }, 2000);
}

export function stopMockWebSocket() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
}

// Mock details data for StatsPanel (CPU/RAM per-process, network per-interface)
export function getMockDetails(type: string): { type: string; data: { name: string; value: string; in?: string; out?: string; total?: string }[] } {
    if (type === 'cpu') {
        return {
            type: 'cpu',
            data: [
                { name: 'kernel_task', value: (cpuVal * 0.3).toFixed(1) },
                { name: 'WindowServer', value: (cpuVal * 0.15).toFixed(1) },
                { name: 'docker', value: (cpuVal * 0.25).toFixed(1) },
                { name: 'qemu-system-aarch64', value: (cpuVal * 0.12).toFixed(1) },
                { name: 'MiniDock', value: (cpuVal * 0.05).toFixed(1) },
                { name: 'node', value: (cpuVal * 0.08).toFixed(1) },
                { name: 'mds_stores', value: (cpuVal * 0.03).toFixed(1) },
            ],
        };
    }
    if (type === 'mem') {
        return {
            type: 'mem',
            data: [
                { name: 'kernel_task', value: '12.5' },
                { name: 'docker', value: '18.3' },
                { name: 'qemu-system-aarch64', value: '8.2' },
                { name: 'WindowServer', value: '5.1' },
                { name: 'MiniDock', value: '3.4' },
                { name: 'Finder', value: '2.1' },
                { name: 'node', value: '4.8' },
            ],
        };
    }
    if (type === 'network') {
        return {
            type: 'network',
            data: [
                { name: 'en0 (Wi-Fi)', value: '0', in: String(Math.round(netInVal * 0.7)), out: String(Math.round(netOutVal * 0.7)), total: String(Math.round(netInVal * 0.7 + netOutVal * 0.7)) },
                { name: 'en1 (Ethernet)', value: '0', in: String(Math.round(netInVal * 0.3)), out: String(Math.round(netOutVal * 0.3)), total: String(Math.round(netInVal * 0.3 + netOutVal * 0.3)) },
                { name: 'lo0 (Loopback)', value: '0', in: '1024', out: '1024', total: '2048' },
            ],
        };
    }
    return { type, data: [] };
}
