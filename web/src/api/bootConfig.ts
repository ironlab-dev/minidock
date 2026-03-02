import { client } from './client';

export interface ServiceBootConfig {
    id?: string;
    serviceId: string;
    itemId?: string;
    itemName: string;
    autoStart: boolean;
    bootPriority: number; // Default 100
    bootDelay: number;    // Default 0
}

export const bootConfigApi = {
    list: async (): Promise<ServiceBootConfig[]> => {
        try {
            return await client.get('/system/boot-config');
        } catch (e) {
            console.error('Failed to list boot configs', e);
            return [];
        }
    },

    save: async (config: ServiceBootConfig): Promise<ServiceBootConfig> => {
        return await client.post('/system/boot-config', config);
    },

    delete: async (id: string): Promise<void> => {
        await client.delete(`/system/boot-config/${id}`);
    }
};
