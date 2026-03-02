import Vapor
import Fluent
import Foundation

// MARK: - DTOs

public struct SolutionComponentDefDTO: Content {
    public let id: String
    public let name: String
    public let description: String
    public let icon: String
    public let type: String      // "native" | "docker"
    public let tier: String      // "core" | "recommended" | "optional"
    public let required: Bool
    public let defaultPort: Int
    public let webUIPath: String?
    public let estimatedRam: Int
    public let estimatedDisk: Int
    public let dockerImage: String?
    public let nativeAppName: String?
    public let containerConfigPath: String?  // Container-side config mount path (default: /config)
}

public struct SolutionDefinitionDTO: Content {
    public let id: String
    public let name: String
    public let description: String
    public let icon: String
    public let category: String
    public let components: [SolutionComponentDefDTO]
    public let available: Bool
}

public struct SolutionInfoDTO: Content {
    public let id: String
    public let name: String
    public let description: String
    public let icon: String
    public let category: String
    public let componentCount: Int
    public let status: String
    public let available: Bool
    public let runningCount: Int
    public let totalCount: Int
}

public struct DeployedComponentDTO: Content {
    public let componentId: String
    public let name: String
    public let type: String
    public let status: String
    public let port: Int
    public let webUIUrl: String?
    public let error: String?
}

public struct SolutionDeploymentDTO: Content {
    public let id: String
    public let solutionId: String
    public let status: String
    public let components: [DeployedComponentDTO]
    public let mediaPath: String
    public let downloadsPath: String
    public let createdAt: String
    public let updatedAt: String
}

public struct ExternalContainerDTO: Content {
    public let componentId: String
    public let componentName: String
    public let containerName: String
    public let containerId: String
    public let image: String
    public let port: Int?
    public let isRunning: Bool
}

public struct SolutionDetailDTO: Content {
    public let definition: SolutionDefinitionDTO
    public let deployment: SolutionDeploymentDTO?
    public let externalContainers: [ExternalContainerDTO]
}

public struct DeploymentProgressDTO: Content {
    public let solutionId: String
    public let overallPercent: Int
    public let currentStep: String
    public let components: [ComponentProgressDTO]
}

public struct ComponentProgressDTO: Content {
    public let componentId: String
    public let status: String
    public let progress: Int?
    public let message: String?
}

public struct DeployRequestDTO: Content {
    public let components: [String]
    public let mediaPath: String
    public let downloadsPath: String
    public let portOverrides: [String: Int]?
}

public struct ActionRequestDTO: Content {
    public let action: String // start_all, stop_all, update_all
}

public struct UpdatePathsRequestDTO: Content {
    public let mediaPath: String
    public let downloadsPath: String
}

// MARK: - Preflight DTOs

public struct PreflightResultDTO: Content {
    public let components: [ComponentPreflightDTO]
}

public struct ComponentPreflightDTO: Content {
    public let componentId: String
    public let existingContainer: String?
    public let existingPort: Int?
    public let portConflict: Bool
    public let portConflictProcess: String?
}

// MARK: - Solution Service

public struct SolutionService: MiniDockService, @unchecked Sendable {
    public let id: String = "solution-center"
    public let name: String = "Solution Center"
    public let type: ServiceType = .system

    private let jellyfinService = JellyfinNativeService()

    // In-memory progress tracking (protected by progressLock)
    private static let progressLock = NSLock()
    nonisolated(unsafe) private static var progressMap: [String: DeploymentProgressDTO] = [:]

    /// Thread-safe read of progress map
    private static func getProgress(_ id: String) -> DeploymentProgressDTO? {
        progressLock.lock()
        defer { progressLock.unlock() }
        return progressMap[id]
    }

    /// Thread-safe write to progress map
    private static func setProgress(_ id: String, _ value: DeploymentProgressDTO?) {
        progressLock.lock()
        defer { progressLock.unlock() }
        if let value = value {
            progressMap[id] = value
        } else {
            progressMap.removeValue(forKey: id)
        }
    }

    public init() {}

    public func getStatus() async throws -> ServiceStatus {
        return .running
    }

    public func getInfo(app: Application) async throws -> ServiceInfo {
        return ServiceInfo(
            id: id,
            name: name,
            type: type,
            status: .running,
            description: "One-click solution deployment center.",
            stats: nil
        )
    }

    // MARK: - Solution Definitions

    private static let mediaCenterComponents: [SolutionComponentDefDTO] = [
        SolutionComponentDefDTO(
            id: "jellyfin", name: "Jellyfin", description: "Media server with hardware-accelerated transcoding via VideoToolbox",
            icon: "jellyfin", type: "native", tier: "core", required: true,
            defaultPort: 8096, webUIPath: "/", estimatedRam: 512, estimatedDisk: 200,
            dockerImage: nil, nativeAppName: "Jellyfin", containerConfigPath: nil
        ),
        SolutionComponentDefDTO(
            id: "sonarr", name: "Sonarr", description: "TV series management and automatic downloading",
            icon: "sonarr", type: "docker", tier: "recommended", required: false,
            defaultPort: 8989, webUIPath: "/", estimatedRam: 256, estimatedDisk: 100,
            dockerImage: "linuxserver/sonarr", nativeAppName: nil, containerConfigPath: nil
        ),
        SolutionComponentDefDTO(
            id: "radarr", name: "Radarr", description: "Movie collection management and automatic downloading",
            icon: "radarr", type: "docker", tier: "recommended", required: false,
            defaultPort: 7878, webUIPath: "/", estimatedRam: 256, estimatedDisk: 100,
            dockerImage: "linuxserver/radarr", nativeAppName: nil, containerConfigPath: nil
        ),
        SolutionComponentDefDTO(
            id: "prowlarr", name: "Prowlarr", description: "Indexer manager for Sonarr and Radarr",
            icon: "prowlarr", type: "docker", tier: "recommended", required: false,
            defaultPort: 9696, webUIPath: "/", estimatedRam: 128, estimatedDisk: 50,
            dockerImage: "linuxserver/prowlarr", nativeAppName: nil, containerConfigPath: nil
        ),
        SolutionComponentDefDTO(
            id: "qbittorrent", name: "qBittorrent", description: "BitTorrent client with web UI",
            icon: "qbittorrent", type: "docker", tier: "recommended", required: false,
            defaultPort: 8080, webUIPath: "/", estimatedRam: 256, estimatedDisk: 50,
            dockerImage: "linuxserver/qbittorrent", nativeAppName: nil, containerConfigPath: nil
        ),
        SolutionComponentDefDTO(
            id: "bazarr", name: "Bazarr", description: "Automatic subtitle downloading",
            icon: "bazarr", type: "docker", tier: "optional", required: false,
            defaultPort: 6767, webUIPath: "/", estimatedRam: 128, estimatedDisk: 50,
            dockerImage: "linuxserver/bazarr", nativeAppName: nil, containerConfigPath: nil
        ),
        SolutionComponentDefDTO(
            id: "jellyseerr", name: "Jellyseerr", description: "Media request and discovery portal",
            icon: "jellyseerr", type: "docker", tier: "optional", required: false,
            defaultPort: 5055, webUIPath: "/", estimatedRam: 256, estimatedDisk: 100,
            dockerImage: "fallenbagel/jellyseerr", nativeAppName: nil, containerConfigPath: "/app/config"
        ),
    ]

    private static let mediaCenterDefinition = SolutionDefinitionDTO(
        id: "media-center",
        name: "影音中心",
        description: "一站式家庭影院套件：Jellyfin 原生硬件转码 + 自动化影视管理",
        icon: "media-center",
        category: "media",
        components: mediaCenterComponents,
        available: true
    )

    private static let allDefinitions: [SolutionDefinitionDTO] = [
        mediaCenterDefinition,
        SolutionDefinitionDTO(
            id: "photo-album",
            name: "智能相册",
            description: "AI 驱动的照片管理与分享平台",
            icon: "photo-album",
            category: "media",
            components: [],
            available: false
        ),
        SolutionDefinitionDTO(
            id: "smart-home",
            name: "智能家居",
            description: "Home Assistant 全屋智能控制中心",
            icon: "smart-home",
            category: "automation",
            components: [],
            available: false
        ),
    ]

    // MARK: - API Methods

    public func listSolutions(app: Application) async throws -> [SolutionInfoDTO] {
        let deployments = try await SolutionDeployment.query(on: app.db).all()
        let deploymentMap = Dictionary(uniqueKeysWithValues: deployments.map { ($0.solutionId, $0) })

        return Self.allDefinitions.map { def in
            let deployment = deploymentMap[def.id]
            var runningCount = 0
            var totalCount = 0
            if let deployment = deployment,
               let data = deployment.componentsJSON.data(using: .utf8),
               let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
                totalCount = parsed.count
                runningCount = parsed.filter { ($0["status"] as? String) == "running" }.count
            }
            return SolutionInfoDTO(
                id: def.id,
                name: def.name,
                description: def.description,
                icon: def.icon,
                category: def.category,
                componentCount: def.components.count,
                status: deployment?.status ?? "not_installed",
                available: def.available,
                runningCount: runningCount,
                totalCount: totalCount
            )
        }
    }

    public func getSolutionDetail(app: Application, id: String) async throws -> SolutionDetailDTO {
        guard let definition = Self.allDefinitions.first(where: { $0.id == id }) else {
            throw Abort(.notFound, reason: "Solution not found: \(id)")
        }

        let deployment = try await SolutionDeployment.query(on: app.db)
            .filter(\.$solutionId == id)
            .first()

        var deploymentDTO: SolutionDeploymentDTO? = nil
        if let deployment = deployment {
            deploymentDTO = try makeDeploymentDTO(from: deployment)
        }

        // Detect external containers (independently deployed) for this solution
        let externalContainers = await detectExternalContainers(
            app: app,
            definition: definition,
            deployedComponentIds: Set((deploymentDTO?.components ?? []).map { $0.componentId })
        )

        return SolutionDetailDTO(definition: definition, deployment: deploymentDTO, externalContainers: externalContainers)
    }

    public func deploy(app: Application, id: String, request: DeployRequestDTO) async throws -> DeploymentProgressDTO {
        guard let definition = Self.allDefinitions.first(where: { $0.id == id }) else {
            throw Abort(.notFound, reason: "Solution not found: \(id)")
        }

        // Check if already deployed
        if let existing = try await SolutionDeployment.query(on: app.db)
            .filter(\.$solutionId == id)
            .first() {
            if existing.status == "deploying" {
                throw Abort(.conflict, reason: "Solution is already being deployed")
            }
            // Remove existing deployment to re-deploy
            try await existing.delete(on: app.db)
        }

        // Build initial components list
        let selectedComponents = definition.components.filter { request.components.contains($0.id) || $0.required }
        let deployedComponents: [[String: Any]] = selectedComponents.map { comp in
            let port = request.portOverrides?[comp.id] ?? comp.defaultPort
            return [
                "componentId": comp.id,
                "name": comp.name,
                "type": comp.type,
                "status": "waiting",
                "port": port,
            ]
        }

        let componentsData = try JSONSerialization.data(withJSONObject: deployedComponents)
        let componentsJSON = String(data: componentsData, encoding: .utf8) ?? "[]"

        // Create deployment record
        let deployment = SolutionDeployment(
            solutionId: id,
            status: "deploying",
            componentsJSON: componentsJSON,
            mediaPath: request.mediaPath,
            downloadsPath: request.downloadsPath
        )
        try await deployment.save(on: app.db)

        // Initialize progress
        let initialProgress = DeploymentProgressDTO(
            solutionId: id,
            overallPercent: 0,
            currentStep: "Preparing deployment...",
            components: selectedComponents.map { comp in
                ComponentProgressDTO(componentId: comp.id, status: "waiting", progress: nil, message: nil)
            }
        )
        Self.setProgress(id, initialProgress)

        // Start async deployment
        let appRef = app
        guard let deploymentId = deployment.id else {
            throw Abort(.internalServerError, reason: "Deployment ID not available after save")
        }
        Task {
            await self.performDeployment(app: appRef, solutionId: id, definition: definition, selectedComponents: selectedComponents, request: request, deploymentId: deploymentId)
        }

        return initialProgress
    }

    public func getDeploymentProgress(id: String) -> DeploymentProgressDTO {
        return Self.getProgress(id) ?? DeploymentProgressDTO(
            solutionId: id,
            overallPercent: 0,
            currentStep: "No active deployment",
            components: []
        )
    }

    public func preflight(app: Application, id: String) async throws -> PreflightResultDTO {
        guard let definition = Self.allDefinitions.first(where: { $0.id == id }) else {
            throw Abort(.notFound, reason: "Solution not found: \(id)")
        }

        let dockerStorage = app.serviceManager.getDockerStorage()
        var results: [ComponentPreflightDTO] = []

        for component in definition.components {
            var existingContainer: String? = nil
            var existingPort: Int? = nil
            var portConflict = false
            var portConflictProcess: String? = nil

            if component.type == "native" && component.id == "jellyfin" {
                // Check Jellyfin native installation
                if jellyfinService.isInstalled() {
                    existingContainer = "Jellyfin.app"
                    if await jellyfinService.isRunning() {
                        existingPort = component.defaultPort
                    }
                }
            } else if component.type == "docker", let imagePrefix = component.dockerImage {
                // Check for existing containers with matching image
                if let storage = dockerStorage {
                    // Extract short name from image (e.g. "linuxserver/sonarr" → "sonarr")
                    let shortName = imagePrefix.components(separatedBy: "/").last ?? imagePrefix
                    let matches = try await storage.findContainersByImagePrefix(app: app, imagePrefix: shortName)
                    if let first = matches.first {
                        existingContainer = first.name
                        // Parse port from ports string (e.g. "0.0.0.0:8989->8989/tcp")
                        if let ports = first.ports {
                            existingPort = parseHostPort(from: ports)
                        }
                    }
                }
            }

            // Check if default port is occupied by another process (only if no existing container found on that port)
            if existingPort == nil {
                let (occupied, process) = await checkPortOccupied(port: component.defaultPort)
                if occupied {
                    portConflict = true
                    portConflictProcess = process
                }
            }

            results.append(ComponentPreflightDTO(
                componentId: component.id,
                existingContainer: existingContainer,
                existingPort: existingPort,
                portConflict: portConflict,
                portConflictProcess: portConflictProcess
            ))
        }

        return PreflightResultDTO(components: results)
    }

    /// Parse host port from docker ps ports string (e.g. "0.0.0.0:8989->8989/tcp" → 8989)
    private func parseHostPort(from portsString: String) -> Int? {
        // Match pattern like "0.0.0.0:8989->8989/tcp"
        let pattern = #"(\d+\.\d+\.\d+\.\d+):(\d+)->"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: portsString, range: NSRange(portsString.startIndex..., in: portsString)),
              let range = Range(match.range(at: 2), in: portsString) else {
            return nil
        }
        return Int(portsString[range])
    }

    /// Check if a port is occupied using lsof
    private func checkPortOccupied(port: Int) async -> (Bool, String?) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/lsof")
        process.arguments = ["-i", ":\(port)", "-sTCP:LISTEN", "-P", "-n"]

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = Pipe()

        do {
            try process.run()
            process.waitUntilExit()

            if process.terminationStatus == 0 {
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let output = String(data: data, encoding: .utf8) ?? ""
                // Parse process name from lsof output (second line, first column)
                let lines = output.components(separatedBy: .newlines)
                if lines.count > 1 {
                    let parts = lines[1].components(separatedBy: .whitespaces).filter { !$0.isEmpty }
                    let processName = parts.first
                    return (true, processName)
                }
                return (true, nil)
            }
        } catch {
            // lsof failed — assume port is free
        }
        return (false, nil)
    }

    public func performAction(app: Application, id: String, action: String) async throws -> [String: String] {
        guard let deployment = try await SolutionDeployment.query(on: app.db)
            .filter(\.$solutionId == id)
            .first() else {
            throw Abort(.notFound, reason: "No deployment found for solution: \(id)")
        }

        let definition = Self.allDefinitions.first(where: { $0.id == id })
        let dockerStorage = app.serviceManager.getDockerStorage()

        switch action {
        case "start_all":
            // Start Jellyfin native
            if jellyfinService.isInstalled() {
                try await jellyfinService.start()
            }
            // Start docker components
            if let def = definition {
                let dockerComponents = def.components.filter { $0.type == "docker" }
                for comp in dockerComponents {
                    let serviceName = "media-center-\(comp.id)"
                    if let storage = dockerStorage {
                        _ = try? await storage.runComposeCommand(app: app, serviceName: serviceName, args: ["up", "-d"], track: false)
                    }
                }
            }
            try await updateDeploymentStatus(app: app, deployment: deployment, status: "running")
            return ["message": "All components started"]

        case "stop_all":
            // Stop Jellyfin native
            try? await jellyfinService.stop()
            // Stop docker components
            if let def = definition {
                let dockerComponents = def.components.filter { $0.type == "docker" }
                for comp in dockerComponents {
                    let serviceName = "media-center-\(comp.id)"
                    if let storage = dockerStorage {
                        _ = try? await storage.runComposeCommand(app: app, serviceName: serviceName, args: ["down"], track: false)
                    }
                }
            }
            try await updateDeploymentStatus(app: app, deployment: deployment, status: "stopped")
            return ["message": "All components stopped"]

        case "update_all":
            // Pull latest images for docker components
            if let def = definition {
                let dockerComponents = def.components.filter { $0.type == "docker" }
                for comp in dockerComponents {
                    let serviceName = "media-center-\(comp.id)"
                    if let storage = dockerStorage {
                        _ = try? await storage.runComposeCommand(app: app, serviceName: serviceName, args: ["pull"], track: false)
                        _ = try? await storage.runComposeCommand(app: app, serviceName: serviceName, args: ["up", "-d"], track: false)
                    }
                }
            }
            return ["message": "All components updated"]

        case "retry_failed":
            // Re-deploy only failed components
            guard let def = definition else {
                throw Abort(.notFound, reason: "Solution definition not found")
            }
            // Parse current components to find failed ones
            let currentComponents: [[String: Any]]
            if let data = deployment.componentsJSON.data(using: .utf8),
               let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
                currentComponents = parsed
            } else {
                currentComponents = []
            }
            let failedIds = Set(currentComponents.filter { ($0["status"] as? String) == "error" }.compactMap { $0["componentId"] as? String })
            guard !failedIds.isEmpty else {
                return ["message": "No failed components to retry"]
            }
            let failedComponents = def.components.filter { failedIds.contains($0.id) }
            // Build port map from existing deployment
            var portMap: [String: Int] = [:]
            for comp in currentComponents {
                if let cid = comp["componentId"] as? String, let port = comp["port"] as? Int {
                    portMap[cid] = port
                }
            }
            // Get paths from deployment
            let mediaPath = deployment.mediaPath
            let downloadsPath = deployment.downloadsPath

            // Re-deploy each failed component
            var retryResults: [String: String] = [:]
            for component in failedComponents {
                let port = portMap[component.id] ?? component.defaultPort
                do {
                    if component.type == "native" && component.id == "jellyfin" {
                        try await deployJellyfin(app: app, solutionId: id, port: port)
                    } else if component.type == "docker" {
                        try await deployDockerComponent(
                            app: app, solutionId: id, component: component,
                            port: port, mediaPath: mediaPath, downloadsPath: downloadsPath
                        )
                    }
                    retryResults[component.id] = "running"
                } catch {
                    app.logger.error("[SolutionService] Retry failed for \(component.name): \(error)")
                    retryResults[component.id] = "error:\(error.localizedDescription)"
                }
            }

            // Update componentsJSON with new statuses
            var updatedComponents = currentComponents
            for i in updatedComponents.indices {
                if let cid = updatedComponents[i]["componentId"] as? String, let result = retryResults[cid] {
                    if result == "running" {
                        updatedComponents[i]["status"] = "running"
                        updatedComponents[i]["error"] = nil
                    } else if result.hasPrefix("error:") {
                        updatedComponents[i]["status"] = "error"
                        updatedComponents[i]["error"] = String(result.dropFirst(6))
                    }
                }
            }
            let updatedData = try JSONSerialization.data(withJSONObject: updatedComponents)
            deployment.componentsJSON = String(data: updatedData, encoding: .utf8) ?? "[]"
            // Update overall status
            let stillHasErrors = updatedComponents.contains { ($0["status"] as? String) == "error" }
            deployment.status = stillHasErrors ? "partial" : "running"
            try await deployment.save(on: app.db)

            let successCount = retryResults.values.filter { $0 == "running" }.count
            return ["message": "Retried \(failedComponents.count) components, \(successCount) succeeded"]

        default:
            throw Abort(.badRequest, reason: "Unknown action: \(action)")
        }
    }

    public func uninstall(app: Application, id: String) async throws {
        guard let deployment = try await SolutionDeployment.query(on: app.db)
            .filter(\.$solutionId == id)
            .first() else {
            throw Abort(.notFound, reason: "No deployment found for solution: \(id)")
        }

        let definition = Self.allDefinitions.first(where: { $0.id == id })
        let dockerStorage = app.serviceManager.getDockerStorage()

        // Stop and remove docker components via standard flow (compose down → rm dir → git commit)
        if let def = definition {
            let dockerComponents = def.components.filter { $0.type == "docker" }
            for comp in dockerComponents {
                let serviceName = "media-center-\(comp.id)"
                if let ds = dockerStorage {
                    try? await ds.deleteService(app: app, serviceName: serviceName)
                }
            }
        }

        // Stop Jellyfin (but don't uninstall the app)
        try? await jellyfinService.stop()

        // Delete deployment record
        try await deployment.delete(on: app.db)

        // Clear progress
        Self.setProgress(id, nil)
    }

    public func updatePaths(app: Application, id: String, request: UpdatePathsRequestDTO) async throws -> SolutionDeploymentDTO {
        guard let definition = Self.allDefinitions.first(where: { $0.id == id }) else {
            throw Abort(.notFound, reason: "Solution not found: \(id)")
        }
        guard let deployment = try await SolutionDeployment.query(on: app.db)
            .filter(\.$solutionId == id)
            .first() else {
            throw Abort(.notFound, reason: "No deployment found for solution: \(id)")
        }

        let oldMedia = deployment.mediaPath
        let oldDownloads = deployment.downloadsPath
        let newMedia = request.mediaPath
        let newDownloads = request.downloadsPath

        // Update DB record
        deployment.mediaPath = newMedia
        deployment.downloadsPath = newDownloads
        try await deployment.save(on: app.db)

        // Regenerate docker-compose.yml for each Docker component if paths changed
        if oldMedia != newMedia || oldDownloads != newDownloads {
            let dockerStorage = app.serviceManager.getDockerStorage()

            // Parse deployed component ports from componentsJSON
            var portMap: [String: Int] = [:]
            if let data = deployment.componentsJSON.data(using: .utf8),
               let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
                for comp in parsed {
                    if let cid = comp["componentId"] as? String, let port = comp["port"] as? Int {
                        portMap[cid] = port
                    }
                }
            }

            let dockerComponents = definition.components.filter { $0.type == "docker" }
            for component in dockerComponents {
                guard portMap[component.id] != nil else { continue }
                let serviceName = "media-center-\(component.id)"
                let port = portMap[component.id]!

                if let storage = dockerStorage {
                    let basePath = try await storage.getBasePath(app: app)
                    let composeContent = generateComposeFile(
                        serviceName: serviceName,
                        image: component.dockerImage ?? "",
                        port: port,
                        containerPort: component.defaultPort,
                        mediaPath: newMedia,
                        downloadsPath: newDownloads,
                        componentId: component.id,
                        basePath: basePath,
                        containerConfigPath: component.containerConfigPath ?? "/config"
                    )
                    try await storage.writeFile(app: app, serviceName: serviceName, fileName: "docker-compose.yml", content: composeContent)

                    // Restart container to pick up new mounts
                    _ = try? await storage.runComposeCommand(app: app, serviceName: serviceName, args: ["up", "-d", "--force-recreate"], track: false)
                }
            }
        }

        return try makeDeploymentDTO(from: deployment)
    }

    // MARK: - External Container Detection

    /// Detect containers that match solution components but were deployed independently (not by the solution)
    private func detectExternalContainers(
        app: Application,
        definition: SolutionDefinitionDTO,
        deployedComponentIds: Set<String>
    ) async -> [ExternalContainerDTO] {
        let dockerStorage = app.serviceManager.getDockerStorage()
        var results: [ExternalContainerDTO] = []

        for component in definition.components {
            // Skip components already deployed by the solution
            if deployedComponentIds.contains(component.id) {
                continue
            }

            if component.type == "native" && component.id == "jellyfin" {
                // Check Jellyfin native installation
                if jellyfinService.isInstalled() {
                    let running = await jellyfinService.isRunning()
                    results.append(ExternalContainerDTO(
                        componentId: component.id,
                        componentName: component.name,
                        containerName: "Jellyfin.app",
                        containerId: "native-jellyfin",
                        image: "Jellyfin (Native)",
                        port: running ? component.defaultPort : nil,
                        isRunning: running
                    ))
                }
            } else if component.type == "docker", let imagePrefix = component.dockerImage {
                guard let storage = dockerStorage else { continue }
                let shortName = imagePrefix.components(separatedBy: "/").last ?? imagePrefix
                do {
                    let matches = try await storage.findContainersByImagePrefix(app: app, imagePrefix: shortName)
                    if let first = matches.first {
                        let isRunning = first.state.lowercased() == "running"
                        let port: Int? = first.ports.flatMap { parseHostPort(from: $0) }
                        results.append(ExternalContainerDTO(
                            componentId: component.id,
                            componentName: component.name,
                            containerName: first.name,
                            containerId: first.id,
                            image: first.image,
                            port: port,
                            isRunning: isRunning
                        ))
                    }
                } catch {
                    app.logger.warning("[SolutionService] Failed to detect external container for \(component.id): \(error)")
                }
            }
        }

        return results
    }

    // MARK: - Deployment Logic

    private func performDeployment(
        app: Application,
        solutionId: String,
        definition: SolutionDefinitionDTO,
        selectedComponents: [SolutionComponentDefDTO],
        request: DeployRequestDTO,
        deploymentId: UUID
    ) async {
        let totalComponents = selectedComponents.count
        var completedCount = 0

        for component in selectedComponents {
            let port = request.portOverrides?[component.id] ?? component.defaultPort

            updateProgress(solutionId: solutionId, componentId: component.id, status: "installing",
                           overallPercent: (completedCount * 100) / totalComponents,
                           currentStep: "Installing \(component.name)...")

            do {
                if component.type == "native" && component.id == "jellyfin" {
                    try await deployJellyfin(app: app, solutionId: solutionId, port: port)
                } else if component.type == "docker" {
                    try await deployDockerComponent(
                        app: app, solutionId: solutionId, component: component,
                        port: port, mediaPath: request.mediaPath, downloadsPath: request.downloadsPath
                    )
                }

                completedCount += 1
                updateProgress(solutionId: solutionId, componentId: component.id, status: "running",
                               overallPercent: (completedCount * 100) / totalComponents,
                               currentStep: completedCount == totalComponents ? "Deployment complete" : "Installing next component...")
            } catch {
                app.logger.error("[SolutionService] Failed to deploy \(component.name): \(error)")
                updateProgress(solutionId: solutionId, componentId: component.id, status: "error",
                               overallPercent: (completedCount * 100) / totalComponents,
                               currentStep: "Error deploying \(component.name)",
                               message: error.localizedDescription)
            }
        }

        // Update deployment record in DB
        do {
            if let deployment = try await SolutionDeployment.find(deploymentId, on: app.db) {
                let currentProgress = Self.getProgress(solutionId)
                let hasErrors = currentProgress?.components.contains { $0.status == "error" } ?? false
                let finalStatus = hasErrors ? "partial" : "running"

                // Build components JSON from actual state (include error messages)
                let components: [[String: Any]] = selectedComponents.map { comp in
                    let port = request.portOverrides?[comp.id] ?? comp.defaultPort
                    let progressComp = currentProgress?.components.first { $0.componentId == comp.id }
                    var dict: [String: Any] = [
                        "componentId": comp.id,
                        "name": comp.name,
                        "type": comp.type,
                        "status": progressComp?.status ?? "running",
                        "port": port,
                        "webUIUrl": "http://localhost:\(port)\(comp.webUIPath ?? "")",
                    ]
                    if let message = progressComp?.message, progressComp?.status == "error" {
                        dict["error"] = message
                    }
                    return dict
                }

                let componentsData = try JSONSerialization.data(withJSONObject: components)
                deployment.componentsJSON = String(data: componentsData, encoding: .utf8) ?? "[]"
                deployment.status = finalStatus
                try await deployment.save(on: app.db)
            }
        } catch {
            app.logger.error("[SolutionService] Failed to update deployment record: \(error)")
        }
    }

    private func deployJellyfin(app: Application, solutionId: String, port: Int) async throws {
        if !jellyfinService.isInstalled() {
            updateProgress(solutionId: solutionId, componentId: "jellyfin", status: "installing",
                           message: "Downloading Jellyfin...")
            try await jellyfinService.install(app: app) { message in
                self.updateProgress(solutionId: solutionId, componentId: "jellyfin", status: "installing",
                                    message: message)
            }
        }

        updateProgress(solutionId: solutionId, componentId: "jellyfin", status: "starting",
                       message: "Starting Jellyfin...")
        try await jellyfinService.start()

        // Wait for health check
        for _ in 0..<30 {
            try await Task.sleep(nanoseconds: 1_000_000_000)
            if await jellyfinService.checkHealth() {
                return
            }
        }
        app.logger.warning("[SolutionService] Jellyfin started but health check not passing after 30s")
    }

    private func deployDockerComponent(
        app: Application,
        solutionId: String,
        component: SolutionComponentDefDTO,
        port: Int,
        mediaPath: String,
        downloadsPath: String
    ) async throws {
        guard let dockerImage = component.dockerImage else {
            throw Abort(.internalServerError, reason: "No Docker image specified for \(component.name)")
        }

        let serviceName = "media-center-\(component.id)"
        let dockerStorage = app.serviceManager.getDockerStorage()

        guard let storage = dockerStorage else {
            throw Abort(.internalServerError, reason: "Docker storage service not available")
        }

        // Ensure service directory via standard flow (creates config/data subdirs + Git init)
        do {
            _ = try await storage.ensureServiceDirectory(app: app, serviceName: serviceName)
        } catch let error as Abort where error.status == .conflict {
            // Directory already exists — that's OK, we'll overwrite the compose file
            app.logger.info("[SolutionService] Service directory '\(serviceName)' already exists, will overwrite compose file")
        }

        // Get basePath for config volume mapping
        let basePath = try await storage.getBasePath(app: app)

        // Generate docker-compose.yml
        let composeContent = generateComposeFile(
            serviceName: serviceName,
            image: dockerImage,
            port: port,
            containerPort: component.defaultPort,
            mediaPath: mediaPath,
            downloadsPath: downloadsPath,
            componentId: component.id,
            basePath: basePath,
            containerConfigPath: component.containerConfigPath ?? "/config"
        )

        // Write compose file via DockerStorageService (auto Git add + commit + push)
        try await storage.writeFile(app: app, serviceName: serviceName, fileName: "docker-compose.yml", content: composeContent)

        // Pull image
        updateProgress(solutionId: solutionId, componentId: component.id, status: "pulling",
                       message: "Pulling \(dockerImage)...")
        _ = try await storage.runComposeCommand(app: app, serviceName: serviceName, args: ["pull"], track: false)

        // Start container
        updateProgress(solutionId: solutionId, componentId: component.id, status: "starting",
                       message: "Starting \(component.name)...")
        _ = try await storage.runComposeCommand(app: app, serviceName: serviceName, args: ["up", "-d"], track: false)
    }

    private func generateComposeFile(
        serviceName: String,
        image: String,
        port: Int,
        containerPort: Int,
        mediaPath: String,
        downloadsPath: String,
        componentId: String,
        basePath: String,
        containerConfigPath: String = "/config"
    ) -> String {
        let configPath = (basePath as NSString).appendingPathComponent("\(serviceName)/config")

        return """
        services:
          \(componentId):
            image: \(image)
            container_name: \(serviceName)
            ports:
              - "\(port):\(containerPort)"
            volumes:
              - \(configPath):\(containerConfigPath)
              - \(mediaPath):/media
              - \(downloadsPath):/downloads
            environment:
              - PUID=1000
              - PGID=1000
              - TZ=Asia/Shanghai
            restart: unless-stopped
        """
    }

    // MARK: - Progress Helpers

    private func updateProgress(
        solutionId: String,
        componentId: String? = nil,
        status: String? = nil,
        overallPercent: Int? = nil,
        currentStep: String? = nil,
        message: String? = nil
    ) {
        guard var progress = Self.getProgress(solutionId) else { return }

        if let overallPercent = overallPercent {
            progress = DeploymentProgressDTO(
                solutionId: progress.solutionId,
                overallPercent: overallPercent,
                currentStep: currentStep ?? progress.currentStep,
                components: progress.components
            )
        }

        if let currentStep = currentStep, overallPercent == nil {
            progress = DeploymentProgressDTO(
                solutionId: progress.solutionId,
                overallPercent: progress.overallPercent,
                currentStep: currentStep,
                components: progress.components
            )
        }

        if let componentId = componentId, let status = status {
            var updatedComponents = progress.components
            if let idx = updatedComponents.firstIndex(where: { $0.componentId == componentId }) {
                updatedComponents[idx] = ComponentProgressDTO(
                    componentId: componentId,
                    status: status,
                    progress: nil,
                    message: message
                )
            }
            progress = DeploymentProgressDTO(
                solutionId: progress.solutionId,
                overallPercent: progress.overallPercent,
                currentStep: progress.currentStep,
                components: updatedComponents
            )
        }

        Self.setProgress(solutionId, progress)
    }

    private func updateDeploymentStatus(app: Application, deployment: SolutionDeployment, status: String) async throws {
        deployment.status = status
        try await deployment.save(on: app.db)
    }

    private func makeDeploymentDTO(from deployment: SolutionDeployment) throws -> SolutionDeploymentDTO {
        let components: [DeployedComponentDTO]
        if let data = deployment.componentsJSON.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            components = parsed.map { dict in
                DeployedComponentDTO(
                    componentId: dict["componentId"] as? String ?? "",
                    name: dict["name"] as? String ?? "",
                    type: dict["type"] as? String ?? "docker",
                    status: dict["status"] as? String ?? "unknown",
                    port: dict["port"] as? Int ?? 0,
                    webUIUrl: dict["webUIUrl"] as? String,
                    error: dict["error"] as? String
                )
            }
        } else {
            components = []
        }

        let formatter = ISO8601DateFormatter()
        return SolutionDeploymentDTO(
            id: deployment.id?.uuidString ?? "",
            solutionId: deployment.solutionId,
            status: deployment.status,
            components: components,
            mediaPath: deployment.mediaPath,
            downloadsPath: deployment.downloadsPath,
            createdAt: deployment.createdAt.map { formatter.string(from: $0) } ?? "",
            updatedAt: deployment.updatedAt.map { formatter.string(from: $0) } ?? ""
        )
    }
}

// MARK: - ServiceManager Extension

extension ServiceManager {
    nonisolated public func getDockerStorage() -> DockerStorageService? {
        return getService(id: "docker-storage") as? DockerStorageService
    }

    nonisolated public func getSolutionService() -> SolutionService? {
        return getService(id: "solution-center") as? SolutionService
    }
}
