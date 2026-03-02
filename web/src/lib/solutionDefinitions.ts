// Client-side display metadata for solutions and their components
// Icons from homarr-labs/dashboard-icons CDN

const ICON_BASE = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg';

export const solutionIcons: Record<string, string> = {
    'media-center': `${ICON_BASE}/jellyfin.svg`,
    'photo-album': `${ICON_BASE}/immich.svg`,
    'smart-home': `${ICON_BASE}/home-assistant.svg`,
};

export const componentIcons: Record<string, string> = {
    'jellyfin': `${ICON_BASE}/jellyfin.svg`,
    'sonarr': `${ICON_BASE}/sonarr.svg`,
    'radarr': `${ICON_BASE}/radarr.svg`,
    'prowlarr': `${ICON_BASE}/prowlarr.svg`,
    'qbittorrent': `${ICON_BASE}/qbittorrent.svg`,
    'bazarr': `${ICON_BASE}/bazarr.svg`,
    'jellyseerr': `${ICON_BASE}/jellyseerr.svg`,
};

export function getSolutionIcon(iconId: string): string {
    return solutionIcons[iconId] || `${ICON_BASE}/docker.svg`;
}

export function getComponentIcon(iconId: string): string {
    return componentIcons[iconId] || `${ICON_BASE}/docker.svg`;
}
