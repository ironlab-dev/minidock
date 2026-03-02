import Vapor
import Foundation

struct SystemController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let system = routes.grouped(
            CookieAuthMiddleware(),
            User.jwtAuthenticator(),
            User.guardMiddleware()
        ).grouped("system")

        system.get("backup", use: backup)
        system.get("interfaces", use: interfaces)
        system.get("ip-info", use: ipInfo)
        system.get("usb-devices", use: usbDevices)
        system.get("screensharing", use: screenSharing)
        system.get("environment", use: environment)
        system.post("environment", ":component", "install", use: installComponent)
        system.get("dev-info", use: devInfo)
        system.get("dev", "build-info", use: buildInfo)
    }

    func backup(req: Request) async throws -> PageContent {
        let tasks = try await AutomationTask.query(on: req.db).all()
        let settings_list = try await SystemSetting.query(on: req.db).all()
        let backup = ["tasks": tasks, "settings": settings_list] as [String : Any]
        let data = try JSONSerialization.data(withJSONObject: backup, options: .prettyPrinted)
        return PageContent(content: String(data: data, encoding: .utf8) ?? "")
    }

    func interfaces(req: Request) async throws -> [SystemService.NetworkInterface] {
        guard let systemService = req.application.serviceManager.getService(id: "system-core") as? SystemService else {
            throw Abort(.internalServerError)
        }
        return try await systemService.getNetworkInterfaces()
    }

    func ipInfo(req: Request) async throws -> SystemService.IPInfo {
        guard let systemService = req.application.serviceManager.getService(id: "system-core") as? SystemService else {
            throw Abort(.internalServerError)
        }
        return try await systemService.getIPInfo()
    }

    func usbDevices(req: Request) async throws -> [SystemService.USBDevice] {
        guard let systemService = req.application.serviceManager.getService(id: "system-core") as? SystemService else {
            throw Abort(.internalServerError)
        }
        return try await systemService.getUSBDevices()
    }

    func screenSharing(req: Request) async throws -> SystemService.ScreenSharingStatus {
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

    func environment(req: Request) async throws -> [EnvironmentService.ComponentStatus] {
        guard let envService = req.application.serviceManager.getService(id: "env-service") as? EnvironmentService else {
            throw Abort(.internalServerError)
        }
        return try await envService.getComponentStatuses()
    }

    func installComponent(req: Request) async throws -> HTTPStatus {
        guard let component = req.parameters.get("component"),
              let envService = req.application.serviceManager.getService(id: "env-service") as? EnvironmentService else {
            throw Abort(.badRequest)
        }
        try await envService.install(app: req.application, component: component)
        return .accepted
    }

    func devInfo(req: Request) async throws -> DevInfoResponse {
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

    func buildInfo(req: Request) async throws -> BuildInfoResponse {
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
}
