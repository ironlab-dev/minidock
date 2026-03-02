import { client } from '@/api/client';

export const licenseClient = {
    status: () => client.get('/license/status'),
    activate: (key: string) => client.post('/license/activate', { key }),
    deactivate: () => client.post('/license/deactivate', {}),
};
