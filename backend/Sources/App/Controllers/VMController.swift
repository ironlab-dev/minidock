import Vapor
import Foundation

struct VMController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let vms = routes.grouped(
            CookieAuthMiddleware(),
            User.jwtAuthenticator(),
            User.guardMiddleware()
        ).grouped("vms", "services")

        vms.get(use: list)
        vms.get("isos", use: listISOs)
        vms.get(":name", "config", use: getConfig)
        vms.put(":name", "config", use: updateConfig)
        vms.get(":name", "history", use: getHistory)
        vms.get(":name", "diff", ":hash", use: getDiff)
        vms.post(use: createVM)
        vms.post(":name", "action", use: performAction)
        vms.post("import", use: importVM)
        vms.get(":name", "snapshots", use: listSnapshots)
        vms.post(":name", "snapshots", use: createSnapshot)
        vms.post(":name", "snapshots", ":snapName", "revert", use: revertSnapshot)
        vms.delete(":name", "snapshots", ":snapName", use: deleteSnapshot)
        vms.delete(":name", use: deleteVM)
        vms.post("isos", "download", use: downloadISO)
        vms.on(.POST, "isos", "upload", body: .collect(maxSize: "10gb"), use: uploadISO)
        vms.get("isos", "rsync-availability", use: rsyncAvailability)
        vms.on(.POST, "isos", "upload-temp", body: .stream, use: uploadTemp)
        vms.on(.POST, "isos", "upload-rsync", use: uploadRsync)
        vms.delete("isos", ":fileName", use: deleteISO)
        vms.get(":name", "drives", "unused", use: listUnusedDisks)
        vms.post(":name", "drives", "add", use: addDisk)
        vms.post(":name", "drives", ":driveName", "resize", use: resizeDisk)
        vms.post(":name", "drives", ":driveName", "compress", use: compressDisk)
        vms.delete(":name", "drives", ":driveName", use: deleteDisk)
    }

    func list(req: Request) async throws -> [VMStorageService.VMServiceItem] {
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

    func listISOs(req: Request) async throws -> [String] {
        guard let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        return try await storage.listISOs(app: req.application)
    }

    func getConfig(req: Request) async throws -> PageContent {
        guard let name = req.parameters.get("name") else {
            throw Abort(.badRequest, reason: "Missing VM name")
        }
        guard let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        let config = try await storage.getConfig(app: req.application, vmName: name)
        return PageContent(content: config)
    }

    func updateConfig(req: Request) async throws -> HTTPStatus {
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

    func getHistory(req: Request) async throws -> [VMStorageService.GitCommit] {
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        return try await storage.getHistory(app: req.application, vmName: name)
    }

    func getDiff(req: Request) async throws -> PageContent {
        guard let name = req.parameters.get("name"),
              let hash = req.parameters.get("hash"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        let diff = try await storage.getDiff(app: req.application, vmName: name, commitHash: hash)
        return PageContent(content: diff)
    }

    func createVM(req: Request) async throws -> HTTPStatus {
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

    func performAction(req: Request) async throws -> HTTPStatus {
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

    func importVM(req: Request) async throws -> HTTPStatus {
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

    func listSnapshots(req: Request) async throws -> [VMStorageService.VMSnapshot] {
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        return try await storage.listSnapshots(app: req.application, vmName: name)
    }

    func createSnapshot(req: Request) async throws -> HTTPStatus {
        struct CreateSnapshot: Content { let name: String }
        guard let vmName = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        let payload = try req.content.decode(CreateSnapshot.self)
        try await storage.createSnapshot(app: req.application, vmName: vmName, snapshotName: payload.name)
        return .created
    }

    func revertSnapshot(req: Request) async throws -> HTTPStatus {
        guard let vmName = req.parameters.get("name"),
              let snapName = req.parameters.get("snapName"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        try await storage.revertSnapshot(app: req.application, vmName: vmName, snapshotName: snapName)
        return .ok
    }

    func deleteSnapshot(req: Request) async throws -> HTTPStatus {
        guard let vmName = req.parameters.get("name"),
              let snapName = req.parameters.get("snapName"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        try await storage.deleteSnapshot(app: req.application, vmName: vmName, snapshotName: snapName)
        return .noContent
    }

    func deleteVM(req: Request) async throws -> HTTPStatus {
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        try await storage.deleteVM(app: req.application, vmName: name)
        return .noContent
    }

    func downloadISO(req: Request) async throws -> HTTPStatus {
        struct DownloadPayload: Content {
            let url: String
            let filename: String
        }
        guard let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        let payload = try req.content.decode(DownloadPayload.self)
        
        Task.detached {
            do {
                try await storage.downloadISO(app: req.application, urlString: payload.url, filename: payload.filename)
            } catch {
                req.application.logger.error("Failed to download ISO: \(error)")
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

    func uploadISO(req: Request) async throws -> HTTPStatus {
        guard let storage = await req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        try await storage.uploadISO(req: req)
        return .ok
    }

    func rsyncAvailability(req: Request) async throws -> [String: Bool] {
        let rsyncService = RsyncService()
        let available = try await rsyncService.checkAvailability(app: req.application)
        return ["available": available]
    }

    func uploadTemp(req: Request) async throws -> HTTPStatus {
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

    func uploadRsync(req: Request) async throws -> HTTPStatus {
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

    func deleteISO(req: Request) async throws -> HTTPStatus {
        guard let fileName = req.parameters.get("fileName"),
              let storage = await req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        try await storage.deleteISO(app: req.application, fileName: fileName)
        return .noContent
    }

    func listUnusedDisks(req: Request) async throws -> [VMStorageService.UnusedDisk] {
        guard let name = req.parameters.get("name"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        return try await storage.listUnusedDisks(app: req.application, vmName: name)
    }

    func addDisk(req: Request) async throws -> HTTPStatus {
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

    func resizeDisk(req: Request) async throws -> HTTPStatus {
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

    func compressDisk(req: Request) async throws -> HTTPStatus {
        guard let name = req.parameters.get("name"),
              let driveName = req.parameters.get("driveName"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        try await storage.compressDisk(app: req.application, vmName: name, diskName: driveName)
        return .ok
    }

    func deleteDisk(req: Request) async throws -> HTTPStatus {
        guard let name = req.parameters.get("name"),
              let driveName = req.parameters.get("driveName"),
              let storage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService else {
            throw Abort(.notFound)
        }
        try await storage.deleteDisk(app: req.application, vmName: name, diskName: driveName)
        return .noContent
    }
}
