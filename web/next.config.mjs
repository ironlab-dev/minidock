const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: isDemoMode ? 'export' : 'standalone',
    ...(isDemoMode ? { trailingSlash: true } : {}),
    ...(isDemoMode ? { images: { unoptimized: true } } : {}),
    // Skip ESLint during production builds (for faster iteration)
    eslint: {
        ignoreDuringBuilds: true,
    },
    // Skip TypeScript errors during builds (handle separately with npm run lint)
    typescript: {
        ignoreBuildErrors: true,
    },
    // Security headers (not applicable for static export)
    ...(!isDemoMode ? {
        async headers() {
            return [
                {
                    source: '/(.*)',
                    headers: [
                        {
                            key: 'X-Content-Type-Options',
                            value: 'nosniff',
                        },
                        {
                            key: 'X-Frame-Options',
                            value: 'SAMEORIGIN',
                        },
                        {
                            key: 'Referrer-Policy',
                            value: 'strict-origin-when-cross-origin',
                        },
                        {
                            key: 'Content-Security-Policy',
                            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://ui-avatars.com https://cdn.jsdelivr.net; connect-src 'self' ws: wss:; font-src 'self' data:; frame-src 'self';",
                        },
                    ],
                },
            ];
        },
    } : {}),
    // 不直接 transpile noVNC，而是外部化它，使用 Script 标签加载
    webpack: (config, { isServer }) => {
        if (!isServer) {
            // 外部化 noVNC，避免 webpack 处理 top-level await
            config.externals = config.externals || [];
            config.externals.push({
                '@novnc/novnc/lib/rfb': 'commonjs @novnc/novnc/lib/rfb',
            });
        }
        return config;
    },
    ...(!isDemoMode ? {
        async rewrites() {
            // Proxy mode: Next.js server proxies API requests to backend
            // Since Next.js server and backend are on the same machine, use localhost
            // The backend port is passed via BACKEND_PORT environment variable from dev.sh
            // If not set, fallback to default port calculation (24000 for frontend 23000)
            const backendPort = process.env.BACKEND_PORT || '24000';
            const apiUrl = `http://127.0.0.1:${backendPort}`;
            console.log(`[Next.js] Proxying /api to ${apiUrl}`);
            return [
                {
                    source: '/api/:path*',
                    destination: `${apiUrl}/:path*`,
                },
            ];
        },
    } : {}),
};

export default nextConfig;
