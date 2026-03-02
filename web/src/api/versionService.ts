/**
 * VersionService
 * Handles checking for latest versions of Docker images and VM ISOs.
 */

export interface VersionInfo {
    latestVersion: string;
    releaseDate?: string;
    isUpdateAvailable: boolean;
}

class VersionService {
    /**
     * Checks the latest tag for a Docker image from Docker Hub.
     * Note: This uses the public Docker Hub API.
     */
    async getLatestDockerTag(imageName: string): Promise<string | null> {
        try {
            // Normalize image name (e.g., 'jellyfin/jellyfin' or 'postgres')
            const fullImageName = imageName.includes('/') ? imageName : `library/${imageName}`;
            const [repo, name] = fullImageName.split('/');

            // We'll use the Hub API v2 tags endpoint, sorted by last_updated
            const url = `https://hub.docker.com/v2/repositories/${repo}/${name}/tags/?page_size=5&ordering=last_updated`;

            const response = await fetch(url);
            if (!response.ok) return null;

            const data = await response.json();
            if (data.results && data.results.length > 0) {
                // Find the first tag that isn't 'latest'
                interface DockerTag { name: string; last_updated: string; }
                const latestTag = (data.results as DockerTag[]).find(t => t.name !== 'latest');
                return latestTag ? latestTag.name : data.results[0].name;
            }
            return null;
        } catch (error) {
            console.error('[VersionService] Error checking Docker tag:', error);
            return null;
        }
    }

    /**
     * Checks if a newer version of a VM ISO is available.
     * This is a simplified implementation that can be expanded with specific distro logic.
     */
    async getLatestVMVersion(distroId: string): Promise<string | null> {
        // Placeholder for distro-specific version checking
        // In a real scenario, this might scrape a page or check a metadata API
        const distros: Record<string, string> = {
            'ubuntu': '24.04.1',
            'debian': '12.8.0',
            'alpine': '3.21.2',
            'arch': '2025.01.01'
        };

        const key = distroId.toLowerCase().split('-')[0];
        return distros[key] || null;
    }
}

export const versionService = new VersionService();
