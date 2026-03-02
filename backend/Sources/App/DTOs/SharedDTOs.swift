import Vapor

struct PageContent: Content {
    let content: String
}

struct BuildInfoResponse: Content {
    let binaryTimestamp: Double
    let runningBinaryTimestamp: Double
    let sourceTimestamp: Double
    let needsRebuild: Bool
    let binaryPath: String
    let latestSourcePath: String
}

struct DevInfoResponse: Content {
    let isDevMode: Bool
    let workingDirectory: String
}

struct DirectoryPreviewResponse: Content {
    var exists: Bool
    var isGitRepo: Bool
    var hasUncommittedChanges: Bool
    var items: [PreviewItem]
    var actions: [String]
}

struct PreviewItem: Content {
    let name: String
    let type: String  // "service" | "vm"
}

struct RoutesHelpers {
    static func handleFileUpdate(_ req: Request) async throws -> HTTPStatus {
        struct FilePayload: Content { let content: String }
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "docker-storage") as? DockerStorageService else {
            throw Abort(.notFound)
        }
        
        // Get file path from query parameter
        guard let file = try? req.query.get(String.self, at: "file"), !file.isEmpty else {
            throw Abort(.badRequest, reason: "File path is required (use ?file=path/to/file)")
        }
        
        // URL decode the file path
        let decodedPath = file.removingPercentEncoding ?? file
        
        let payload = try req.content.decode(FilePayload.self)
        try await storage.writeFile(app: req.application, serviceName: name, fileName: decodedPath, content: payload.content)
        return .ok
    }
}
