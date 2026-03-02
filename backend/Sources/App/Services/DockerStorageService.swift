import Vapor
import Foundation
import Fluent

public struct DockerStorageService: MiniDockService, @unchecked Sendable {
    public let id: String = "docker-storage"
    public let name: String = "Docker Storage Manager"
    public let type: ServiceType = .system
    
    private let gitService = GitStorageService.shared
    
    public init() {}
    
    public func getStatus() async throws -> ServiceStatus {
        return .running
    }
    
    public func start(app: Application) async throws {}
    public func stop(app: Application) async throws {}
    public func restart(app: Application) async throws {}
    
    public func getInfo(app: Application) async throws -> ServiceInfo {
        let status = try await getStatus()
        let services = try await listServices(app: app)
        return ServiceInfo(
            id: id,
            name: name,
            type: type,
            status: status,
            description: "Manage Docker Compose services and configurations.",
            stats: [
                "services_total": "\(services.count)",
                "services_running": "\(services.filter { $0.isRunning }.count)"
            ]
        )
    }
    
    public func getItems(app: Application) async throws -> [ServiceItem] {
        let services = try await listServices(app: app)
        return services.map { service in
            ServiceItem(
                id: service.name,
                name: service.name,
                status: service.isRunning ? "running" : "stopped",
                metadata: [
                    "is_managed": service.isManaged ? "true" : "false"
                ]
            )
        }
    }
    
    // --- Business Logic ---
    
    public struct DockerServiceItem: Content {
        public let name: String
        public let isManaged: Bool
        public let isRunning: Bool
        public var expectedImage: String?
        public var actualImage: String?
        public var isImageMismatch: Bool
        public var expectedPorts: String?
        public var actualPorts: String?
        public var isPortMismatch: Bool
        public var configChanged: Bool
        public var configDifferences: String?
        
        public init(name: String, isManaged: Bool, isRunning: Bool, expectedImage: String? = nil, actualImage: String? = nil, isImageMismatch: Bool = false, expectedPorts: String? = nil, actualPorts: String? = nil, isPortMismatch: Bool = false, configChanged: Bool = false, configDifferences: String? = nil) {
            self.name = name
            self.isManaged = isManaged
            self.isRunning = isRunning
            self.expectedImage = expectedImage
            self.actualImage = actualImage
            self.isImageMismatch = isImageMismatch
            self.expectedPorts = expectedPorts
            self.actualPorts = actualPorts
            self.isPortMismatch = isPortMismatch
            self.configChanged = configChanged
            self.configDifferences = configDifferences
        }
    }

    public func listServices(app: Application) async throws -> [DockerServiceItem] {
        let basePath = try await getBasePath(app: app)
        let fm = FileManager.default
        
        // 1. Get Managed Services (Directories)
        var managedServices: Set<String> = []
        if let contents = try? fm.contentsOfDirectory(atPath: basePath) {
            for name in contents {
                var isDir: ObjCBool = false
                if fm.fileExists(atPath: (basePath as NSString).appendingPathComponent(name), isDirectory: &isDir), isDir.boolValue {
                    if !name.hasPrefix(".") {
                        managedServices.insert(name)
                    }
                }
            }
        }
        
        // 2. Get Running Containers (Docker PS with labels)
        let runningContainers: [ContainerInfo]
        do {
            runningContainers = try await getRunningContainers(app: app)
        } catch {
            app.logger.warning("[DockerStorage] Failed to get running containers: \(error.localizedDescription)")
            runningContainers = []
        }
        
        // 3. Merge
        var allServices: [DockerServiceItem] = []
        
        // Track which managed services are running
        var managedServiceStatus: [String: (isRunning: Bool, actualImage: String?, actualPorts: String?)] = [:]
        
        let normalizedManagedServices = Set(managedServices.map { $0.lowercased().replacingOccurrences(of: "_", with: "-") })
        
        for container in runningContainers {
            if let project = container.project {
                let normalizedProject = project.lowercased().replacingOccurrences(of: "_", with: "-")
                if managedServices.contains(project) || normalizedManagedServices.contains(normalizedProject) {
                    let matchedService = managedServices.first { serviceName in
                        let normalized = serviceName.lowercased().replacingOccurrences(of: "_", with: "-")
                        return serviceName == project || normalized == normalizedProject
                    }
                    if let matched = matchedService {
                        let expectedPath = (basePath as NSString).appendingPathComponent(matched)
                        let normalizedWorkingDir: String? = {
                            guard let wd = container.workingDir else { return nil }
                            return wd.hasSuffix("/") ? String(wd.dropLast()) : wd
                        }()
                        let normalizedExpectedPath = expectedPath.hasSuffix("/") ? String(expectedPath.dropLast()) : expectedPath
                        
                        if normalizedWorkingDir == normalizedExpectedPath {
                            let isRunning = container.state.lowercased() == "running"
                            if !(managedServiceStatus[matched]?.isRunning ?? false) {
                                managedServiceStatus[matched] = (isRunning: isRunning, actualImage: container.image, actualPorts: container.ports)
                            }
                        }
                    }
                }
            }
        }
        
        // Add managed services concurrently
        let serviceNames = Array(managedServices)
        let statusSnapshot = managedServiceStatus
        
        let processedServices = try await withThrowingTaskGroup(of: DockerServiceItem.self) { group in
            for name in serviceNames {
                group.addTask {
                    let status = statusSnapshot[name] ?? (isRunning: false, actualImage: nil, actualPorts: nil)
                    let expectedImage = self.getExpectedImage(basePath: basePath, serviceName: name)
                    let expectedPorts = self.getExpectedPorts(basePath: basePath, serviceName: name)
                    
                    let isImageMismatch: Bool
                    if let actual = status.actualImage, let expected = expectedImage {
                        let normActual = actual.hasSuffix(":latest") ? String(actual.dropLast(7)) : actual
                        let normExpected = expected.hasSuffix(":latest") ? String(expected.dropLast(7)) : expected
                        isImageMismatch = normActual != normExpected
                    } else {
                        isImageMismatch = false
                    }

                    // Strict port mismatch detection
                    let isPortMismatch: Bool
                    if let actual = status.actualPorts, let expected = expectedPorts {
                        // Parse expected ports: "8081:80, 127.0.0.1:8081:80"
                        // Handle [[remote_ip:]host_port:]container_port
                        let expectedPortList = expected.components(separatedBy: ",")
                            .map { $0.trimmingCharacters(in: .whitespaces) }
                            .compactMap { portStr -> String? in
                                let parts = portStr.components(separatedBy: ":")
                                if parts.count >= 3 {
                                    // IP:HOST_PORT:CONTAINER_PORT
                                    return parts[1].trimmingCharacters(in: .whitespaces)
                                } else if parts.count == 2 {
                                    // HOST_PORT:CONTAINER_PORT
                                    return parts[0].trimmingCharacters(in: .whitespaces)
                                } else {
                                    // CONTAINER_PORT (usually autobound or ephemeral)
                                    return parts[0].trimmingCharacters(in: .whitespaces)
                                }
                            }
                        
                        // Parse actual ports from our unified format: "8081->80/tcp, 443->443/tcp"
                        // Or docker ps format: "0.0.0.0:8081->80/tcp"
                        let actualPortList = actual.components(separatedBy: ",")
                            .map { $0.trimmingCharacters(in: .whitespaces) }
                            .compactMap { portStr -> String? in
                                guard !portStr.isEmpty else { return nil }
                                
                                if portStr.contains("->") {
                                    let beforeArrow = portStr.components(separatedBy: "->").first ?? ""
                                    // Extract host port from "0.0.0.0:8081" or "8081"
                                    if let colonIndex = beforeArrow.lastIndex(of: ":") {
                                        let portPart = String(beforeArrow[beforeArrow.index(after: colonIndex)...])
                                        return portPart.trimmingCharacters(in: .whitespaces)
                                    }
                                    return beforeArrow.trimmingCharacters(in: .whitespaces)
                                } else if portStr.contains(":") {
                                    // Format like "0.0.0.0:8081"
                                    let parts = portStr.components(separatedBy: ":")
                                    return parts.last?.trimmingCharacters(in: .whitespaces)
                                }
                                return portStr.trimmingCharacters(in: .whitespaces)
                            }
                        
                        // Check if all expected ports exist in actual ports
                        let actualPortSet = Set(actualPortList)
                        let missingPorts = expectedPortList.filter { !actualPortSet.contains($0) }
                        isPortMismatch = !missingPorts.isEmpty
                    } else if status.actualPorts != nil && expectedPorts == nil {
                        // Running with ports but none expected
                        isPortMismatch = true
                    } else if status.actualPorts == nil && (expectedPorts != nil && expectedPorts != "") {
                        // Expected ports but none running
                        isPortMismatch = true
                    } else {
                        isPortMismatch = false
                    }
                    
                    // Only flag port mismatch if running (can't compare ports if container is stopped)
                    let finalPortMismatch = status.isRunning ? isPortMismatch : false
                    
                    // Calculate configChanged and configDifferences
                    // 只在容器运行时才检测配置不匹配
                    let configChanged = status.isRunning && (isImageMismatch || finalPortMismatch)
                    var differences: [String] = []
                    if isImageMismatch {
                        differences.append("Image mismatch")
                    }
                    if finalPortMismatch {
                        differences.append("Port mismatch")
                    }
                    let configDifferences = differences.isEmpty ? nil : differences.joined(separator: ", ")

                    return DockerServiceItem(
                        name: name,
                        isManaged: true,
                        isRunning: status.isRunning,
                        expectedImage: expectedImage,
                        actualImage: status.actualImage,
                        isImageMismatch: isImageMismatch,
                        expectedPorts: expectedPorts,
                        actualPorts: status.actualPorts,
                        isPortMismatch: finalPortMismatch,
                        configChanged: configChanged,
                        configDifferences: configDifferences
                    )
                }
            }
            
            var results: [DockerServiceItem] = []
            for try await item in group {
                results.append(item)
            }
            return results
        }
        
        allServices.append(contentsOf: processedServices)
        
        // Unmanaged
        for container in runningContainers {
            let project = container.project ?? ""
            let expectedPath = (basePath as NSString).appendingPathComponent(project)
            let normalizedWorkingDir: String? = {
                guard let wd = container.workingDir else { return nil }
                return wd.hasSuffix("/") ? String(wd.dropLast()) : wd
            }()
            let normalizedExpectedPath = expectedPath.hasSuffix("/") ? String(expectedPath.dropLast()) : expectedPath
            
            if normalizedWorkingDir != normalizedExpectedPath {
                allServices.append(DockerServiceItem(
                    name: container.name,
                    isManaged: false,
                    isRunning: container.state.lowercased() == "running"
                ))
            }
        }
        
        return allServices.sorted { $0.name < $1.name }
    }
    
    struct ContainerInfo {
        let id: String
        let name: String
        let image: String
        let state: String
        let project: String?
        let workingDir: String?
        let ports: String?
    }
    
    private func getRunningContainers(app: Application? = nil) async throws -> [ContainerInfo] {
        let path = resolveDockerPath()
        let process = Process()
        process.executableURL = URL(fileURLWithPath: path)
        // Get container info with ports from docker ps
        process.arguments = ["ps", "-a", "--format", "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.State}}\t{{.Label \"com.docker.compose.project\"}}\t{{.Label \"com.docker.compose.project.working_dir\"}}\t{{.Ports}}"]
        
        let pipe = Pipe()
        let errorPipe = Pipe()
        process.standardOutput = pipe
        process.standardError = errorPipe
        
        do {
            try process.run()
            process.waitUntilExit()
            
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: data, encoding: .utf8) ?? ""
            
            if process.terminationStatus != 0 {
                let errorData = errorPipe.fileHandleForReading.readDataToEndOfFile()
                let errorOutput = String(data: errorData, encoding: .utf8) ?? ""
                app?.logger.warning("[DockerStorage] Failed to list containers: \(errorOutput)")
            }
            
            var containers: [ContainerInfo] = []
            let lines = output.components(separatedBy: .newlines)
            
            // Get ports for each container using docker inspect
            for line in lines {
                let parts = line.components(separatedBy: "\t")
                if parts.count >= 3 {
                    let containerID = parts[0].trimmingCharacters(in: .whitespacesAndNewlines)
                    let name = parts[1].trimmingCharacters(in: .whitespacesAndNewlines)
                    if !name.isEmpty && !containerID.isEmpty {
                        let image = parts.count > 2 ? parts[2].trimmingCharacters(in: .whitespacesAndNewlines) : ""
                        let state = parts.count > 3 ? parts[3].trimmingCharacters(in: .whitespacesAndNewlines) : ""
                        let project = parts.count > 4 ? parts[4].trimmingCharacters(in: .whitespacesAndNewlines) : ""
                        let workingDir = parts.count > 5 ? parts[5].trimmingCharacters(in: .whitespacesAndNewlines) : ""
                        let ports = parts.count > 6 ? parts[6].trimmingCharacters(in: .whitespacesAndNewlines) : ""
                        
                        containers.append(ContainerInfo(
                            id: containerID,
                            name: name,
                            image: image,
                            state: state,
                            project: project.isEmpty ? nil : project,
                            workingDir: workingDir.isEmpty ? nil : workingDir,
                            ports: ports.isEmpty ? nil : ports
                        ))
                    }
                }
            }
            return containers
        } catch {
            app?.logger.warning("[DockerStorage] Error listing containers: \(error.localizedDescription)")
            return []
        }
    }
    
    private func getContainerPorts(containerID: String, app: Application?) async throws -> String? {
        // This function is now deprecated as we get ports directly from docker ps
        return nil
    }
    
    /// Public wrapper to find containers matching a given image name prefix
    public func findContainersByImagePrefix(app: Application, imagePrefix: String) async throws -> [(name: String, image: String, state: String, ports: String?, id: String)] {
        let containers = try await getRunningContainers(app: app)
        return containers.filter { container in
            container.image.lowercased().contains(imagePrefix.lowercased())
        }.map { ($0.name, $0.image, $0.state, $0.ports, $0.id) }
    }

    public func getExpectedImage(basePath: String, serviceName: String) -> String? {
        let yamlPath = (basePath as NSString).appendingPathComponent(serviceName).appending("/docker-compose.yml")
        
        guard FileManager.default.fileExists(atPath: yamlPath) else { return nil }
        let content = try? String(contentsOfFile: yamlPath, encoding: .utf8)
        guard let content = content else { return nil }
        
        // Simple regex to extract the first image defined in the file
        let pattern = #"image\s*:\s*"?([^"\s]+)"?"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: []),
              let match = regex.firstMatch(in: content, options: [], range: NSRange(content.startIndex..., in: content)) else {
            return nil
        }
        
        if let range = Range(match.range(at: 1), in: content) {
            return String(content[range])
        }
        
        return nil
    }

    public func getExpectedPorts(basePath: String, serviceName: String) -> String? {
        let yamlPath = (basePath as NSString).appendingPathComponent(serviceName).appending("/docker-compose.yml")
        
        guard FileManager.default.fileExists(atPath: yamlPath) else { return nil }
        let content = try? String(contentsOfFile: yamlPath, encoding: .utf8)
        guard let content = content else { return nil }
        
        // Extract all ports from the ports section
        // Support multiple formats:
        // ports:
        //   - "8080:80"
        //   - "8443:443"
        // or
        // ports:
        //   - 8080:80
        //   - 8443:443
        // or inline format:
        // ports: ["8080:80", "8443:443"]
        
        var ports: [String] = []
        
        // First, try to find the ports section block
        let blockPattern = #"ports:\s*\n((?:\s*-\s*[^\n]+\n?)+)"#
        if let blockRegex = try? NSRegularExpression(pattern: blockPattern, options: [.dotMatchesLineSeparators]),
           let blockMatch = blockRegex.firstMatch(in: content, options: [], range: NSRange(content.startIndex..., in: content)),
           let blockRange = Range(blockMatch.range(at: 1), in: content) {
            let portsBlock = String(content[blockRange])
            // Extract individual port mappings from block
            let portPattern = #"-\s*['"]?([a-zA-Z0-9\.\-:]+(?:/udp|/tcp)?)['"]?"#
            if let portRegex = try? NSRegularExpression(pattern: portPattern, options: []) {
                let portMatches = portRegex.matches(in: portsBlock, options: [], range: NSRange(portsBlock.startIndex..., in: portsBlock))
                ports = portMatches.compactMap { match -> String? in
                    guard let range = Range(match.range(at: 1), in: portsBlock) else { return nil }
                    return String(portsBlock[range])
                }
            }
        }
        
        // If block format didn't work, try inline array format
        if ports.isEmpty {
            let inlinePattern = #"ports:\s*\[([^\]]+)\]"#
            if let inlineRegex = try? NSRegularExpression(pattern: inlinePattern, options: []),
               let inlineMatch = inlineRegex.firstMatch(in: content, options: [], range: NSRange(content.startIndex..., in: content)),
               let inlineRange = Range(inlineMatch.range(at: 1), in: content) {
                let portsStr = String(content[inlineRange])
                // Extract ports from comma-separated list
                let portPattern = #"['"]?([a-zA-Z0-9\.\-:]+(?:/udp|/tcp)?)['"]?"#
                if let portRegex = try? NSRegularExpression(pattern: portPattern, options: []) {
                    let portMatches = portRegex.matches(in: portsStr, options: [], range: NSRange(portsStr.startIndex..., in: portsStr))
                    ports = portMatches.compactMap { match -> String? in
                        guard let range = Range(match.range(at: 1), in: portsStr) else { return nil }
                        return String(portsStr[range])
                    }
                }
            }
        }
        
        guard !ports.isEmpty else { return nil }
        return ports.joined(separator: ", ")
    }
    
    public func getBasePath(app: Application) async throws -> String {
        let setting = try await SystemSetting.query(on: app.db)
            .filter(\SystemSetting.$key == "DOCKER_BASE_PATH")
            .first()
        return setting?.value ?? "/Users/shared/minidock/docker"
    }
    
    private func getServicePath(app: Application, serviceName: String) async throws -> String {
        let basePath = try await getBasePath(app: app)
        return (basePath as NSString).appendingPathComponent(serviceName)
    }
    
    /// 确保服务路径存在（如果不存在则创建），但不会在目录已存在时抛出错误
    /// 用于操作现有服务的场景（读取、写入、运行命令等）
    private func ensureServicePathExists(app: Application, serviceName: String) async throws -> String {
        let servicePath = try await getServicePath(app: app, serviceName: serviceName)
        let fm = FileManager.default
        
        // 如果目录不存在，创建它（包括子目录）
        if !fm.fileExists(atPath: servicePath) {
            try fm.createDirectory(atPath: servicePath, withIntermediateDirectories: true)
            try fm.createDirectory(atPath: (servicePath as NSString).appendingPathComponent("config"), withIntermediateDirectories: true)
            try fm.createDirectory(atPath: (servicePath as NSString).appendingPathComponent("data"), withIntermediateDirectories: true)
            
            // 确保 Git 已初始化
            let basePath = try await getBasePath(app: app)
            try await ensureGitInitialized(basePath: basePath)
        }
        
        return servicePath
    }
    
    /// 确保服务目录存在（用于创建新服务）
    /// 如果目录已存在且非空，会抛出错误
    public func ensureServiceDirectory(app: Application, serviceName: String) async throws -> String {
        let basePath = try await getBasePath(app: app)
        let servicePath = (basePath as NSString).appendingPathComponent(serviceName)
        
        let fm = FileManager.default
        
        // 检查服务名称是否已存在（非空目录）
        if fm.fileExists(atPath: servicePath) {
            if let contents = try? fm.contentsOfDirectory(atPath: servicePath),
               !contents.isEmpty {
                throw Abort(.conflict, reason: "服务名称 '\(serviceName)' 已存在")
            }
        }
        
        try fm.createDirectory(atPath: servicePath, withIntermediateDirectories: true)
        try fm.createDirectory(atPath: (servicePath as NSString).appendingPathComponent("config"), withIntermediateDirectories: true)
        try fm.createDirectory(atPath: (servicePath as NSString).appendingPathComponent("data"), withIntermediateDirectories: true)
        
        // Ensure Git Init
        try await ensureGitInitialized(basePath: basePath)
        
        return servicePath
    }
    
    private func ensureGitInitialized(basePath: String) async throws {
        // Create initial .gitignore if needed
        let gitignorePath = (basePath as NSString).appendingPathComponent(".gitignore")
        if !FileManager.default.fileExists(atPath: gitignorePath) {
            let content = """
            .DS_Store
            **/data/
            **/logs/
            *.iso
            *.qcow2
            *.img
            *.dmg
            *.fd
            *.tar
            *.tar.gz
            *.zip
            *.log
            *.tmp
            *.cache
            """
            try content.write(toFile: gitignorePath, atomically: true, encoding: .utf8)
        } else {
            // 更新现有的 .gitignore，确保包含所有需要忽略的文件
            let existingContent = (try? String(contentsOfFile: gitignorePath, encoding: .utf8)) ?? ""
            var lines = Set(existingContent.components(separatedBy: .newlines).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty })
            lines.insert(".DS_Store")
            lines.insert("**/data/")
            lines.insert("**/logs/")
            lines.insert("*.iso")
            lines.insert("*.qcow2")
            lines.insert("*.img")
            lines.insert("*.dmg")
            lines.insert("*.fd")
            lines.insert("*.tar")
            lines.insert("*.tar.gz")
            lines.insert("*.zip")
            lines.insert("*.log")
            lines.insert("*.tmp")
            lines.insert("*.cache")
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
                _ = try await gitService.runGitCommand(args: ["commit", "-m", "Initial commit for Docker management"], basePath: basePath)
            }
        }
    }
    
    public func writeFile(app: Application, serviceName: String, fileName: String, content: String) async throws {
        let _ = try await ensureServicePathExists(app: app, serviceName: serviceName)
        let filePath = try await resolveFilePath(app: app, serviceName: serviceName, fileName: fileName)
        
        // Ensure parent directory exists
        let parentDir = (filePath as NSString).deletingLastPathComponent
        try FileManager.default.createDirectory(atPath: parentDir, withIntermediateDirectories: true)
        
        try content.write(toFile: filePath, atomically: true, encoding: .utf8)
        
        // Auto-commit
        let basePath = try await getBasePath(app: app)
        _ = try await gitService.runGitCommand(args: ["add", "."], basePath: basePath)
        _ = try await gitService.runGitCommand(args: ["commit", "-m", "Auto-update: \(serviceName)/\(fileName)"], basePath: basePath)
        
        // Clear history cache
        await gitService.clearHistoryCache(basePath: basePath)
        
        // Try push (background, errors won't propagate)
        Task.detached { [weak app] in
            guard let app = app else { return }
            do {
                try await gitService.tryPush(app: app, basePath: basePath, remoteKey: "DOCKER_GIT_REMOTE", branchKey: "DOCKER_GIT_BRANCH")
            } catch {
                app.logger.warning("[DockerStorage] Git push failed (non-critical): \(error)")
            }
        }
    }
    
    // FileItem structure for directory listing
    public struct FileItem: Content {
        public let name: String
        public let type: String  // "file" or "directory"
        public let path: String
        public let size: Int64?  // Only files have size
    }
    
    // Validate and sanitize path to prevent directory traversal
    private func validatePath(_ path: String) throws -> String {
        // Remove leading/trailing slashes and normalize
        var normalized = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        
        // Prevent directory traversal
        if normalized.contains("..") || normalized.contains("//") {
            throw Abort(.badRequest, reason: "Invalid path: directory traversal not allowed")
        }
        
        // Allow root-level files (docker-compose.yml, Dockerfile, .env, etc.)
        // and paths starting with "data/" or "config/"
        if !normalized.isEmpty {
            // Check if it's a root-level file (no slashes) or a data/config subdirectory
            let hasSlash = normalized.contains("/")
            if hasSlash {
                // For paths with slashes, only allow data/ or config/ prefixes
                if !normalized.hasPrefix("data/") && !normalized.hasPrefix("config/") {
                    throw Abort(.badRequest, reason: "Invalid path: only 'data' and 'config' directories are accessible")
                }
            }
            // If no slash, it's a root-level file - allow it (e.g., docker-compose.yml, Dockerfile, .env)
        }
        
        return normalized
    }
    
    // Resolve file path with validation
    private func resolveFilePath(app: Application, serviceName: String, fileName: String) async throws -> String {
        let servicePath = try await getServicePath(app: app, serviceName: serviceName)
        let validatedPath = try validatePath(fileName)
        
        // If path is empty or just "data"/"config", it's a directory, not a file
        if validatedPath.isEmpty || validatedPath == "data" || validatedPath == "config" {
            throw Abort(.badRequest, reason: "Path points to a directory, not a file")
        }
        
        let filePath = (servicePath as NSString).appendingPathComponent(validatedPath)
        
        // Ensure the resolved path is still within the service directory
        let servicePathURL = URL(fileURLWithPath: servicePath).standardizedFileURL
        let filePathURL = URL(fileURLWithPath: filePath).standardizedFileURL
        
        guard filePathURL.path.hasPrefix(servicePathURL.path) else {
            throw Abort(.badRequest, reason: "Invalid path: outside service directory")
        }
        
        return filePath
    }
    
    // Resolve directory path with validation
    private func resolveDirectoryPath(app: Application, serviceName: String, path: String) async throws -> String {
        let servicePath = try await getServicePath(app: app, serviceName: serviceName)
        let validatedPath = try validatePath(path)
        
        if validatedPath.isEmpty {
            // Root directory - return service path
            return servicePath
        }
        
        let dirPath = (servicePath as NSString).appendingPathComponent(validatedPath)
        
        // Ensure the resolved path is still within the service directory
        let servicePathURL = URL(fileURLWithPath: servicePath).standardizedFileURL
        let dirPathURL = URL(fileURLWithPath: dirPath).standardizedFileURL
        
        guard dirPathURL.path.hasPrefix(servicePathURL.path) else {
            throw Abort(.badRequest, reason: "Invalid path: outside service directory")
        }
        
        return dirPath
    }
    
    // List directory contents
    public func listDirectory(app: Application, serviceName: String, path: String) async throws -> [FileItem] {
        let dirPath = try await resolveDirectoryPath(app: app, serviceName: serviceName, path: path)
        let fm = FileManager.default
        
        // Check if directory exists
        var isDir: ObjCBool = false
        guard fm.fileExists(atPath: dirPath, isDirectory: &isDir), isDir.boolValue else {
            throw Abort(.notFound, reason: "Directory not found")
        }
        
        // List directory contents
        guard let contents = try? fm.contentsOfDirectory(atPath: dirPath) else {
            return []
        }
        
        var items: [FileItem] = []
        
        for itemName in contents {
            // Skip hidden files
            if itemName.hasPrefix(".") {
                continue
            }
            
            let itemPath = (dirPath as NSString).appendingPathComponent(itemName)
            var isItemDir: ObjCBool = false
            
            guard fm.fileExists(atPath: itemPath, isDirectory: &isItemDir) else {
                continue
            }
            
            // Calculate relative path from service root
            let servicePath = try await getServicePath(app: app, serviceName: serviceName)
            let relativePath: String
            if path.isEmpty {
                relativePath = itemName
            } else {
                relativePath = (path as NSString).appendingPathComponent(itemName)
            }
            
            if isItemDir.boolValue {
                items.append(FileItem(name: itemName, type: "directory", path: relativePath, size: nil))
            } else {
                // Get file size
                let fileAttributes = try? fm.attributesOfItem(atPath: itemPath)
                let fileSize = fileAttributes?[.size] as? Int64
                items.append(FileItem(name: itemName, type: "file", path: relativePath, size: fileSize))
            }
        }
        
        // Sort: directories first, then files, both alphabetically
        return items.sorted { item1, item2 in
            if item1.type != item2.type {
                return item1.type == "directory"
            }
            return item1.name.lowercased() < item2.name.lowercased()
        }
    }
    
    public func readFile(app: Application, serviceName: String, fileName: String) async throws -> String {
        let filePath = try await resolveFilePath(app: app, serviceName: serviceName, fileName: fileName)
        
        if !FileManager.default.fileExists(atPath: filePath) {
            return ""
        }
        
        // Check file size, limit to 10MB
        let fileAttributes = try FileManager.default.attributesOfItem(atPath: filePath)
        if let fileSize = fileAttributes[.size] as? Int64, fileSize > 10 * 1024 * 1024 {
            throw Abort(.payloadTooLarge, reason: "File size exceeds 10MB limit")
        }
        
        // Use Data to read file, avoiding potential memory issues with String(contentsOfFile:)
        let fileURL = URL(fileURLWithPath: filePath)
        let data = try Data(contentsOf: fileURL)
        
        guard let content = String(data: data, encoding: .utf8) else {
            throw Abort(.badRequest, reason: "File is not valid UTF-8")
        }
        
        return content
    }
    
    public func readFileAsData(app: Application, serviceName: String, fileName: String) async throws -> Data {
        let filePath = try await resolveFilePath(app: app, serviceName: serviceName, fileName: fileName)
        
        if !FileManager.default.fileExists(atPath: filePath) {
            throw Abort(.notFound, reason: "File not found")
        }
        
        // Check file size, limit to 10MB
        let fileAttributes = try FileManager.default.attributesOfItem(atPath: filePath)
        if let fileSize = fileAttributes[.size] as? Int64, fileSize > 10 * 1024 * 1024 {
            throw Abort(.payloadTooLarge, reason: "File size exceeds 10MB limit")
        }
        
        let fileURL = URL(fileURLWithPath: filePath)
        let data = try Data(contentsOf: fileURL)
        
        return data
    }
    
    public func getMimeType(for fileName: String) -> String {
        let ext = (fileName as NSString).pathExtension.lowercased()
        switch ext {
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "svg": return "image/svg+xml"
        case "webp": return "image/webp"
        case "bmp": return "image/bmp"
        case "ico": return "image/x-icon"
        default: return "application/octet-stream"
        }
    }
    
    public func isImageFile(_ fileName: String) -> Bool {
        let ext = (fileName as NSString).pathExtension.lowercased()
        return ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"].contains(ext)
    }
    
    public func getDynamicBranchName(basePath: String) async -> String {
        return await gitService.getDynamicBranchName(basePath: basePath)
    }
    
    public func validateComposeFile(app: Application, serviceName: String, content: String) async throws -> (valid: Bool, errors: [String]) {
        let servicePath = try await ensureServicePathExists(app: app, serviceName: serviceName)
        
        // 创建临时文件用于验证
        let tempFilePath = (servicePath as NSString).appendingPathComponent(".docker-compose.yml.tmp")
        defer {
            // 清理临时文件
            try? FileManager.default.removeItem(atPath: tempFilePath)
        }
        
        // 写入临时文件
        try content.write(toFile: tempFilePath, atomically: true, encoding: .utf8)
        
        // 规范化项目名称（与 runComposeCommand 保持一致）
        let normalizedProjectName = serviceName.lowercased().replacingOccurrences(of: "_", with: "-")
        
        let process = Process()
        process.executableURL = URL(fileURLWithPath: resolveDockerPath())
        // 验证时也使用项目名称，确保一致性
        process.arguments = ["compose", "-p", normalizedProjectName, "-f", tempFilePath, "config", "--quiet"]
        process.currentDirectoryURL = URL(fileURLWithPath: servicePath)
        
        // Inject prefix for path mapping if needed
        var env = ProcessInfo.processInfo.environment
        env["MINIDOCK_SERVICE_PATH"] = servicePath
        process.environment = env
        
        let outputPipe = Pipe()
        let errorPipe = Pipe()
        process.standardOutput = outputPipe
        process.standardError = errorPipe
        
        try process.run()
        process.waitUntilExit()
        
        let errorData = errorPipe.fileHandleForReading.readDataToEndOfFile()
        let errorOutput = String(data: errorData, encoding: .utf8) ?? ""
        
        // 如果退出码不为0，说明验证失败
        if process.terminationStatus != 0 {
            // 解析错误信息，过滤掉警告（包含"warning"或"obsolete"的行）
            let errorLines = errorOutput.components(separatedBy: .newlines)
                .filter { line in
                    let trimmed = line.trimmingCharacters(in: .whitespaces)
                    if trimmed.isEmpty { return false }
                    // 忽略警告信息
                    let lowercased = trimmed.lowercased()
                    if lowercased.contains("warning") || lowercased.contains("obsolete") {
                        return false
                    }
                    return true
                }
            
            // 如果过滤后还有错误，返回失败
            if !errorLines.isEmpty {
                return (valid: false, errors: errorLines)
            }
            // 如果退出码不为0但没有错误信息（可能是其他问题），也返回失败
            return (valid: false, errors: ["Docker Compose validation failed with exit code \(process.terminationStatus)"])
        }
        
        // 退出码为0，验证通过（即使stderr中有警告信息，也忽略）
        return (valid: true, errors: [])
    }
    
    public func runComposeCommand(app: Application, serviceName: String, args: [String], forceAnsi: Bool = false, track: Bool = true, nonBlocking: Bool = false) async throws -> String {
        let servicePath = try await ensureServicePathExists(app: app, serviceName: serviceName)
        let normalizedProjectName = serviceName.lowercased().replacingOccurrences(of: "_", with: "-")
        let commandDisplayName = "Docker Compose [\(serviceName)]: \(args.joined(separator: " "))"
        
        let engine = app.instructionEngine
        let dockerPath = resolveDockerPath()
        
        var cmdArgs = ["compose", "-p", normalizedProjectName]
        if forceAnsi {
            cmdArgs.append(contentsOf: ["--ansi", "always"])
        }
        cmdArgs.append(contentsOf: args)
        
        // Use full command for logging
        let fullCommand = "\(dockerPath) " + cmdArgs.joined(separator: " ")
        let instructionId = track ? await engine.emitStarted(app: app, command: commandDisplayName, fullCommand: fullCommand) : nil
        
        let process = Process()
        process.executableURL = URL(fileURLWithPath: dockerPath)
        process.arguments = cmdArgs
        process.currentDirectoryURL = URL(fileURLWithPath: servicePath)
        
        var env = ProcessInfo.processInfo.environment
        env["MINIDOCK_SERVICE_PATH"] = servicePath
        process.environment = env
        
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        
        class OutputBuffer: @unchecked Sendable {
            var content = ""
            private let lock = NSLock()
            
            func append(_ str: String) {
                lock.lock()
                defer { lock.unlock() }
                content += str
            }
            
            func current() -> String {
                lock.lock()
                defer { lock.unlock() }
                return content
            }
        }
        
        let outputBuffer = OutputBuffer()
        
        // Setup asynchronous reading
        pipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }
            
            if let str = String(data: data, encoding: .utf8) {
                outputBuffer.append(str)
                
                if let id = instructionId {
                    Task {
                        await engine.emitOutput(app: app, id: id, output: str)
                    }
                }
            }
        }
        
        if nonBlocking {
            do {
                try process.run()
                process.terminationHandler = { proc in
                    pipe.fileHandleForReading.readabilityHandler = nil
                    if let id = instructionId {
                        let finalOutput = outputBuffer.current()
                        Task {
                            await engine.emitFinished(app: app, id: id, output: finalOutput, exitCode: proc.terminationStatus)
                        }
                    }
                }
                return "instruction_id:\(instructionId?.uuidString ?? "")"
            } catch {
                pipe.fileHandleForReading.readabilityHandler = nil
                if let id = instructionId {
                    await engine.emitFinished(app: app, id: id, output: "Error starting process: \(error)", exitCode: -1)
                }
                throw error
            }
        }
        
        return try await withCheckedThrowingContinuation { continuation in
            do {
                try process.run()
                
                process.terminationHandler = { proc in
                    // Close the readability handler
                    pipe.fileHandleForReading.readabilityHandler = nil
                    
                    let finalOutput = outputBuffer.current()
                    
                    if let id = instructionId {
                        Task {
                            await engine.emitFinished(app: app, id: id, output: finalOutput, exitCode: proc.terminationStatus)
                        }
                    }
                    
                    if proc.terminationStatus != 0 {
                        // Clean up error message
                        let cleanOutput = finalOutput.components(separatedBy: .newlines)
                            .filter { line in
                                let lower = line.lowercased()
                                return !lower.contains("level=warning") && !lower.contains("obsolete") && !line.trimmingCharacters(in: .whitespaces).isEmpty
                            }
                            .joined(separator: "\n")
                        
                        let finalReason = cleanOutput.isEmpty ? "Docker Compose failed with exit code \(proc.terminationStatus)" : cleanOutput
                        continuation.resume(throwing: Abort(.internalServerError, reason: finalReason))
                    } else {
                        continuation.resume(returning: finalOutput)
                    }
                }
            } catch {
                pipe.fileHandleForReading.readabilityHandler = nil
                if let id = instructionId {
                    Task {
                        await engine.emitFinished(app: app, id: id, output: "Error: \(error.localizedDescription)", exitCode: 1)
                    }
                }
                continuation.resume(throwing: error)
            }
        }
    }
    
    public struct ImageStatus: Content {
        public let exists: Bool
        public let size: String?
        public let id: String?
    }
    
    public func getImageStatus(app: Application, imageName: String) async throws -> ImageStatus {
        let dockerPath = resolveDockerPath()
        let process = Process()
        process.executableURL = URL(fileURLWithPath: dockerPath)
        
        // Format: ID, Size, Tag
        // Use --no-trunc to get full ID if needed
        process.arguments = ["images", "--format", "{{.ID}}\t{{.Size}}", imageName]
        
        let pipe = Pipe()
        process.standardOutput = pipe
        
        try process.run()
        process.waitUntilExit()
        
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let output = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        
        if output.isEmpty || process.terminationStatus != 0 {
            return ImageStatus(exists: false, size: nil, id: nil)
        }
        
        let parts = output.components(separatedBy: "\t")
        if parts.count >= 2 {
            return ImageStatus(exists: true, size: parts[1], id: parts[0])
        }
        
        return ImageStatus(exists: true, size: "Unknown", id: output)
    }
    
    public func getLogs(app: Application, serviceName: String, tail: Int = 100) async throws -> String {
        return try await runComposeCommand(app: app, serviceName: serviceName, args: ["logs", "--tail", "\(tail)"], forceAnsi: true, track: false)
    }
    
    public typealias GitCommit = GitStorageService.GitCommit
    
    public func getHistory(app: Application, serviceName: String) async throws -> [GitCommit] {
        let basePath = try await getBasePath(app: app)
        return try await gitService.getHistory(basePath: basePath, path: serviceName)
    }
    
    public func getDiff(app: Application, serviceName: String, commitHash: String) async throws -> String {
        let basePath = try await getBasePath(app: app)
        return try await gitService.getDiff(basePath: basePath, path: serviceName, commitHash: commitHash)
    }
    
    public func deleteService(app: Application, serviceName: String) async throws {
        let basePath = try await getBasePath(app: app)
        let servicePath = (basePath as NSString).appendingPathComponent(serviceName)
        let fm = FileManager.default
        
        guard fm.fileExists(atPath: servicePath) else {
            throw Abort(.notFound, reason: "Service \(serviceName) not found")
        }
        
        // First, try to stop the service if it's running
        do {
            _ = try await runComposeCommand(app: app, serviceName: serviceName, args: ["down"])
        } catch {
            app.logger.warning("[DockerStorage] Failed to stop service before deletion: \(error.localizedDescription)")
            // Continue with deletion even if stop fails
        }
        
        // Always force cleanup orphans to handle cases where 'down' failed or was incomplete
        cleanupOrphanResources(app: app, serviceName: serviceName)
        
        // Remove the service directory
        try fm.removeItem(atPath: servicePath)
        
        // Git commit the deletion
        try await ensureGitInitialized(basePath: basePath)
        _ = try await gitService.runGitCommand(args: ["add", "."], basePath: basePath)
        _ = try await gitService.runGitCommand(args: ["commit", "-m", "Delete service: \(serviceName)"], basePath: basePath)
        
        // Clear history cache
        await gitService.clearHistoryCache(basePath: basePath)
        
        // Try push (background)
        Task.detached { [weak app] in
            guard let app = app else { return }
            do {
                try await gitService.tryPush(app: app, basePath: basePath, remoteKey: "DOCKER_GIT_REMOTE", branchKey: "DOCKER_GIT_BRANCH")
            } catch {
                app.logger.warning("[DockerStorage] Git push failed (non-critical): \(error)")
            }
        }
    }
    
    public func deleteFile(app: Application, serviceName: String, fileName: String) async throws {
        let filePath = try await resolveFilePath(app: app, serviceName: serviceName, fileName: fileName)
        let fm = FileManager.default
        
        guard fm.fileExists(atPath: filePath) else {
            throw Abort(.notFound, reason: "File not found: \(fileName)")
        }
        
        try fm.removeItem(atPath: filePath)
        
        // Auto-commit
        let basePath = try await getBasePath(app: app)
        try await ensureGitInitialized(basePath: basePath)
        _ = try await gitService.runGitCommand(args: ["add", "."], basePath: basePath)
        _ = try await gitService.runGitCommand(args: ["commit", "-m", "Delete file: \(serviceName)/\(fileName)"], basePath: basePath)
        
        // Clear history cache
        await gitService.clearHistoryCache(basePath: basePath)
        
        // Try push
        Task.detached { [weak app] in
            guard let app = app else { return }
            do {
                try await GitStorageService.shared.tryPush(app: app, basePath: basePath, remoteKey: "DOCKER_GIT_REMOTE", branchKey: "DOCKER_GIT_BRANCH")
            } catch {
                app.logger.warning("[DockerStorage] Git push failed (non-critical): \(error)")
            }
        }
    }
    
    public func createDirectory(app: Application, serviceName: String, path: String) async throws {
        let dirPath = try await resolveDirectoryPath(app: app, serviceName: serviceName, path: path)
        let fm = FileManager.default
        
        if fm.fileExists(atPath: dirPath) {
            throw Abort(.conflict, reason: "Directory already exists")
        }
        
        try fm.createDirectory(atPath: dirPath, withIntermediateDirectories: true)
        
        // Directories are not tracked by git until they contain files, but we can add an empty .gitkeep if needed.
        // For now, let's just create the directory. If user checks "git status", it won't show empty dirs.
        // We can create a .gitkeep to ensure it persists in git.
        let gitkeepPath = (dirPath as NSString).appendingPathComponent(".gitkeep")
        try "".write(toFile: gitkeepPath, atomically: true, encoding: .utf8)
        
        // Auto-commit
        let basePath = try await getBasePath(app: app)
        try await ensureGitInitialized(basePath: basePath)
        _ = try await gitService.runGitCommand(args: ["add", "."], basePath: basePath)
        _ = try await gitService.runGitCommand(args: ["commit", "-m", "Create directory: \(serviceName)/\(path)"], basePath: basePath)
        
        // Clear history cache
        await gitService.clearHistoryCache(basePath: basePath)
        
        // Try push
        Task.detached { [weak app] in
            guard let app = app else { return }
            do {
                try await GitStorageService.shared.tryPush(app: app, basePath: basePath, remoteKey: "DOCKER_GIT_REMOTE", branchKey: "DOCKER_GIT_BRANCH")
            } catch {
                app.logger.warning("[DockerStorage] Git push failed (non-critical): \(error)")
            }
        }
    }
    
    public func renameFile(app: Application, serviceName: String, oldName: String, newName: String) async throws {
        let oldPath = try await resolveFilePath(app: app, serviceName: serviceName, fileName: oldName)
        
        // Validate new name (simple validation, should probably reuse resolveFilePath logic but target verify target doesn't exist yet)
        // We can't use resolveFilePath for newName if we want to ensure it DOESN'T exist yet, 
        // but we DO want to ensure it's valid path within service.
        
        // Let's resolve the parent of newName to ensure we can write there
        let servicePath = try await getServicePath(app: app, serviceName: serviceName)
        let validatedNewName = try validatePath(newName)
        if validatedNewName.isEmpty || validatedNewName == "data" || validatedNewName == "config" {
             throw Abort(.badRequest, reason: "Invalid new name")
        }
        
        let newPath = (servicePath as NSString).appendingPathComponent(validatedNewName)
        let newPathURL = URL(fileURLWithPath: newPath).standardizedFileURL
        let servicePathURL = URL(fileURLWithPath: servicePath).standardizedFileURL
        
        guard newPathURL.path.hasPrefix(servicePathURL.path) else {
            throw Abort(.badRequest, reason: "Invalid path: outside service directory")
        }
        
        let fm = FileManager.default
        
        guard fm.fileExists(atPath: oldPath) else {
            throw Abort(.notFound, reason: "Source file not found")
        }
        
        if fm.fileExists(atPath: newPath) {
            throw Abort(.conflict, reason: "Target file already exists")
        }
        
        // Ensure parent directory of new path exists
        let newParentDir = (newPath as NSString).deletingLastPathComponent
        try fm.createDirectory(atPath: newParentDir, withIntermediateDirectories: true)
        
        try fm.moveItem(atPath: oldPath, toPath: newPath)
        
        // Auto-commit
        let basePath = try await getBasePath(app: app)
        try await ensureGitInitialized(basePath: basePath)
        _ = try await gitService.runGitCommand(args: ["add", "."], basePath: basePath)
        _ = try await gitService.runGitCommand(args: ["commit", "-m", "Rename: \(serviceName)/\(oldName) -> \(newName)"], basePath: basePath)
        
        // Clear history cache
        await gitService.clearHistoryCache(basePath: basePath)
        
        // Try push
        Task.detached { [weak app] in
            guard let app = app else { return }
            do {
                try await GitStorageService.shared.tryPush(app: app, basePath: basePath, remoteKey: "DOCKER_GIT_REMOTE", branchKey: "DOCKER_GIT_BRANCH")
            } catch {
                app.logger.warning("[DockerStorage] Git push failed (non-critical): \(error)")
            }
        }
    }
    private func resolveDockerPath() -> String {
        let paths = ["/usr/local/bin/docker", "/opt/homebrew/bin/docker", "/usr/bin/docker"]
        for path in paths {
            if FileManager.default.fileExists(atPath: path) {
                return path
            }
        }
        return "/usr/local/bin/docker"
    }
    
    private func cleanupOrphanResources(app: Application, serviceName: String) {
        let normalizedProjectName = serviceName.lowercased().replacingOccurrences(of: "_", with: "-")
        let path = resolveDockerPath()
        
        // 1. Cleanup Containers
        do {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: path)
            process.arguments = ["ps", "-a", "-q", "--filter", "label=com.docker.compose.project=\(normalizedProjectName)"]
            
            let pipe = Pipe()
            process.standardOutput = pipe
            try process.run()
            process.waitUntilExit()
            
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: data, encoding: .utf8) ?? ""
            let ids = output.components(separatedBy: .newlines).filter { !$0.isEmpty }
            
            if !ids.isEmpty {
                app.logger.info("[DockerStorage] Cleaning up orphan containers for \(serviceName): \(ids)")
                let rmProcess = Process()
                rmProcess.executableURL = URL(fileURLWithPath: path)
                rmProcess.arguments = ["rm", "-f"] + ids
                try rmProcess.run()
                rmProcess.waitUntilExit()
            }
        } catch {
            app.logger.error("[DockerStorage] Failed to cleanup containers: \(error)")
        }
        
        // 2. Cleanup Networks
        do {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: path)
            process.arguments = ["network", "ls", "-q", "--filter", "label=com.docker.compose.project=\(normalizedProjectName)"]
            
            let pipe = Pipe()
            process.standardOutput = pipe
            try process.run()
            process.waitUntilExit()
            
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: data, encoding: .utf8) ?? ""
            let ids = output.components(separatedBy: .newlines).filter { !$0.isEmpty }
            
            if !ids.isEmpty {
                app.logger.info("[DockerStorage] Cleaning up orphan networks for \(serviceName): \(ids)")
                let rmProcess = Process()
                rmProcess.executableURL = URL(fileURLWithPath: path)
                rmProcess.arguments = ["network", "rm"] + ids
                try rmProcess.run()
                rmProcess.waitUntilExit()
            }
        } catch {
            app.logger.error("[DockerStorage] Failed to cleanup networks: \(error)")
        }
    }
}
