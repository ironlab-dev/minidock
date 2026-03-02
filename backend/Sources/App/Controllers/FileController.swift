import Vapor

struct FileController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let files = routes.grouped(
            CookieAuthMiddleware(),
            User.jwtAuthenticator(),
            User.guardMiddleware()
        ).grouped("files")

        files.get(use: getFiles)
        files.put(use: writeFile)
        files.delete(use: deleteFile)
        files.post("directories", use: createDirectory)
        files.post("rename", use: renameFile)
        files.get("info", use: getFileInfo)
    }

    func getFiles(req: Request) async throws -> Response {
        let fileService = SystemFileService()
        // Check if "file" query parameter is provided (for reading files)
        if let file = try? req.query.get(String.self, at: "file"), !file.isEmpty {
            // Read file
            let decodedPath = file.removingPercentEncoding ?? file
            
            // Check if it's an image file
            if fileService.isImageFile(decodedPath) {
                // Return binary data for images
                let data = try await fileService.readFileAsData(app: req.application, filePath: decodedPath)
                let mimeType = fileService.getMimeType(for: decodedPath)
                
                var headers = HTTPHeaders()
                headers.add(name: .contentType, value: mimeType)
                headers.add(name: .cacheControl, value: "public, max-age=3600")
                
                return Response(status: .ok, headers: headers, body: .init(data: data))
            } else {
                // Return text content for text files
                let content = try await fileService.readFile(app: req.application, filePath: decodedPath)
                return try await PageContent(content: content).encodeResponse(for: req)
            }
        } else {
            // List directory
            let path = (try? req.query.get(String.self, at: "path")) ?? ""
            let items = try await fileService.listDirectory(app: req.application, path: path)
            return try await items.encodeResponse(for: req)
        }
    }

    func writeFile(req: Request) async throws -> HTTPStatus {
        let fileService = SystemFileService()
        struct FilePayload: Content {
            let content: String
        }
        
        // Get file path from query parameter
        guard let file = try? req.query.get(String.self, at: "file"), !file.isEmpty else {
            throw Abort(.badRequest, reason: "File path is required (use ?file=path/to/file)")
        }
        
        // URL decode the file path
        let decodedPath = file.removingPercentEncoding ?? file
        
        let payload = try req.content.decode(FilePayload.self)
        try await fileService.writeFile(app: req.application, filePath: decodedPath, content: payload.content)
        return .ok
    }

    func deleteFile(req: Request) async throws -> HTTPStatus {
        let fileService = SystemFileService()
        guard let file = try? req.query.get(String.self, at: "file"), !file.isEmpty else {
            throw Abort(.badRequest, reason: "File path is required")
        }
        
        let decodedPath = file.removingPercentEncoding ?? file
        try await fileService.deleteFile(app: req.application, filePath: decodedPath)
        return .noContent
    }

    func createDirectory(req: Request) async throws -> HTTPStatus {
        let fileService = SystemFileService()
        struct CreateDirPayload: Content {
            let path: String
        }
        let payload = try req.content.decode(CreateDirPayload.self)
        try await fileService.createDirectory(app: req.application, path: payload.path)
        return .created
    }

    func renameFile(req: Request) async throws -> HTTPStatus {
        let fileService = SystemFileService()
        struct RenamePayload: Content {
            let oldPath: String
            let newName: String
        }
        let payload = try req.content.decode(RenamePayload.self)
        // oldPath is relative path from allowed root, newName is just the filename
        try await fileService.renameFile(app: req.application, oldPath: payload.oldPath, newName: payload.newName)
        return .ok
    }

    func getFileInfo(req: Request) async throws -> SystemFileService.FileInfo {
        let fileService = SystemFileService()
        guard let file = try? req.query.get(String.self, at: "file"), !file.isEmpty else {
            throw Abort(.badRequest, reason: "File path is required (use ?file=path/to/file)")
        }
        
        let decodedPath = file.removingPercentEncoding ?? file
        return try await fileService.getFileInfo(app: req.application, filePath: decodedPath)
    }
}
