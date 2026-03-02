import Vapor

struct RaidController: RouteCollection {
    let raidService = RaidService()
    
    func boot(routes: RoutesBuilder) throws {
        let raids = routes.grouped("raids")
        
        // Read operations
        raids.get(use: listRaids)
        raids.get(":id", use: getRaid)
        
        // Write operations
        raids.post(use: createRaid)
        raids.delete(":id", use: deleteRaid)
        raids.post(":id", "add", use: addMember)
        raids.post(":id", "remove", use: removeMember)
        raids.post(":id", "repair", use: repairRaid)
    }
    
    // GET /api/raids
    func listRaids(req: Request) async throws -> [RaidService.RaidSet] {
        return try await raidService.listRaids()
    }
    
    // GET /api/raids/:id
    func getRaid(req: Request) async throws -> RaidService.RaidSet {
        guard let id = req.parameters.get("id") else {
            throw Abort(.badRequest, reason: "Missing RAID ID")
        }
        return try await raidService.getRaid(uniqueId: id)
    }
    
    // POST /api/raids
    func createRaid(req: Request) async throws -> RaidService.RaidSet {
        let input = try req.content.decode(RaidService.CreateRaidRequest.self)
        return try await raidService.createRaid(
            type: input.type,
            name: input.name,
            disks: input.disks
        )
    }
    
    // DELETE /api/raids/:id
    func deleteRaid(req: Request) async throws -> HTTPStatus {
        guard let id = req.parameters.get("id") else {
            throw Abort(.badRequest, reason: "Missing RAID ID")
        }
        try await raidService.deleteRaid(uniqueId: id)
        return .noContent
    }
    
    // POST /api/raids/:id/add
    func addMember(req: Request) async throws -> HTTPStatus {
        guard let id = req.parameters.get("id") else {
            throw Abort(.badRequest, reason: "Missing RAID ID")
        }
        let input = try req.content.decode(RaidService.AddMemberRequest.self)
        try await raidService.addMember(
            raidId: id,
            disk: input.disk,
            asSpare: input.asSpare ?? false
        )
        return .ok
    }
    
    // POST /api/raids/:id/remove
    func removeMember(req: Request) async throws -> HTTPStatus {
        guard let id = req.parameters.get("id") else {
            throw Abort(.badRequest, reason: "Missing RAID ID")
        }
        let input = try req.content.decode(RaidService.RemoveMemberRequest.self)
        try await raidService.removeMember(raidId: id, disk: input.disk)
        return .ok
    }
    
    // POST /api/raids/:id/repair
    func repairRaid(req: Request) async throws -> HTTPStatus {
        guard let id = req.parameters.get("id") else {
            throw Abort(.badRequest, reason: "Missing RAID ID")
        }
        let input = try req.content.decode(RaidService.RepairRaidRequest.self)
        try await raidService.repairMirror(raidId: id, disk: input.disk)
        return .ok
    }
}
