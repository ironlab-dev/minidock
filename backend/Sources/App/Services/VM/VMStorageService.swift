import Vapor
import Fluent
import Foundation

public struct VMStorageService: MiniDockService, @unchecked Sendable {
    public let id: String = "vm-storage"
    public let name: String = "VM Storage Manager"
    public let type: ServiceType = .system
    
    private let gitService = GitStorageService.shared
    
    public init() {}

    private func shellEscape(_ arg: String) -> String {
        "'\(arg.replacingOccurrences(of: "'", with: "'\\''" ))'"
    }
    
    public func getStatus() async throws -> ServiceStatus {
        return .running
    }
    
    public func start(app: Application) async throws {}
    public func stop(app: Application) async throws {}
    public func restart(app: Application) async throws {}
    
    public func getInfo(app: Application) async throws -> ServiceInfo {
        let status = try await getStatus()
        let vms = try await listVMs(app: app)
        return ServiceInfo(
            id: id,
            name: name,
            type: type,
            status: status,
            description: "Manage virtual machine storage and configurations.",
            stats: ["vms_total": "\(vms.count)"]
        )
    }
    
    public func getItems(app: Application) async throws -> [ServiceItem] {
        let vms = try await listVMs(app: app)
        return vms.map { vm in
            ServiceItem(
                id: vm.uuid,
                name: vm.name,
                status: vm.isRunning ? "running" : "stopped",
                metadata: [
                    "arch": vm.architecture,
                    "path": vm.path
                ]
            )
        }
    }
    
    public struct VMServiceItem: Content {
        public let name: String  // 显示名称（从 config.plist 读取）
        public let directoryName: String  // 目录名（不含.utm后缀，用于定位VM）
        public let uuid: String
        public let architecture: String
        public let isRunning: Bool
        public let path: String
        public let vncPort: Int?
        public let ipAddress: String?
        public let macAddress: String?
        public let cpuUsage: String?
        public let memoryUsage: String?
        public let qgaVerified: Bool?
        public let configChanged: Bool?
        public let configDifferences: [String]?
        public let vncBindAddress: String?
        public let autoStart: Bool?
        public let isManaged: Bool?  // 是否在 MiniDock 配置目录中管理
    }

    public struct VMSnapshot: Content {
        public let id: String
        public let name: String
        public let vmStateSize: Int
        public let dateSec: Int
        public let vmClockSec: Int
        
        enum CodingKeys: String, CodingKey {
            case id
            case name
            case vmStateSize = "vm-state-size"
            case dateSec = "date-sec"
            case vmClockSec = "vm-clock-sec"
        }
    }

    public func listVMs(app: Application) async throws -> [VMServiceItem] {
        let basePath = try await getBasePath(app: app)
        let fm = FileManager.default
        
        var vms: [VMServiceItem] = []
        var seenUUIDs = Set<String>()
        
        // 扫描 MiniDock 管理的虚拟机目录
        if let contents = try? fm.contentsOfDirectory(atPath: basePath) {
            for dirName in contents where dirName.hasSuffix(".utm") {
                let vmPath = (basePath as NSString).appendingPathComponent(dirName)
                if let config = parseVMConfig(at: vmPath) {
                    // 避免重复添加相同 UUID 的虚拟机
                    if seenUUIDs.contains(config.uuid) {
                        continue
                    }
                    seenUUIDs.insert(config.uuid)
                    
                    // 提取目录名（去除.utm后缀）
                    let directoryName = dirName.replacingOccurrences(of: ".utm", with: "")
                    vms.append(VMServiceItem(
                        name: config.name,
                        directoryName: directoryName,
                        uuid: config.uuid,
                        architecture: config.architecture,
                        isRunning: false, // Will be updated by NativeVMService
                        path: vmPath,
                        vncPort: nil,
                        ipAddress: nil,
                        macAddress: nil,
                        cpuUsage: nil,
                        memoryUsage: nil,
                        qgaVerified: nil,
                        configChanged: nil,
                        configDifferences: nil,
                        vncBindAddress: nil,
                        autoStart: config.autoStart,
                        isManaged: true  // 在 MiniDock 配置目录中
                    ))
                }
            }
        }
        
        // 同时扫描 UTM 的默认存储位置
        let homeDir = fm.homeDirectoryForCurrentUser.path
        let utmDefaultPath = (homeDir as NSString).appendingPathComponent("Library/Containers/com.utmapp.UTM/Data/Documents")
        
        if fm.fileExists(atPath: utmDefaultPath), let utmContents = try? fm.contentsOfDirectory(atPath: utmDefaultPath) {
            for dirName in utmContents where dirName.hasSuffix(".utm") {
                let vmPath = (utmDefaultPath as NSString).appendingPathComponent(dirName)
                if let config = parseVMConfig(at: vmPath) {
                    // 避免重复添加相同 UUID 的虚拟机
                    if seenUUIDs.contains(config.uuid) {
                        continue
                    }
                    seenUUIDs.insert(config.uuid)
                    
                    // 提取目录名（去除.utm后缀）
                    let directoryName = dirName.replacingOccurrences(of: ".utm", with: "")
                    vms.append(VMServiceItem(
                        name: config.name,
                        directoryName: directoryName,
                        uuid: config.uuid,
                        architecture: config.architecture,
                        isRunning: false, // Will be updated by NativeVMService
                        path: vmPath,
                        vncPort: nil,
                        ipAddress: nil,
                        macAddress: nil,
                        cpuUsage: nil,
                        memoryUsage: nil,
                        qgaVerified: nil,
                        configChanged: nil,
                        configDifferences: nil,
                        vncBindAddress: nil,
                        autoStart: config.autoStart,
                        isManaged: false  // 不在 MiniDock 配置目录中（UTM 默认位置）
                    ))
                }
            }
        }
        
        return vms.sorted { $0.name < $1.name }
    }
    
    public func getBasePath(app: Application) async throws -> String {
        let setting = try await SystemSetting.query(on: app.db)
            .filter(\SystemSetting.$key == "VM_BASE_PATH")
            .first()
        return setting?.value ?? "/Users/shared/minidock/vms"
    }
    
    /// 通过 directoryName 或 name（显示名称）查找 VM 路径
    /// 优先使用 directoryName，如果找不到则尝试通过显示名称查找
    func findVMPath(app: Application, identifier: String) async throws -> String {
        let basePath = try await getBasePath(app: app)
        let fm = FileManager.default
        
        // 首先尝试作为 directoryName（直接匹配）在 MiniDock 目录
        let directPath = (basePath as NSString).appendingPathComponent("\(identifier).utm")
        if fm.fileExists(atPath: directPath) {
            return directPath
        }
        
        // 尝试在 UTM 默认位置查找
        let homeDir = fm.homeDirectoryForCurrentUser.path
        let utmDefaultPath = (homeDir as NSString).appendingPathComponent("Library/Containers/com.utmapp.UTM/Data/Documents")
        let utmDirectPath = (utmDefaultPath as NSString).appendingPathComponent("\(identifier).utm")
        if fm.fileExists(atPath: utmDirectPath) {
            return utmDirectPath
        }
        
        // 如果直接匹配失败，尝试通过显示名称查找
        let vms = try await listVMs(app: app)
        if let vm = vms.first(where: { $0.name == identifier || $0.directoryName == identifier }) {
            return vm.path
        }
        
        // 如果都找不到，抛出错误
        throw Abort(.notFound, reason: "VM not found: \(identifier)")
    }
    
    public func parseVMConfig(at path: String) -> (name: String, uuid: String, architecture: String, autoStart: Bool)? {
        let plistPath = (path as NSString).appendingPathComponent("config.plist")
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: plistPath)),
              let plist = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any] else {
            return nil
        }
        
        let info = plist["Information"] as? [String: Any]
        let name = info?["Name"] as? String ?? (path as NSString).lastPathComponent.replacingOccurrences(of: ".utm", with: "")
        let uuid = info?["UUID"] as? String ?? UUID().uuidString
        
        let system = plist["System"] as? [String: Any]
        let arch = system?["Architecture"] as? String ?? "aarch64"
        let autoStart = system?["AutoStart"] as? Bool ?? false
        
        return (name, uuid, arch, autoStart)
    }
    
    public func createVM(
        app: Application,
        name: String,
        arch: String,
        ramMB: Int?,
        cpuCount: Int?,
        diskSizeGB: Int?,
        preset: String?,
        uefi: Bool?,
        networkMode: String? = "user",
        bridgeInterface: String? = nil,
        isoPath: String? = nil,
        autoStart: Bool? = false
    ) async throws {
        let basePath = try await getBasePath(app: app)
        let vmPath = (basePath as NSString).appendingPathComponent("\(name).utm")
        let fm = FileManager.default
        
        app.logger.info("[VMStorageService] Creating VM: \(name) at path: \(vmPath)")
        
        if fm.fileExists(atPath: vmPath) {
            throw Abort(.conflict, reason: "VM with name \(name) already exists")
        }
        
        try fm.createDirectory(atPath: vmPath, withIntermediateDirectories: true)
        
        // Use a do-catch for cleanup
        do {
            let dataPath = (vmPath as NSString).appendingPathComponent("Data")
            try fm.createDirectory(atPath: dataPath, withIntermediateDirectories: true)
            
            // 1. Create initial config.plist (Fail fast if config is invalid)
            let uuid = UUID().uuidString
            let finalDiskSizeGB = diskSizeGB ?? 64
            
            // OS Specific Tweaks
            var target = arch == "aarch64" ? "virt" : "q35"
            var finalUefi = uefi ?? false
            if preset == "windows" {
                finalUefi = true
                target = arch == "aarch64" ? "virt" : "q35"
            } else if preset == "macos" {
                finalUefi = true
                target = "virt"
            } else if preset == "debian" {
                finalUefi = true
                target = arch == "aarch64" ? "virt" : "q35"
            }

            var networkEntry: [String: Any] = ["NetworkMode": networkMode ?? "user"]
            if networkMode == "bridge" {
                guard let bridge = bridgeInterface, !bridge.isEmpty else {
                    throw Abort(.badRequest, reason: "Bridge interface must be specified for bridged networking")
                }
                networkEntry["BridgeInterface"] = bridge
            }
            networkEntry["HardwareAddress"] = generateRandomMAC()
            
            let networkConfig: [[String: Any]] = [networkEntry]

            // Prepare Drives
            // ISO 通常用于安装系统，应该优先启动（启动顺序为 1）
            // 主磁盘的启动顺序：如果有 ISO 则为 2，否则为 1
            let hasISO = isoPath?.isEmpty == false
            var drives: [[String: Any]] = [
                 [
                    "ImageName": "data.qcow2",
                    "Interface": "virtio",
                    "Size": Int64(finalDiskSizeGB) * 1024 * 1024 * 1024,
                    "BootOrder": hasISO ? 2 : 1
                 ]
            ]
            
            // Add ISO if provided
            if let iso = isoPath, !iso.isEmpty {
                drives.append([
                    "ImageName": (iso as NSString).lastPathComponent,
                    "ImagePath": iso,
                    "Interface": "cdrom",
                    "IsISO": true,
                    "ReadOnly": true,
                    "BootOrder": 1
                ])
            }

            let config: [String: Any] = [
                "Backend": "QEMU",
                "ConfigurationVersion": 4,
                "Information": [
                    "Name": name,
                    "UUID": uuid,
                    "CreationDate": Date().description
                ],
                "System": [
                    "Architecture": arch,
                    "MemorySize": ramMB ?? 2048,
                    "CPUCount": cpuCount ?? 2,
                    "UEFIBoot": finalUefi,
                    "Target": target,
                    "AutoStart": autoStart ?? false
                ],
                "Display": [
                    "EmulatedDisplayCard": arch == "aarch64" ? "virtio-ramfb" : "virtio-vga",
                    "VGAMemoryMB": 16,
                    "UpscalingFilter": "Linear",
                    "DownscalingFilter": "Linear",
                    "RetinaMode": false
                ],
                "Network": networkConfig,
                "Drives": drives
            ]
            
            let plistPath = (vmPath as NSString).appendingPathComponent("config.plist")
            do {
                let data = try PropertyListSerialization.data(fromPropertyList: config, format: .xml, options: 0)
                try data.write(to: URL(fileURLWithPath: plistPath))
            } catch {
                throw Abort(.internalServerError, reason: "Failed to serialize config.plist: \(error.localizedDescription)")
            }

            // 2. Create Disk Image (Potentially slow)
            let diskPath = (dataPath as NSString).appendingPathComponent("data.qcow2")
            try await createDiskImage(app: app, path: diskPath, sizeGB: finalDiskSizeGB)
            
            // 3. Git Operations
            try await ensureGitInitialized(basePath: basePath)
            _ = try await gitService.runGitCommand(args: ["add", "."], basePath: basePath)
            _ = try await gitService.runGitCommand(args: ["commit", "-m", "Create VM: \(name)"], basePath: basePath)
            
            // Clear history cache
            await gitService.clearHistoryCache(basePath: basePath)
            
            // Try push (background)
            Task.detached { [weak app] in
                guard let app = app else { return }
                do {
                    try await gitService.tryPush(app: app, basePath: basePath, remoteKey: "VM_GIT_REMOTE", branchKey: "VM_GIT_BRANCH")
                } catch {
                    app.logger.warning("[VMStorage] Git push failed (non-critical): \(error)")
                }
            }
            
        } catch {
            // Cleanup on any failure
            try? fm.removeItem(atPath: vmPath)
            throw error
        }
    }

    private func createDiskImage(app: Application, path: String, sizeGB: Int) async throws {
        let commandDisplayName = "qemu-img create disk: \(path.suffix(30)) (\(sizeGB)G)"
        let engine = app.instructionEngine
        let fullCommand = "qemu-img create -f qcow2 \(path) \(sizeGB)G"
        let instructionId = await engine.emitStarted(app: app, command: commandDisplayName, fullCommand: fullCommand)
        
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        
        let env = ProcessInfo.processInfo.environment
        var newEnv = env
        newEnv["PATH"] = (env["PATH"] ?? "") + ":/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        process.environment = newEnv
        
        // Use qemu-img from homebrew or path
        process.arguments = ["qemu-img", "create", "-f", "qcow2", path, "\(sizeGB)G"]
        
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        
        do {
            let engine = app.instructionEngine
            await engine.registerCancellable(id: instructionId) { [weak process] in
                process?.terminate()
            }
            
            try process.run()
            process.waitUntilExit()
            
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: data, encoding: .utf8) ?? ""
            
            await engine.unregisterCancellable(id: instructionId)
            let exitCode = process.terminationStatus == 15 ? -1 : process.terminationStatus
            await engine.emitFinished(app: app, id: instructionId, output: output, exitCode: exitCode)
            
            if process.terminationStatus != 0 {
                // If exit code is 15 (SIGTERM), it was likely cancelled
                if process.terminationStatus == 15 {
                     throw Abort(.internalServerError, reason: "Operation cancelled.")
                }
                throw Abort(.internalServerError, reason: "Failed to create disk image: \(output)")
            }
        } catch {
            let engine = app.instructionEngine
            await engine.unregisterCancellable(id: instructionId)
            let exitCode: Int32 = (error as? Abort)?.reason == "Operation cancelled." ? -1 : 1
            await engine.emitFinished(app: app, id: instructionId, output: "Error: \(error.localizedDescription)", exitCode: exitCode)
            throw error
        }
    }

    public func importUTM(app: Application, fromPath sourcePath: String) async throws {
        let basePath = try await getBasePath(app: app)
        let fm = FileManager.default
        
        if !fm.fileExists(atPath: basePath) {
            try fm.createDirectory(atPath: basePath, withIntermediateDirectories: true)
        }
        
        // Remove trailing slash if present
        var cleanedSourcePath = sourcePath
        if cleanedSourcePath.hasSuffix("/") {
            cleanedSourcePath = String(cleanedSourcePath.dropLast())
        }
        
        let destinationName = (cleanedSourcePath as NSString).lastPathComponent
        let destinationPath = (basePath as NSString).appendingPathComponent(destinationName)
        
        if fm.fileExists(atPath: destinationPath) {
            throw Abort(.conflict, reason: "VM already exists in managed storage: \(destinationName)")
        }
        
        try fm.copyItem(atPath: cleanedSourcePath, toPath: destinationPath)
        
        // Auto-commit
        try await ensureGitInitialized(basePath: basePath)
        _ = try await gitService.runGitCommand(args: ["add", "."], basePath: basePath)
        _ = try await gitService.runGitCommand(args: ["commit", "-m", "Import VM: \(destinationName)"], basePath: basePath)
        
        // Clear history cache
        await gitService.clearHistoryCache(basePath: basePath)
        
        // Try push (background)
        Task.detached { [weak app] in
            guard let app = app else { return }
            do {
                try await gitService.tryPush(app: app, basePath: basePath, remoteKey: "VM_GIT_REMOTE", branchKey: "VM_GIT_BRANCH")
            } catch {
                app.logger.warning("[VMStorage] Git push failed (non-critical): \(error)")
            }
        }
    }
    
    public func getConfig(app: Application, vmName: String) async throws -> String {
        // vmName 可能是 directoryName 或显示名称，使用 findVMPath 来查找
        let vmPath = try await findVMPath(app: app, identifier: vmName)
        let plistPath = (vmPath as NSString).appendingPathComponent("config.plist")
        
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: plistPath)) else {
            throw Abort(.notFound, reason: "config.plist not found for \(vmName)")
        }
        
        return String(data: data, encoding: .utf8) ?? ""
    }
    
    public func updateConfig(app: Application, vmName: String, content: String) async throws {
        // 使用 findVMPath 查找 VM（支持 directoryName 或显示名称）
        let oldVmPath = try await findVMPath(app: app, identifier: vmName)
        let basePath = try await getBasePath(app: app)
        let fm = FileManager.default
        
        // 读取当前配置以检测名称变化
        let oldPlistPath = (oldVmPath as NSString).appendingPathComponent("config.plist")
        var oldDisplayName: String? = nil
        if let oldData = try? Data(contentsOf: URL(fileURLWithPath: oldPlistPath)),
           let oldPlist = try? PropertyListSerialization.propertyList(from: oldData, options: [], format: nil) as? [String: Any],
           let oldInfo = oldPlist["Information"] as? [String: Any] {
            oldDisplayName = oldInfo["Name"] as? String
        }
        
        guard let data = content.data(using: .utf8) else {
            throw Abort(.badRequest, reason: "Invalid content encoding")
        }
        
        // Basic validation: attempt to parse it
        guard let plist = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any] else {
            throw Abort(.badRequest, reason: "Invalid Property List format")
        }
        
        // 提取新的显示名称
        let info = plist["Information"] as? [String: Any]
        let newDisplayName = info?["Name"] as? String
        
        // 检测显示名称是否改变
        let displayNameChanged = oldDisplayName != nil && newDisplayName != nil && oldDisplayName != newDisplayName
        
        // 如果显示名称改变，需要重命名目录
        var finalVmPath = oldVmPath
        var finalDirectoryName = (oldVmPath as NSString).lastPathComponent.replacingOccurrences(of: ".utm", with: "")
        
        if displayNameChanged, let newName = newDisplayName {
            // 检查 VM 是否正在运行
            if let nativeVM = await app.serviceManager.getService(id: "native-vm") as? NativeVMService {
                let status = try? await nativeVM.getVMStatus(vmPath: oldVmPath)
                if status?.status == "running" {
                    throw Abort(.conflict, reason: "Cannot rename VM while it is running. Please stop the VM first.")
                }
            }
            
            // 生成新的目录名（基于新的显示名称，但需要确保安全）
            let sanitizedNewName = sanitizeDirectoryName(newName)
            
            // 确定新路径：如果虚拟机在 basePath 下，则在 basePath 下重命名；否则在当前位置重命名
            let oldVmParentDir = (oldVmPath as NSString).deletingLastPathComponent
            let isInBasePath = oldVmParentDir == basePath
            let newVmPath: String
            
            if isInBasePath {
                // 在 basePath 下重命名
                newVmPath = (basePath as NSString).appendingPathComponent("\(sanitizedNewName).utm")
            } else {
                // 在当前位置重命名（UTM 默认位置等）
                newVmPath = (oldVmParentDir as NSString).appendingPathComponent("\(sanitizedNewName).utm")
            }
            
            // 检查新目录名是否已存在
            if fm.fileExists(atPath: newVmPath) && newVmPath != oldVmPath {
                throw Abort(.conflict, reason: "A VM with the name '\(sanitizedNewName)' already exists")
            }
            
            // 执行目录重命名（原子操作）
            do {
                try fm.moveItem(atPath: oldVmPath, toPath: newVmPath)
                finalVmPath = newVmPath
                finalDirectoryName = sanitizedNewName
                app.logger.info("[VMStorageService] Renamed VM directory from '\(finalDirectoryName)' to '\(sanitizedNewName)' at '\(oldVmParentDir)'")
            } catch {
                throw Abort(.internalServerError, reason: "Failed to rename VM directory: \(error.localizedDescription)")
            }
        }
        
        let plistPath = (finalVmPath as NSString).appendingPathComponent("config.plist")
        let dataPath = (finalVmPath as NSString).appendingPathComponent("Data")
        
        // Handle ISO files: copy from ImagePath to Data directory if needed
        if let drives = plist["Drives"] as? [[String: Any]] {
            for drive in drives {
                if let imagePath = drive["ImagePath"] as? String,
                   let imageName = drive["ImageName"] as? String,
                   imagePath.hasSuffix(".iso") {
                    let destPath = (dataPath as NSString).appendingPathComponent(imageName)
                    // Only copy if source exists and destination doesn't
                    if fm.fileExists(atPath: imagePath) && !fm.fileExists(atPath: destPath) {
                        try fm.createDirectory(atPath: dataPath, withIntermediateDirectories: true)
                        try fm.copyItem(atPath: imagePath, toPath: destPath)
                        app.logger.info("[VMStorageService] Copied ISO from \(imagePath) to \(destPath)")
                    }
                }
            }
        }
        
        try data.write(to: URL(fileURLWithPath: plistPath))
        
        // Auto-commit
        try await ensureGitInitialized(basePath: basePath)
        _ = try await gitService.runGitCommand(args: ["add", "."], basePath: basePath)
        
        // 提交消息根据是否有重命名操作而不同
        let commitMessage = displayNameChanged ? "Update Config and Rename VM: \(oldDisplayName ?? "unknown") -> \(newDisplayName ?? "unknown")" : "Update Config: \(finalDirectoryName)"
        _ = try await gitService.runGitCommand(args: ["commit", "-m", commitMessage], basePath: basePath)
        
        // Clear history cache
        await gitService.clearHistoryCache(basePath: basePath)
        
        // Try push (background)
        Task.detached { [weak app] in
            guard let app = app else { return }
            do {
                try await gitService.tryPush(app: app, basePath: basePath, remoteKey: "VM_GIT_REMOTE", branchKey: "VM_GIT_BRANCH")
                app.logger.info("[VMStorage] Git push completed successfully")
            } catch {
                app.logger.error("[VMStorage] Git push failed: \(error.localizedDescription)")
                app.logger.error("[VMStorage] Push error details: \(error)")
            }
        }
    }
    
    /// 清理目录名，移除不安全的字符
    private func sanitizeDirectoryName(_ name: String) -> String {
        // 移除或替换不安全的文件名字符
        var sanitized = name
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: "\\", with: "-")
            .replacingOccurrences(of: ":", with: "-")
            .replacingOccurrences(of: "*", with: "-")
            .replacingOccurrences(of: "?", with: "-")
            .replacingOccurrences(of: "\"", with: "-")
            .replacingOccurrences(of: "<", with: "-")
            .replacingOccurrences(of: ">", with: "-")
            .replacingOccurrences(of: "|", with: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        
        // 确保不为空
        if sanitized.isEmpty {
            sanitized = "unnamed-vm"
        }
        
        // 限制长度（避免过长的目录名）
        if sanitized.count > 100 {
            sanitized = String(sanitized.prefix(100))
        }
        
        return sanitized
    }
    
    public typealias GitCommit = GitStorageService.GitCommit
    
    public func getHistory(app: Application, vmName: String) async throws -> [GitCommit] {
        let basePath = try await getBasePath(app: app)
        // 使用 findVMPath 获取实际路径，然后提取目录名
        let vmPath = try await findVMPath(app: app, identifier: vmName)
        let vmDir = (vmPath as NSString).lastPathComponent
        return try await gitService.getHistory(basePath: basePath, path: vmDir)
    }
    
    public func getDiff(app: Application, vmName: String, commitHash: String) async throws -> String {
        let basePath = try await getBasePath(app: app)
        // 使用 findVMPath 获取实际路径，然后提取目录名
        let vmPath = try await findVMPath(app: app, identifier: vmName)
        let vmDir = (vmPath as NSString).lastPathComponent
        return try await gitService.getDiff(basePath: basePath, path: vmDir, commitHash: commitHash)
    }
    
    private func ensureGitInitialized(basePath: String) async throws {
        // Create initial .gitignore if needed
        let gitignorePath = (basePath as NSString).appendingPathComponent(".gitignore")
        if !FileManager.default.fileExists(atPath: gitignorePath) {
            let content = """
            .DS_Store
            *.iso
            *.qcow2
            *.img
            *.dmg
            *.fd
            Data/
            *.log
            config_running.plist
            """
            try content.write(toFile: gitignorePath, atomically: true, encoding: .utf8)
        } else {
            // 更新现有的 .gitignore，确保包含所有需要忽略的文件
            let existingContent = (try? String(contentsOfFile: gitignorePath, encoding: .utf8)) ?? ""
            var lines = Set(existingContent.components(separatedBy: .newlines).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty })
            lines.insert(".DS_Store")
            lines.insert("*.iso")
            lines.insert("*.qcow2")
            lines.insert("*.img")
            lines.insert("*.dmg")
            lines.insert("*.fd")
            lines.insert("Data/")
            lines.insert("*.log")
            lines.insert("config_running.plist")
            let updatedContent = lines.sorted().joined(separator: "\n") + "\n"
            try updatedContent.write(toFile: gitignorePath, atomically: true, encoding: String.Encoding.utf8)
        }
        
        // Use unified GitStorageService
        try await gitService.ensureGitInitialized(basePath: basePath)
        
        // Create initial commit if needed
        let gitDir = (basePath as NSString).appendingPathComponent(".git")
        if FileManager.default.fileExists(atPath: gitDir) {
            // Check if there are uncommitted changes
            let status = try? await gitService.runGitCommand(args: ["status", "--porcelain"], basePath: basePath)
            if let status = status, !status.isEmpty {
                _ = try await gitService.runGitCommand(args: ["add", "."], basePath: basePath)
                _ = try await gitService.runGitCommand(args: ["commit", "-m", "Initial commit for VM storage"], basePath: basePath)
            }
        }
    }
    
    public func getDynamicBranchName(basePath: String) async -> String {
        return await gitService.getDynamicBranchName(basePath: basePath)
    }

    public func uploadISO(req: Request) async throws {
        let basePath = try await getBasePath(app: req.application)
        let isoDir = (basePath as NSString).appendingPathComponent("ISOs")
        let fm = FileManager.default
        
        // 获取 uploadId（如果前端提供了）
        let uploadId = req.headers.first(name: "X-Upload-ID") ?? UUID().uuidString
        
        req.application.logger.info("[VMStorage] Starting ISO upload, basePath=\(basePath), isoDir=\(isoDir), uploadId=\(uploadId)")
        
        // Ensure ISOs directory exists
        if !fm.fileExists(atPath: isoDir) {
            do {
            try fm.createDirectory(atPath: isoDir, withIntermediateDirectories: true)
                req.application.logger.info("[VMStorage] Created ISOs directory: \(isoDir)")
            } catch {
                req.application.logger.error("[VMStorage] Failed to create ISOs directory: \(error.localizedDescription)")
                throw Abort(.internalServerError, reason: "Failed to create ISOs directory: \(error.localizedDescription)")
            }
        }
        
        // 推送解码开始进度
        let wsManager = req.application.webSocketManager
        let progressThrottleInterval: TimeInterval = 0.1 // 最多每 100ms 推送一次
        final class ProgressThrottle: @unchecked Sendable {
            private let lock = NSLock()
            private var lastTime: Date = Date()
            
            func shouldSkip(now: Date, percent: Int, interval: TimeInterval) -> Bool {
                lock.lock()
                defer { lock.unlock() }
                
                if now.timeIntervalSince(lastTime) < interval && percent < 100 {
                    return true
                }
                lastTime = now
                return false
            }
        }
        let throttle = ProgressThrottle()
        
        @Sendable func pushProgress(stage: String, percent: Int) {
            let now = Date()
            // 节流：避免过于频繁的进度推送
            if throttle.shouldSkip(now: now, percent: percent, interval: progressThrottleInterval) {
                return
            }
            
            let progressData: [String: Any] = [
                "uploadId": uploadId,
                "stage": stage,
                "percent": percent
            ]
            if let jsonData = try? JSONSerialization.data(withJSONObject: progressData),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                wsManager.broadcast(event: "iso_upload_progress", data: jsonString)
            }
        }
        
        // Decode multipart data in background thread
        // 注意：req.content.decode 会将整个文件加载到内存中
        // 这是 Vapor multipart 解析的限制，但后续写入时我们使用流式处理避免创建额外的 Data 副本
        struct FileUpload: Content {
            var file: File
        }
        
        let upload: FileUpload
        do {
            // 推送解码阶段进度（估算）
            pushProgress(stage: "decoding", percent: 90)
            
            // Decode in background thread to avoid blocking main event loop
            // 注意：此操作会将整个文件加载到内存（Vapor multipart 解析的限制）
            upload = try await req.application.threadPool.runIfActive {
                return try req.content.decode(FileUpload.self)
            }
            
            // 解码完成，推送进度
            pushProgress(stage: "decoding", percent: 95)
        } catch {
            req.application.logger.error("[VMStorage] Failed to decode file: \(error.localizedDescription)")
            // 推送错误状态
            pushProgress(stage: "error", percent: 0)
            throw Abort(.badRequest, reason: "Failed to decode file: \(error.localizedDescription)")
        }
        
        let fileName = upload.file.filename
        guard !fileName.isEmpty else {
            throw Abort(.badRequest, reason: "Missing filename")
        }
        
        guard fileName.lowercased().hasSuffix(".iso") else {
            throw Abort(.badRequest, reason: "Only .iso files are allowed")
        }
        
        let filePath = (isoDir as NSString).appendingPathComponent(fileName)
        
        if fm.fileExists(atPath: filePath) {
            try fm.removeItem(atPath: filePath)
        }
        
        // 使用流式写入，避免创建额外的 Data 副本
        // 虽然 ByteBuffer 可能已经包含整个文件（由于 req.content.decode 的限制），
        // 但我们通过 readData 逐步读取，避免创建大的 Data 对象，减少内存峰值
        // 使用固定大小的缓冲区（1MB），内存占用可控
        do {
            let totalBytes = upload.file.data.readableBytes
            let chunkSize = 1024 * 1024 // 1MB chunks - 固定缓冲区大小
            let localFM = FileManager.default
            
            // 记录开始时间和文件大小（用于监控和性能分析）
            let startTime = Date()
            req.application.logger.info("[VMStorage] Starting file write, size: \(totalBytes) bytes (\(String(format: "%.2f", Double(totalBytes) / 1024 / 1024)) MB)")
            
            // 创建目标文件（如果不存在）
            if !localFM.fileExists(atPath: filePath) {
                localFM.createFile(atPath: filePath, contents: nil, attributes: nil)
            }
            
            // 使用 FileHandle 进行流式写入
            guard let fileHandle = FileHandle(forWritingAtPath: filePath) else {
                throw NSError(domain: "VMStorage", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to create file handle"])
            }
            
            defer {
                fileHandle.closeFile()
            }
            
            // 从 ByteBuffer 流式读取并写入文件
            // 使用固定大小的缓冲区，避免将整个文件加载到内存
            var bytesWritten: Int = 0
            var lastProgressOffset: Int = 0
            let progressUpdateInterval = 5 * 1024 * 1024 // 每 5MB 更新一次进度（节流）
            var buffer = upload.file.data
            
            // 流式读取并写入，每次处理 1MB
            while buffer.readableBytes > 0 {
                let currentChunkSize = min(chunkSize, buffer.readableBytes)
                
                // 从 ByteBuffer 读取数据块
                guard let chunkData = buffer.readData(length: currentChunkSize) else {
                    throw NSError(domain: "VMStorage", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to read data from buffer"])
                }
                
                // 写入文件
                fileHandle.write(chunkData)
                bytesWritten += currentChunkSize
                
                // 每写入一定量后推送进度（95% -> 99%），避免过于频繁
                if bytesWritten - lastProgressOffset >= progressUpdateInterval || bytesWritten >= totalBytes {
                    let writePercent = 95 + Int((Double(bytesWritten) / Double(totalBytes)) * 4) // 95% -> 99%
                    pushProgress(stage: "writing", percent: min(writePercent, 99))
                    lastProgressOffset = bytesWritten
                }
            }
            
            // 确保数据写入磁盘
            fileHandle.synchronizeFile()
            
            // 验证写入的字节数
            if bytesWritten != totalBytes {
                req.application.logger.warning("[VMStorage] Byte count mismatch: expected \(totalBytes), wrote \(bytesWritten)")
            }
            
            // 记录完成时间和性能指标
            let elapsed = Date().timeIntervalSince(startTime)
            let speedMBps = elapsed > 0 ? (Double(bytesWritten) / 1024 / 1024) / elapsed : 0
            req.application.logger.info("[VMStorage] File write completed: \(bytesWritten) bytes in \(String(format: "%.2f", elapsed))s, speed: \(String(format: "%.2f", speedMBps)) MB/s")
            
            // 写入完成，推送 100%
            pushProgress(stage: "writing", percent: 100)
            req.application.logger.info("[VMStorage] ISO uploaded successfully to \(filePath)")
        } catch {
            req.application.logger.error("[VMStorage] Failed to write ISO file: \(error.localizedDescription), path: \(filePath)")
            
            // 错误恢复：清理部分写入的文件，避免留下不完整的文件
            if fm.fileExists(atPath: filePath) {
                do {
                    try fm.removeItem(atPath: filePath)
                    req.application.logger.info("[VMStorage] Cleaned up partial file: \(filePath)")
                } catch {
                    req.application.logger.error("[VMStorage] Failed to cleanup partial file: \(error.localizedDescription)")
                }
            }
            
            // 推送错误状态
            pushProgress(stage: "error", percent: 0)
            throw Abort(.internalServerError, reason: "Failed to write ISO file: \(error.localizedDescription)")
        }
    }
    public func listISOs(app: Application) async throws -> [String] {
        let fm = FileManager.default
        var isos: [String] = []
        
        // Only check the ISOs directory in VM storage base path
        // Users should upload ISO files through the web interface for better management
        if let basePath = try? await getBasePath(app: app) {
            let isoDir = (basePath as NSString).appendingPathComponent("ISOs")
            if !fm.fileExists(atPath: isoDir) {
                try? fm.createDirectory(atPath: isoDir, withIntermediateDirectories: true)
            }
            if let files = try? fm.contentsOfDirectory(atPath: isoDir) {
                for file in files where file.hasSuffix(".iso") {
                    isos.append((isoDir as NSString).appendingPathComponent(file))
                }
            }
        }
        
        return isos.sorted()
    }
    
    public func deleteISO(app: Application, fileName: String) async throws {
        let basePath = try await getBasePath(app: app)
        let isoDir = (basePath as NSString).appendingPathComponent("ISOs")
        let fm = FileManager.default
        
        app.logger.info("[VMStorage] Attempting to delete ISO: fileName=\(fileName), basePath=\(basePath), isoDir=\(isoDir)")
        
        // 安全验证：确保文件名只包含安全字符，防止路径遍历攻击
        let sanitizedFileName = (fileName as NSString).lastPathComponent
        guard sanitizedFileName.lowercased().hasSuffix(".iso") else {
            app.logger.error("[VMStorage] Invalid file extension: \(sanitizedFileName)")
            throw Abort(.badRequest, reason: "Only .iso files can be deleted")
        }
        
        // 验证文件路径必须在 ISOs 目录内
        let filePath = (isoDir as NSString).appendingPathComponent(sanitizedFileName)
        let resolvedPath = (filePath as NSString).resolvingSymlinksInPath
        let resolvedIsoDir = (isoDir as NSString).resolvingSymlinksInPath
        
        app.logger.info("[VMStorage] Resolved paths: filePath=\(resolvedPath), isoDir=\(resolvedIsoDir)")
        
        // 确保解析后的路径在 ISOs 目录内（防止路径遍历）
        guard resolvedPath.hasPrefix(resolvedIsoDir) else {
            app.logger.error("[VMStorage] Path validation failed: resolvedPath=\(resolvedPath), resolvedIsoDir=\(resolvedIsoDir)")
            throw Abort(.badRequest, reason: "Invalid file path")
        }
        
        // 检查文件是否存在
        guard fm.fileExists(atPath: resolvedPath) else {
            app.logger.error("[VMStorage] ISO file not found at path: \(resolvedPath)")
            throw Abort(.notFound, reason: "ISO file not found")
        }
        
        // 可选：检查是否有虚拟机正在使用该 ISO
        // 这里可以添加检查逻辑，但为了简化，我们先允许删除
        // 如果将来需要，可以遍历所有 VM 配置检查 ImagePath
        
        // 执行删除
        do {
            try fm.removeItem(atPath: resolvedPath)
            app.logger.info("[VMStorage] ISO deleted successfully: \(resolvedPath)")
        } catch {
            app.logger.error("[VMStorage] Failed to delete ISO file: \(error.localizedDescription), path: \(resolvedPath)")
            throw Abort(.internalServerError, reason: "Failed to delete ISO file: \(error.localizedDescription)")
        }
    }


    // --- Snapshot Management ---
    
    public func listSnapshots(app: Application, vmName: String) async throws -> [VMSnapshot] {
        let diskPath = try await getPrimaryDiskPath(app: app, vmName: vmName)
        
        // qemu-img snapshot -l <disk> --output=json
        let result = try await Shell.run("qemu-img snapshot -l \"\(diskPath)\" --output=json", app: app)
        
        if result.exitCode != 0 {
            // If no snapshots, qemu-img might exit with error or just empty array? 
            // Often it returns empty list [] if json output is requested and none exist.
            // If error, likely disk not found or unrelated.
            if result.output.contains("no snapshots") { return [] }
            // Some versions fail if no snapshots with json.
            return []
        }
        
        guard let data = result.output.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([VMSnapshot].self, from: data)) ?? []
    }
    
    public func createSnapshot(app: Application, vmName: String, snapshotName: String) async throws {
        let diskPath = try await getPrimaryDiskPath(app: app, vmName: vmName)
        
        // qemu-img snapshot -c <name> <disk>
        let result = try await Shell.run("qemu-img snapshot -c \(shellEscape(snapshotName)) \(shellEscape(diskPath))", app: app, track: true)
        if result.exitCode != 0 {
            throw Abort(.internalServerError, reason: "Failed to create snapshot: \(result.output)")
        }
    }
    
    public func revertSnapshot(app: Application, vmName: String, snapshotName: String) async throws {
        let diskPath = try await getPrimaryDiskPath(app: app, vmName: vmName)
        
        // qemu-img snapshot -a <name> <disk>
        // WARNING: This is destructive to current state
        let result = try await Shell.run("qemu-img snapshot -a \(shellEscape(snapshotName)) \(shellEscape(diskPath))", app: app, track: true)
        if result.exitCode != 0 {
            throw Abort(.internalServerError, reason: "Failed to revert snapshot: \(result.output)")
        }
    }
    
    public func deleteSnapshot(app: Application, vmName: String, snapshotName: String) async throws {
        let diskPath = try await getPrimaryDiskPath(app: app, vmName: vmName)
        
        // qemu-img snapshot -d <name> <disk>
        let result = try await Shell.run("qemu-img snapshot -d \(shellEscape(snapshotName)) \(shellEscape(diskPath))", app: app, track: true)
        if result.exitCode != 0 {
            throw Abort(.internalServerError, reason: "Failed to delete snapshot: \(result.output)")
        }
    }
    
    /// Validates a disk name to prevent path traversal and other injection attacks.
    private func validateDiskName(_ name: String) throws {
        guard !name.isEmpty else {
            throw Abort(.badRequest, reason: "Disk name must not be empty")
        }
        guard name.count <= 255 else {
            throw Abort(.badRequest, reason: "Disk name must not exceed 255 characters")
        }
        guard !name.contains("/") && !name.contains("..") else {
            throw Abort(.badRequest, reason: "Disk name contains invalid characters")
        }
    }
    
    // MARK: - Drive Management
    
    public func addDisk(app: Application, vmName: String, diskName: String, sizeGB: Int, interface: String, importExisting: Bool = false) async throws {
        let vmPath = try await findVMPath(app: app, identifier: vmName)
        let dataPath = (vmPath as NSString).appendingPathComponent("Data")
        let fm = FileManager.default
        
        if !fm.fileExists(atPath: dataPath) {
            try fm.createDirectory(atPath: dataPath, withIntermediateDirectories: true)
        }
        
        let diskPath = (dataPath as NSString).appendingPathComponent(diskName)
        
        let actualSizeBytes: Int64
        
        if importExisting {
            // 导入模式：检查磁盘文件是否存在
            guard fm.fileExists(atPath: diskPath) else {
                throw Abort(.notFound, reason: "Disk file not found: \(diskName)")
            }
            
            // 使用 qemu-img info 获取磁盘实际大小
            let diskInfo = try await getDiskInfo(app: app, path: diskPath)
            actualSizeBytes = diskInfo.sizeBytes
        } else {
            // 创建模式：检查磁盘是否已存在
            if fm.fileExists(atPath: diskPath) {
                throw Abort(.conflict, reason: "Disk with name \(diskName) already exists")
            }
            
            // 创建新的磁盘镜像
            try await createDiskImage(app: app, path: diskPath, sizeGB: sizeGB)
            actualSizeBytes = Int64(sizeGB) * 1024 * 1024 * 1024
        }
        
        // Update config.plist
        let configString = try await getConfig(app: app, vmName: vmName)
        guard let data = configString.data(using: .utf8),
              var plist = try? PropertyListSerialization.propertyList(from: data, options: [.mutableContainersAndLeaves], format: nil) as? [String: Any],
              var drives = plist["Drives"] as? [[String: Any]] else {
            throw Abort(.internalServerError, reason: "Failed to parse config.plist")
        }
        
        // 检查磁盘是否已在配置中
        if drives.contains(where: { ($0["ImageName"] as? String) == diskName }) {
            throw Abort(.conflict, reason: "Disk \(diskName) is already in configuration")
        }
        
        drives.append([
            "ImageName": diskName,
            "Interface": interface,
            "Size": actualSizeBytes,
            "IsISO": false,
            "ReadOnly": false
        ])
        
        plist["Drives"] = drives
        
        let newData = try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0)
        try await updateConfig(app: app, vmName: vmName, content: String(data: newData, encoding: .utf8) ?? "")
    }

    public func resizeDisk(app: Application, vmName: String, diskName: String, newSizeGB: Int) async throws {
        let vmPath = try await findVMPath(app: app, identifier: vmName)
        let diskPath = (vmPath as NSString).appendingPathComponent("Data/\(diskName)")
        
        guard FileManager.default.fileExists(atPath: diskPath) else {
            throw Abort(.notFound, reason: "Disk not found: \(diskName)")
        }
        
        // Resize physical disk
        let result = try await Shell.run("qemu-img resize \"\(diskPath)\" \(newSizeGB)G", app: app, track: true)
        if result.exitCode != 0 {
             throw Abort(.internalServerError, reason: "Resize failed: \(result.output)")
        }
        
        // Update config.plist
        let configString = try await getConfig(app: app, vmName: vmName)
        guard let data = configString.data(using: .utf8),
              var plist = try? PropertyListSerialization.propertyList(from: data, options: [.mutableContainersAndLeaves], format: nil) as? [String: Any],
              var drives = plist["Drives"] as? [[String: Any]] else {
            throw Abort(.internalServerError, reason: "Failed to parse config.plist")
        }
        
        // Update size in config
        var found = false
        for i in 0..<drives.count {
            if let name = drives[i]["ImageName"] as? String, name == diskName {
                drives[i]["Size"] = Int64(newSizeGB) * 1024 * 1024 * 1024
                found = true
            }
        }
        
        if !found {
             throw Abort(.notFound, reason: "Disk entry not found in config")
        }
        
        plist["Drives"] = drives
        
        let newData = try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0)
        try await updateConfig(app: app, vmName: vmName, content: String(data: newData, encoding: .utf8) ?? "")
    }
    
    public func compressDisk(app: Application, vmName: String, diskName: String) async throws {
        try validateDiskName(diskName)
        let basePath = try await getBasePath(app: app)
        let vmPath = try await findVMPath(app: app, identifier: vmName)
        let diskPath = (vmPath as NSString).appendingPathComponent("Data/\(diskName)")
        
        guard FileManager.default.fileExists(atPath: diskPath) else {
            throw Abort(.notFound, reason: "Disk not found: \(diskName)")
        }
        
        let tempPath = diskPath + ".tmp"
        
        // Compress using qemu-img convert
        let command = "qemu-img convert -O qcow2 -c \"\(diskPath)\" \"\(tempPath)\" && mv \"\(tempPath)\" \"\(diskPath)\""
        
        let result = try await Shell.run(command, app: app, track: true)
        
        if result.exitCode != 0 {
            throw Abort(.internalServerError, reason: "Compression failed: \(result.output)")
        }
        
        // Manual commit since updateConfig is not called
        try await ensureGitInitialized(basePath: basePath)
        _ = try await gitService.runGitCommand(args: ["add", "."], basePath: basePath)
        _ = try await gitService.runGitCommand(args: ["commit", "-m", "Compress Disk: \(diskName)"], basePath: basePath)
        
        // Push
         Task.detached { [weak app] in
            guard let app = app else { return }
            do {
                try await self.gitService.tryPush(app: app, basePath: basePath, remoteKey: "VM_GIT_REMOTE", branchKey: "VM_GIT_BRANCH")
            } catch {
                app.logger.warning("[VMStorage] Push failed after compression: \(error)")
            }
        }
    }

    public func deleteDisk(app: Application, vmName: String, diskName: String) async throws {
        try validateDiskName(diskName)
        let vmPath = try await findVMPath(app: app, identifier: vmName)
        let diskPath = (vmPath as NSString).appendingPathComponent("Data/\(diskName)")
        
        if FileManager.default.fileExists(atPath: diskPath) {
            try FileManager.default.removeItem(atPath: diskPath)
        }

        // Update config.plist
        let configString = try await getConfig(app: app, vmName: vmName)
        guard let data = configString.data(using: .utf8),
              var plist = try? PropertyListSerialization.propertyList(from: data, options: [.mutableContainersAndLeaves], format: nil) as? [String: Any],
              var drives = plist["Drives"] as? [[String: Any]] else {
            throw Abort(.internalServerError, reason: "Failed to parse config.plist for disk deletion")
        }

        let originalCount = drives.count
        drives.removeAll { $0["ImageName"] as? String == diskName }
        
        if drives.count != originalCount {
            plist["Drives"] = drives
            let newData = try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0)
            try await updateConfig(app: app, vmName: vmName, content: String(data: newData, encoding: .utf8) ?? "")
        }
    }

    public func getPrimaryDiskPath(app: Application, vmName: String) async throws -> String {
        // 使用 findVMPath 来查找 VM
        let vmPath = try await findVMPath(app: app, identifier: vmName)
        let dataPath = (vmPath as NSString).appendingPathComponent("Data")
        let diskPath = (dataPath as NSString).appendingPathComponent("data.qcow2")
        
        if !FileManager.default.fileExists(atPath: diskPath) {
             throw Abort(.notFound, reason: "Primary disk (data.qcow2) not found for VM \(vmName)")
        }
        return diskPath
    }
    
    // MARK: - Unused Disk Discovery
    
    public struct UnusedDisk: Content {
        public let name: String
        public let sizeBytes: Int64
        public let sizeGB: Double
        public let format: String
    }
    
    public func listUnusedDisks(app: Application, vmName: String) async throws -> [UnusedDisk] {
        let vmPath = try await findVMPath(app: app, identifier: vmName)
        let dataPath = (vmPath as NSString).appendingPathComponent("Data")
        let fm = FileManager.default
        
        // 如果 Data 目录不存在，返回空列表
        guard fm.fileExists(atPath: dataPath) else {
            return []
        }
        
        // 获取当前配置中已使用的磁盘名称
        let configString = try await getConfig(app: app, vmName: vmName)
        guard let data = configString.data(using: .utf8),
              let plist = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any],
              let drives = plist["Drives"] as? [[String: Any]] else {
            // 如果配置解析失败，返回空列表
            return []
        }
        
        let usedDiskNames = Set(drives.compactMap { $0["ImageName"] as? String })
        
        // 扫描 Data 目录中的所有 .qcow2 文件
        var unusedDisks: [UnusedDisk] = []
        
        guard let files = try? fm.contentsOfDirectory(atPath: dataPath) else {
            app.logger.warning("[VMStorage] Failed to list files in Data directory: \(dataPath)")
            return []
        }
        
        for fileName in files where fileName.hasSuffix(".qcow2") {
            // 跳过已在配置中使用的磁盘
            if usedDiskNames.contains(fileName) {
                continue
            }
            
            let diskPath = (dataPath as NSString).appendingPathComponent(fileName)
            
            // 使用 qemu-img info 获取磁盘信息
            do {
                let diskInfo = try await getDiskInfo(app: app, path: diskPath)
                unusedDisks.append(UnusedDisk(
                    name: fileName,
                    sizeBytes: diskInfo.sizeBytes,
                    sizeGB: diskInfo.sizeGB,
                    format: diskInfo.format
                ))
            } catch {
                app.logger.warning("[VMStorage] Failed to get disk info for \(fileName), using file size fallback: \(error.localizedDescription)")
                // 即使获取信息失败，也尝试添加磁盘（使用文件系统大小作为后备）
                if let attrs = try? fm.attributesOfItem(atPath: diskPath),
                   let fileSize = attrs[.size] as? Int64 {
                    let sizeGB = Double(fileSize) / (1024.0 * 1024.0 * 1024.0)
                    unusedDisks.append(UnusedDisk(
                        name: fileName,
                        sizeBytes: fileSize,
                        sizeGB: sizeGB,
                        format: "qcow2"
                    ))
                }
            }
        }
        
        // 按名称排序
        return unusedDisks.sorted { $0.name < $1.name }
    }
    
    private struct DiskInfo {
        let sizeBytes: Int64
        let sizeGB: Double
        let format: String
    }
    
    private func getDiskInfo(app: Application, path: String) async throws -> DiskInfo {
        // 使用 qemu-img info --output=json 获取磁盘信息
        let result = try await Shell.run("qemu-img info --output=json \"\(path)\"", app: app)
        
        guard result.exitCode == 0, let jsonData = result.output.data(using: String.Encoding.utf8) else {
            throw Abort(.internalServerError, reason: "Failed to get disk info for \(path)")
        }
        
        guard let json = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
              let virtualSize = json["virtual-size"] as? Int64,
              let format = json["format"] as? String else {
            throw Abort(.internalServerError, reason: "Failed to parse disk info for \(path)")
        }
        
        let sizeGB = Double(virtualSize) / (1024.0 * 1024.0 * 1024.0)
        
        return DiskInfo(
            sizeBytes: virtualSize,
            sizeGB: sizeGB,
            format: format
        )
    }
    

    
    public func deleteVM(app: Application, vmName: String) async throws {
        // 使用 findVMPath 来查找 VM
        let vmPath = try await findVMPath(app: app, identifier: vmName)
        let basePath = try await getBasePath(app: app)
        let fm = FileManager.default
        
        // First, try to stop the VM if it's running
        if let nativeVM = await app.serviceManager.getService(id: "native-vm") as? NativeVMService {
            do {
                try await nativeVM.stopVM(app: app, vmPath: vmPath)
            } catch {
                app.logger.warning("[VMStorage] Failed to stop VM before deletion: \(error.localizedDescription)")
                // Continue with deletion even if stop fails
            }
        }
        
        // Remove the VM directory
        try fm.removeItem(atPath: vmPath)
        
        // Git commit the deletion
        try await ensureGitInitialized(basePath: basePath)
        _ = try await gitService.runGitCommand(args: ["add", "."], basePath: basePath)
        _ = try await gitService.runGitCommand(args: ["commit", "-m", "Delete VM: \(vmName)"], basePath: basePath)
        
        // Clear history cache
        await gitService.clearHistoryCache(basePath: basePath)
        
        // Try push (background)
        Task.detached { [weak app] in
            guard let app = app else { return }
            do {
                try await gitService.tryPush(app: app, basePath: basePath, remoteKey: "VM_GIT_REMOTE", branchKey: "VM_GIT_BRANCH")
            } catch {
                app.logger.warning("[VMStorage] Git push failed (non-critical): \(error)")
            }
        }
    }
    
    private func generateRandomMAC() -> String {
        let hexChars = "0123456789ABCDEF"
        var mac = "52:54:00" // QEMU default prefix
        for _ in 0..<3 {
            let first = hexChars.randomElement()!
            let second = hexChars.randomElement()!
            mac += ":\(first)\(second)"
        }
        return mac
    }

    public func downloadISO(app: Application, urlString: String, filename: String) async throws {
        let basePath = try await getBasePath(app: app)
        let isoDir = (basePath as NSString).appendingPathComponent("ISOs")
        let fm = FileManager.default
        
        // Ensure ISOs directory exists
        if !fm.fileExists(atPath: isoDir) {
            try fm.createDirectory(atPath: isoDir, withIntermediateDirectories: true)
        }
        
        // Validate filename - allow .iso, .img, and .gz
        let lowerName = filename.lowercased()
        guard !filename.isEmpty, (lowerName.hasSuffix(".iso") || lowerName.hasSuffix(".img") || lowerName.hasSuffix(".gz")) else {
            throw Abort(.badRequest, reason: "Invalid filename: must end with .iso, .img or .gz")
        }
        
        let destinationPath = (isoDir as NSString).appendingPathComponent(filename)
        // If file exists, check if size > 0. If it does, error or overwrite?
        // Implementation plan says: check if exists.
        if fm.fileExists(atPath: destinationPath) {
             throw Abort(.conflict, reason: "File already exists: \(filename)")
        }
        
        guard let url = URL(string: urlString) else {
            throw Abort(.badRequest, reason: "Invalid URL")
        }
        
        app.logger.info("[VMStorage] Starting ISO download from \(urlString) to \(destinationPath)")
        
        let instructionId = await app.instructionEngine.emitStarted(app: app, command: "Download ISO: \(filename)", fullCommand: "Download from \(urlString)")
        
        let downloader = ISODownloader(app: app, instructionId: instructionId, url: url, destinationPath: destinationPath)
        try await downloader.start()
    }
}

// Helper class for downloading with progress
fileprivate class ISODownloader: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    let app: Application
    let instructionId: UUID
    let url: URL
    let destinationPath: String
    private var continuation: CheckedContinuation<Void, Error>?
    private var lastProgressTime = Date.distantPast
    private var downloadTask: URLSessionDownloadTask?
    
    init(app: Application, instructionId: UUID, url: URL, destinationPath: String) {
        self.app = app
        self.instructionId = instructionId
        self.url = url
        self.destinationPath = destinationPath
    }
    
    func start() async throws {
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let config = URLSessionConfiguration.default
            let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
            let task = session.downloadTask(with: url)
            self.downloadTask = task
            
            Task {
                await app.instructionEngine.registerCancellable(id: instructionId) { [weak task] in
                    task?.cancel()
                }
            }
            
            task.resume()
        }
    }
    
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        do {
            let fm = FileManager.default
            // Move file to destination
            if fm.fileExists(atPath: destinationPath) {
                try fm.removeItem(atPath: destinationPath)
            }
            try fm.moveItem(at: location, to: URL(fileURLWithPath: destinationPath))
            
            // Auto decompress if .gz
            if destinationPath.lowercased().hasSuffix(".gz") {
                broadcastProgress(percent: 0, stage: "decompressing")
                let process = Process()
                process.executableURL = URL(fileURLWithPath: "/usr/bin/gunzip")
                process.arguments = ["-f", destinationPath]
                
                try process.run()
                process.waitUntilExit()
                
                if process.terminationStatus != 0 {
                    throw NSError(domain: "VMStorage", code: 2, userInfo: [NSLocalizedDescriptionKey: "Decompression failed with status \(process.terminationStatus)"])
                }
                broadcastProgress(percent: 100, stage: "finished")
            } else {
                // Notify success
                broadcastProgress(percent: 100, stage: "finished")
            }
            Task {
                await app.instructionEngine.unregisterCancellable(id: instructionId)
                await app.instructionEngine.emitFinished(app: app, id: instructionId, output: "Download completed successfully.", exitCode: 0)
            }
            continuation?.resume()
        } catch {
            continuation?.resume(throwing: error)
        }
        session.finishTasksAndInvalidate()
    }
    
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        guard totalBytesExpectedToWrite > 0 else { return }
        let percent = Int(Double(totalBytesWritten) / Double(totalBytesExpectedToWrite) * 100)
        
        let now = Date()
        if now.timeIntervalSince(lastProgressTime) >= 0.5 {
            broadcastProgress(percent: percent, stage: "downloading")
            lastProgressTime = now
        }
    }
    
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            Task {
                await app.instructionEngine.unregisterCancellable(id: instructionId)
                let nsError = error as NSError
                let isCancelled = nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled
                await app.instructionEngine.emitFinished(app: app, id: instructionId, output: "Error: \(error.localizedDescription)", exitCode: isCancelled ? -1 : 1)
            }
            continuation?.resume(throwing: error)
            session.finishTasksAndInvalidate()
        }
    }
    
    private func broadcastProgress(percent: Int, stage: String) {
        Task {
            await app.instructionEngine.emitProgress(app: app, id: instructionId, percent: percent)
            await app.instructionEngine.emitOutput(app: app, id: instructionId, output: "Stage: \(stage) - \(percent)%\n")
        }
        
        let wsManager = app.webSocketManager
        
        // Broadcast format for frontend (legacy compatibility if needed, but InstructionService handles core now)
        let progressData: [String: Any] = [
            "instructionId": instructionId.uuidString,
            "filename": (destinationPath as NSString).lastPathComponent,
            "stage": stage,
            "percent": percent
        ]
        
        if let jsonData = try? JSONSerialization.data(withJSONObject: progressData),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            wsManager.broadcast(event: "iso_download_progress", data: jsonString)
        }
    }
}
