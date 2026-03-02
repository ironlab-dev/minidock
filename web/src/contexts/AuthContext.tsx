"use client";

import React, { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { client, setClientToken } from '@/api/client';
import { reconnectWebSocket } from '@/hooks/useWebSocket';
import { useRouter, usePathname } from 'next/navigation';
import { DEMO_MODE, DEMO_USER, DEMO_TOKEN } from '@/demo/demoConfig';

export interface User {
    id: string;
    username: string;
    role: string;
    createdAt?: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    loading: boolean;
    isAdmin: boolean;
    canRegister: boolean;
    login: (username: string, password: string) => Promise<void>;
    register: (username: string, password: string, confirmPassword: string) => Promise<void>;
    logout: () => void;
    refreshProfile: () => Promise<void>;
    checkRegistrationPolicy: () => Promise<void>;
}

interface AuthResponse {
    token: string;
    user: User;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Token refresh interval: refresh every 90 minutes (token expires in 2 hours)
const TOKEN_REFRESH_INTERVAL = 90 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [canRegister, setCanRegister] = useState(true);
    const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const router = useRouter();
    const pathname = usePathname();

    const checkRegistrationPolicy = async () => {
        try {
            const data = await client.get<{ canRegister: boolean }>('/auth/policy');
            setCanRegister(data.canRegister);
        } catch (error) {
            console.error("Failed to fetch registration policy", error);
        }
    };

    const stopRefreshTimer = useCallback(() => {
        if (refreshTimerRef.current) {
            clearInterval(refreshTimerRef.current);
            refreshTimerRef.current = null;
        }
    }, []);

    const logout = useCallback(() => {
        stopRefreshTimer();
        // Ask server to clear the httpOnly session cookie
        client.post('/auth/logout', {}).catch(() => {});
        setToken(null);
        setClientToken(null);
        setUser(null);
        router.push('/login');
    }, [stopRefreshTimer, router]);

    const refreshAuthToken = useCallback(async () => {
        try {
            const data = await client.post<AuthResponse>('/auth/refresh', {});
            setToken(data.token);
            setClientToken(data.token);
            if (data.user) {
                setUser(data.user);
            }
        } catch (error) {
            console.error('[AuthContext] Token refresh failed:', error);
            // If refresh fails with 401, the token has expired — log out
            const errorStr = String(error);
            if (errorStr.includes('401') || errorStr.toLowerCase().includes('unauthorized')) {
                stopRefreshTimer();
                logout();
            }
        }
    }, [stopRefreshTimer, logout]);

    const startRefreshTimer = useCallback(() => {
        stopRefreshTimer();
        refreshTimerRef.current = setInterval(refreshAuthToken, TOKEN_REFRESH_INTERVAL);
    }, [refreshAuthToken, stopRefreshTimer]);

    // DEMO_INTEGRATION: auto-login with demo user, skip cookie-based auth
    useEffect(() => {
        if (DEMO_MODE) {
            setUser(DEMO_USER);
            setToken(DEMO_TOKEN);
            setClientToken(DEMO_TOKEN);
            setLoading(false);
            setCanRegister(false);
            return;
        }

        // Restore session from the httpOnly cookie via /auth/me.
        // The browser sends the cookie automatically (same-origin) — no localStorage needed.
        checkRegistrationPolicy();

        client.get<{ user: User }>('/auth/me')
            .then((data) => {
                if (data.user) {
                    setUser(data.user);
                    startRefreshTimer();
                }
            })
            .catch(() => {
                // No valid session — user will be redirected to /login by the guard below.
            })
            .finally(() => {
                setLoading(false);
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const setSession = (newToken: string, newUser: User) => {
        setToken(newToken);
        setClientToken(newToken); // Keep in memory for Authorization header fallback
        setUser(newUser);
        startRefreshTimer();
        reconnectWebSocket();
        router.push('/');
    };

    const login = async (username: string, password: string) => {
        try {
            const data = await client.post<AuthResponse>('/auth/login', { username, password });
            setSession(data.token, data.user);
        } catch (error) {
            console.error('Login failed:', error);
            throw error;
        }
    };

    const register = async (username: string, password: string, confirmPassword: string) => {
        try {
            const data = await client.post<AuthResponse>('/auth/register', { username, password, confirmPassword });
            setSession(data.token, data.user);
        } catch (error) {
            console.error('Registration failed:', error);
            throw error;
        }
    };

    const refreshProfile = async () => {
        try {
            const data = await client.get<{ user: User }>('/auth/me');
            if (data.user) {
                setUser(data.user);
            }
        } catch (e) {
            console.error("Failed to refresh profile", e);
        }
    };

    // Public pages that don't require auth
    const publicPages = ['/login', '/register'];

    // DEMO_INTEGRATION: skip auth redirects in demo mode
    useEffect(() => {
        if (DEMO_MODE) {
            if (publicPages.includes(pathname)) {
                router.push('/');
            }
            return;
        }
        if (!loading) {
            if (!user && !publicPages.includes(pathname)) {
                router.push('/login');
            } else if (user && publicPages.includes(pathname)) {
                router.push('/');
            }
        }
    }, [user, loading, pathname]);

    const value = {
        user,
        token,
        loading,
        isAdmin: user?.role === 'admin',
        canRegister,
        login,
        register,
        logout,
        refreshProfile,
        checkRegistrationPolicy
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
