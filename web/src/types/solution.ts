export type SolutionStatus = 'not_installed' | 'deploying' | 'running' | 'partial' | 'stopped' | 'error';
export type ComponentType = 'native' | 'docker';
export type ComponentTier = 'core' | 'recommended' | 'optional';
export type ComponentStatus = 'waiting' | 'pulling' | 'installing' | 'starting' | 'running' | 'stopped' | 'error';

export interface SolutionInfo {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    componentCount: number;
    status: SolutionStatus;
    available: boolean;
    runningCount: number;
    totalCount: number;
}

export interface SolutionComponentDef {
    id: string;
    name: string;
    description: string;
    icon: string;
    type: ComponentType;
    tier: ComponentTier;
    required: boolean;
    defaultPort: number;
    webUIPath?: string;
    estimatedRam: number;
    estimatedDisk: number;
    dockerImage?: string;
    nativeAppName?: string;
}

export interface SolutionDefinition {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    components: SolutionComponentDef[];
    available: boolean;
}

export interface ExternalContainer {
    componentId: string;
    componentName: string;
    containerName: string;
    containerId: string;
    image: string;
    port: number | null;
    isRunning: boolean;
}

export interface SolutionDetail {
    definition: SolutionDefinition;
    deployment: SolutionDeployment | null;
    externalContainers: ExternalContainer[];
}

export interface SolutionDeployment {
    id: string;
    solutionId: string;
    status: SolutionStatus;
    components: DeployedComponent[];
    mediaPath: string;
    downloadsPath: string;
    createdAt: string;
    updatedAt: string;
}

export interface DeployedComponent {
    componentId: string;
    name: string;
    type: ComponentType;
    status: ComponentStatus;
    port: number;
    webUIUrl?: string;
    error?: string;
}

export interface DeploymentProgress {
    solutionId: string;
    overallPercent: number;
    currentStep: string;
    components: {
        componentId: string;
        status: ComponentStatus;
        progress?: number;
        message?: string;
    }[];
}

export interface DeployRequest {
    components: string[];
    mediaPath: string;
    downloadsPath: string;
    portOverrides?: Record<string, number>;
}

export interface PreflightResult {
    components: ComponentPreflight[];
}

export interface ComponentPreflight {
    componentId: string;
    existingContainer: string | null;
    existingPort: number | null;
    portConflict: boolean;
    portConflictProcess: string | null;
}
