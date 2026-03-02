import Vapor

public final class WebSocketManager: @unchecked Sendable {
    private let lock = NSLock()
    private var clients: [UUID: WebSocket] = [:]
    
    public init() {}
    
    public func addClient(_ ws: WebSocket, app: Application) {
        let id = UUID()
        lock.lock()
        clients[id] = ws
        lock.unlock()

        ws.onClose.whenComplete { [weak self] _ in
            self?.removeClient(id)
        }

        // Must register handlers on the WebSocket's event loop (NIOLoopBoundBox precondition).
        // The caller may be on a different thread due to async/await in the WebSocket route handler.
        ws.eventLoop.execute { [weak self] in
            ws.onText { ws, text in
                self?.handleMessage(text, ws: ws, app: app)
            }

            // Handle binary messages (WebSocket proxy may forward messages as binary)
            ws.onBinary { ws, buffer in
                let data = Data(buffer: buffer)
                if let text = String(data: data, encoding: .utf8) {
                    self?.handleMessage(text, ws: ws, app: app)
                }
            }
        }
    }
    
    private func handleMessage(_ text: String, ws: WebSocket, app: Application) {
        // Simple JSON parsing
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let event = json["event"] as? String else {
            return
        }
        
        if event == "request_details" {
            guard let type = json["type"] as? String else { return }
            
            Task {
                if let systemService = await app.serviceManager.getService(id: "system-core") as? SystemService {
                    do {
                        var details: [[String: String]] = []
                        if type == "network" {
                            details = try await systemService.getNetworkProcessDetails()
                        } else {
                            // cpu or mem
                            details = try await systemService.getTopProcesses(type: type)
                        }
                        
                        let response: [String: Any] = [
                            "event": "system_details",
                            "type": type,
                            "data": details
                        ]
                        
                        if let jsonData = try? JSONSerialization.data(withJSONObject: response),
                           let jsonString = String(data: jsonData, encoding: .utf8) {
                            // Send back to specific client only? Or broadcast?
                            // Usually just requestor.
                            // But for "shared" dashboard feeling, maybe simple broadcast is fine?
                            // No, let's keep it to the requester for now, or broadcast if multiple people watch.
                            // The `broadcast` method sends to all. `ws.send` sends to one.
                            // Let's send to just the requester to save bandwidth if many users (unlikely for minidock).
                            // But wait, the current WebSocketManager implementation doesn't easily expose sending to ONE client from outside 
                            // except inside this closure where we have `ws`.
                            try await ws.send("system_details:\(jsonString)")
                        }
                    } catch {
                        app.logger.error("Failed to get system details: \(error)")
                    }
                }
            }
        }
    }
    
    private func removeClient(_ id: UUID) {
        lock.lock()
        clients.removeValue(forKey: id)
        lock.unlock()
    }
    
    /// 获取当前活跃的 WebSocket 客户端数量
    public var activeClientCount: Int {
        lock.lock()
        let count = clients.count
        lock.unlock()
        return count
    }
    
    /// 检查是否有活跃的客户端连接
    public var hasActiveClients: Bool {
        return activeClientCount > 0
    }
    
    public func broadcast(event: String, data: String) {
        lock.lock()
        let clientsCopy = clients
        lock.unlock()

        let message = "\(event):\(data)"
        var closedIds: [UUID] = []

        for (id, client) in clientsCopy {
            if client.isClosed {
                closedIds.append(id)
            } else {
                client.send(message, promise: nil)
            }
        }

        // Prune any clients that were found closed during broadcast
        if !closedIds.isEmpty {
            lock.lock()
            for id in closedIds {
                clients.removeValue(forKey: id)
            }
            lock.unlock()
        }
    }
}

extension Application {
    struct WebSocketManagerKey: StorageKey {
        typealias Value = WebSocketManager
    }
    
    public var webSocketManager: WebSocketManager {
        get {
            if let existing = self.storage[WebSocketManagerKey.self] {
                return existing
            }
            let new = WebSocketManager()
            self.storage[WebSocketManagerKey.self] = new
            return new
        }
        set {
            self.storage[WebSocketManagerKey.self] = newValue
        }
    }
}
