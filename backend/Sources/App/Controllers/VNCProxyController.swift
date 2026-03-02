import Vapor
import NIOCore
import NIOPosix

struct VNCProxyController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        // VNC proxy routes are registered directly on app (no auth middleware group - auth is done inside WebSocket handler)
        routes.on(.GET, "vms", "services", ":name", "console", "proxy", use: vmConsoleProxy)
        routes.on(.GET, "system", "console", "proxy", use: systemConsoleProxy)
    }

    func vmConsoleProxy(req: Request) -> Response {
        return req.webSocket(shouldUpgrade: { req in
            var headers = HTTPHeaders()
            if let protocols = req.headers.first(name: .secWebSocketProtocol), protocols.contains("binary") {
                headers.add(name: .secWebSocketProtocol, value: "binary")
            }
            return req.eventLoop.makeSucceededFuture(headers)
        }) { req, ws in
            // JWT auth check
            guard let token = req.query[String.self, at: "token"] else {
                _ = ws.close(code: .policyViolation); return
            }
            do {
                _ = try req.jwt.verify(token, as: UserPayload.self)
            } catch {
                _ = ws.close(code: .policyViolation); return
            }

            guard let name = req.parameters.get("name") else { _ = ws.close(); return }
            Task {
                // Variables needed for connection, fetched asynchronously
                var vncPort: Int = 0
                
                do {
                    let storage = VMStorageService()
                    let nativeVM = NativeVMService()
                    // 支持通过 directoryName 或显示名称查找 VM
                    let vmPath = try await storage.findVMPath(app: req.application, identifier: name)
                    let status = try await nativeVM.getVMStatus(vmPath: vmPath)
                    
                    if let port = status.vncPort {
                        vncPort = port
                    } else {
                        _ = try? await ws.close()
                        return
                    }
                } catch {
                    req.logger.error("[VNCProxy] Error getting VM info for \(name): \(error)")
                     _ = try? await ws.close()
                     return
                }
                
                // Now proceed with connection
                let bootstrap = ClientBootstrap(group: req.eventLoop)
                    .channelOption(ChannelOptions.socketOption(.so_reuseaddr), value: 1)
                    .channelOption(ChannelOptions.socketOption(.so_keepalive), value: 1)
                    .connectTimeout(.seconds(10))
                    
                let connectFuture = bootstrap.connect(host: "127.0.0.1", port: vncPort)
                
                connectFuture.whenFailure { [vncPort] error in
                    req.logger.error("[VNCProxy] Failed to connect to VM VNC \(name) on port \(vncPort): \(error)")
                    _ = ws.close(code: .policyViolation)
                }

                _ = connectFuture.flatMap { [vncPort] channel -> EventLoopFuture<Void> in
                    req.logger.info("[VNCProxy] Connected to VM VNC \(name) on port \(vncPort)")
                    ws.onBinary { _, buffer in
                        let data = buffer.getData(at: 0, length: buffer.readableBytes) ?? Data()
                        if channel.isActive {
                             _ = channel.writeAndFlush(channel.allocator.buffer(data: data))
                        }
                    }
                    let handler = VNCProxyHandler(ws: ws, logger: req.logger)
                    
                    // Robust cleanup
                    ws.onClose.whenComplete { _ in 
                        req.logger.info("[VNCProxy] WebSocket closed for VM \(name) (Code: \(ws.closeCode ?? .unknown(0))), closing TCP channel")
                        // Check if channel is already closed to avoid double-close errors
                        if channel.isActive {
                            _ = channel.close() 
                        }
                    }
                    
                    // Close WS if channel closes first
                    channel.closeFuture.whenComplete { _ in
                            if !ws.isClosed {
                                _ = ws.close()
                            }
                    }
                    
                    return channel.pipeline.addHandler(handler)
                }
            }
        }
    }

    func systemConsoleProxy(req: Request) -> Response {
        return req.webSocket(shouldUpgrade: { req in
            var headers = HTTPHeaders()
            if let protocols = req.headers.first(name: .secWebSocketProtocol), protocols.contains("binary") {
                headers.add(name: .secWebSocketProtocol, value: "binary")
            }
            return req.eventLoop.makeSucceededFuture(headers)
        }) { req, ws in
            // Default to local screen sharing
            // JWT auth check
            guard let token = req.query[String.self, at: "token"] else {
                _ = ws.close(code: .policyViolation); return
            }
            do {
                _ = try req.jwt.verify(token, as: UserPayload.self)
            } catch {
                _ = ws.close(code: .policyViolation); return
            }

            let targetHost = "127.0.0.1"  // Fixed: always local, no SSRF
            let targetPort: Int
            let requestedPort = (try? req.query.get(Int.self, at: "port")) ?? 5900
            guard (5900...5999).contains(requestedPort) else {
                _ = ws.close(code: .policyViolation); return
            }
            targetPort = requestedPort
            req.logger.info("[VNCProxy] Connecting to \(targetHost):\(targetPort) (query: \(req.url.query ?? "none"))")
            
            Task {
                let bootstrap = ClientBootstrap(group: req.eventLoop)
                    .channelOption(ChannelOptions.socketOption(.so_reuseaddr), value: 1)
                    .channelOption(ChannelOptions.socketOption(.so_keepalive), value: 1)
                    .connectTimeout(.seconds(5))
                    
                let connectFuture = bootstrap.connect(host: targetHost, port: targetPort)
                
                connectFuture.whenFailure { error in
                    req.logger.error("[VNCProxy] Failed to connect to \(targetHost):\(targetPort): \(error)")
                    _ = ws.close(code: .policyViolation)
                }

                _ = connectFuture.flatMap { channel -> EventLoopFuture<Void> in
                    req.logger.info("[VNCProxy] Successfully connected to \(targetHost):\(targetPort)")
                    ws.onBinary { _, buffer in
                        let data = buffer.getData(at: 0, length: buffer.readableBytes) ?? Data()
                        // Check again before writing
                        if channel.isActive {
                            _ = channel.writeAndFlush(channel.allocator.buffer(data: data))
                        }
                    }
                    let handler = VNCProxyHandler(ws: ws, logger: req.logger, target: "\(targetHost):\(targetPort)")
                    
                    // Robust cleanup
                    ws.onClose.whenComplete { _ in 
                        req.logger.info("[VNCProxy] WebSocket closed for \(targetHost):\(targetPort) (Code: \(ws.closeCode ?? .unknown(0))), closing TCP channel")
                        if channel.isActive {
                            _ = channel.close() 
                        }
                    }
                    
                    // Close WS if channel closes first
                    channel.closeFuture.whenComplete { _ in
                            if !ws.isClosed {
                                req.logger.info("[VNCProxy] TCP Channel closed for \(targetHost):\(targetPort), closing WebSocket")
                                _ = ws.close()
                            }
                    }

                    return channel.pipeline.addHandler(handler)
                }
            }
        }
    }
}
