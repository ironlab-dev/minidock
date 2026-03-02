import type { User } from '@/contexts/AuthContext';

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export const DEMO_USER: User = {
    id: 'demo-user-001',
    username: 'demo',
    role: 'admin',
};

export const DEMO_TOKEN = 'demo-token-placeholder';
