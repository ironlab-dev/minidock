import {
    mockServices,
    mockDockerServices,
    mockDockerItems,
    mockVMServices,
    mockVMItems,
    mockAutomationTasks,
    mockSettings,
    mockIPInfo,
    mockDevInfo,
    mockScreenSharing,
    mockFiles,
    mockAuthMe,
    mockAuthPolicy,
    mockGitopsDefaults,
    mockContainerLogs,
    mockTailscaleStatus,
    mockTailscaleInstalled,
    mockHardwareInfo,
    mockUsers,
    mockDockerServiceFiles,
    mockDockerComposeFiles,
    mockSolutions,
    mockSolutionDetail,
    mockDeploymentProgress,
    mockPreflightResult,
} from './mockData';

type ToastFn = (toast: { type: 'info'; message: string }) => void;

let toastFn: ToastFn | null = null;

export function setDemoToastFn(fn: ToastFn) {
    toastFn = fn;
}

function showDemoToast() {
    if (toastFn) {
        toastFn({ type: 'info', message: 'This action is disabled in demo mode' });
    }
}

function delay(): Promise<void> {
    const ms = 150 + Math.random() * 300;
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function resolveMockRequest<T>(
    endpoint: string,
    method: string,
    _body?: unknown
): Promise<T> {
    void _body;
    await delay();

    // Pattern-match endpoint to mock data
    const path = endpoint.replace(/\?.*$/, ''); // strip query params

    if (method !== 'GET') {
        // Allow path update to return mock deployment so UI updates correctly
        if (method === 'PUT' && path.match(/^\/solutions\/[^/]+\/paths$/)) {
            showDemoToast();
            return (mockSolutionDetail.deployment || {}) as T;
        }
        showDemoToast();
        return {} as T;
    }

    // Auth
    if (path === '/auth/me') return mockAuthMe as T;
    if (path === '/auth/policy') return mockAuthPolicy as T;

    // Services
    if (path === '/services') return mockServices as T;

    // Docker
    if (path === '/docker/services') return mockDockerServices as T;
    if (path === '/services/docker-engine/items') return mockDockerItems as T;
    if (path.match(/^\/services\/docker-engine\/items\/[^/]+\/logs/)) {
        return { content: mockContainerLogs } as T;
    }
    if (path.match(/^\/services\/docker-engine\/items\/[^/]+$/)) {
        const itemId = path.split('/').pop()!;
        const item = mockDockerItems.find(i => i.id === itemId);
        if (item) {
            const inspectData = {
                Id: item.id,
                Name: `/${item.name}`,
                State: { Status: item.status === 'running' ? 'running' : 'exited', Running: item.status === 'running', Pid: item.status === 'running' ? 12345 : 0 },
                Config: {
                    Image: item.metadata.image,
                    Env: ['TZ=Asia/Shanghai', 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'],
                    Labels: { 'com.docker.compose.project': item.metadata.service_name },
                },
                NetworkSettings: {
                    IPAddress: '172.17.0.' + (mockDockerItems.indexOf(item) + 2),
                    Ports: item.metadata.ports ? Object.fromEntries(
                        item.metadata.ports.split(', ').filter(Boolean).map(p => {
                            const match = p.match(/(?:(\d+\.\d+\.\d+\.\d+):)?(\d+)->(\d+\/\w+)/);
                            if (match) return [match[3], [{ HostIp: match[1] || '0.0.0.0', HostPort: match[2] }]];
                            return [p, null];
                        }).filter(([, v]) => v !== null)
                    ) : {},
                },
                Mounts: [
                    { Source: `/opt/minidock/docker/${item.metadata.service_name}/data`, Destination: '/data', Mode: 'rw', RW: true },
                ],
            };
            return { raw: JSON.stringify(inspectData) } as T;
        }
        return { raw: '{}' } as T;
    }
    if (path.match(/^\/docker\/services\/[^/]+\/files$/)) {
        const name = path.split('/')[3];
        const fileParam = endpoint.match(/[?&]file=([^&]*)/);
        if (fileParam) {
            // Read file content
            const fileName = decodeURIComponent(fileParam[1]);
            if (fileName === 'docker-compose.yml' || fileName.endsWith('/docker-compose.yml')) {
                return { content: mockDockerComposeFiles[name] || `# ${name} docker-compose.yml\n` } as T;
            }
            if (fileName === '.env' || fileName.endsWith('/.env')) {
                return { content: `# Environment variables for ${name}\nTZ=Asia/Shanghai\n` } as T;
            }
            return { content: `# ${fileName}\n` } as T;
        }
        // List directory
        return (mockDockerServiceFiles[name] || [{ name: 'docker-compose.yml', type: 'file', size: 256 }]) as T;
    }
    if (path.match(/^\/docker\/services\/[^/]+\/validate\/file$/)) return { valid: true } as T;
    if (path.match(/^\/docker\/services\/[^/]+\/logs/)) return { content: mockContainerLogs } as T;
    if (path.match(/^\/docker\/services\/[^/]+\/history/)) return [] as T;
    if (path.match(/^\/docker\/services\/[^/]+$/)) {
        const name = path.split('/').pop()!;
        const svc = mockDockerServices.find(s => s.directoryName === name || s.name === name);
        return (svc || {}) as T;
    }

    // VMs
    if (path === '/vms/services') return mockVMServices as T;
    if (path === '/services/utm-vms/items') return mockVMItems as T;
    if (path.match(/^\/vms\/services\/[^/]+\/config$/)) return { content: '# VM configuration\n' } as T;
    if (path.match(/^\/vms\/services\/[^/]+\/history$/)) return [] as T;
    if (path.match(/^\/vms\/services\/[^/]+\/logs/)) return { content: mockContainerLogs } as T;

    // Automation
    if (path === '/automation/tasks') return mockAutomationTasks as T;

    // Settings
    if (path === '/settings') return mockSettings as T;
    if (path === '/settings/gitops-defaults') return mockGitopsDefaults as T;

    // System
    if (path === '/system/ip-info') return mockIPInfo as T;
    if (path === '/system/dev-info') return mockDevInfo as T;
    if (path === '/system/screensharing') return mockScreenSharing as T;

    // Environment
    if (path === '/system/environment') return [
        { name: 'brew', isInstalled: true, version: '4.4.1', path: '/opt/homebrew/bin/brew' },
        { name: 'docker', isInstalled: true, version: '27.4.0', path: '/usr/local/bin/docker' },
        { name: 'qemu', isInstalled: true, version: '9.2.0', path: '/opt/homebrew/bin/qemu-system-aarch64' },
        { name: 'node', isInstalled: true, version: '22.12.0', path: '/opt/homebrew/bin/node' },
    ] as T;
    if (path.match(/^\/system\/dev\/build-info/)) return { buildHash: 'demo', buildDate: '2026-02-09' } as T;

    // Files
    if (path === '/files' || path.startsWith('/files')) return mockFiles as T;

    // SSH/Connectivity
    if (path === '/ssh/keys') return [] as T;
    if (path.match(/^\/services\/ssh-manager/)) {
        return { status: 'running', stats: { external_ip: '203.0.113.42', external_host: 'nas.example.com', external_ssh_port: '22', external_vnc_port: '5900' } } as T;
    }

    // Remote Access (Tailscale)
    if (path === '/remote/status') return mockTailscaleStatus as T;
    if (path === '/remote/installed') return mockTailscaleInstalled as T;

    // Hardware Info
    if (path.match(/^\/services\/system-core\/hardware\//)) {
        const type = path.split('/').pop()!;
        return (mockHardwareInfo[type] || { [type]: [] }) as T;
    }

    // Boot config
    if (path === '/boot/config') return { groups: [], services: [] } as T;
    if (path === '/system/boot-config') return [] as T;

    // Admin
    if (path === '/admin/users') return mockUsers as T;

    // Disks
    if (path === '/disks') return [] as T;
    if (path === '/raid' || path === '/raids') return [] as T;

    // Solutions
    if (path === '/solutions') return mockSolutions as T;
    if (path.match(/^\/solutions\/[^/]+\/preflight$/)) return mockPreflightResult as T;
    if (path.match(/^\/solutions\/[^/]+\/status$/)) return mockDeploymentProgress as T;
    if (path.match(/^\/solutions\/[^/]+$/)) return mockSolutionDetail as T;

    // Fallback
    console.warn(`[DemoClient] Unhandled GET: ${path}`);
    return {} as T;
}
