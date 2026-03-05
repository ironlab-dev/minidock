import Vapor
import Fluent
import NIOCore
import NIOPosix
import Foundation

func routes(_ app: Application) throws {
    app.get { req async in
        "MiniDock API is running"
    }

    app.get("health") { req async in
        ["status": "ok"]
    }

    app.webSocket("ws") { req, ws in
        req.logger.info("[WebSocket] Connection attempt")

        let jwtToken: String?
        if let cookieToken = req.cookies["minidock_session"]?.string {
            req.logger.info("[WebSocket] Using cookie auth")
            jwtToken = cookieToken
        } else if let queryToken = req.query[String.self, at: "token"] {
            req.logger.info("[WebSocket] Using query param auth")
            jwtToken = queryToken
        } else {
            req.logger.warning("[WebSocket] No auth token found, closing connection")
            jwtToken = nil
        }

        guard let token = jwtToken else {
            try? await ws.close(code: .policyViolation)
            return
        }

        do {
            let payload = try req.jwt.verify(token, as: UserPayload.self)
            req.logger.info("[WebSocket] Auth successful for user: \(payload.username)")
        } catch {
            req.logger.warning("[WebSocket] Auth failed: \(error)")
            try? await ws.close(code: .policyViolation)
            return
        }

        req.logger.info("[WebSocket] Client connected, adding to manager")
        req.application.webSocketManager.addClient(ws, app: req.application)
    }

    // --- Controller Registrations ---

    // Existing controllers
    try app.register(collection: LicenseController())
    try app.register(collection: AuthController())
    try app.register(collection: AdminController())
    try app.register(collection: BootConfigController())
    try app.register(collection: DiskController())
    try app.register(collection: RaidController())

    // New controllers (split from monolithic routes)
    try app.register(collection: ServiceController())
    try app.register(collection: DockerController())
    try app.register(collection: FileController())
    try app.register(collection: VMController())
    try app.register(collection: AutomationController())
    try app.register(collection: SettingsController())
    try app.register(collection: ConnectivityController())
    try app.register(collection: VNCProxyController())
    try app.register(collection: SystemController())
    try app.register(collection: SSHController())
    try app.register(collection: RemoteAccessController())
    try app.register(collection: SolutionsController())

    // Boot orchestrator
    BootOrchestrator.run(app: app)

    // Terminal WebSocket
    app.webSocket("terminal", "ws") { req, ws in
        // JWT auth check — same pattern as the main /ws endpoint
        if let token = req.query[String.self, at: "token"] {
            do {
                _ = try req.jwt.verify(token, as: UserPayload.self)
            } catch {
                try? await ws.close(code: .policyViolation)
                return
            }
        } else {
            try? await ws.close(code: .policyViolation)
            return
        }

        let eventLoop = ws.eventLoop
        let app = req.application
        let existingId = req.query[String.self, at: "sessionId"].flatMap { UUID(uuidString: $0) }

        guard let terminalService = app.serviceManager.getService(id: "terminal-service") as? TerminalService else {
            Task { try? await ws.close() }
            return
        }

        // Box to hold sessionId once it's created, since we must register handlers BEFORE await
        class SessionBox: @unchecked Sendable {
            var id: UUID?
        }
        let box = SessionBox()

        // 如果有 existingId，立即设置，避免时序问题
        if let existingId = existingId {
            box.id = existingId
        }

        // Register handlers synchronously while ON the event loop
        ws.onText { ws, text in
            // 如果 box.id 还未设置，等待一下（最多 1 秒）
            if box.id == nil {
                // 延迟处理，等待 sessionId 设置完成
                Task {
                    do {
                        var waited = 0
                        while box.id == nil && waited < 100 {
                            try? await Task.sleep(nanoseconds: 10_000_000) // 10ms
                            waited += 1
                        }
                        guard let sessionId = box.id else { return }
                        if text.hasPrefix("resize:") {
                            let parts = text.dropFirst(7).split(separator: ",")
                            if parts.count == 2, let cols = UInt16(parts[0]), let rows = UInt16(parts[1]) {
                                await terminalService.resize(id: sessionId, cols: cols, rows: rows)
                            }
                        } else {
                            await terminalService.handleInput(id: sessionId, data: text)
                        }
                    } catch {
                        // 错误处理：发送错误消息到前端，但不关闭连接
                        eventLoop.execute {
                            ws.send("terminal_error:\(error.localizedDescription)")
                        }
                    }
                }
            } else {
                guard let sessionId = box.id else { return }
                Task {
                    do {
                        if text.hasPrefix("resize:") {
                            let parts = text.dropFirst(7).split(separator: ",")
                            if parts.count == 2, let cols = UInt16(parts[0]), let rows = UInt16(parts[1]) {
                                await terminalService.resize(id: sessionId, cols: cols, rows: rows)
                            }
                        } else {
                            await terminalService.handleInput(id: sessionId, data: text)
                        }
                    } catch {
                        // 错误处理：发送错误消息到前端，但不关闭连接
                        eventLoop.execute {
                            ws.send("terminal_error:\(error.localizedDescription)")
                        }
                    }
                }
            }
        }

        ws.onClose.whenComplete { _ in
            Task {
                guard let sessionId = box.id else { return }
                await terminalService.detachSession(id: sessionId)
            }
        }

        // Perform async setup in a separate task to avoid blocking the EventLoop
        // and to ensure we don't call registration methods after a thread jump.
        Task {
            let sessionId = await terminalService.getOrCreateSession(existingId: existingId)
            await terminalService.attachSession(id: sessionId, ws: ws, eventLoop: eventLoop)

            eventLoop.execute {
                box.id = sessionId
                ws.send("session_id:\(sessionId.uuidString)")
            }
        }
    }
}
