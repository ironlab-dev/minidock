import { createServer as createHttpsServer } from 'https';
import { createServer as createHttpServer } from 'http';
import { parse } from 'url';
import next from 'next';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { WebSocket, WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '23000', 10);
const backendPort = parseInt(process.env.BACKEND_PORT || '28080', 10);
const useHttps = process.env.USE_HTTPS === 'true';

// Use localhost for Next.js internal hostname (required for dev mode)
const app = next({ dev, hostname: 'localhost', port });
const handle = app.getRequestHandler();

// Load SSL certificates if HTTPS mode
let httpsOptions = null;
if (useHttps) {
    const certsDir = path.join(__dirname, '..', 'certs');
    const certPath = path.join(certsDir, 'server.crt');
    const keyPath = path.join(certsDir, 'server.key');

    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        httpsOptions = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath),
        };
        console.log('[Server] HTTPS certificates loaded');
    } else {
        console.warn('[Server] HTTPS requested but certificates not found, falling back to HTTP');
    }
}

app.prepare().then(() => {
    // Create server (HTTP or HTTPS based on config)
    const createServerFn = (httpsOptions && useHttps) ? createHttpsServer.bind(null, httpsOptions) : createHttpServer;
    const protocol = (httpsOptions && useHttps) ? 'https' : 'http';

    const server = createServerFn(async (req, res) => {
        try {
            const parsedUrl = parse(req.url, true);
            await handle(req, res, parsedUrl);
        } catch (err) {
            console.error('Error occurred handling', req.url, err);
            res.statusCode = 500;
            res.end('internal server error');
        }
    });

    // WebSocket proxy: /ws -> backend WebSocket
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
        const { pathname } = parse(req.url);

        // Proxy WebSocket paths: /ws, /system/console/proxy, /terminal/ws/*
        const wsProxyPaths = ['/ws', '/system/console/proxy', '/terminal/ws'];
        const shouldProxy = wsProxyPaths.some(p => pathname === p || pathname?.startsWith(p + '/') || pathname?.startsWith('/terminal/ws'));

        if (shouldProxy) {
            // Proxy WebSocket to backend (preserve the original path and cookies)
            const backendWsUrl = `ws://127.0.0.1:${backendPort}${pathname}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;

            // Forward cookies from client to backend for authentication
            const headers = {};
            if (req.headers.cookie) {
                headers['Cookie'] = req.headers.cookie;
            }

            const backendWs = new WebSocket(backendWsUrl, { headers });

            backendWs.on('open', () => {
                wss.handleUpgrade(req, socket, head, (clientWs) => {
                    // Forward messages: client -> backend
                    clientWs.on('message', (data, isBinary) => {
                        if (backendWs.readyState === WebSocket.OPEN) {
                            // Preserve the message type (binary or text)
                            backendWs.send(data, { binary: isBinary });
                        }
                    });

                    // Forward messages: backend -> client
                    backendWs.on('message', (data, isBinary) => {
                        if (clientWs.readyState === WebSocket.OPEN) {
                            // Convert Buffer to string for text messages to ensure proper transmission
                            if (!isBinary) {
                                const textData = Buffer.isBuffer(data) ? data.toString('utf8') : data;
                                // Send as text by explicitly setting binary to false
                                clientWs.send(textData, { binary: false });
                            } else {
                                clientWs.send(data, { binary: true });
                            }
                        }
                    });

                    // Handle close
                    clientWs.on('close', () => backendWs.close());
                    backendWs.on('close', () => clientWs.close());

                    // Handle errors
                    clientWs.on('error', (err) => {
                        console.error('[WS Proxy] Client error:', err.message);
                        backendWs.close();
                    });
                    backendWs.on('error', (err) => {
                        console.error('[WS Proxy] Backend error:', err.message);
                        clientWs.close();
                    });
                });
            });

            backendWs.on('error', (err) => {
                console.error('[WS Proxy] Failed to connect to backend:', err.message);
                socket.destroy();
            });
        } else {
            // Let Next.js handle other WebSocket upgrades (HMR)
            // Don't destroy - let it pass through for HMR
        }
    });

    server.listen(port, '0.0.0.0', (err) => {
        if (err) throw err;
        console.log(`> Ready on ${protocol}://localhost:${port}`);
        console.log(`> WebSocket proxy: ${protocol === 'https' ? 'wss' : 'ws'}://*/ws -> ws://127.0.0.1:${backendPort}/ws`);

        // Get local IP for LAN access info
        const nets = os.networkInterfaces();
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    console.log(`> LAN access: ${protocol}://${net.address}:${port}`);
                }
            }
        }
    });
});
