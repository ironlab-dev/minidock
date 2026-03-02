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
        // Verify JWT token from query parameter for WebSocket auth
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
        req.application.webSocketManager.addClient(ws, app: req.application)
    }
    try app.register(collection: LicenseController())

    // Public routes
    let publicRoutes = app.grouped(User.jwtAuthenticator()) // Optional auth for public routes if needed
    
    // Protected routes
    let protected = app.grouped(User.jwtAuthenticator(), User.guardMiddleware())

    let services = protected.grouped("services")
    
    services.get { req async throws -> [ServiceInfo] in
        try await req.application.serviceManager.listServices(app: req.application)
    }
    
    services.get(":id") { req async throws -> ServiceInfo in
        guard let id = req.parameters.get("id"),
              let service = req.application.serviceManager.getService(id: id) else {
            throw Abort(.notFound)
        }
        return try await service.getInfo(app: req.application)
    }
    
    services.post(":id", ":action") { req async throws -> ServiceInfo in
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
    
    services.get(":id", "items") { req async throws -> [ServiceItem] in
        guard let id = req.parameters.get("id"),
              let service = req.application.serviceManager.getService(id: id) else {
            throw Abort(.notFound)
        }
        return try await service.getItems(app: req.application)
    }
    
    services.post(":id", "items", ":itemId", ":action") { req async throws -> ServiceInfo in
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
    
    services.get(":id", "items", ":itemId") { req async throws -> [String: String] in
        guard let id = req.parameters.get("id"),
              let itemId = req.parameters.get("itemId"),
              let service = req.application.serviceManager.getService(id: id) else {
            throw Abort(.notFound)
        }
        return try await service.getItemDetails(app: req.application, itemId: itemId)
    }

    services.get(":id", "items", ":itemId", "logs") { req async throws -> PageContent in
        guard let id = req.parameters.get("id"),
              let itemId = req.parameters.get("itemId"),
              let service = req.application.serviceManager.getService(id: id) as? DockerEngineService else {
            throw Abort(.notFound)
        }
        let tail = (try? req.query.get(Int.self, at: "tail")) ?? 100
        let logs = try await service.getLogs(containerId: itemId, tail: tail)
        return PageContent(content: logs)
    }

    services.get(":id", "hardware", ":type") { req async throws -> Response in
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

    // Unified Docker Management (GitOps)
    let docker = protected.grouped("docker", "services")
    
    docker.get { req async throws -> [DockerStorageService.DockerServiceItem] in
        guard let storage = req.application.serviceManager.getService(id: "docker-storage") as? DockerStorageService else {
            throw Abort(.notFound)
        }
        return try await storage.listServices(app: req.application)
    }
    
    docker.get("images", "status") { req async throws -> DockerStorageService.ImageStatus in
        guard let storage = req.application.serviceManager.getService(id: "docker-storage") as? DockerStorageService else {
            throw Abort(.notFound)
        }
        let imageName = try req.query.get(String.self, at: "image")
        return try await storage.getImageStatus(app: req.application, imageName: imageName)
    }
    
    // List directory contents or read file
    // If "file" query parameter is provided, read the file; otherwise list directory
    docker.get(":name", "files") { req async throws -> Response in
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
    
    docker.put(":name", "files") { req async throws -> HTTPStatus in
        try await RoutesHelpers.handleFileUpdate(req)
    }
    
    docker.delete(":name", "files") { req async throws -> HTTPStatus in
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
    
    docker.post(":name", "directories") { req async throws -> HTTPStatus in
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
    
    docker.post(":name", "files", "rename") { req async throws -> HTTPStatus in
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
    
    // 验证端点
    struct ValidationResponse: Content {
        let valid: Bool
        let errors: [String]?
    }
    struct ValidatePayload: Content {
        let file: String
        let content: String
    }
    
    docker.post(":name", "validate", "file") { req async throws -> ValidationResponse in
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
    
    docker.post(":name", "files") { req async throws -> HTTPStatus in
        try await RoutesHelpers.handleFileUpdate(req)
    }
    
    docker.post(":name", "action") { req async throws -> PageContent in
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
    
    docker.get(":name", "logs") { req async throws -> PageContent in
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "docker-storage") as? DockerStorageService else {
            throw Abort(.notFound)
        }
        let tail = (try? req.query.get(Int.self, at: "tail")) ?? 100
        let logs = try await storage.getLogs(app: req.application, serviceName: name, tail: tail)
        return PageContent(content: logs)
    }

    docker.get(":name", "history") { req async throws -> [DockerStorageService.GitCommit] in
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "docker-storage") as? DockerStorageService else {
            throw Abort(.notFound)
        }
        return try await storage.getHistory(app: req.application, serviceName: name)
    }
    
    docker.get(":name", "diff", ":hash") { req async throws -> PageContent in
        guard let name = req.parameters.get("name"),
              let hash = req.parameters.get("hash"),
              let storage = req.application.serviceManager.getService(id: "docker-storage") as? DockerStorageService else {
            throw Abort(.notFound)
        }
        let diff = try await storage.getDiff(app: req.application, serviceName: name, commitHash: hash)
        return PageContent(content: diff)
    }
    
    docker.delete(":name") { req async throws -> HTTPStatus in
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "docker-storage") as? DockerStorageService else {
            throw Abort(.notFound)
        }
        try await storage.deleteService(app: req.application, serviceName: name)
        return .noContent
    }
    
    // System File Management
    let files = protected.grouped("files")
    let fileService = SystemFileService()
    
    // List directory contents or read file
    // If "file" query parameter is provided, read the file; otherwise list directory
    files.get { req async throws -> Response in
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
    
    // Write file
    files.put { req async throws -> HTTPStatus in
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
    
    // Delete file
    files.delete { req async throws -> HTTPStatus in
        guard let file = try? req.query.get(String.self, at: "file"), !file.isEmpty else {
            throw Abort(.badRequest, reason: "File path is required")
        }
        
        let decodedPath = file.removingPercentEncoding ?? file
        try await fileService.deleteFile(app: req.application, filePath: decodedPath)
        return .noContent
    }
    
    // Create directory
    files.post("directories") { req async throws -> HTTPStatus in
        struct CreateDirPayload: Content {
            let path: String
        }
        let payload = try req.content.decode(CreateDirPayload.self)
        try await fileService.createDirectory(app: req.application, path: payload.path)
        return .created
    }
    
    // Rename file
    files.post("rename") { req async throws -> HTTPStatus in
        struct RenamePayload: Content {
            let oldPath: String
            let newName: String
        }
        let payload = try req.content.decode(RenamePayload.self)
        // oldPath is relative path from allowed root, newName is just the filename
        try await fileService.renameFile(app: req.application, oldPath: payload.oldPath, newName: payload.newName)
        return .ok
    }
    
    // Get file info
    files.get("info") { req async throws -> SystemFileService.FileInfo in
        guard let file = try? req.query.get(String.self, at: "file"), !file.isEmpty else {
            throw Abort(.badRequest, reason: "File path is required (use ?file=path/to/file)")
        }
        
        let decodedPath = file.removingPercentEncoding ?? file
        return try await fileService.getFileInfo(app: req.application, filePath: decodedPath)
    }
    
    struct PageContent: Content {
        let content: String
    }
    struct USBDevice: Content, Sendable {
        let content: String
    }
    
    // Unified VM Management (Native QEMU)
    let vms = protected.grouped("vms", "services")
    
    vms.get { req async throws -> [VMStorageService.VMServiceItem] in
        guard let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService,
              let nativeVM = req.application.serviceManager.getService(id: "native-vm") as? NativeVMService else {
            throw Abort(.notFound)
        }
        
        var vms = try await storage.listVMs(app: req.application)
        
        for i in 0..<vms.count {
            let status = try await nativeVM.getVMStatus(vmPath: vms[i].path)
            
            vms[i] = VMStorageService.VMServiceItem(
                name: vms[i].name,
                directoryName: vms[i].directoryName,
                uuid: vms[i].uuid,
                architecture: vms[i].architecture,
                isRunning: status.status == "running",
                path: vms[i].path,
                vncPort: status.vncPort,
                ipAddress: status.ipAddress,
                macAddress: status.macAddress,
                cpuUsage: status.cpuUsage,
                memoryUsage: status.memoryUsage,
                qgaVerified: status.qgaVerified,
                configChanged: status.configChanged,
                configDifferences: status.configDifferences,
                vncBindAddress: status.vncBindAddress,
                autoStart: vms[i].autoStart,
                isManaged: vms[i].isManaged
            )
        }
        return vms
    }

    vms.get("isos") { req async throws -> [String] in
        guard let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        return try await storage.listISOs(app: req.application)
    }
    
    vms.get(":name", "config") { req async throws -> PageContent in
        guard let name = req.parameters.get("name") else {
            throw Abort(.badRequest, reason: "Missing VM name")
        }
        guard let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        let config = try await storage.getConfig(app: req.application, vmName: name)
        return PageContent(content: config)
    }

    vms.put(":name", "config") { req async throws -> HTTPStatus in
        guard let name = req.parameters.get("name") else {
            throw Abort(.badRequest, reason: "Missing VM name")
        }
        let update = try req.content.decode(PageContent.self)
        
        guard let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        try await storage.updateConfig(app: req.application, vmName: name, content: update.content)
        
        return .ok
    }
    
    vms.get(":name", "history") { req async throws -> [VMStorageService.GitCommit] in
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        return try await storage.getHistory(app: req.application, vmName: name)
    }
    
    vms.get(":name", "diff", ":hash") { req async throws -> PageContent in
        guard let name = req.parameters.get("name"),
              let hash = req.parameters.get("hash"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        let diff = try await storage.getDiff(app: req.application, vmName: name, commitHash: hash)
        return PageContent(content: diff)
    }
    
    vms.post { req async throws -> HTTPStatus in
        struct CreatePayload: Content {
            let name: String
            let arch: String
            let ram: Int?
            let cpuCount: Int?
            let diskSize: Int?
            let preset: String?
            let uefi: Bool?
            let networkMode: String?
            let bridgeInterface: String?
            let isoPath: String?
        }
        guard let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        let payload = try req.content.decode(CreatePayload.self)
        try await storage.createVM(
            app: req.application, 
            name: payload.name, 
            arch: payload.arch,
            ramMB: payload.ram,
            cpuCount: payload.cpuCount,
            diskSizeGB: payload.diskSize,
            preset: payload.preset,
            uefi: payload.uefi,
            networkMode: payload.networkMode,
            bridgeInterface: payload.bridgeInterface,
            isoPath: payload.isoPath
        )
        return .created
    }
    
    vms.post(":name", "action") { req async throws -> HTTPStatus in
        struct ActionPayload: Content {
            let action: String
        }
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService,
              let nativeVM = req.application.serviceManager.getService(id: "native-vm") as? NativeVMService else {
            throw Abort(.notFound)
        }
        
        let payload = try req.content.decode(ActionPayload.self)
        let vms_list = try await storage.listVMs(app: req.application)
        // 支持通过 directoryName 或 name（显示名称）查找
        guard let vm = vms_list.first(where: { $0.directoryName == name || $0.name == name }) else {
            throw Abort(.notFound, reason: "VM not found: \(name)")
        }
        
        switch payload.action {
        case "start":
            try await nativeVM.startVM(app: req.application, vmPath: vm.path)
        case "stop":
            try await nativeVM.stopVM(app: req.application, vmPath: vm.path)
        default:
            throw Abort(.badRequest, reason: "Invalid action: \(payload.action)")
        }
        
        return .ok
    }
    
    vms.post("import") { req async throws -> HTTPStatus in
        struct ImportPayload: Content {
            let sourcePath: String
        }
        guard let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        let payload = try req.content.decode(ImportPayload.self)
        try await storage.importUTM(app: req.application, fromPath: payload.sourcePath)
        return .ok
    }
    
    vms.get(":name", "snapshots") { req async throws -> [VMStorageService.VMSnapshot] in
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        return try await storage.listSnapshots(app: req.application, vmName: name)
    }
    
    vms.post(":name", "snapshots") { req async throws -> HTTPStatus in
        struct CreateSnapshot: Content { let name: String }
        guard let vmName = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        let payload = try req.content.decode(CreateSnapshot.self)
        try await storage.createSnapshot(app: req.application, vmName: vmName, snapshotName: payload.name)
        return .created
    }
    
    vms.post(":name", "snapshots", ":snapName", "revert") { req async throws -> HTTPStatus in
        guard let vmName = req.parameters.get("name"),
              let snapName = req.parameters.get("snapName"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        try await storage.revertSnapshot(app: req.application, vmName: vmName, snapshotName: snapName)
        return .ok
    }
    
    vms.delete(":name", "snapshots", ":snapName") { req async throws -> HTTPStatus in
        guard let vmName = req.parameters.get("name"),
              let snapName = req.parameters.get("snapName"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        try await storage.deleteSnapshot(app: req.application, vmName: vmName, snapshotName: snapName)
        return .noContent
    }
    
    vms.delete(":name") { req async throws -> HTTPStatus in
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        try await storage.deleteVM(app: req.application, vmName: name)
        return .noContent
    }

    // --- ISO & Disk Management ---

    vms.post("isos", "download") { req async throws -> HTTPStatus in
        struct DownloadPayload: Content {
            let url: String
            let filename: String
        }
        guard let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        let payload = try req.content.decode(DownloadPayload.self)
        
        // Run in detached task to not block the request, but ideally we should track it.
        // For this MVP, we will return Accepted and let the websocket report progress.
        // Or we can await it if we want the client to hold connection (not recommended for large files).
        // Better: Return 202 Accepted immediately.
        
        Task.detached {
            do {
                try await storage.downloadISO(app: req.application, urlString: payload.url, filename: payload.filename)
            } catch {
                req.application.logger.error("Failed to download ISO: \(error)")
                // Optionally broadcast error via websocket
                let errorData: [String: Any] = [
                    "filename": payload.filename,
                    "stage": "error",
                    "error": error.localizedDescription
                ]
                if let jsonData = try? JSONSerialization.data(withJSONObject: errorData),
                   let jsonString = String(data: jsonData, encoding: .utf8) {
                    req.application.webSocketManager.broadcast(event: "iso_download_progress", data: jsonString)
                }
            }
        }
        
        return .accepted
    }

    // --- ISO & Disk Management ---
    // Use .collect(maxSize:) to ensure body is fully collected before processing
    // This is critical for large file uploads (700MB+)
    vms.on(.POST, "isos", "upload", body: .collect(maxSize: "10gb")) { req async throws -> HTTPStatus in
        guard let storage = await req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        try await storage.uploadISO(req: req)
        return .ok
    }
    
    // Rsync availability check
    vms.get("isos", "rsync-availability") { req async throws -> [String: Bool] in
        let rsyncService = RsyncService()
        let available = try await rsyncService.checkAvailability(app: req.application)
        return ["available": available]
    }
    
    // Temporary upload endpoint (for rsync workflow)
    // 使用流式上传，直接写入文件，避免 multipart 解码的性能问题
    vms.on(.POST, "isos", "upload-temp", body: .stream) { req async throws -> HTTPStatus in
        let uploadId = req.headers.first(name: "X-Upload-ID") ?? UUID().uuidString
        let fileName = req.headers.first(name: "X-File-Name") ?? ""
        let contentLength = req.headers.first(name: "Content-Length").flatMap { Int64($0) } ?? 0
        
        guard !fileName.isEmpty else {
            throw Abort(.badRequest, reason: "Missing X-File-Name header")
        }
        
        guard fileName.lowercased().hasSuffix(".iso") else {
            throw Abort(.badRequest, reason: "Only .iso files are allowed")
        }
        
        // 创建临时目录
        let tempDir = "/tmp/minidock-uploads"
        let fm = FileManager.default
        if !fm.fileExists(atPath: tempDir) {
            try fm.createDirectory(atPath: tempDir, withIntermediateDirectories: true)
        }
        
        // 使用 uploadId 作为临时文件名
        let tempFileName = "\(uploadId)-\(fileName)"
        let tempFilePath = (tempDir as NSString).appendingPathComponent(tempFileName)
        
        // 如果文件已存在，先删除
        if fm.fileExists(atPath: tempFilePath) {
            try fm.removeItem(atPath: tempFilePath)
        }
        
        // 创建文件
        fm.createFile(atPath: tempFilePath, contents: nil, attributes: nil)
        guard let fileHandle = FileHandle(forWritingAtPath: tempFilePath) else {
            throw Abort(.internalServerError, reason: "Failed to create temporary file")
        }
        
        var writtenBytes: Int64 = 0
        var lastProgressTime = Date()
        let progressInterval: TimeInterval = 0.5
        
        // 流式写入文件
        for try await chunk in req.body {
            let data = Data(buffer: chunk)
            fileHandle.write(data)
            writtenBytes += Int64(data.count)
            
            // 定期推送进度
            let now = Date()
            if now.timeIntervalSince(lastProgressTime) >= progressInterval {
                lastProgressTime = now
                let progress = contentLength > 0 ? Double(writtenBytes) / Double(contentLength) : 0
                let percent = Int(progress * 90)
                
                let progressData: [String: Any] = [
                    "uploadId": uploadId,
                    "stage": "uploading",
                    "percent": percent,
                    "loaded": writtenBytes,
                    "total": contentLength
                ]
                if let jsonData = try? JSONSerialization.data(withJSONObject: progressData),
                   let jsonString = String(data: jsonData, encoding: .utf8) {
                    req.application.webSocketManager.broadcast(event: "iso_upload_progress", data: jsonString)
                }
            }
        }
        
        fileHandle.closeFile()
        return .ok
    }
    
    // Rsync upload endpoint (sync from temp to destination)
    vms.on(.POST, "isos", "upload-rsync") { req async throws -> HTTPStatus in
        guard let storage = await req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        
        struct RsyncUploadRequest: Content {
            let tempFileName: String
            let fileName: String
        }
        
        let uploadReq = try req.content.decode(RsyncUploadRequest.self)
        let uploadId = req.headers.first(name: "X-Upload-ID") ?? UUID().uuidString
        
        // 获取 ISO 目录
        let basePath = try await storage.getBasePath(app: req.application)
        let isoDir = (basePath as NSString).appendingPathComponent("ISOs")
        let fm = FileManager.default
        
        if !fm.fileExists(atPath: isoDir) {
            try fm.createDirectory(atPath: isoDir, withIntermediateDirectories: true)
        }
        
        // 临时文件路径
        let tempDir = "/tmp/minidock-uploads"
        let tempFilePath = (tempDir as NSString).appendingPathComponent(uploadReq.tempFileName)
        
        // 检查临时文件是否存在
        guard fm.fileExists(atPath: tempFilePath) else {
            throw Abort(.badRequest, reason: "Temporary file not found")
        }
        
        let destination = (isoDir as NSString).appendingPathComponent(uploadReq.fileName)
        
        // 如果文件已存在，先删除
        if fm.fileExists(atPath: destination) {
            try fm.removeItem(atPath: destination)
        }
        
        // 获取文件大小用于进度显示
        let fileAttributes = try fm.attributesOfItem(atPath: tempFilePath)
        let fileSize = (fileAttributes[.size] as? Int64) ?? 0
        
        // 小文件直接移动；大文件使用rsync（提供校验）
        if fileSize < 100 * 1024 * 1024 {
            // 小文件：直接移动
            let processingData: [String: Any] = [
                "uploadId": uploadId,
                "stage": "processing",
                "percent": 90,
                "loaded": fileSize,
                "total": fileSize,
                "speed": 0
            ]
            if let jsonData = try? JSONSerialization.data(withJSONObject: processingData),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                req.application.webSocketManager.broadcast(event: "iso_upload_progress", data: jsonString)
            }
            
            try fm.moveItem(atPath: tempFilePath, toPath: destination)
            
            // 短暂延迟，让用户看到processing状态
            try await Task.sleep(nanoseconds: 200_000_000)
            
            // 推送完成事件
            let completeData: [String: Any] = [
                "uploadId": uploadId,
                "stage": "completed",
                "percent": 100,
                "loaded": fileSize,
                "total": fileSize
            ]
            if let jsonData = try? JSONSerialization.data(withJSONObject: completeData),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                req.application.webSocketManager.broadcast(event: "iso_upload_progress", data: jsonString)
            }
        } else {
            // 大文件：使用rsync（提供校验和进度显示）
            let rsyncService = RsyncService()
            try await rsyncService.uploadFile(
                source: tempFilePath,
                destination: destination,
                uploadId: uploadId,
                app: req.application,
                onProgress: { loaded, total, percent, speed, eta in
                    // 进度已通过 WebSocket 推送
                }
            )
            
            // 清理临时文件（rsync会复制，不移动）
            try? fm.removeItem(atPath: tempFilePath)
        }
        
        return .ok
    }
    
    vms.delete("isos", ":fileName") { req async throws -> HTTPStatus in
        guard let fileName = req.parameters.get("fileName"),
              let storage = await req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        try await storage.deleteISO(app: req.application, fileName: fileName)
        return .noContent
    }

    vms.get(":name", "drives", "unused") { req async throws -> [VMStorageService.UnusedDisk] in
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        return try await storage.listUnusedDisks(app: req.application, vmName: name)
    }
    
    vms.post(":name", "drives", "add") { req async throws -> HTTPStatus in
        struct AddDiskPayload: Content {
            let diskName: String
            let sizeGB: Int
            let interface: String
            let importExisting: Bool?
        }
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        let payload = try req.content.decode(AddDiskPayload.self)
        try await storage.addDisk(app: req.application, vmName: name, diskName: payload.diskName, sizeGB: payload.sizeGB, interface: payload.interface, importExisting: payload.importExisting ?? false)
        return .created
    }

    vms.post(":name", "drives", ":driveName", "resize") { req async throws -> HTTPStatus in
        struct ResizeDiskPayload: Content {
            let newSizeGB: Int
        }
        guard let name = req.parameters.get("name"),
              let driveName = req.parameters.get("driveName"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        let payload = try req.content.decode(ResizeDiskPayload.self)
        try await storage.resizeDisk(app: req.application, vmName: name, diskName: driveName, newSizeGB: payload.newSizeGB)
        return .ok
    }

    vms.post(":name", "drives", ":driveName", "compress") { req async throws -> HTTPStatus in
        guard let name = req.parameters.get("name"),
              let driveName = req.parameters.get("driveName"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        try await storage.compressDisk(app: req.application, vmName: name, diskName: driveName)
        return .ok
    }

    vms.delete(":name", "drives", ":driveName") { req async throws -> HTTPStatus in
        guard let name = req.parameters.get("name"),
              let driveName = req.parameters.get("driveName"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        try await storage.deleteDisk(app: req.application, vmName: name, diskName: driveName)
        return .noContent
    }
    
    // Automation Tasks CRUD
    let automation = protected.grouped("automation", "tasks")
    
    automation.get { req async throws -> [AutomationTask] in
        // 优先从文件系统读取，如果文件系统为空则从数据库读取
        guard let storage = req.application.serviceManager.getService(id: "automation-storage") as? AutomationStorageService else {
            // 如果存储服务未注册，回退到数据库
            return try await AutomationTask.query(on: req.db).all()
        }
        
        let fsTasks = try await storage.listTasks(app: req.application)
        if !fsTasks.isEmpty {
            return fsTasks
        }
        
        // 如果文件系统为空，从数据库读取
        return try await AutomationTask.query(on: req.db).all()
    }
    
    automation.post { req async throws -> AutomationTask in
        let task = try req.content.decode(AutomationTask.self)
        
        // 检查是否存在同名任务（排除当前任务本身，如果是更新操作）
        var query = AutomationTask.query(on: req.db)
            .filter(\.$name == task.name)
        
        // 如果任务有 ID，排除自身
        if let taskId = task.id {
            query = query.filter(\.$id != taskId)
        }
        
        let existingTask = try await query.first()
        
        // 检查重名，直接阻止创建
        if existingTask != nil {
            throw Abort(.conflict, reason: "任务名称 '\(task.name)' 已存在，请使用不同的任务名称")
        }
        
        // 保存到数据库（作为备份）
        try await task.save(on: req.db)
        
        // 同步到文件系统和 Git（Git 失败不影响创建）
        if let storage = req.application.serviceManager.getService(id: "automation-storage") as? AutomationStorageService {
            do {
                try await storage.saveTaskToFileSystem(app: req.application, task: task)
            } catch {
                req.application.logger.warning("[Automation] Failed to save task to file system (non-critical): \(error)")
            }
        }
        
        return task
    }
    
    automation.put(":id") { req async throws -> AutomationTask in
        guard let id = req.parameters.get("id", as: UUID.self),
              let task = try await AutomationTask.find(id, on: req.db) else {
            throw Abort(.notFound)
        }
        let updatedTask = try req.content.decode(AutomationTask.self)
        
        // 如果名称改变，检查是否存在同名任务（排除当前任务）
        if updatedTask.name != task.name {
            let existingTask = try await AutomationTask.query(on: req.db)
                .filter(\.$name == updatedTask.name)
                .filter(\.$id != id)
                .first()
            
            if existingTask != nil {
                throw Abort(.conflict, reason: "任务名称 '\(updatedTask.name)' 已存在，请使用不同的任务名称")
            }
        }
        
        task.name = updatedTask.name
        task.triggerType = updatedTask.triggerType
        task.cronExpression = updatedTask.cronExpression
        task.watchPath = updatedTask.watchPath
        task.eventType = updatedTask.eventType
        task.scriptType = updatedTask.scriptType
        task.scriptContent = updatedTask.scriptContent
        task.isEnabled = updatedTask.isEnabled
        
        // 保存到数据库（作为备份）
        try await task.save(on: req.db)
        
        // 同步到文件系统和 Git（Git 失败不影响更新）
        if let storage = req.application.serviceManager.getService(id: "automation-storage") as? AutomationStorageService {
            do {
                try await storage.saveTaskToFileSystem(app: req.application, task: task)
            } catch {
                req.application.logger.warning("[Automation] Failed to save task to file system (non-critical): \(error)")
            }
        }
        
        return task
    }
    
    automation.delete(":id") { req async throws -> HTTPStatus in
        guard let id = req.parameters.get("id", as: UUID.self),
              let task = try await AutomationTask.find(id, on: req.db) else {
            throw Abort(.notFound)
        }
        
        // 先删除相关的执行日志（避免外键约束失败）
        try await ExecutionLog.query(on: req.db)
            .filter(\ExecutionLog.$task.$id == id)
            .delete()
        
        // 从文件系统删除（如果存在）
        if let storage = req.application.serviceManager.getService(id: "automation-storage") as? AutomationStorageService {
            do {
                try await storage.deleteTask(app: req.application, taskId: id)
            } catch {
                req.application.logger.warning("[Automation] Failed to delete task from file system (non-critical): \(error)")
            }
        }
        
        // 从数据库删除
        try await task.delete(on: req.db)
        return .noContent
    }
    
    // Git 历史查看
    automation.get(":id", "history") { req async throws -> [GitStorageService.GitCommit] in
        guard let id = req.parameters.get("id", as: UUID.self),
              let storage = req.application.serviceManager.getService(id: "automation-storage") as? AutomationStorageService else {
            throw Abort(.notFound)
        }
        return try await storage.getHistory(app: req.application, taskId: id)
    }
    
    // Git 差异查看
    automation.get(":id", "diff", ":hash") { req async throws -> PageContent in
        guard let id = req.parameters.get("id", as: UUID.self),
              let hash = req.parameters.get("hash"),
              let storage = req.application.serviceManager.getService(id: "automation-storage") as? AutomationStorageService else {
            throw Abort(.notFound)
        }
        let diff = try await storage.getDiff(app: req.application, taskId: id, commitHash: hash)
        return PageContent(content: diff)
    }
    
    // 获取脚本内容（从文件系统）
    automation.get(":id", "script") { req async throws -> PageContent in
        guard let id = req.parameters.get("id", as: UUID.self),
              let storage = req.application.serviceManager.getService(id: "automation-storage") as? AutomationStorageService else {
            throw Abort(.notFound)
        }
        guard let task = try await storage.loadTaskFromFileSystem(app: req.application, taskId: id) else {
            throw Abort(.notFound, reason: "Task not found in file system")
        }
        return PageContent(content: task.scriptContent)
    }
    
    automation.post(":id", "run") { req async throws -> HTTPStatus in
        guard let id = req.parameters.get("id", as: UUID.self),
              let automationService = req.application.serviceManager.getService(id: "automation-engine") as? AutomationService else {
            throw Abort(.notFound)
        }
        
        // 优先从文件系统加载任务，如果不存在则从数据库加载
        var task: AutomationTask?
        if let storage = req.application.serviceManager.getService(id: "automation-storage") as? AutomationStorageService {
            task = try await storage.loadTaskFromFileSystem(app: req.application, taskId: id)
        }
        
        // 如果文件系统中没有，尝试从数据库加载
        if task == nil {
            task = try await AutomationTask.find(id, on: req.db)
        }
        
        guard let task = task else {
            throw Abort(.notFound, reason: "Task not found")
        }
        
        try await automationService.runTask(app: req.application, task: task)
        return .ok
    }
    
    automation.get(":id", "logs") { req async throws -> [ExecutionLog] in
        guard let id = req.parameters.get("id", as: UUID.self) else {
            throw Abort(.badRequest)
        }
        return try await ExecutionLog.query(on: req.db)
            .filter(\ExecutionLog.$task.$id == id)
            .sort(\ExecutionLog.$executedAt, .descending)
            .range(0..<50)
            .all()
    }
    
    // Event-based automation triggers (protected - requires authentication)
    protected.post("automation", "events", ":eventType") { req async throws -> HTTPStatus in
        guard let eventType = req.parameters.get("eventType"),
              let automationService = req.application.serviceManager.getService(id: "automation-engine") as? AutomationService else {
            throw Abort(.notFound)
        }

        // Trigger all enabled tasks matching this event type
        try await automationService.triggerEventTasks(app: req.application, eventType: eventType)
        return .ok
    }
    
    // System Settings CRUD
    let settings = protected.grouped("settings")
    
    settings.get { req async throws -> [SystemSetting] in
        try await SystemSetting.query(on: req.db).all()
    }
    
    settings.post { req async throws -> SystemSetting in
        let setting = try req.content.decode(SystemSetting.self)
        
        // Upsert: 如果存在就更新，不存在就创建
        if let existing = try await SystemSetting.query(on: req.db)
            .filter(\.$key == setting.key)
            .first() {
            existing.value = setting.value
            existing.category = setting.category
            existing.isSecret = setting.isSecret
            try await existing.update(on: req.db)
            return existing
        } else {
            try await setting.create(on: req.db)
            return setting
        }
    }
    
    settings.put { req async throws -> SystemSetting in
        let setting = try req.content.decode(SystemSetting.self)
        guard let existing = try await SystemSetting.query(on: req.db)
            .filter(\.$key == setting.key)
            .first() else {
            throw Abort(.notFound)
        }
        existing.value = setting.value
        existing.category = setting.category
        existing.isSecret = setting.isSecret
        try await existing.update(on: req.db)
        return existing
    }
    
    settings.delete(":key") { req async throws -> HTTPStatus in
        guard let key = req.parameters.get("key") else {
            throw Abort(.badRequest, reason: "Missing key parameter")
        }
        // Idempotent delete: return success even if setting doesn't exist
        if let setting = try await SystemSetting.query(on: req.db).filter(\.$key == key).first() {
            try await setting.delete(on: req.db)
        }
        return .noContent
    }
    
    // Connectivity Check
    let connectivity = protected.grouped("connectivity")
    
    connectivity.post("check") { req async throws -> ConnectivityCheckResponse in
        let request = try req.content.decode(ConnectivityCheckRequest.self)
        let service = ConnectivityService()
        
        var results: [PortCheckResult] = []
        
        for portCheck in request.ports {
            let (reachable, latency) = await service.checkPort(
                host: request.host,
                port: portCheck.port,
                timeout: 3.0
            )
            
            results.append(PortCheckResult(
                name: portCheck.name,
                port: portCheck.port,
                reachable: reachable,
                latency: latency
            ))
        }
        
        return ConnectivityCheckResponse(results: results)
    }
    
    settings.post("test-notification") { req async throws -> HTTPStatus in
        struct TestPayload: Content {
            let title: String
            let message: String
        }
        let payload = try req.content.decode(TestPayload.self)
        if let notificationService = req.application.serviceManager.getService(id: "notification-manager") as? NotificationService {
            await notificationService.send(app: req.application, title: payload.title, message: payload.message)
            return .ok
        }
        throw Abort(.serviceUnavailable)
    }
    
    settings.get("gitops-defaults") { req async throws -> [String: String] in
        let dockerStorage = req.application.serviceManager.getService(id: "docker-storage") as? DockerStorageService
        let vmStorage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService
        let automationStorage = req.application.serviceManager.getService(id: "automation-storage") as? AutomationStorageService
        
        let dockerBasePath = try await dockerStorage?.getBasePath(app: req.application) ?? "/Users/shared/minidock/docker"
        let vmBasePath = try await vmStorage?.getBasePath(app: req.application) ?? "/Users/shared/minidock/vms"
        let automationBasePath = try await automationStorage?.getBasePath(app: req.application) ?? "/Users/shared/minidock/automation"
        
        let dockerDefault = await dockerStorage?.getDynamicBranchName(basePath: dockerBasePath) ?? "main"
        let vmDefault = await vmStorage?.getDynamicBranchName(basePath: vmBasePath) ?? "main"
        let automationDefault = await GitStorageService.shared.getDynamicBranchName(basePath: automationBasePath)
        
        return [
            "dockerDefaultBranch": dockerDefault,
            "vmDefaultBranch": vmDefault,
            "automationDefaultBranch": automationDefault,
            "dockerBasePath": dockerBasePath,
            "vmBasePath": vmBasePath
        ]
    }
    
    settings.post("preview-directory") { req async throws -> DirectoryPreviewResponse in
        struct PreviewRequest: Content {
            let path: String
            let type: String  // "docker" | "vm"
        }
        
        let request = try req.content.decode(PreviewRequest.self)
        let basePath = request.path
        let type = request.type.lowercased()
        
        // 路径安全验证
        guard !basePath.contains("..") else {
            throw Abort(.badRequest, reason: "Invalid path: path traversal not allowed")
        }
        
        let fm = FileManager.default
        var preview = DirectoryPreviewResponse(
            exists: false,
            isGitRepo: false,
            hasUncommittedChanges: false,
            items: [],
            actions: []
        )
        
        // 检查目录是否存在
        var isDir: ObjCBool = false
        if fm.fileExists(atPath: basePath, isDirectory: &isDir), isDir.boolValue {
            preview.exists = true
            
            // 检查是否是 Git 仓库
            let gitDir = (basePath as NSString).appendingPathComponent(".git")
            if fm.fileExists(atPath: gitDir) {
                preview.isGitRepo = true
                
                // 检查是否有未提交的更改
                do {
                    let status = try await GitStorageService.shared.runGitCommand(
                        args: ["status", "--porcelain"],
                        basePath: basePath,
                        timeout: 5.0
                    )
                    preview.hasUncommittedChanges = !status.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                } catch {
                    // Git 命令失败，假设没有未提交的更改
                    preview.hasUncommittedChanges = false
                }
            }
            
            // 扫描目录内容
            if let contents = try? fm.contentsOfDirectory(atPath: basePath) {
                if type == "docker" {
                    // Docker: 扫描非隐藏的子目录
                    for name in contents {
                        var itemIsDir: ObjCBool = false
                        let itemPath = (basePath as NSString).appendingPathComponent(name)
                        if fm.fileExists(atPath: itemPath, isDirectory: &itemIsDir),
                           itemIsDir.boolValue,
                           !name.hasPrefix(".") {
                            preview.items.append(PreviewItem(name: name, type: "service"))
                        }
                    }
                } else if type == "vm" {
                    // VM: 扫描 .utm 结尾的目录
                    let vmStorage = VMStorageService()
                    for dirName in contents where dirName.hasSuffix(".utm") {
                        let vmPath = (basePath as NSString).appendingPathComponent(dirName)
                        if let config = vmStorage.parseVMConfig(at: vmPath) {
                            preview.items.append(PreviewItem(name: config.name, type: "vm"))
                        }
                    }
                }
            }
        }
        
        // 生成操作描述
        var actions: [String] = []
        
        if !preview.exists {
            actions.append("将创建目录并初始化 Git 仓库")
        } else {
            if preview.isGitRepo {
                actions.append("将使用现有 Git 仓库，不会修改历史记录")
                if preview.hasUncommittedChanges {
                    actions.append("检测到未提交的更改，这些更改将保留")
                }
            } else {
                actions.append("将初始化 Git 仓库并提交现有内容")
            }
            
            if preview.items.count > 0 {
                let itemType = type == "docker" ? "服务" : "虚拟机"
                actions.append("将接管管理 \(preview.items.count) 个已存在的\(itemType)")
            }
        }
        
        preview.actions = actions
        
        return preview
    }
    
    // --- VNC Proxy ---
    app.on(.GET, "vms", "services", ":name", "console", "proxy") { req -> Response in
        return req.webSocket(shouldUpgrade: { req in
            var headers = HTTPHeaders()
            if let protocols = req.headers.first(name: .secWebSocketProtocol), protocols.contains("binary") {
                headers.add(name: .secWebSocketProtocol, value: "binary")
            }
            return req.eventLoop.makeSucceededFuture(headers)
        }) { req, ws in
            // JWT auth check
            guard let token = req.query[String.self, at: "token"] else {
                _ = ws.close(code: .policyViolation); return
            }
            do {
                _ = try req.jwt.verify(token, as: UserPayload.self)
            } catch {
                _ = ws.close(code: .policyViolation); return
            }

            guard let name = req.parameters.get("name") else { _ = ws.close(); return }
            Task {
                // Variables needed for connection, fetched asynchronously
                var vncPort: Int = 0
                
                do {
                    let storage = VMStorageService()
                    let nativeVM = NativeVMService()
                    // 支持通过 directoryName 或显示名称查找 VM
                    let vmPath = try await storage.findVMPath(app: req.application, identifier: name)
                    let status = try await nativeVM.getVMStatus(vmPath: vmPath)
                    
                    if let port = status.vncPort {
                        vncPort = port
                    } else {
                        _ = try? await ws.close()
                        return
                    }
                } catch {
                    req.logger.error("[VNCProxy] Error getting VM info for \(name): \(error)")
                     _ = try? await ws.close()
                     return
                }
                
                // Now proceed with connection
                let bootstrap = ClientBootstrap(group: req.eventLoop)
                    .channelOption(ChannelOptions.socketOption(.so_reuseaddr), value: 1)
                    .channelOption(ChannelOptions.socketOption(.so_keepalive), value: 1)
                    .connectTimeout(.seconds(10))
                    
                let connectFuture = bootstrap.connect(host: "127.0.0.1", port: vncPort)
                
                connectFuture.whenFailure { [vncPort] error in
                    req.logger.error("[VNCProxy] Failed to connect to VM VNC \(name) on port \(vncPort): \(error)")
                    _ = ws.close(code: .policyViolation)
                }

                _ = connectFuture.flatMap { [vncPort] channel -> EventLoopFuture<Void> in
                    req.logger.info("[VNCProxy] Connected to VM VNC \(name) on port \(vncPort)")
                    ws.onBinary { _, buffer in
                        let data = buffer.getData(at: 0, length: buffer.readableBytes) ?? Data()
                        if channel.isActive {
                             _ = channel.writeAndFlush(channel.allocator.buffer(data: data))
                        }
                    }
                    let handler = VNCProxyHandler(ws: ws, logger: req.logger)
                    
                    // Robust cleanup
                    ws.onClose.whenComplete { _ in 
                        req.logger.info("[VNCProxy] WebSocket closed for VM \(name) (Code: \(ws.closeCode ?? .unknown(0))), closing TCP channel")
                        // Check if channel is already closed to avoid double-close errors
                        if channel.isActive {
                            _ = channel.close() 
                        }
                    }
                    
                    // Close WS if channel closes first
                    channel.closeFuture.whenComplete { _ in
                            if !ws.isClosed {
                                _ = ws.close()
                            }
                    }
                    
                    return channel.pipeline.addHandler(handler)
                }
            }
        }
    }

    app.on(.GET, "system", "console", "proxy") { req -> Response in
        return req.webSocket(shouldUpgrade: { req in
            var headers = HTTPHeaders()
            if let protocols = req.headers.first(name: .secWebSocketProtocol), protocols.contains("binary") {
                headers.add(name: .secWebSocketProtocol, value: "binary")
            }
            return req.eventLoop.makeSucceededFuture(headers)
        }) { req, ws in
            // Default to local screen sharing
            // JWT auth check
            guard let token = req.query[String.self, at: "token"] else {
                _ = ws.close(code: .policyViolation); return
            }
            do {
                _ = try req.jwt.verify(token, as: UserPayload.self)
            } catch {
                _ = ws.close(code: .policyViolation); return
            }

            let targetHost = "127.0.0.1"  // Fixed: always local, no SSRF
            let targetPort: Int
            let requestedPort = (try? req.query.get(Int.self, at: "port")) ?? 5900
            guard (5900...5999).contains(requestedPort) else {
                _ = ws.close(code: .policyViolation); return
            }
            targetPort = requestedPort
            req.logger.info("[VNCProxy] Connecting to \(targetHost):\(targetPort) (query: \(req.url.query ?? "none"))")
            
            Task {
                let bootstrap = ClientBootstrap(group: req.eventLoop)
                    .channelOption(ChannelOptions.socketOption(.so_reuseaddr), value: 1)
                    .channelOption(ChannelOptions.socketOption(.so_keepalive), value: 1)
                    .connectTimeout(.seconds(5))
                    
                let connectFuture = bootstrap.connect(host: targetHost, port: targetPort)
                
                connectFuture.whenFailure { error in
                    req.logger.error("[VNCProxy] Failed to connect to \(targetHost):\(targetPort): \(error)")
                    _ = ws.close(code: .policyViolation)
                }

                _ = connectFuture.flatMap { channel -> EventLoopFuture<Void> in
                    req.logger.info("[VNCProxy] Successfully connected to \(targetHost):\(targetPort)")
                    ws.onBinary { _, buffer in
                        let data = buffer.getData(at: 0, length: buffer.readableBytes) ?? Data()
                        // Check again before writing
                        if channel.isActive {
                            _ = channel.writeAndFlush(channel.allocator.buffer(data: data))
                        }
                    }
                    let handler = VNCProxyHandler(ws: ws, logger: req.logger, target: "\(targetHost):\(targetPort)")
                    
                    // Robust cleanup
                    ws.onClose.whenComplete { _ in 
                        req.logger.info("[VNCProxy] WebSocket closed for \(targetHost):\(targetPort) (Code: \(ws.closeCode ?? .unknown(0))), closing TCP channel")
                        if channel.isActive {
                            _ = channel.close() 
                        }
                    }
                    
                    // Close WS if channel closes first
                    channel.closeFuture.whenComplete { _ in
                            if !ws.isClosed {
                                req.logger.info("[VNCProxy] TCP Channel closed for \(targetHost):\(targetPort), closing WebSocket")
                                _ = ws.close()
                            }
                    }

                    return channel.pipeline.addHandler(handler)
                }
            }
        }
    }
    
    // System Core
    let system = protected.grouped("system")
    
    system.get("backup") { req async throws -> PageContent in
        let tasks = try await AutomationTask.query(on: req.db).all()
        let settings_list = try await SystemSetting.query(on: req.db).all()
        let backup = ["tasks": tasks, "settings": settings_list] as [String : Any]
        let data = try JSONSerialization.data(withJSONObject: backup, options: .prettyPrinted)
        return PageContent(content: String(data: data, encoding: .utf8) ?? "")
    }

    system.get("interfaces") { req async throws -> [SystemService.NetworkInterface] in
        guard let systemService = req.application.serviceManager.getService(id: "system-core") as? SystemService else {
            throw Abort(.internalServerError)
        }
        return try await systemService.getNetworkInterfaces()
    }
    
    system.get("ip-info") { req async throws -> SystemService.IPInfo in
        guard let systemService = req.application.serviceManager.getService(id: "system-core") as? SystemService else {
            throw Abort(.internalServerError)
        }
        return try await systemService.getIPInfo()
    }

    system.get("usb-devices") { req async throws -> [SystemService.USBDevice] in
        guard let systemService = req.application.serviceManager.getService(id: "system-core") as? SystemService else {
            throw Abort(.internalServerError)
        }
        return try await systemService.getUSBDevices()
    }
    
    system.get("screensharing") { req async throws -> SystemService.ScreenSharingStatus in
        req.application.logger.info("[Routes] /system/screensharing request received")
        guard let systemService = req.application.serviceManager.getService(id: "system-core") as? SystemService else {
            req.application.logger.error("[Routes] system-core service not found")
            throw Abort(.internalServerError)
        }
        req.application.logger.info("[Routes] Calling getScreenSharingStatus...")
        do {
            // Fetch status and primaryIP in parallel (both are async and non-blocking now)
            async let statusTask = systemService.getScreenSharingStatus(app: req.application)
            async let primaryIPTask = systemService.getPrimaryIP()
            
            let status = try await statusTask
            let primaryIP = try? await primaryIPTask
            
            req.application.logger.info("[Routes] getScreenSharingStatus returned: \(status), primaryIP: \(primaryIP ?? "nil")")
        
            let result = SystemService.ScreenSharingStatus(
                enabled: status,
                listening: false,
                processName: nil,
                primaryIP: primaryIP
            )
            
            return result
        } catch {
            req.application.logger.error("[Routes] getScreenSharingStatus failed: \(error)")
            return SystemService.ScreenSharingStatus(
                enabled: false,
                listening: false,
                processName: nil,
                primaryIP: nil
            )
        }
    }
    
    system.get("environment") { req async throws -> [EnvironmentService.ComponentStatus] in
        guard let envService = req.application.serviceManager.getService(id: "env-service") as? EnvironmentService else {
            throw Abort(.internalServerError)
        }
        return try await envService.getComponentStatuses()
    }
    
    system.post("environment", ":component", "install") { req async throws -> HTTPStatus in
        guard let component = req.parameters.get("component"),
              let envService = req.application.serviceManager.getService(id: "env-service") as? EnvironmentService else {
            throw Abort(.badRequest)
        }
        try await envService.install(app: req.application, component: component)
        return .accepted
    }
    
    system.get("dev-info") { req async throws -> DevInfoResponse in
        // App Bundle 模式下直接返回非开发模式
        if ProcessInfo.processInfo.environment["MINIDOCK_BUNDLE_MODE"] == "true" {
            return DevInfoResponse(isDevMode: false, workingDirectory: "")
        }
        
        let isDevMode = ProcessInfo.processInfo.environment["NEXT_PUBLIC_API_URL"] != nil || 
                       ProcessInfo.processInfo.environment["SWIFT_ENV"] == "development" ||
                       ProcessInfo.processInfo.arguments.contains("serve")
        
        // Try to get project root from environment variable first, then fallback to current directory
        let workingDirectory: String
        if let projectRoot = ProcessInfo.processInfo.environment["MINIDOCK_PROJECT_ROOT"] {
            workingDirectory = projectRoot
        } else {
            // Fallback: try to find project root by looking for .dev_state file
            let currentDir = FileManager.default.currentDirectoryPath
            var searchDir = currentDir
            var found = false
            
            // Search up to 3 levels for .dev_state file
            for _ in 0..<3 {
                let devStatePath = (searchDir as NSString).appendingPathComponent(".dev_state")
                if FileManager.default.fileExists(atPath: devStatePath) {
                    found = true
                    break
                }
                let parent = (searchDir as NSString).deletingLastPathComponent
                if parent == searchDir {
                    break
                }
                searchDir = parent
            }
            
            workingDirectory = found ? searchDir : currentDir
        }
        
        return DevInfoResponse(isDevMode: isDevMode, workingDirectory: workingDirectory)
    }
    
    system.get("dev", "build-info") { req async throws -> BuildInfoResponse in
        // Get project root
        let projectRoot: String
        var isDevMode = false
        
        if let envRoot = ProcessInfo.processInfo.environment["MINIDOCK_PROJECT_ROOT"] {
            projectRoot = envRoot
            isDevMode = true
        } else {
            let currentDir = FileManager.default.currentDirectoryPath
            var searchDir = currentDir
            var found = false
            
            for _ in 0..<3 {
                let devStatePath = (searchDir as NSString).appendingPathComponent(".dev_state")
                if FileManager.default.fileExists(atPath: devStatePath) {
                    found = true
                    break
                }
                let parent = (searchDir as NSString).deletingLastPathComponent
                if parent == searchDir {
                    break
                }
                searchDir = parent
            }
            
            projectRoot = found ? searchDir : currentDir
            isDevMode = found
        }
        
        // In bundle/production mode (no .dev_state found), skip rebuild detection
        if !isDevMode {
            return BuildInfoResponse(
                binaryTimestamp: 0,
                runningBinaryTimestamp: 0,
                sourceTimestamp: 0,
                needsRebuild: false,
                binaryPath: "",
                latestSourcePath: ""
            )
        }
        
        let fileManager = FileManager.default
        let backendDir = (projectRoot as NSString).appendingPathComponent("backend")
        let binaryPath = (backendDir as NSString).appendingPathComponent(".build/debug/App")
        let sourcesPath = (backendDir as NSString).appendingPathComponent("Sources")
        let packageSwiftPath = (backendDir as NSString).appendingPathComponent("Package.swift")
        
        // Get binary timestamp
        var binaryTimestamp: TimeInterval = 0
        if fileManager.fileExists(atPath: binaryPath) {
            if let attrs = try? fileManager.attributesOfItem(atPath: binaryPath),
               let modDate = attrs[.modificationDate] as? Date {
                binaryTimestamp = modDate.timeIntervalSince1970
            }
        }
        
        // Get latest source file timestamp
        var sourceTimestamp: TimeInterval = 0
        var latestSourcePath = ""
        
        func checkDirectory(_ dir: String) {
            guard let enumerator = fileManager.enumerator(atPath: dir) else { return }
            
            for case let file as String in enumerator {
                let fullPath = (dir as NSString).appendingPathComponent(file)
                var isDir: ObjCBool = false
                
                if fileManager.fileExists(atPath: fullPath, isDirectory: &isDir) && !isDir.boolValue {
                    if file.hasSuffix(".swift") {
                        if let attrs = try? fileManager.attributesOfItem(atPath: fullPath),
                           let modDate = attrs[.modificationDate] as? Date {
                            let timestamp = modDate.timeIntervalSince1970
                            if timestamp > sourceTimestamp {
                                sourceTimestamp = timestamp
                                latestSourcePath = fullPath
                            }
                        }
                    }
                }
            }
        }
        
        // Check Sources directory
        if fileManager.fileExists(atPath: sourcesPath) {
            checkDirectory(sourcesPath)
        }
        
        // Check Package.swift
        if fileManager.fileExists(atPath: packageSwiftPath) {
            if let attrs = try? fileManager.attributesOfItem(atPath: packageSwiftPath),
               let modDate = attrs[.modificationDate] as? Date {
                let timestamp = modDate.timeIntervalSince1970
                if timestamp > sourceTimestamp {
                    sourceTimestamp = timestamp
                    latestSourcePath = packageSwiftPath
                }
            }
        }
        
        // 5. 最终判定：除了检查磁盘上的二进制文件，还要考虑当前运行进程的编译时间
        // 获取当前运行程序的路径
        let executablePath = ProcessInfo.processInfo.arguments[0]
        var runningBinaryTimestamp: TimeInterval = 0
        if fileManager.fileExists(atPath: executablePath) {
            if let attrs = try? fileManager.attributesOfItem(atPath: executablePath),
               let modDate = attrs[.modificationDate] as? Date {
                runningBinaryTimestamp = modDate.timeIntervalSince1970
            }
        }

        // 添加时间容差（5秒），避免文件系统时间精度问题或构建过程中的微差导致的误判
        let timeTolerance: TimeInterval = 5.0
        let needsRebuild: Bool
        
        // 判定逻辑：如果 源代码最新时间 > 磁盘二进制时间 + 容差 OR 源代码最新时间 > 运行进程时间 + 容差
        let diskNeedsRebuild = binaryTimestamp == 0 || (sourceTimestamp - binaryTimestamp) > timeTolerance
        let processNeedsRestart = runningBinaryTimestamp == 0 || (sourceTimestamp - runningBinaryTimestamp) > timeTolerance
        
        needsRebuild = diskNeedsRebuild || processNeedsRestart
        
        return BuildInfoResponse(
            binaryTimestamp: binaryTimestamp,
            runningBinaryTimestamp: runningBinaryTimestamp,
            sourceTimestamp: sourceTimestamp,
            needsRebuild: needsRebuild,
            binaryPath: binaryPath,
            latestSourcePath: latestSourcePath
        )
    }
    
    try app.register(collection: BootConfigController())
    BootOrchestrator.run(app: app)
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

    let ssh = protected.grouped("ssh")
    
    ssh.get("keys") { req async throws -> [SSHKey] in
        guard let sshService = req.application.serviceManager.getService(id: "ssh-manager") as? SSHService else {
            throw Abort(.notFound)
        }
        return try await sshService.listKeys()
    }
    
    ssh.post("keys") { req async throws -> HTTPStatus in
        struct AddKeyPayload: Content {
            let key: String
        }
        let payload = try req.content.decode(AddKeyPayload.self)
        guard let sshService = req.application.serviceManager.getService(id: "ssh-manager") as? SSHService else {
            throw Abort(.notFound)
        }
        try await sshService.addKey(payload.key)
        return .created
    }
    
    ssh.delete("keys") { req async throws -> HTTPStatus in
        struct DeleteKeyPayload: Content {
             let keySignature: String
        }
        // Often delete requests don't have bodies in some clients, but here we can support query or body.
        // Let's support query param for delete usually, or body.
        // But for safety, let's use a POST to delete or properly support DELETE with body if client sends it.
        // Or cleaner: ssh.delete("keys", ":signature") but signature often has slashes/special chars.
        // Let's try to get from query first.
        let signature = try req.query.get(String.self, at: "signature")

        guard let sshService = req.application.serviceManager.getService(id: "ssh-manager") as? SSHService else {
             throw Abort(.notFound)
        }
        try await sshService.deleteKey(signature)
        return .noContent
    }

    // MARK: - Remote Access (Tailscale)
    let remote = protected.grouped("remote")

    // GET /remote/status - 获取 Tailscale 连接状态
    remote.get("status") { req async throws -> TailscaleStatus in
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        return try await service.getTailscaleStatus()
    }

    // GET /remote/installed - 检查 Tailscale 是否安装
    remote.get("installed") { req async throws -> TailscaleInstallCheck in
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        return await service.getInstallInfo()
    }

    // POST /remote/enable - 启用远程访问
    remote.post("enable") { req async throws -> TailscaleAuthResponse in
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        return try await service.enable()
    }

    // POST /remote/disable - 禁用远程访问（保持登录）
    remote.post("disable") { req async throws -> HTTPStatus in
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        try await service.disable()
        return .ok
    }

    // POST /remote/logout - 完全登出
    remote.post("logout") { req async throws -> HTTPStatus in
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        try await service.logout()
        return .ok
    }

    // POST /remote/install - 安装 Tailscale
    remote.post("install") { req async throws -> TailscaleInstallProgress in
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        let result = try await service.installViaHomebrew(app: req.application)

        // 安装后启动守护进程
        if result.stage == "completed" {
            try? await service.startDaemon()
        }

        return result
    }

    // GET /remote/homebrew - 检查 Homebrew 是否可用
    remote.get("homebrew") { req async throws -> [String: Bool] in
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        let available = await service.isHomebrewAvailable()
        return ["available": available]
    }

    // POST /remote/open-appstore - 在 NAS 上打开 App Store 的 Tailscale 页面
    remote.post("open-appstore") { req async throws -> HTTPStatus in
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        try await service.openAppStoreOnNAS()
        return .ok
    }

    // POST /remote/open-tailscale - 在 NAS 上打开 Tailscale 应用
    remote.post("open-tailscale") { req async throws -> [String: Bool] in
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        let opened = try await service.openTailscaleAppOnNAS()
        return ["opened": opened]
    }

    // GET /remote/app-installed - 检查 Tailscale Mac App 是否安装
    remote.get("app-installed") { req async throws -> [String: Bool] in
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        let installed = await service.isTailscaleAppInstalled()
        return ["installed": installed]
    }

    // POST /remote/download-install - 从官网下载并安装 Tailscale（不依赖 App Store）
    remote.post("download-install") { req async throws -> TailscaleInstallProgress in
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        return try await service.downloadAndInstall(app: req.application)
    }

    // Disk Management
    try app.register(collection: DiskController())
    
    // RAID Management
    try app.register(collection: RaidController())

    // Solutions
    let solutions = protected.grouped("solutions")

    solutions.get { req async throws -> [SolutionInfoDTO] in
        guard let service = req.application.serviceManager.getSolutionService() else {
            throw Abort(.internalServerError, reason: "Solution service not available")
        }
        return try await service.listSolutions(app: req.application)
    }

    solutions.get(":id") { req async throws -> SolutionDetailDTO in
        guard let id = req.parameters.get("id"),
              let service = req.application.serviceManager.getSolutionService() else {
            throw Abort(.notFound)
        }
        return try await service.getSolutionDetail(app: req.application, id: id)
    }

    solutions.post(":id", "deploy") { req async throws -> DeploymentProgressDTO in
        guard let id = req.parameters.get("id"),
              let service = req.application.serviceManager.getSolutionService() else {
            throw Abort(.notFound)
        }
        let deployRequest = try req.content.decode(DeployRequestDTO.self)
        return try await service.deploy(app: req.application, id: id, request: deployRequest)
    }

    solutions.get(":id", "preflight") { req async throws -> PreflightResultDTO in
        guard let id = req.parameters.get("id"),
              let service = req.application.serviceManager.getSolutionService() else {
            throw Abort(.notFound)
        }
        return try await service.preflight(app: req.application, id: id)
    }

    solutions.get(":id", "status") { req async throws -> DeploymentProgressDTO in
        guard let id = req.parameters.get("id"),
              let service = req.application.serviceManager.getSolutionService() else {
            throw Abort(.notFound)
        }
        return service.getDeploymentProgress(id: id)
    }

    solutions.post(":id", "action") { req async throws -> [String: String] in
        guard let id = req.parameters.get("id"),
              let service = req.application.serviceManager.getSolutionService() else {
            throw Abort(.notFound)
        }
        let actionReq = try req.content.decode(ActionRequestDTO.self)
        return try await service.performAction(app: req.application, id: id, action: actionReq.action)
    }

    solutions.put(":id", "paths") { req async throws -> SolutionDeploymentDTO in
        guard let id = req.parameters.get("id"),
              let service = req.application.serviceManager.getSolutionService() else {
            throw Abort(.notFound)
        }
        let pathsReq = try req.content.decode(UpdatePathsRequestDTO.self)
        return try await service.updatePaths(app: req.application, id: id, request: pathsReq)
    }

    solutions.delete(":id") { req async throws -> HTTPStatus in
        guard let id = req.parameters.get("id"),
              let service = req.application.serviceManager.getSolutionService() else {
            throw Abort(.notFound)
        }
        try await service.uninstall(app: req.application, id: id)
        return .noContent
    }
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



