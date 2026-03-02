import Vapor

struct DockerController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let docker = routes.grouped(
            CookieAuthMiddleware(),
            User.jwtAuthenticator(),
            User.guardMiddleware()
        ).grouped("docker", "services")

        docker.get(use: list)
        docker.get("images", "status", use: getImageStatus)
        docker.get(":name", "files", use: getFiles)
        docker.put(":name", "files", use: updateFile)
        docker.delete(":name", "files", use: deleteFile)
        docker.post(":name", "directories", use: createDirectory)
        docker.post(":name", "files", "rename", use: renameFile)
        docker.post(":name", "validate", "file", use: validateFile)
        docker.post(":name", "files", use: createFile)
        docker.post(":name", "action", use: performAction)
        docker.get(":name", "logs", use: getLogs)
        docker.get(":name", "history", use: getHistory)
        docker.get(":name", "diff", ":hash", use: getDiff)
        docker.delete(":name", use: deleteService)
    }

    // DTOs
    struct ValidationResponse: Content {
        let valid: Bool
        let errors: [String]?
    }
    struct ValidatePayload: Content {
        let file: String
        let content: String
    }

    func list(req: Request) async throws -> [DockerStorageService.DockerServiceItem] {
        guard let storage = req.application.serviceManager.getService(id: "docker-storage") as? DockerStorageService else {
            throw Abort(.notFound)
        }
        return try await storage.listServices(app: req.application)
    }

    func getImageStatus(req: Request) async throws -> DockerStorageService.ImageStatus {
        guard let storage = req.application.serviceManager.getService(id: "docker-storage") as? DockerStorageService else {
            throw Abort(.notFound)
        }
        let imageName = try req.query.get(String.self, at: "image")
        return try await storage.getImageStatus(app: req.application, imageName: imageName)
    }

    func getFiles(req: Request) async throws -> Response {
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "docker-storage") as? DockerStorageService else {
            throw Abort(.notFound)
        }
        
        // Check if "file" query parameter is provided (for reading files)
        if let file = try? req.query.get(String.self, at: "file"), !file.isEmpty {
            // Read file
            let decodedPath = file.removingPercentEncoding ?? file
            
            // Check if it's an image file
            if storage.isImageFile(decodedPath) {
                // Return binary data for images
                let data = try await storage.readFileAsData(app: req.application, serviceName: name, fileName: decodedPath)
                let mimeType = storage.getMimeType(for: decodedPath)
                
                var headers = HTTPHeaders()
                headers.add(name: .contentType, value: mimeType)
                headers.add(name: .cacheControl, value: "public, max-age=3600")
                
                return Response(status: .ok, headers: headers, body: .init(data: data))
            } else {
                // Return text content for text files
                let content = try await storage.readFile(app: req.application, serviceName: name, fileName: decodedPath)
                return try await PageContent(content: content).encodeResponse(for: req)
            }
        } else {
            // List directory
            let path = (try? req.query.get(String.self, at: "path")) ?? ""
            let items = try await storage.listDirectory(app: req.application, serviceName: name, path: path)
            return try await items.encodeResponse(for: req)
        }
    }

    func updateFile(req: Request) async throws -> HTTPStatus {
        try await RoutesHelpers.handleFileUpdate(req)
    }

    func deleteFile(req: Request) async throws -> HTTPStatus {
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "docker-storage") as? DockerStorageService else {
            throw Abort(.notFound)
        }
        
        guard let file = try? req.query.get(String.self, at: "file"), !file.isEmpty else {
            throw Abort(.badRequest, reason: "File path is required")
        }
        
        let decodedPath = file.removingPercentEncoding ?? file
        try await storage.deleteFile(app: req.application, serviceName: name, fileName: decodedPath)
        return .noContent
    }

    func createDirectory(req: Request) async throws -> HTTPStatus {
        struct CreateDirPayload: Content {
            let path: String
        }
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "docker-storage") as? DockerStorageService else {
            throw Abort(.notFound)
        }
        let payload = try req.content.decode(CreateDirPayload.self)
        try await storage.createDirectory(app: req.application, serviceName: name, path: payload.path)
        return .created
    }

    func renameFile(req: Request) async throws -> HTTPStatus {
        struct RenamePayload: Content {
            let oldName: String
            let newName: String
        }
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "docker-storage") as? DockerStorageService else {
            throw Abort(.notFound)
        }
        let payload = try req.content.decode(RenamePayload.self)
        try await storage.renameFile(app: req.application, serviceName: name, oldName: payload.oldName, newName: payload.newName)
        return .ok
    }

    func validateFile(req: Request) async throws -> ValidationResponse {
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "docker-storage") as? DockerStorageService else {
            throw Abort(.notFound)
        }
        let payload = try req.content.decode(ValidatePayload.self)
        let file = payload.file
        
        if file == "docker-compose.yml" || file.hasSuffix(".yml") || file.hasSuffix(".yaml") {
            let result = try await storage.validateComposeFile(app: req.application, serviceName: name, content: payload.content)
            return ValidationResponse(valid: result.valid, errors: result.valid ? nil : result.errors)
        } else {
            return ValidationResponse(valid: true, errors: nil)
        }
    }

    func createFile(req: Request) async throws -> HTTPStatus {
        try await RoutesHelpers.handleFileUpdate(req)
    }

    func performAction(req: Request) async throws -> PageContent {
        struct ActionPayload: Content {
            let action: String
        }
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "docker-storage") as? DockerStorageService else {
            throw Abort(.notFound)
        }
        let payload = try req.content.decode(ActionPayload.self)
        
        let args: [String]
        switch payload.action {
        case "start": args = ["up", "-d", "--remove-orphans"]
        case "stop": args = ["down"]
        case "restart": args = ["up", "-d", "--force-recreate"]
        case "down": args = ["down"]
        default: throw Abort(.badRequest, reason: "Invalid action: \(payload.action)")
        }
        let isNonBlocking = payload.action == "start" || payload.action == "restart"
        let output = try await storage.runComposeCommand(app: req.application, serviceName: name, args: args, nonBlocking: isNonBlocking)
        return PageContent(content: output)
    }

    func getLogs(req: Request) async throws -> PageContent {
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "docker-storage") as? DockerStorageService else {
            throw Abort(.notFound)
        }
        let tail = (try? req.query.get(Int.self, at: "tail")) ?? 100
        let logs = try await storage.getLogs(app: req.application, serviceName: name, tail: tail)
        return PageContent(content: logs)
    }

    func getHistory(req: Request) async throws -> [DockerStorageService.GitCommit] {
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "docker-storage") as? DockerStorageService else {
            throw Abort(.notFound)
        }
        return try await storage.getHistory(app: req.application, serviceName: name)
    }

    func getDiff(req: Request) async throws -> PageContent {
        guard let name = req.parameters.get("name"),
              let hash = req.parameters.get("hash"),
              let storage = req.application.serviceManager.getService(id: "docker-storage") as? DockerStorageService else {
            throw Abort(.notFound)
        }
        let diff = try await storage.getDiff(app: req.application, serviceName: name, commitHash: hash)
        return PageContent(content: diff)
    }

    func deleteService(req: Request) async throws -> HTTPStatus {
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "docker-storage") as? DockerStorageService else {
            throw Abort(.notFound)
        }
        try await storage.deleteService(app: req.application, serviceName: name)
        return .noContent
    }
}
