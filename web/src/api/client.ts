const getBaseUrl = () => {
    // 1. Always prioritize environment variable if available (e.g. from .env.local via dev.sh)
    if (process.env.NEXT_PUBLIC_API_URL) {
        return process.env.NEXT_PUBLIC_API_URL;
    }

    // 2. Browser-side: always use /api relative path
    // This works with:
    // - Direct access (Next.js rewrites to backend)
    // - Reverse proxy (Traefik, nginx) - same origin, no CORS issues
    if (typeof window !== 'undefined') {
        return '/api';
    }

    // Server-side fallback: default port
    return "http://localhost:28080";
};

export const API_URL = getBaseUrl();

/**
 * Get the backend URL for WebSocket connections
 * WebSocket is now proxied through server.mjs, so we use same origin
 */
export const getBackendBaseUrl = (): string => {
    // 1. Always prioritize environment variable if available
    if (process.env.NEXT_PUBLIC_API_URL) {
        return process.env.NEXT_PUBLIC_API_URL;
    }

    // 2. Browser-side: use same origin (WebSocket is proxied by server.mjs)
    if (typeof window !== 'undefined') {
        return window.location.origin;
    }

    // Server-side fallback
    return "http://localhost:23000";
};

// ─── In-memory auth token ────────────────────────────────────────────────────
// Set by AuthContext on login/refresh. Never written to localStorage, so an
// XSS attack cannot steal it across page sessions. The httpOnly cookie is the
// primary auth mechanism; this variable provides a Bearer-header fallback for
// edge-case deployments where the cookie isn't forwarded by the proxy.
let _memoryToken: string | null = null;

/** Called by AuthContext whenever the session token changes (login / refresh / logout). */
export function setClientToken(token: string | null): void {
    _memoryToken = token;
}

/** Returns true if an in-memory session token is set (user is authenticated). */
export function isClientAuthenticated(): boolean {
    return _memoryToken !== null;
}

class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;

        const controller = new AbortController();
        // Determine timeout based on endpoint and body
        const isFileUpload = options.body instanceof FormData;
        const isHeavyAction = endpoint.includes('/action') || endpoint.includes('/vms') || endpoint.includes('/docker/services') || isFileUpload;

        // 5 minutes for heavy actions/uploads, 60s for others
        const timeout = isHeavyAction ? 300000 : 60000;

        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const headers: Record<string, string> = {
            ...options.headers as Record<string, string>,
        };

        // Inject in-memory token as Bearer header when available.
        // The httpOnly cookie is sent automatically (same-origin) via credentials:'include'.
        // This header provides a secondary auth path for non-proxy direct-backend access.
        if (typeof window !== 'undefined' && _memoryToken) {
            headers['Authorization'] = `Bearer ${_memoryToken}`;
        }

        // Only default to JSON if not explicitly set and not sending FormData
        if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }

        try {
            const response = await fetch(url, {
                ...options,
                headers,
                credentials: 'include', // Send httpOnly session cookie automatically
                signal: controller.signal,
            });

            if (!response.ok) {
                let errorMessage = `API Error: ${response.status}`;
                try {
                    const text = await response.text();
                    try {
                        const errorData = JSON.parse(text);
                        if (errorData.reason) {
                            errorMessage = errorData.reason;
                        } else if (errorData.error && typeof errorData.error === 'string') {
                            errorMessage = errorData.error;
                        }
                    } catch {
                        if (text) errorMessage = text;
                    }
                } catch {
                    // Body unreadable, keep default message
                }
                if (response.status === 401) {
                    // Clear in-memory token on 401 so next explicit login sets fresh state.
                    // AuthContext will handle the redirect to /login.
                    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
                        _memoryToken = null;
                    }
                }
                throw new Error(errorMessage);
            }

            // Handle empty response for 204 No Content or zero content-length
            if (response.status === 204 || response.headers.get('content-length') === '0') {
                return {} as T;
            }

            const contentType = response.headers.get('content-type');

            if (contentType && contentType.includes('application/json')) {
                try {
                    const jsonData = await response.json();

                    // LICENSE NAG CHECK: Intercept mutations (POST, PUT, DELETE) if they succeeded
                    if (options.method && ['POST', 'PUT', 'DELETE'].includes(options.method)) {
                        // Don't intercept auth or license endpoints to avoid loops
                        if (!url.includes('/login') && !url.includes('/license')) {
                            // Check local status silently
                            fetch(this.baseUrl + '/license/status')
                                .then(res => res.json())
                                .then(status => {
                                    if (!status.isActivated && status.isTrialExpired) {
                                        window.dispatchEvent(new CustomEvent('trigger-license-nag', { detail: status }));
                                    }
                                }).catch(e => console.error(e));
                        }
                    }

                    return jsonData;
                } catch {
                    return {} as T;
                }
            }

            const textData = await response.text();
            return textData as unknown as T;
        } catch (error: unknown) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw new Error(`Request timed out: ${endpoint}`);
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    get<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        return this.request<T>(endpoint, { method: 'GET', ...options });
    }

    post<T>(endpoint: string, body: unknown, options: RequestInit = {}): Promise<T> {
        const isFormData = body instanceof FormData;
        return this.request<T>(endpoint, {
            method: 'POST',
            body: isFormData ? body : JSON.stringify(body),
            ...options,
        });
    }

    put<T>(endpoint: string, body: unknown): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body),
        });
    }

    delete<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        return this.request<T>(endpoint, { method: 'DELETE', ...options });
    }

    /**
     * Upload file with progress tracking using XMLHttpRequest
     * @param endpoint API endpoint
     * @param formData FormData containing the file
     * @param onProgress Progress callback (loaded, total, percent)
     * @returns Promise that resolves when upload completes
     */
    uploadWithProgress<T = unknown>(
        endpoint: string,
        formData: FormData,
        onProgress?: (loaded: number, total: number, percent: number) => void,
        headers?: Record<string, string>
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const url = `${this.baseUrl}${endpoint}`;
            const xhr = new XMLHttpRequest();

            // Set timeout (5 minutes for large files)
            xhr.timeout = 300000;

            // Handle progress
            if (onProgress) {
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const percent = (e.loaded / e.total) * 100;
                        onProgress(e.loaded, e.total, percent);
                    }
                };
            }

            // Handle completion
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const contentType = xhr.getResponseHeader('content-type');
                        if (contentType && contentType.includes('application/json')) {
                            const data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
                            resolve(data as T);
                        } else if (xhr.status === 204 || xhr.responseText === '') {
                            resolve({} as T);
                        } else {
                            resolve(xhr.responseText as unknown as T);
                        }
                    } catch {
                        resolve({} as T);
                    }
                } else {
                    let errorMessage = `API Error: ${xhr.status}`;
                    try {
                        const errorData = JSON.parse(xhr.responseText);
                        if (errorData.reason) {
                            errorMessage = errorData.reason;
                        } else if (errorData.error && typeof errorData.error === 'string') {
                            errorMessage = errorData.error;
                        }
                    } catch {
                        errorMessage = xhr.responseText || errorMessage;
                    }
                    reject(new Error(errorMessage));
                }
            };

            // Handle errors
            xhr.onerror = () => {
                reject(new Error('Network error during upload'));
            };

            xhr.ontimeout = () => {
                reject(new Error(`Upload timed out: ${endpoint}`));
            };

            // Send request
            xhr.open('POST', url, true);
            xhr.withCredentials = true; // Send httpOnly session cookie for file uploads

            // Set in-memory token as Authorization header (same as fetch requests)
            if (_memoryToken) {
                xhr.setRequestHeader('Authorization', `Bearer ${_memoryToken}`);
            }

            // Set custom headers if provided
            if (headers) {
                Object.entries(headers).forEach(([key, value]) => {
                    xhr.setRequestHeader(key, value);
                });
            }

            xhr.send(formData);
        });
    }
}

// DEMO_INTEGRATION: replace API client with mock in demo mode, see web/src/demo/
import { DEMO_MODE } from '@/demo/demoConfig';
import { resolveMockRequest } from '@/demo/demoClient';

class DemoApiClient {
    get<T>(endpoint: string): Promise<T> {
        return resolveMockRequest<T>(endpoint, 'GET');
    }

    post<T>(endpoint: string, body?: unknown): Promise<T> {
        return resolveMockRequest<T>(endpoint, 'POST', body);
    }

    put<T>(endpoint: string, body?: unknown): Promise<T> {
        return resolveMockRequest<T>(endpoint, 'PUT', body);
    }

    delete<T>(endpoint: string): Promise<T> {
        return resolveMockRequest<T>(endpoint, 'DELETE');
    }
    uploadWithProgress<T = unknown>(
        endpoint: string
    ): Promise<T> {
        return resolveMockRequest<T>(endpoint, 'POST');
    }
}

export const client = DEMO_MODE ? new DemoApiClient() as unknown as ApiClient : new ApiClient(API_URL);
