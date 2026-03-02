import Vapor

struct ServiceController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let services = routes.grouped(
            CookieAuthMiddleware(),
            User.jwtAuthenticator(),
            User.guardMiddleware()
        ).grouped("services")

        services.get(use: list)
        services.get(":id", use: getService)
        services.post(":id", ":action", use: performAction)
        services.get(":id", "items", use: getItems)
        services.post(":id", "items", ":itemId", ":action", use: performItemAction)
        services.get(":id", "items", ":itemId", use: getItemDetails)
        services.get(":id", "items", ":itemId", "logs", use: getItemLogs)
        services.get(":id", "hardware", ":type", use: getHardwareInfo)
    }

    func list(req: Request) async throws -> [ServiceInfo] {
        try await req.application.serviceManager.listServices(app: req.application)
    }

    func getService(req: Request) async throws -> ServiceInfo {
        guard let id = req.parameters.get("id"),
              let service = req.application.serviceManager.getService(id: id) else {
            throw Abort(.notFound)
        }
        return try await service.getInfo(app: req.application)
    }

    func performAction(req: Request) async throws -> ServiceInfo {
        guard let id = req.parameters.get("id"),
              let action = req.parameters.get("action"),
              let service = req.application.serviceManager.getService(id: id) else {
            throw Abort(.notFound)
        }
        
        switch action {
        case "start":
            try await service.start(app: req.application)
        case "stop":
            try await service.stop(app: req.application)
        case "restart":
            try await service.restart(app: req.application)
        default:
            throw Abort(.badRequest, reason: "Unknown action: \(action)")
        }
        
        return try await service.getInfo(app: req.application)
    }

    func getItems(req: Request) async throws -> [ServiceItem] {
        guard let id = req.parameters.get("id"),
              let service = req.application.serviceManager.getService(id: id) else {
            throw Abort(.notFound)
        }
        return try await service.getItems(app: req.application)
    }

    func performItemAction(req: Request) async throws -> ServiceInfo {
        guard let id = req.parameters.get("id"),
              let itemId = req.parameters.get("itemId"),
              let action = req.parameters.get("action"),
              let service = req.application.serviceManager.getService(id: id) else {
            throw Abort(.notFound)
        }
        
        req.application.logger.info("[DockerEngine] Performing action '\(action)' on container '\(itemId)'")
        do {
            try await service.performItemAction(app: req.application, itemId: itemId, action: action)
            req.application.logger.info("[DockerEngine] Successfully performed action '\(action)' on container '\(itemId)'")
        } catch {
            req.application.logger.error("[DockerEngine] Failed to perform action '\(action)' on container '\(itemId)': \(error)")
            throw error
        }
        
        // Safely get service info after action - wrap in try-catch to prevent crashes
        do {
            return try await service.getInfo(app: req.application)
        } catch {
            req.application.logger.error("[DockerEngine] Failed to get service info after action: \(error.localizedDescription)")
            // Return basic info even if getInfo fails - try to get status first
            let fallbackStatus: ServiceStatus
            do {
                fallbackStatus = try await service.getStatus()
            } catch {
                fallbackStatus = .unknown
            }
            return ServiceInfo(
                id: id,
                name: service.name,
                type: service.type,
                status: fallbackStatus,
                description: nil,
                stats: nil
            )
        }
    }

    func getItemDetails(req: Request) async throws -> [String: String] {
        guard let id = req.parameters.get("id"),
              let itemId = req.parameters.get("itemId"),
              let service = req.application.serviceManager.getService(id: id) else {
            throw Abort(.notFound)
        }
        return try await service.getItemDetails(app: req.application, itemId: itemId)
    }

    func getItemLogs(req: Request) async throws -> PageContent {
        guard let id = req.parameters.get("id"),
              let itemId = req.parameters.get("itemId"),
              let service = req.application.serviceManager.getService(id: id) as? DockerEngineService else {
            throw Abort(.notFound)
        }
        let tail = (try? req.query.get(Int.self, at: "tail")) ?? 100
        let logs = try await service.getLogs(containerId: itemId, tail: tail)
        return PageContent(content: logs)
    }

    func getHardwareInfo(req: Request) async throws -> Response {
        guard let id = req.parameters.get("id"),
              let type = req.parameters.get("type"),
              let service = req.application.serviceManager.getService(id: id) as? SystemService else {
            throw Abort(.notFound)
        }
        
        let allowedTypes = ["SPUSBDataType", "SPNetworkDataType", "SPThunderboltDataType", "SPPowerDataType", "SPDisplaysDataType", "SPHardwareDataType", "SPBluetoothDataType", "SPAudioDataType", "SPSerialATADataType", "SPStorageDataType", "SPMemoryDataType"]
        guard allowedTypes.contains(type) else {
             throw Abort(.badRequest, reason: "Invalid hardware type")
        }
        
        let json = try await service.getHardwareInfo(dataType: type)
        var headers = HTTPHeaders()
        headers.add(name: .contentType, value: "application/json")
        headers.add(name: .cacheControl, value: "private, max-age=10")
        return Response(status: .ok, headers: headers, body: .init(string: json))
    }
}
