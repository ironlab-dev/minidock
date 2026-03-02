import Vapor
import Fluent

struct BootConfigController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let boot = routes.grouped("system", "boot-config")
        boot.get(use: list)
        boot.post(use: save)
        boot.delete(":id", use: delete)
    }
    
    // GET /system/boot-config
    func list(req: Request) async throws -> [ServiceBootConfig] {
        try await ServiceBootConfig.query(on: req.db).all()
    }
    
    // POST /system/boot-config
    // Upsert based on service_id + item_id
    func save(req: Request) async throws -> ServiceBootConfig {
        let input = try req.content.decode(ServiceBootConfig.self)
        
        // Check if exists
        let query = ServiceBootConfig.query(on: req.db)
            .filter(\.$serviceId == input.serviceId)
        
        if let itemId = input.itemId {
            query.filter(\.$itemId == itemId)
        } else {
            query.filter(\.$itemId == nil)
        }
        
        if let existing = try await query.first() {
            existing.autoStart = input.autoStart
            existing.bootPriority = input.bootPriority
            existing.bootDelay = input.bootDelay
            existing.itemName = input.itemName 
            try await existing.save(on: req.db)
            return existing
        } else {
            try await input.save(on: req.db)
            return input
        }
    }

    func delete(req: Request) async throws -> HTTPStatus {
        guard let id = req.parameters.get("id", as: UUID.self),
              let config = try await ServiceBootConfig.find(id, on: req.db) else {
            throw Abort(.notFound)
        }
        try await config.delete(on: req.db)
        return .ok
    }
}
