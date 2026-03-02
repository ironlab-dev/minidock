import Vapor

struct DiskController: RouteCollection {
    let diskService = DiskService()
    
    func boot(routes: RoutesBuilder) throws {
        let disks = routes.grouped("disks")
        
        disks.get(use: listDisks)
        disks.get(":id", use: getDiskInfo)
        disks.post(":id", "mount", use: mountDisk)
        disks.post(":id", "unmount", use: unmountDisk)
        disks.post(":id", "eject", use: ejectDisk)
        disks.post(":id", "erase", use: eraseDisk)
    }
    
    // GET /api/disks
    func listDisks(req: Request) async throws -> [DiskService.DiskInfo] {
        return try await diskService.listDisks()
    }
    
    // GET /api/disks/:id
    func getDiskInfo(req: Request) async throws -> [String: String] {
        guard let id = req.parameters.get("id") else {
            throw Abort(.badRequest, reason: "Missing disk ID")
        }
        return try await diskService.getDiskInfo(id: id)
    }
    
    // POST /api/disks/:id/mount
    func mountDisk(req: Request) async throws -> HTTPStatus {
        guard let id = req.parameters.get("id") else {
            throw Abort(.badRequest)
        }
        try await diskService.mount(id: id)
        return .ok
    }
    
    // POST /api/disks/:id/unmount
    func unmountDisk(req: Request) async throws -> HTTPStatus {
        guard let id = req.parameters.get("id") else {
            throw Abort(.badRequest)
        }
        try await diskService.unmount(id: id)
        return .ok
    }
    
    // POST /api/disks/:id/eject
    func ejectDisk(req: Request) async throws -> HTTPStatus {
        guard let id = req.parameters.get("id") else {
            throw Abort(.badRequest)
        }
        try await diskService.eject(id: id)
        return .ok
    }
    
    struct EraseRequest: Content {
        let format: String
        let name: String
    }
    
    // POST /api/disks/:id/erase
    func eraseDisk(req: Request) async throws -> HTTPStatus {
        guard let id = req.parameters.get("id") else {
            throw Abort(.badRequest)
        }
        let input = try req.content.decode(EraseRequest.self)
        try await diskService.erase(id: id, format: input.format, name: input.name)
        return .ok
    }
}
