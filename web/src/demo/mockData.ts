import { DEMO_USER } from './demoConfig';

// ── Services ──

export const mockServices = [
    {
        id: 'system-core',
        name: 'System Core',
        type: 'system',
        status: 'running',
        items: [],
        itemCount: 0,
    },
    {
        id: 'docker-engine',
        name: 'Docker Engine',
        type: 'docker',
        status: 'running',
        items: [],
        itemCount: 7,
    },
    {
        id: 'utm-vms',
        name: 'Virtual Machines',
        type: 'vm',
        status: 'running',
        items: [],
        itemCount: 2,
    },
];

// ── Docker ──

export const mockDockerServices = [
    { name: 'nginx-proxy', directoryName: 'nginx-proxy', isManaged: true, isRunning: true, expectedImage: 'jwilder/nginx-proxy:latest', actualImage: 'jwilder/nginx-proxy:latest' },
    { name: 'postgres', directoryName: 'postgres', isManaged: true, isRunning: true, expectedImage: 'postgres:16-alpine', actualImage: 'postgres:16-alpine' },
    { name: 'redis', directoryName: 'redis', isManaged: true, isRunning: true, expectedImage: 'redis:7-alpine', actualImage: 'redis:7-alpine' },
    { name: 'jellyfin', directoryName: 'jellyfin', isManaged: true, isRunning: true, expectedImage: 'jellyfin/jellyfin:latest', actualImage: 'jellyfin/jellyfin:latest' },
    { name: 'homebridge', directoryName: 'homebridge', isManaged: true, isRunning: false, expectedImage: 'homebridge/homebridge:latest', actualImage: 'homebridge/homebridge:latest' },
    { name: 'portainer', directoryName: 'portainer', isManaged: false, isRunning: true },
    { name: 'watchtower', directoryName: 'watchtower', isManaged: false, isRunning: true },
];

export const mockDockerItems = [
    { id: 'abc1234567', name: 'nginx-proxy', status: 'running', metadata: { image: 'jwilder/nginx-proxy:latest', ports: '0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp', created: '2025-12-15T10:30:00Z', uptime: '3 weeks', service_name: 'nginx-proxy', is_managed: 'true' } },
    { id: 'def2345678', name: 'postgres', status: 'running', metadata: { image: 'postgres:16-alpine', ports: '5432/tcp', created: '2025-12-10T08:00:00Z', uptime: '4 weeks', service_name: 'postgres', is_managed: 'true' } },
    { id: 'ghi3456789', name: 'redis', status: 'running', metadata: { image: 'redis:7-alpine', ports: '6379/tcp', created: '2025-12-10T08:00:00Z', uptime: '4 weeks', service_name: 'redis', is_managed: 'true' } },
    { id: 'jkl4567890', name: 'jellyfin', status: 'running', metadata: { image: 'jellyfin/jellyfin:latest', ports: '0.0.0.0:8096->8096/tcp', created: '2026-01-05T14:20:00Z', uptime: '1 week', service_name: 'jellyfin', is_managed: 'true' } },
    { id: 'service:homebridge', name: 'homebridge', status: 'not_started', metadata: { image: 'homebridge/homebridge:latest', ports: '', created: '2026-01-20T09:15:00Z', service_name: 'homebridge', is_managed: 'true' } },
    { id: 'mno5678901', name: 'portainer', status: 'running', metadata: { image: 'portainer/portainer-ce:latest', ports: '0.0.0.0:9443->9443/tcp', created: '2025-11-01T12:00:00Z', uptime: '2 months', service_name: 'portainer', is_external: 'true' } },
    { id: 'pqr6789012', name: 'watchtower', status: 'running', metadata: { image: 'containrrr/watchtower:latest', ports: '', created: '2025-11-01T12:00:00Z', uptime: '2 months', service_name: 'watchtower', is_external: 'true' } },
];

// ── VMs ──

export const mockVMServices = [
    {
        name: 'Ubuntu Server 24.04',
        directoryName: 'ubuntu-server',
        uuid: 'vm-001-uuid',
        architecture: 'aarch64',
        isRunning: true,
        path: '/opt/minidock/vms/ubuntu-server',
        ipAddress: '192.168.64.3',
        cpuUsage: '12%',
        memoryUsage: '1.2 GB',
        isManaged: true,
    },
    {
        name: 'Debian 12',
        directoryName: 'debian-12',
        uuid: 'vm-002-uuid',
        architecture: 'aarch64',
        isRunning: false,
        path: '/opt/minidock/vms/debian-12',
        isManaged: true,
    },
];

export const mockVMItems = [
    { id: 'vm-001-uuid', name: 'Ubuntu Server 24.04', status: 'running', metadata: { arch: 'aarch64', ram: '4096', cpuCount: '4', directoryName: 'ubuntu-server' } },
    { id: 'vm-002-uuid', name: 'Debian 12', status: 'stopped', metadata: { arch: 'aarch64', ram: '2048', cpuCount: '2', directoryName: 'debian-12' } },
];

// ── Automation ──

export const mockAutomationTasks = [
    {
        id: 'task-001',
        name: 'Daily Backup',
        triggerType: 'cron',
        cronExpression: '0 3 * * *',
        scriptType: 'shell',
        scriptContent: '#!/bin/bash\nrsync -avz /opt/minidock/ /Volumes/Backup/minidock/',
        isEnabled: true,
        lastRunAt: '2026-02-08T03:00:00Z',
    },
    {
        id: 'task-002',
        name: 'Docker Cleanup',
        triggerType: 'cron',
        cronExpression: '0 4 * * 0',
        scriptType: 'shell',
        scriptContent: '#!/bin/bash\ndocker system prune -af --volumes',
        isEnabled: true,
        lastRunAt: '2026-02-02T04:00:00Z',
    },
    {
        id: 'task-003',
        name: 'SSL Renewal',
        triggerType: 'cron',
        cronExpression: '0 0 1 * *',
        scriptType: 'python',
        scriptContent: '#!/usr/bin/env python3\nimport subprocess\nsubprocess.run(["certbot", "renew", "--quiet"])',
        isEnabled: false,
    },
];

// ── Settings ──

export const mockSettings = [
    { id: 'setting-001', key: 'NOTIFICATION_WEBHOOK', value: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxx', category: 'notification', isSecret: true },
    { id: 'setting-002', key: 'DOCKER_COMPOSE_PATH', value: '/opt/minidock/docker', category: 'docker', isSecret: false },
    { id: 'setting-003', key: 'VM_CONFIG_PATH', value: '/opt/minidock/vms', category: 'vm', isSecret: false },
    { id: 'setting-004', key: 'AUTO_UPDATE', value: 'true', category: 'system', isSecret: false },
    { id: 'setting-005', key: 'SOLUTION_CUSTOM_URLS', value: '{}', category: 'custom', isSecret: false },
];

// ── System ──

export const mockIPInfo = {
    localIP: '192.168.1.100',
    publicIP: '203.0.113.42',
    publicIPDomestic: '203.0.113.42',
    publicIPOverseas: '203.0.113.42',
    localIPs: [
        { device: 'en0', name: 'Wi-Fi', address: '192.168.1.100' },
        { device: 'en1', name: 'Ethernet', address: '192.168.1.101' },
    ],
};

export const mockDevInfo = {
    isDevMode: false,
    workingDirectory: '',
};

export const mockScreenSharing = {
    enabled: true,
    listening: true,
    processName: 'screensharingd',
    primaryIP: '192.168.1.100',
};

// ── Files ──

export const mockFiles = [
    { name: 'docker', type: 'directory', size: 0, modified: '2026-02-08T10:00:00Z', permissions: 'drwxr-xr-x' },
    { name: 'vms', type: 'directory', size: 0, modified: '2026-02-07T15:30:00Z', permissions: 'drwxr-xr-x' },
    { name: 'backups', type: 'directory', size: 0, modified: '2026-02-08T03:00:00Z', permissions: 'drwxr-xr-x' },
    { name: 'README.md', type: 'file', size: 2048, modified: '2026-01-15T12:00:00Z', permissions: '-rw-r--r--' },
    { name: 'docker-compose.yml', type: 'file', size: 4096, modified: '2026-02-06T09:45:00Z', permissions: '-rw-r--r--' },
];

// ── Auth ──

export const mockAuthMe = {
    user: DEMO_USER,
};

export const mockAuthPolicy = {
    canRegister: false,
};

// ── GitOps ──

export const mockGitopsDefaults = {
    autoCommit: true,
    autoRestore: false,
    branch: 'main',
};

// ── Remote Access (Tailscale) ──

export const mockTailscaleStatus = {
    BackendState: 'Running',
    Self: {
        ID: 'node-demo-001',
        HostName: 'minidock-nas',
        DNSName: 'minidock-nas.tail1234.ts.net.',
        TailscaleIPs: ['100.100.1.1', 'fd7a:115c:a1e0::1'],
        Online: true,
        Relay: '',
        CurAddr: '192.168.1.100:41641',
        RxBytes: 1048576,
        TxBytes: 524288,
    },
    Peer: {},
    Health: [],
    MagicDNSSuffix: 'tail1234.ts.net',
};

export const mockTailscaleInstalled = {
    installed: true,
    path: '/Applications/Tailscale.app',
    daemonRunning: true,
};

// ── Hardware Info ──

export const mockHardwareInfo: Record<string, Record<string, unknown[]>> = {
    SPHardwareDataType: { SPHardwareDataType: [{ _name: 'Hardware Overview', machine_model: 'Mac mini', machine_name: 'Mac mini', model_number: 'A2686', chip_type: 'Apple M4', number_processors: 'proc 10:4:6', memory: '16 GB', os_loader_version: '11881.41.6', serial_number: 'DEMO12345678', platform_UUID: 'DEMO-UUID-0001' }] },
    SPNetworkDataType: { SPNetworkDataType: [{ _name: 'Wi-Fi', interface: 'en0', ip_address: ['192.168.1.100'], subnet_mask: ['255.255.255.0'], hardware: 'AirPort', type: 'AirPort', media_subtype: 'autoselect' }, { _name: 'Ethernet', interface: 'en1', ip_address: ['192.168.1.101'], subnet_mask: ['255.255.255.0'], hardware: 'Ethernet', type: 'Ethernet' }] },
    SPUSBDataType: { SPUSBDataType: [] },
    SPThunderboltDataType: { SPThunderboltDataType: [{ _name: 'Thunderbolt Bus', device_name_key: 'Thunderbolt 4', domain_uuid: 'DEMO-TB4-UUID', route_string: '0', switch_uid: 'DEMO-SWITCH' }] },
    SPPowerDataType: { SPPowerDataType: [{ _name: 'AC Charger Information', charging: 'No', connected: 'Yes', wattage: '0W' }] },
    SPStorageDataType: { SPStorageDataType: [{ _name: 'Macintosh HD', mount_point: '/', free_space_in_bytes: 214748364800, size_in_bytes: 494384795648, file_system: 'APFS', physical_drive: { device_name: 'APPLE SSD AP0512R', medium_type: 'SSD', protocol: 'Apple Fabric' } }] },
    SPMemoryDataType: { SPMemoryDataType: [{ _name: 'Memory', dimm_manufacturer: 'Apple', dimm_type: 'LPDDR5', global_ecc_state: 'ecc_disabled', is_memory_upgradeable: 'No', memory_size: '16 GB' }] },
    SPDisplaysDataType: { SPDisplaysDataType: [{ _name: 'Apple M4', sppci_model: 'Apple M4', spdisplays_vendor: 'sppci_vendor_apple', spdisplays_vram: '16 GB', spdisplays_metal_supported: 'spdisplays_metal_supported' }] },
};

// ── Admin ──

export const mockUsers = [
    { id: 'user-001', username: 'admin', role: 'admin', createdAt: '2025-12-01T00:00:00Z' },
    { id: 'user-002', username: 'demo', role: 'admin', createdAt: '2026-02-01T00:00:00Z' },
];

// ── Docker Service Files ──

export const mockDockerServiceFiles: Record<string, { name: string; type: string; size: number }[]> = {
    'nginx-proxy': [
        { name: 'docker-compose.yml', type: 'file', size: 512 },
        { name: '.env', type: 'file', size: 128 },
        { name: 'config', type: 'directory', size: 0 },
    ],
    'postgres': [
        { name: 'docker-compose.yml', type: 'file', size: 480 },
        { name: '.env', type: 'file', size: 256 },
        { name: 'data', type: 'directory', size: 0 },
    ],
    'redis': [
        { name: 'docker-compose.yml', type: 'file', size: 320 },
        { name: 'redis.conf', type: 'file', size: 1024 },
    ],
    'jellyfin': [
        { name: 'docker-compose.yml', type: 'file', size: 600 },
        { name: 'config', type: 'directory', size: 0 },
        { name: 'media', type: 'directory', size: 0 },
    ],
    'homebridge': [
        { name: 'docker-compose.yml', type: 'file', size: 420 },
        { name: 'config', type: 'directory', size: 0 },
    ],
};

export const mockDockerComposeFiles: Record<string, string> = {
    'nginx-proxy': `version: "3.8"

services:
  nginx-proxy:
    image: jwilder/nginx-proxy:latest
    container_name: nginx-proxy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/tmp/docker.sock:ro
      - ./certs:/etc/nginx/certs
      - ./vhost.d:/etc/nginx/vhost.d
      - ./html:/usr/share/nginx/html
    restart: unless-stopped
`,
    'postgres': `version: "3.8"

services:
  postgres:
    image: postgres:16-alpine
    container_name: postgres
    environment:
      POSTGRES_USER: \${POSTGRES_USER:-admin}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_DB: \${POSTGRES_DB:-minidock}
    ports:
      - "5432:5432"
    volumes:
      - ./data:/var/lib/postgresql/data
    restart: unless-stopped
`,
    'redis': `version: "3.8"

services:
  redis:
    image: redis:7-alpine
    container_name: redis
    command: redis-server /usr/local/etc/redis/redis.conf
    ports:
      - "6379:6379"
    volumes:
      - ./redis.conf:/usr/local/etc/redis/redis.conf
      - ./data:/data
    restart: unless-stopped
`,
    'jellyfin': `version: "3.8"

services:
  jellyfin:
    image: jellyfin/jellyfin:latest
    container_name: jellyfin
    ports:
      - "8096:8096"
    volumes:
      - ./config:/config
      - ./media:/media
    environment:
      - TZ=Asia/Shanghai
    restart: unless-stopped
`,
    'homebridge': `version: "3.8"

services:
  homebridge:
    image: homebridge/homebridge:latest
    container_name: homebridge
    network_mode: host
    volumes:
      - ./config:/homebridge
    environment:
      - TZ=Asia/Shanghai
    restart: unless-stopped
`,
};

// ── Container/VM Logs ──

export const mockContainerLogs = `[2026-02-08 10:00:01] Starting service...
[2026-02-08 10:00:02] Configuration loaded successfully
[2026-02-08 10:00:03] Listening on port 8080
[2026-02-08 10:00:15] Health check passed
[2026-02-08 10:05:00] Request processed in 12ms
[2026-02-08 10:10:00] Request processed in 8ms
[2026-02-08 10:15:00] Health check passed`;

// ── Solutions ──

export const mockSolutions = [
    {
        id: 'media-center',
        name: '影音中心',
        description: '一站式家庭影院套件：Jellyfin 原生硬件转码 + 自动化影视管理',
        icon: 'media-center',
        category: 'media',
        componentCount: 7,
        status: 'running',
        available: true,
        runningCount: 5,
        totalCount: 5,
    },
    {
        id: 'photo-album',
        name: '智能相册',
        description: 'AI 驱动的照片管理与分享平台',
        icon: 'photo-album',
        category: 'media',
        componentCount: 0,
        status: 'not_installed',
        available: false,
        runningCount: 0,
        totalCount: 0,
    },
    {
        id: 'smart-home',
        name: '智能家居',
        description: 'Home Assistant 全屋智能控制中心',
        icon: 'smart-home',
        category: 'automation',
        componentCount: 0,
        status: 'not_installed',
        available: false,
        runningCount: 0,
        totalCount: 0,
    },
];

export const mockSolutionDetail = {
    definition: {
        id: 'media-center',
        name: '影音中心',
        description: '一站式家庭影院套件：Jellyfin 原生硬件转码 + 自动化影视管理',
        icon: 'media-center',
        category: 'media',
        available: true,
        components: [
            { id: 'jellyfin', name: 'Jellyfin', description: 'Media server with hardware-accelerated transcoding via VideoToolbox', icon: 'jellyfin', type: 'native', tier: 'core', required: true, defaultPort: 8096, webUIPath: '/', estimatedRam: 512, estimatedDisk: 200, dockerImage: null, nativeAppName: 'Jellyfin' },
            { id: 'sonarr', name: 'Sonarr', description: 'TV series management and automatic downloading', icon: 'sonarr', type: 'docker', tier: 'recommended', required: false, defaultPort: 8989, webUIPath: '/', estimatedRam: 256, estimatedDisk: 100, dockerImage: 'linuxserver/sonarr', nativeAppName: null },
            { id: 'radarr', name: 'Radarr', description: 'Movie collection management and automatic downloading', icon: 'radarr', type: 'docker', tier: 'recommended', required: false, defaultPort: 7878, webUIPath: '/', estimatedRam: 256, estimatedDisk: 100, dockerImage: 'linuxserver/radarr', nativeAppName: null },
            { id: 'prowlarr', name: 'Prowlarr', description: 'Indexer manager for Sonarr and Radarr', icon: 'prowlarr', type: 'docker', tier: 'recommended', required: false, defaultPort: 9696, webUIPath: '/', estimatedRam: 128, estimatedDisk: 50, dockerImage: 'linuxserver/prowlarr', nativeAppName: null },
            { id: 'qbittorrent', name: 'qBittorrent', description: 'BitTorrent client with web UI', icon: 'qbittorrent', type: 'docker', tier: 'recommended', required: false, defaultPort: 8080, webUIPath: '/', estimatedRam: 256, estimatedDisk: 50, dockerImage: 'linuxserver/qbittorrent', nativeAppName: null },
            { id: 'bazarr', name: 'Bazarr', description: 'Automatic subtitle downloading', icon: 'bazarr', type: 'docker', tier: 'optional', required: false, defaultPort: 6767, webUIPath: '/', estimatedRam: 128, estimatedDisk: 50, dockerImage: 'linuxserver/bazarr', nativeAppName: null },
            { id: 'jellyseerr', name: 'Jellyseerr', description: 'Media request and discovery portal', icon: 'jellyseerr', type: 'docker', tier: 'optional', required: false, defaultPort: 5055, webUIPath: '/', estimatedRam: 256, estimatedDisk: 100, dockerImage: 'fallenbagel/jellyseerr', nativeAppName: null },
        ],
    },
    deployment: {
        id: 'deploy-001',
        solutionId: 'media-center',
        status: 'running',
        components: [
            { componentId: 'jellyfin', name: 'Jellyfin', type: 'native', status: 'running', port: 8096, webUIUrl: 'http://localhost:8096/' },
            { componentId: 'sonarr', name: 'Sonarr', type: 'docker', status: 'running', port: 8989, webUIUrl: 'http://localhost:8989/' },
            { componentId: 'radarr', name: 'Radarr', type: 'docker', status: 'running', port: 7878, webUIUrl: 'http://localhost:7878/' },
            { componentId: 'prowlarr', name: 'Prowlarr', type: 'docker', status: 'running', port: 9696, webUIUrl: 'http://localhost:9696/' },
            { componentId: 'qbittorrent', name: 'qBittorrent', type: 'docker', status: 'running', port: 8080, webUIUrl: 'http://localhost:8080/' },
        ],
        mediaPath: '/opt/minidock/media',
        downloadsPath: '/opt/minidock/downloads',
        createdAt: '2026-02-01T10:00:00Z',
        updatedAt: '2026-02-09T08:00:00Z',
    },
    externalContainers: [
        { componentId: 'bazarr', componentName: 'Bazarr', containerName: 'bazarr', containerId: 'ext_bazarr_01', image: 'linuxserver/bazarr:latest', port: 6767, isRunning: true },
        { componentId: 'jellyseerr', componentName: 'Jellyseerr', containerName: 'jellyseerr', containerId: 'ext_jellyseerr_01', image: 'fallenbagel/jellyseerr:latest', port: 5055, isRunning: false },
    ],
};

export const mockPreflightResult = {
    components: [
        { componentId: 'jellyfin', existingContainer: null, existingPort: null, portConflict: false, portConflictProcess: null },
        { componentId: 'sonarr', existingContainer: null, existingPort: null, portConflict: false, portConflictProcess: null },
        { componentId: 'radarr', existingContainer: null, existingPort: null, portConflict: false, portConflictProcess: null },
        { componentId: 'prowlarr', existingContainer: null, existingPort: null, portConflict: false, portConflictProcess: null },
        { componentId: 'qbittorrent', existingContainer: null, existingPort: null, portConflict: false, portConflictProcess: null },
        { componentId: 'bazarr', existingContainer: null, existingPort: null, portConflict: false, portConflictProcess: null },
        { componentId: 'jellyseerr', existingContainer: null, existingPort: null, portConflict: false, portConflictProcess: null },
    ],
};

export const mockDeploymentProgress = {
    solutionId: 'media-center',
    overallPercent: 100,
    currentStep: 'Deployment complete',
    components: [
        { componentId: 'jellyfin', status: 'running', progress: 100, message: 'Jellyfin is running' },
        { componentId: 'sonarr', status: 'running', progress: 100, message: 'Sonarr is running' },
        { componentId: 'radarr', status: 'running', progress: 100, message: 'Radarr is running' },
        { componentId: 'prowlarr', status: 'running', progress: 100, message: 'Prowlarr is running' },
        { componentId: 'qbittorrent', status: 'running', progress: 100, message: 'qBittorrent is running' },
    ],
};
