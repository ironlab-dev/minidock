import Vapor

struct SolutionsController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let solutions = routes.grouped(
            CookieAuthMiddleware(),
            User.jwtAuthenticator(),
            User.guardMiddleware()
        ).grouped("solutions")

        solutions.get(use: list)
        solutions.get(":id", use: getDetail)
        solutions.post(":id", "deploy", use: deploy)
        solutions.get(":id", "preflight", use: preflight)
        solutions.get(":id", "status", use: getStatus)
        solutions.post(":id", "action", use: performAction)
        solutions.put(":id", "paths", use: updatePaths)
        solutions.delete(":id", use: uninstall)
    }

    func list(req: Request) async throws -> [SolutionInfoDTO] {
        guard let service = req.application.serviceManager.getSolutionService() else {
            throw Abort(.internalServerError, reason: "Solution service not available")
        }
        return try await service.listSolutions(app: req.application)
    }

    func getDetail(req: Request) async throws -> SolutionDetailDTO {
        guard let id = req.parameters.get("id"),
              let service = req.application.serviceManager.getSolutionService() else {
            throw Abort(.notFound)
        }
        return try await service.getSolutionDetail(app: req.application, id: id)
    }

    func deploy(req: Request) async throws -> DeploymentProgressDTO {
        guard let id = req.parameters.get("id"),
              let service = req.application.serviceManager.getSolutionService() else {
            throw Abort(.notFound)
        }
        let deployRequest = try req.content.decode(DeployRequestDTO.self)
        return try await service.deploy(app: req.application, id: id, request: deployRequest)
    }

    func preflight(req: Request) async throws -> PreflightResultDTO {
        guard let id = req.parameters.get("id"),
              let service = req.application.serviceManager.getSolutionService() else {
            throw Abort(.notFound)
        }
        return try await service.preflight(app: req.application, id: id)
    }

    func getStatus(req: Request) async throws -> DeploymentProgressDTO {
        guard let id = req.parameters.get("id"),
              let service = req.application.serviceManager.getSolutionService() else {
            throw Abort(.notFound)
        }
        return service.getDeploymentProgress(id: id)
    }

    func performAction(req: Request) async throws -> [String: String] {
        guard let id = req.parameters.get("id"),
              let service = req.application.serviceManager.getSolutionService() else {
            throw Abort(.notFound)
        }
        let actionReq = try req.content.decode(ActionRequestDTO.self)
        return try await service.performAction(app: req.application, id: id, action: actionReq.action)
    }

    func updatePaths(req: Request) async throws -> SolutionDeploymentDTO {
        guard let id = req.parameters.get("id"),
              let service = req.application.serviceManager.getSolutionService() else {
            throw Abort(.notFound)
        }
        let pathsReq = try req.content.decode(UpdatePathsRequestDTO.self)
        return try await service.updatePaths(app: req.application, id: id, request: pathsReq)
    }

    func uninstall(req: Request) async throws -> HTTPStatus {
        guard let id = req.parameters.get("id"),
              let service = req.application.serviceManager.getSolutionService() else {
            throw Abort(.notFound)
        }
        try await service.uninstall(app: req.application, id: id)
        return .noContent
    }
}
