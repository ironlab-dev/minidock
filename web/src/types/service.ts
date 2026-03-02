export type ServiceStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'error' | 'unknown' | 'not_installed';
export type ServiceType = 'docker' | 'vm' | 'system' | 'automation';

export interface ServiceInfo {
    id: string;
    name: string;
    type: ServiceType;
    status: ServiceStatus;
    description?: string;
    stats?: Record<string, string>;
}

export interface ServiceItem {
    id: string;
    name: string;
    status: string;
    metadata?: Record<string, string>;
}
