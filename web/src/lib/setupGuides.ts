// Setup guide definitions for each solution
// Resolved at render time using deployed component ports

export type AddressFormat = 'url' | 'port' | 'static';

export interface AddressTemplate {
    label: string;
    format: AddressFormat;
    componentId?: string;   // for 'url' and 'port' formats — resolve from portMap
    staticValue?: string;   // for 'static' format
}

export interface SetupStepTemplate {
    id: string;
    title: string;
    description: string;
    requiredComponents: string[];   // step shown only if ALL are present
    targetComponentId: string;      // which component's WebUI to open
    targetPath?: string;            // sub-path in the WebUI
    addresses: AddressTemplate[];
}

export interface SetupGuideDefinition {
    solutionId: string;
    steps: SetupStepTemplate[];
}

// ── Media Center ──

const mediaCenterGuide: SetupGuideDefinition = {
    solutionId: 'media-center',
    steps: [
        {
            id: 'jellyfin-init',
            title: '初始化 Jellyfin',
            description: '打开 Jellyfin，完成初始向导：创建管理员账号、选择语言、添加媒体库（路径设置为 /media）',
            requiredComponents: ['jellyfin'],
            targetComponentId: 'jellyfin',
            addresses: [
                { label: '媒体库路径', format: 'static', staticValue: '/media' },
            ],
        },
        {
            id: 'prowlarr-indexers',
            title: '配置 Prowlarr 索引器',
            description: '打开 Prowlarr → Indexers，添加索引源作为 Sonarr/Radarr 的搜索来源',
            requiredComponents: ['prowlarr'],
            targetComponentId: 'prowlarr',
            targetPath: '/indexers',
            addresses: [],
        },
        {
            id: 'prowlarr-apps',
            title: '在 Prowlarr 中关联 Sonarr 和 Radarr',
            description: '打开 Prowlarr → Settings → Apps，添加 Sonarr 和 Radarr 后索引器将自动同步',
            requiredComponents: ['prowlarr'],
            targetComponentId: 'prowlarr',
            targetPath: '/settings/applications',
            addresses: [
                { label: 'Prowlarr Server', format: 'url', componentId: 'prowlarr' },
                { label: 'Sonarr Server', format: 'url', componentId: 'sonarr' },
                { label: 'Sonarr API Key', format: 'static', staticValue: 'Sonarr → Settings → General → API Key' },
                { label: 'Radarr Server', format: 'url', componentId: 'radarr' },
                { label: 'Radarr API Key', format: 'static', staticValue: 'Radarr → Settings → General → API Key' },
            ],
        },
        {
            id: 'download-client',
            title: '配置下载客户端',
            description: '在 Sonarr 和 Radarr 中分别添加 qBittorrent 作为下载工具（Settings → Download Clients）',
            requiredComponents: ['qbittorrent'],
            targetComponentId: 'sonarr',
            targetPath: '/settings/downloadclients',
            addresses: [
                { label: 'Host', format: 'static', staticValue: 'localhost' },
                { label: 'Port', format: 'port', componentId: 'qbittorrent' },
                { label: '默认密码', format: 'static', staticValue: 'adminadmin（请在首次登录后修改）' },
            ],
        },
        {
            id: 'root-folders',
            title: '设置媒体根目录',
            description: '在 Sonarr 中添加剧集根目录，在 Radarr 中添加电影根目录（Settings → Media Management → Root Folders）',
            requiredComponents: ['sonarr'],
            targetComponentId: 'sonarr',
            targetPath: '/settings/mediamanagement',
            addresses: [
                { label: '剧集目录 (Sonarr)', format: 'static', staticValue: '/media/tv' },
                { label: '电影目录 (Radarr)', format: 'static', staticValue: '/media/movies' },
            ],
        },
        {
            id: 'jellyseerr-setup',
            title: '配置 Jellyseerr',
            description: '打开 Jellyseerr 完成初始向导，连接 Jellyfin、Sonarr 和 Radarr 开启影视请求门户',
            requiredComponents: ['jellyseerr'],
            targetComponentId: 'jellyseerr',
            addresses: [
                { label: 'Jellyfin URL', format: 'url', componentId: 'jellyfin' },
                { label: 'Sonarr URL', format: 'url', componentId: 'sonarr' },
                { label: 'Radarr URL', format: 'url', componentId: 'radarr' },
            ],
        },
    ],
};

// ── Registry ──

const guideRegistry: Record<string, SetupGuideDefinition> = {
    'media-center': mediaCenterGuide,
};

export function getSetupGuide(solutionId: string): SetupGuideDefinition | null {
    return guideRegistry[solutionId] ?? null;
}

// ── Resolver ──

export interface ResolvedAddress {
    label: string;
    value: string;
    copyable: boolean;  // url/port are copyable, static hints are not always
}

export interface ResolvedStep {
    id: string;
    title: string;
    description: string;
    targetUrl: string | null;
    addresses: ResolvedAddress[];
}

/**
 * Resolve a setup guide against actual deployed/external component ports.
 * Returns only steps whose required components are ALL present.
 */
export function resolveSetupGuide(
    guide: SetupGuideDefinition,
    portMap: Map<string, number>,
    webUIUrlMap: Map<string, string>,
    customUrlMap?: Map<string, string>,
): ResolvedStep[] {
    return guide.steps
        .filter(step => step.requiredComponents.every(id => portMap.has(id)))
        .map(step => {
            // Resolve target URL: custom URL > webUIUrl > localhost:port
            const customTargetUrl = customUrlMap?.get(step.targetComponentId);
            const targetPort = portMap.get(step.targetComponentId);
            let targetUrl = customTargetUrl ?? webUIUrlMap.get(step.targetComponentId) ?? null;
            if (!targetUrl && targetPort) {
                targetUrl = `http://localhost:${targetPort}`;
            }
            if (targetUrl && step.targetPath) {
                // Append sub-path
                targetUrl = targetUrl.replace(/\/$/, '') + step.targetPath;
            }

            // Resolve addresses
            const addresses: ResolvedAddress[] = step.addresses
                .map(addr => {
                    if (addr.format === 'url' && addr.componentId) {
                        const customUrl = customUrlMap?.get(addr.componentId);
                        if (customUrl) {
                            return { label: addr.label, value: customUrl, copyable: true };
                        }
                        const port = portMap.get(addr.componentId);
                        if (!port) return null;
                        return { label: addr.label, value: `http://localhost:${port}`, copyable: true };
                    }
                    if (addr.format === 'port' && addr.componentId) {
                        const port = portMap.get(addr.componentId);
                        if (!port) return null;
                        return { label: addr.label, value: String(port), copyable: true };
                    }
                    if (addr.format === 'static' && addr.staticValue) {
                        return { label: addr.label, value: addr.staticValue, copyable: true };
                    }
                    return null;
                })
                .filter((a): a is ResolvedAddress => a !== null);

            return {
                id: step.id,
                title: step.title,
                description: step.description,
                targetUrl,
                addresses,
            };
        });
}
