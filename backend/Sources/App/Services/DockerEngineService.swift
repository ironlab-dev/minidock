import Vapor

public enum DockerEngineType: String, Content {
    case orbstack
    case colima
    case docker_desktop = "docker-desktop"
    case generic
}

public struct DockerEngineService: MiniDockService, @unchecked Sendable {
    public let id: String = "docker-engine"
    public var name: String { "Docker Engine" }
    public let type: ServiceType = .docker
    
    private let statusCache = StateCache<ServiceStatus>(ttl: 2.0)
    private let containerCache = StateCache<[DockerContainer]>(ttl: 3.0)
    
    private func detectEngine() async -> DockerEngineType {
        if await checkOrbStack() { return .orbstack }
        if await checkColima() { return .colima }
        if checkDockerDesktop() { return .docker_desktop }
        return .generic
    }
    
    public init() {}
    
    public func getInfo(app: Application) async throws -> ServiceInfo {
        let status = try await getStatus()
        var stats: [String: String] = [:]
        
        do {
            let containers = try await listContainers()
            stats["containers_total"] = "\(containers.count)"
            stats["containers_running"] = "\(containers.filter { $0.State == "running" }.count)"
            stats["engine_type"] = await detectEngine().rawValue
        } catch {
            // Log error but don't crash - use default stats
            app.logger.warning("[DockerEngine] Failed to get container stats in getInfo: \(error.localizedDescription)")
            stats["containers_total"] = "0"
            stats["containers_running"] = "0"
            stats["engine_type"] = await detectEngine().rawValue
        }
        
        return ServiceInfo(
            id: id,
            name: name,
            type: type,
            status: status,
            description: "Manage and monitor Docker containers and health.",
            stats: stats
        )
    }
    
    public func getStatus() async throws -> ServiceStatus {
        guard await checkPrerequisites() else {
            return .not_installed
        }
        
        if let cached = statusCache.get() {
            return cached
        }
        
        do {
            let _ = try await runCommand(args: ["info", "--format", "{{.ServerVersion}}"])
            statusCache.set(.running)
            return .running
        } catch {
            statusCache.set(.stopped)
            return .stopped
        }
    }
    
    public func start(app: Application) async throws {
        // Check if Docker is already available before starting the application
        let currentStatus = try await getStatus()
        if currentStatus == .running {
            app.logger.info("[DockerEngine] Docker is already available, skipping application start")
            return
        }
        
        let command: String
        switch await detectEngine() {
        case .orbstack:
            command = "open -a OrbStack"
        case .colima:
            command = "colima start"
        case .docker_desktop:
            command = "open -a 'Docker Desktop'"
        case .generic:
            return // Generic docker often managed by systemd/launchd or already running
        }
        try await Shell.run(command, app: app, track: true)
        invalidateCaches()
    }
    
    public func stop(app: Application) async throws {
        let command: String
        switch await detectEngine() {
        case .orbstack:
            command = "pkill OrbStack"
        case .colima:
            command = "colima stop"
        case .docker_desktop:
            command = "pkill Docker"
        case .generic:
            return
        }
        try await Shell.run(command, app: app, track: true)
        invalidateCaches()
    }
    
    public func restart(app: Application) async throws {
        if await detectEngine() == .colima {
            try await Shell.run("colima restart", app: app, track: true)
        } else {
            try await stop(app: app)
            try await Task.sleep(nanoseconds: 1_000_000_000)
            try await start(app: app)
        }
        invalidateCaches()
    }
    
    public func getItems(app: Application) async throws -> [ServiceItem] {
        let startTime = Date().timeIntervalSince1970 * 1000
        app.logger.info("[DockerEngine] getItems started")
        
        // 1. 获取所有已配置的服务（从 DockerStorageService）
        let storage = DockerStorageService()
        let configuredServices = try await storage.listServices(app: app)
        app.logger.info("[DockerEngine] listServices returned \(configuredServices.count) configured services")
        
        // 2. 获取所有实际容器
        let containers = try await listContainers()
        app.logger.info("[DockerEngine] listContainers returned \(containers.count) containers")
        
        // 3. 创建容器映射（按服务名称和项目名称）
        // 注意：这里只解析 project 名称用于快速映射，workingDir 会在后续精确匹配阶段重新解析
        var containerMap: [String: DockerContainer] = [:]
        var containerByProjectMap: [String: DockerContainer] = [:]
        let basePath = try await storage.getBasePath(app: app)
        
        for container in containers {
            var project: String? = nil
            let labels = container.Labels.components(separatedBy: ",")
            for label in labels {
                if label.hasPrefix("com.docker.compose.project=") {
                    project = label.replacingOccurrences(of: "com.docker.compose.project=", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
                }
            }
            
            // 按容器名称映射
            containerMap[container.Names] = container
            
            // 按项目名称映射（用于匹配已配置的服务）
            // 这是快速映射阶段，只需要项目名称即可，精确匹配会在后续阶段通过 workingDir 验证
            if let project = project {
                let normalizedProject = project.lowercased().replacingOccurrences(of: "_", with: "-")
                containerByProjectMap[normalizedProject] = container
                
                // 也尝试匹配原始项目名称
                containerByProjectMap[project] = container
            }
        }
        
        // 4. 获取运行中容器的统计信息
        let runningIds = containers.filter { $0.State == "running" }.map { $0.ID }
        var statsDict: [String: ContainerStats] = [:]
        
        if !runningIds.isEmpty {
            do {
                let statsOutput = try await runCommand(args: ["stats", "--no-stream", "--format", "json"] + runningIds)
                let lines = statsOutput.components(separatedBy: .newlines).filter { !$0.isEmpty }
                let decoder = JSONDecoder()
                for line in lines {
                    if let data = line.data(using: .utf8),
                       let stat = try? decoder.decode(ContainerStats.self, from: data) {
                        statsDict[stat.ID] = stat
                    }
                }
            } catch {
                // Fallback
            }
        }

        // 5. 批量获取所有容器的详细信息（端口、工作目录、Entrypoint、Cmd）
        // 性能优化：使用 1 次 docker inspect 调用替代 N 次单独调用
        let containerIds = containers.map { $0.ID }
        let batchDetails = await batchGetContainerDetails(containerIds: containerIds, app: app)
        
        var portsDict: [String: String] = [:]
        var detailsDict: [String: ContainerDetails] = [:]
        
        for container in containers {
            if let details = batchDetails[container.ID] {
                detailsDict[container.ID] = details
                if !details.ports.isEmpty {
                    portsDict[container.ID] = details.ports
                } else if !container.Ports.isEmpty {
                    portsDict[container.ID] = container.Ports
                }
            } else {
                // Fallback: 如果批量查询中没有这个容器的信息，使用 docker ps 的基础信息
                let fallbackDetails = ContainerDetails(ports: container.Ports, workingDir: nil, hostWorkingDir: nil, entrypoint: nil, cmd: nil, healthStatus: nil, traefikHost: nil)
                detailsDict[container.ID] = fallbackDetails
                if !container.Ports.isEmpty {
                    portsDict[container.ID] = container.Ports
                }
            }
        }
        
        // 6. 合并已配置服务和容器信息
        var resultItems: [ServiceItem] = []
        
        for service in configuredServices {
            let normalizedServiceName = service.name.lowercased().replacingOccurrences(of: "_", with: "-")
            
            // 查找对应的容器
            var matchedContainer: DockerContainer? = nil
            if let container = containerByProjectMap[service.name] ?? containerByProjectMap[normalizedServiceName] {
                // 验证工作目录是否匹配
                var containerProject: String? = nil
                var containerWorkingDir: String? = nil
                let labels = container.Labels.components(separatedBy: ",")
                for label in labels {
                    if label.hasPrefix("com.docker.compose.project=") {
                        containerProject = label.replacingOccurrences(of: "com.docker.compose.project=", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
                    } else if label.hasPrefix("com.docker.compose.project.working_dir=") {
                        containerWorkingDir = label.replacingOccurrences(of: "com.docker.compose.project.working_dir=", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
                    }
                }
                
                if let workingDir = containerWorkingDir, let _ = containerProject {
                    let expectedPath = (basePath as NSString).appendingPathComponent(service.name)
                    let normalizedWorkingDir = workingDir.hasSuffix("/") ? String(workingDir.dropLast()) : workingDir
                    let normalizedExpectedPath = expectedPath.hasSuffix("/") ? String(expectedPath.dropLast()) : expectedPath
                    
                    if normalizedWorkingDir == normalizedExpectedPath {
                        matchedContainer = container
                    }
                }
            }
            
            // 如果有匹配的容器，使用容器信息
            if let container = matchedContainer {
                let details = detailsDict[container.ID]
                var metadata: [String: String] = [
                    "image": container.Image,
                    "status": container.Status,
                    "ports": portsDict[container.ID] ?? container.Ports,
                    "is_managed": service.isManaged ? "true" : "false",
                    "project": service.name,
                    "service_name": service.name
                ]
                
                // 添加容器执行信息
                // 优先使用宿主机路径，如果没有则使用容器内路径
                if let hostWorkingDir = details?.hostWorkingDir {
                    metadata["working_dir"] = hostWorkingDir
                    metadata["container_working_dir"] = details?.workingDir
                } else if let workingDir = details?.workingDir {
                    metadata["working_dir"] = workingDir
                }
                if let entrypoint = details?.entrypoint {
                    metadata["entrypoint"] = entrypoint
                }
                if let cmd = details?.cmd {
                    metadata["cmd"] = cmd
                }
                
                // 添加健康状态和 Traefik 域名
                if let healthStatus = details?.healthStatus {
                    metadata["health_status"] = healthStatus
                }
                if let traefikHost = details?.traefikHost {
                    metadata["traefik_host"] = traefikHost
                }
                
                if service.isManaged {
                    let expectedImage = storage.getExpectedImage(basePath: basePath, serviceName: service.name)
                    let expectedPorts = storage.getExpectedPorts(basePath: basePath, serviceName: service.name)
                    
                    // Image Mismatch Check
                    var isImageMismatch = false
                    if let actual = container.Image as String?, let expected = expectedImage {
                        let normActual = actual.hasSuffix(":latest") ? String(actual.dropLast(7)) : actual
                        let normExpected = expected.hasSuffix(":latest") ? String(expected.dropLast(7)) : expected
                        isImageMismatch = normActual != normExpected
                    }
                    
                    // Port Mismatch Check
                    var isPortMismatch = false
                    let actualPorts = portsDict[container.ID] ?? container.Ports
                    if let expected = expectedPorts {
                        let expectedPortList = expected.components(separatedBy: ",")
                            .map { $0.trimmingCharacters(in: .whitespaces) }
                            .compactMap { portStr -> String? in
                                let parts = portStr.components(separatedBy: ":")
                                return parts.first?.trimmingCharacters(in: .whitespaces)
                            }
                        
                        let actualPortList = actualPorts.components(separatedBy: ",")
                            .map { $0.trimmingCharacters(in: .whitespaces) }
                            .compactMap { portStr -> String? in
                                if portStr.contains("->") {
                                    let beforeArrow = portStr.components(separatedBy: "->").first ?? ""
                                    if let colonIndex = beforeArrow.lastIndex(of: ":") {
                                        let portPart = String(beforeArrow[beforeArrow.index(after: colonIndex)...])
                                        return portPart.trimmingCharacters(in: .whitespaces)
                                    }
                                    return beforeArrow.trimmingCharacters(in: .whitespaces)
                                } else if portStr.contains(":") {
                                    let parts = portStr.components(separatedBy: ":")
                                    return parts.last?.trimmingCharacters(in: .whitespaces)
                                }
                                return portStr.trimmingCharacters(in: .whitespaces)
                            }
                        
                        let actualPortSet = Set(actualPortList)
                        let missingPorts = expectedPortList.filter { !actualPortSet.contains($0) }
                        isPortMismatch = !missingPorts.isEmpty
                    }
                    
                    // 只在容器运行时才标记为 config_changed
                    let isRunning = container.State.lowercased() == "running"
                    if isRunning && (isImageMismatch || isPortMismatch) {
                        metadata["config_changed"] = "true"
                        var differences: [String] = []
                        if isImageMismatch { differences.append("Image mismatch") }
                        if isPortMismatch { differences.append("Port mismatch") }
                        metadata["config_differences"] = differences.joined(separator: ", ")
                    }
                }
                
                if let stats = statsDict[container.ID] {
                    metadata["cpu_perc"] = stats.CPUPerc
                    metadata["mem_usage"] = stats.MemUsage
                    metadata["mem_perc"] = stats.MemPerc
                    metadata["net_io"] = stats.NetIO
                    metadata["block_io"] = stats.BlockIO
                }
                
                resultItems.append(ServiceItem(
                    id: container.ID,
                    name: container.Names,
                    status: container.State,
                    metadata: metadata
                ))
            } else {
                // 没有匹配的容器（workingDir 不匹配），检查是否有同名容器在运行
                // 即使 workingDir 不匹配，如果容器存在且运行中，应该显示实际状态
                var foundRunningContainer: DockerContainer? = nil
                // 首先尝试通过项目名称查找
                if let container = containerByProjectMap[service.name] ?? containerByProjectMap[normalizedServiceName] {
                    // 容器存在但 workingDir 不匹配，说明是外部管理的容器
                    foundRunningContainer = container
                } else {
                    // 如果通过项目名称找不到，尝试通过容器名称查找
                    // 容器名称可能是服务名称，也可能是服务名称的变体
                    let possibleNames = [
                        service.name,
                        normalizedServiceName,
                        "/\(service.name)",
                        "/\(normalizedServiceName)"
                    ]
                    for name in possibleNames {
                        if let container = containerMap[name] {
                            foundRunningContainer = container
                            break
                        }
                    }
                }
                
                if let container = foundRunningContainer {
                    // 容器存在但 workingDir 不匹配，使用实际容器状态
                    let details = detailsDict[container.ID]
                    var metadata: [String: String] = [
                        "image": container.Image,
                        "status": container.Status,
                        "ports": portsDict[container.ID] ?? container.Ports,
                        "is_managed": "false",
                        "project": service.name,
                        "service_name": service.name
                    ]
                    
                    // 添加容器执行信息
                    // 优先使用宿主机路径，如果没有则使用容器内路径
                    if let hostWorkingDir = details?.hostWorkingDir {
                        metadata["working_dir"] = hostWorkingDir
                        metadata["container_working_dir"] = details?.workingDir
                    } else if let workingDir = details?.workingDir {
                        metadata["working_dir"] = workingDir
                    }
                    if let entrypoint = details?.entrypoint {
                        metadata["entrypoint"] = entrypoint
                    }
                    if let cmd = details?.cmd {
                        metadata["cmd"] = cmd
                    }
                    
                    // 添加健康状态和 Traefik 域名
                    if let healthStatus = details?.healthStatus {
                        metadata["health_status"] = healthStatus
                    }
                    if let traefikHost = details?.traefikHost {
                        metadata["traefik_host"] = traefikHost
                    }
                    
                    if let stats = statsDict[container.ID] {
                        metadata["cpu_perc"] = stats.CPUPerc
                        metadata["mem_usage"] = stats.MemUsage
                        metadata["mem_perc"] = stats.MemPerc
                        metadata["net_io"] = stats.NetIO
                        metadata["block_io"] = stats.BlockIO
                    }
                    
                    resultItems.append(ServiceItem(
                        id: container.ID,
                        name: container.Names,
                        status: container.State,
                        metadata: metadata
                    ))
                } else {
                    // 真正没有匹配的容器，说明服务已配置但未启动
                    let expectedImage = storage.getExpectedImage(basePath: basePath, serviceName: service.name)
                    let expectedPorts = storage.getExpectedPorts(basePath: basePath, serviceName: service.name)
                    
                    var metadata: [String: String] = [
                        "is_managed": service.isManaged ? "true" : "false",
                        "project": service.name,
                        "service_name": service.name
                    ]
                    
                    if let image = expectedImage {
                        metadata["image"] = image
                    }
                    
                    if let ports = expectedPorts {
                        metadata["ports"] = ports
                    }
                    
                    // 使用服务名称作为 ID（因为没有容器 ID）
                    resultItems.append(ServiceItem(
                        id: "service:\(service.name)",
                        name: service.name,
                        status: "not_started",
                        metadata: metadata
                    ))
                }
            }
        }
        
        // 7. 添加未管理的容器（不在已配置服务列表中的容器）
        for container in containers {
            var project: String? = nil
            var workingDir: String? = nil
            let labels = container.Labels.components(separatedBy: ",")
            for label in labels {
                if label.hasPrefix("com.docker.compose.project=") {
                    project = label.replacingOccurrences(of: "com.docker.compose.project=", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
                } else if label.hasPrefix("com.docker.compose.project.working_dir=") {
                    workingDir = label.replacingOccurrences(of: "com.docker.compose.project.working_dir=", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
                }
            }
            
            let isManaged: Bool
            if let workingDir = workingDir, let project = project {
                let expectedPath = (basePath as NSString).appendingPathComponent(project)
                let normalizedWorkingDir = workingDir.hasSuffix("/") ? String(workingDir.dropLast()) : workingDir
                let normalizedExpectedPath = expectedPath.hasSuffix("/") ? String(expectedPath.dropLast()) : expectedPath
                isManaged = normalizedWorkingDir == normalizedExpectedPath
            } else {
                isManaged = false
            }
            
            // 只添加未管理的容器
            if !isManaged {
                // 检查是否已经在结果中（通过容器名称）
                let alreadyIncluded = resultItems.contains { item in
                    item.id == container.ID || item.name == container.Names
                }
                
                if !alreadyIncluded {
                    let details = detailsDict[container.ID]
                    var metadata: [String: String] = [
                        "image": container.Image,
                        "status": container.Status,
                        "ports": portsDict[container.ID] ?? container.Ports,
                        "is_managed": "false",
                        "project": project ?? "",
                        "working_dir": workingDir ?? ""
                    ]
                    
                    // 添加容器执行信息（优先使用从 inspect 获取的信息）
                    // 优先使用宿主机路径，如果没有则使用容器内路径
                    if let hostWorkingDir = details?.hostWorkingDir {
                        metadata["working_dir"] = hostWorkingDir
                        metadata["container_working_dir"] = details?.workingDir
                    } else if let workingDir = details?.workingDir {
                        metadata["working_dir"] = workingDir
                    }
                    if let entrypoint = details?.entrypoint {
                        metadata["entrypoint"] = entrypoint
                    }
                    if let cmd = details?.cmd {
                        metadata["cmd"] = cmd
                    }
                    
                    // 添加健康状态和 Traefik 域名
                    if let healthStatus = details?.healthStatus {
                        metadata["health_status"] = healthStatus
                    }
                    if let traefikHost = details?.traefikHost {
                        metadata["traefik_host"] = traefikHost
                    }
                    
                    if let stats = statsDict[container.ID] {
                        metadata["cpu_perc"] = stats.CPUPerc
                        metadata["mem_usage"] = stats.MemUsage
                        metadata["mem_perc"] = stats.MemPerc
                        metadata["net_io"] = stats.NetIO
                        metadata["block_io"] = stats.BlockIO
                    }
                    
                    resultItems.append(ServiceItem(
                        id: container.ID,
                        name: container.Names,
                        status: container.State,
                        metadata: metadata
                    ))
                }
            }
        }
        
        let endTime = Date().timeIntervalSince1970 * 1000
        let duration = endTime - startTime
        app.logger.info("[DockerEngine] getItems completed in \(duration)ms, returning \(resultItems.count) items")
        
        return resultItems
    }
    
    private struct ContainerDetails {
        let ports: String
        let workingDir: String?
        let hostWorkingDir: String?  // 宿主机上的实际工作目录路径
        let entrypoint: String?
        let cmd: String?
        let healthStatus: String?    // healthy, unhealthy, starting, none
        let traefikHost: String?     // 从 Traefik labels 解析的域名
    }
    
    /// 批量获取多个容器的详细信息（性能优化：1 次 CLI 调用替代 N 次）
    private func batchGetContainerDetails(containerIds: [String], app: Application) async -> [String: ContainerDetails] {
        guard !containerIds.isEmpty else { return [:] }
        
        do {
            // 使用 docker inspect 批量查询（返回 JSON 数组）
            let output = try await runCommand(args: ["inspect"] + containerIds)
            
            guard !output.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  let data = output.data(using: .utf8) else {
                app.logger.warning("[DockerEngine] Batch inspect returned empty, falling back to individual queries")
                return await fallbackToIndividualQueries(containerIds: containerIds, app: app)
            }
            
            guard let jsonArray = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                app.logger.warning("[DockerEngine] Batch inspect JSON parse failed, falling back to individual queries")
                return await fallbackToIndividualQueries(containerIds: containerIds, app: app)
            }
            
            var results: [String: ContainerDetails] = [:]
            
            for jsonObject in jsonArray {
                guard let containerId = jsonObject["Id"] as? String else { continue }
                // 取前 12 位作为短 ID（与 docker ps 输出一致）
                let shortId = String(containerId.prefix(12))
                
                let details = parseContainerInspectJson(jsonObject)
                results[shortId] = details
                // 同时存储完整 ID，以防匹配时需要
                results[containerId] = details
            }
            
            app.logger.info("[DockerEngine] Batch inspect completed for \(containerIds.count) containers")
            return results
            
        } catch {
            app.logger.warning("[DockerEngine] Batch inspect failed: \(error.localizedDescription), falling back to individual queries")
            return await fallbackToIndividualQueries(containerIds: containerIds, app: app)
        }
    }
    
    /// 批量查询失败时的降级方案：逐个查询
    private func fallbackToIndividualQueries(containerIds: [String], app: Application) async -> [String: ContainerDetails] {
        var results: [String: ContainerDetails] = [:]
        
        await withTaskGroup(of: (String, ContainerDetails?).self) { group in
            for containerId in containerIds {
                group.addTask {
                    do {
                        let details = try await self.getContainerDetails(containerId: containerId)
                        return (containerId, details)
                    } catch {
                        return (containerId, nil)
                    }
                }
            }
            
            for await (id, details) in group {
                if let details = details {
                    results[id] = details
                }
            }
        }
        
        return results
    }
    
    /// 解析单个容器的 inspect JSON 数据
    private func parseContainerInspectJson(_ jsonObject: [String: Any]) -> ContainerDetails {
        // 解析端口信息
        var portStrings: [String] = []
        if let networkSettings = jsonObject["NetworkSettings"] as? [String: Any],
           let portsDict = networkSettings["Ports"] as? [String: Any], !portsDict.isEmpty {
            for (containerPort, bindingsValue) in portsDict {
                guard let bindings = bindingsValue as? [[String: String]],
                      !bindings.isEmpty else {
                    continue
                }
                
                var selectedBinding: [String: String]? = nil
                for binding in bindings {
                    if let hostIP = binding["HostIp"], hostIP == "0.0.0.0" || hostIP == "::" || hostIP.isEmpty {
                        selectedBinding = binding
                        if hostIP == "0.0.0.0" || hostIP.isEmpty {
                            break
                        }
                    } else if selectedBinding == nil {
                        selectedBinding = binding
                    }
                }
                
                guard let binding = selectedBinding,
                      let hostPort = binding["HostPort"],
                      !hostPort.isEmpty else {
                    continue
                }
                
                let hostIP = binding["HostIp"] ?? ""
                let hostPart = hostIP.isEmpty || hostIP == "::" || hostIP == "0.0.0.0" ? "0.0.0.0" : hostIP
                let portString = "\(hostPart):\(hostPort)->\(containerPort)"
                portStrings.append(portString)
            }
        }
        
        // 解析工作目录
        var workingDir: String? = nil
        if let config = jsonObject["Config"] as? [String: Any],
           let wd = config["WorkingDir"] as? String, !wd.isEmpty {
            workingDir = wd
        }
        
        // 解析挂载信息
        var hostWorkingDir: String? = nil
        if let mounts = jsonObject["Mounts"] as? [[String: Any]] {
            if let wd = workingDir {
                for mount in mounts {
                    if let destination = mount["Destination"] as? String,
                       let source = mount["Source"] as? String,
                       let mountType = mount["Type"] as? String,
                       mountType == "bind" || mountType == "volume" {
                        if destination == wd || wd.hasPrefix(destination + "/") {
                            hostWorkingDir = source
                            break
                        }
                    }
                }
            }
            
            if hostWorkingDir == nil {
                let commonDataPaths = ["/data", "/app", "/var/www", "/usr/src/app", "/opt"]
                for mount in mounts {
                    if let destination = mount["Destination"] as? String,
                       let source = mount["Source"] as? String,
                       let mountType = mount["Type"] as? String,
                       mountType == "bind" || mountType == "volume",
                       let rw = mount["RW"] as? Bool,
                       rw == true {
                        if commonDataPaths.contains(destination) {
                            hostWorkingDir = source
                            break
                        }
                    }
                }
            }
            
            if hostWorkingDir == nil {
                for mount in mounts {
                    if let source = mount["Source"] as? String,
                       let mountType = mount["Type"] as? String,
                       mountType == "bind",
                       let rw = mount["RW"] as? Bool,
                       rw == true {
                        if !source.hasPrefix("/etc/") && !source.hasPrefix("/sys/") && !source.hasPrefix("/proc/") {
                            hostWorkingDir = source
                            break
                        }
                    }
                }
            }
        }
        
        // 解析 Entrypoint 和 Cmd
        var entrypoint: String? = nil
        var cmd: String? = nil
        if let config = jsonObject["Config"] as? [String: Any] {
            if let ep = config["Entrypoint"] as? [String], !ep.isEmpty {
                entrypoint = ep.joined(separator: " ")
            } else if let ep = config["Entrypoint"] as? String, !ep.isEmpty {
                entrypoint = ep
            }
            
            if let c = config["Cmd"] as? [String], !c.isEmpty {
                cmd = c.joined(separator: " ")
            } else if let c = config["Cmd"] as? String, !c.isEmpty {
                cmd = c
            }
        }
        
        // 解析健康检查状态
        var healthStatus: String? = nil
        if let state = jsonObject["State"] as? [String: Any] {
            if let health = state["Health"] as? [String: Any],
               let status = health["Status"] as? String {
                healthStatus = status
            }
        }
        
        // 解析 Traefik 域名
        var traefikHost: String? = nil
        if let config = jsonObject["Config"] as? [String: Any],
           let labels = config["Labels"] as? [String: String] {
            // 查找 traefik.http.routers.*.rule 格式的 label
            for (key, value) in labels {
                if key.hasPrefix("traefik.http.routers.") && key.hasSuffix(".rule") {
                    // 解析 Host(`xxx.example.com`) 或 Host(`xxx.example.com`, `yyy.example.com`)
                    if let hostMatch = extractTraefikHost(from: value) {
                        traefikHost = hostMatch
                        break
                    }
                }
            }
        }
        
        return ContainerDetails(
            ports: portStrings.joined(separator: ", "),
            workingDir: workingDir,
            hostWorkingDir: hostWorkingDir,
            entrypoint: entrypoint,
            cmd: cmd,
            healthStatus: healthStatus,
            traefikHost: traefikHost
        )
    }
    
    /// 从 Traefik rule 中提取 Host 域名
    private func extractTraefikHost(from rule: String) -> String? {
        // 支持的格式:
        // Host(`example.com`)
        // Host(`example.com`, `example2.com`)
        // Host(`example.com`) && PathPrefix(`/api`)
        let pattern = "Host\\(`([^`]+)`\\)"
        guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else {
            return nil
        }
        
        let range = NSRange(rule.startIndex..<rule.endIndex, in: rule)
        if let match = regex.firstMatch(in: rule, options: [], range: range) {
            if let hostRange = Range(match.range(at: 1), in: rule) {
                return String(rule[hostRange])
            }
        }
        return nil
    }
    
    private func getContainerDetails(containerId: String) async throws -> ContainerDetails {
        do {
            // 使用完整的 inspect 输出以获取所有信息（包括健康状态和 labels）
            let output = try await runCommand(args: ["inspect", containerId])
            
            // Handle empty output
            guard !output.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  let data = output.data(using: .utf8) else {
                return ContainerDetails(ports: "", workingDir: nil, hostWorkingDir: nil, entrypoint: nil, cmd: nil, healthStatus: nil, traefikHost: nil)
            }
            
            // docker inspect 返回一个数组
            guard let jsonArray = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
                  let jsonObject = jsonArray.first else {
                return ContainerDetails(ports: "", workingDir: nil, hostWorkingDir: nil, entrypoint: nil, cmd: nil, healthStatus: nil, traefikHost: nil)
            }
            
            // 复用 parseContainerInspectJson 来解析
            return parseContainerInspectJson(jsonObject)
        } catch {
            // If inspect fails, return empty details
            return ContainerDetails(ports: "", workingDir: nil, hostWorkingDir: nil, entrypoint: nil, cmd: nil, healthStatus: nil, traefikHost: nil)
        }
    }
    
    private func getContainerPorts(containerId: String) async throws -> String {
        let details = try await getContainerDetails(containerId: containerId)
        return details.ports
    }
    
    public func performItemAction(app: Application, itemId: String, action: String) async throws {
        // 如果 itemId 以 "service:" 开头，需要查找实际的容器 ID
        var actualItemId = itemId
        if itemId.hasPrefix("service:") {
            let serviceName = String(itemId.dropFirst(8)) // 移除 "service:" 前缀
            // 查找匹配的容器（通过名称或项目名称）
            let containers = try await listContainers()
            // 先尝试通过容器名称匹配
            if let container = containers.first(where: { $0.Names == serviceName || $0.Names == "/\(serviceName)" }) {
                actualItemId = container.ID
            } else {
                // 如果找不到容器，对于删除操作应该抛出错误
                if action == "delete" || action == "remove" {
                    throw Abort(.notFound, reason: "Container not found for service: \(serviceName)")
                }
            }
        }
        
        switch action {
        case "start":
            _ = try await runCommand(args: ["start", actualItemId], app: app, track: true)
        case "stop":
            _ = try await runCommand(args: ["stop", actualItemId], app: app, track: true)
        case "restart":
            _ = try await runCommand(args: ["restart", actualItemId], app: app, track: true)
        case "delete", "remove":
            // 先尝试停止容器（如果正在运行）
            do {
                _ = try await runCommand(args: ["stop", actualItemId], app: app, track: true)
            } catch {
                // 忽略停止失败，继续删除（容器可能已经停止）
            }
            // 强制删除容器
            _ = try await runCommand(args: ["rm", "-f", actualItemId], app: app, track: true)
        default:
            throw Abort(.badRequest, reason: "Unsupported docker action: \(action)")
        }
        
        invalidateCaches()
    }
    
    public func getItemDetails(app: Application, itemId: String) async throws -> [String: String] {
        let output = try await runCommand(args: ["inspect", itemId])
        return ["raw": output]
    }
    
    private func invalidateCaches() {
        statusCache.invalidate()
        containerCache.invalidate()
    }
    
    public func listContainers() async throws -> [DockerContainer] {
        if let cached = containerCache.get() {
            return cached
        }
        
        let output = try await runCommand(args: ["ps", "-a", "--format", "json"])
        let lines = output.components(separatedBy: .newlines).filter { !$0.isEmpty }
        
        let decoder = JSONDecoder()
        let containers = lines.compactMap { line -> DockerContainer? in
            guard let data = line.data(using: .utf8) else { return nil }
            return try? decoder.decode(DockerContainer.self, from: data)
        }
        
        containerCache.set(containers)
        return containers
    }
    
    private func resolveDockerPath() async -> String {
        let possiblePaths = [
            "/usr/local/bin/docker",
            "/opt/homebrew/bin/docker",
            "\(FileManager.default.homeDirectoryForCurrentUser.path)/.orbstack/bin/docker",
            "/usr/bin/docker"
        ]
        for path in possiblePaths {
            if FileManager.default.fileExists(atPath: path) {
                return path
            }
        }
        // Fallback to searching in PATH using which
        if let result = try? await Shell.run("which docker"), !result.output.isEmpty {
            return result.output
        }
        return "docker"
    }

    private func runCommand(args: [String], app: Application? = nil, track: Bool = false) async throws -> String {
        let shellArgs = args.map { arg -> String in
            if arg.contains(" ") || arg.contains("{") || arg.contains("}") || arg.contains("'") {
                return "'\(arg.replacingOccurrences(of: "'", with: "'\\''"  ))'"
            }
            return arg
        }
        let command = "docker \(shellArgs.joined(separator: " "))"
        let result = try await Shell.run(command, app: app, track: track)
        guard result.exitCode == 0 else {
            let error = result.output.isEmpty ? "Unknown error" : result.output
            throw Abort(.internalServerError, reason: "Docker CLI failed: \(error)")
        }
        return result.output
    }

    
    public func checkPrerequisites() async -> Bool {
        do {
            let result = try await Shell.run("which docker")
            if result.output.contains("/") {
                return FileManager.default.fileExists(atPath: result.output)
            }
            return result.exitCode == 0
        } catch {
            return false
        }
    }
    
    private func checkOrbStack() async -> Bool {
        let orbPath = "\(FileManager.default.homeDirectoryForCurrentUser.path)/.orbstack"
        if FileManager.default.fileExists(atPath: orbPath) { return true }
        return (try? await Shell.run("which orbstack")).map { $0.exitCode == 0 } ?? false
    }
    
    private func checkColima() async -> Bool {
        return (try? await Shell.run("which colima")).map { $0.exitCode == 0 } ?? false
    }
    
    private func checkDockerDesktop() -> Bool {
        return FileManager.default.fileExists(atPath: "/Applications/Docker.app")
    }
    
    public func getLogs(containerId: String, tail: Int = 100) async throws -> String {
        // docker logs --tail <tail> <containerId>
        // We use timestamps=false as we want raw logs, but sometimes -t is useful. For now keeps it simple.
        // We do NOT use --follow as this is a polling endpoint.
        let output = try await runCommand(args: ["logs", "--tail", "\(tail)", containerId])
        return output
    }
}

public struct DockerContainer: Content {
    public let ID: String
    public let Names: String
    public let Image: String
    public let State: String
    public let Status: String
    public let Ports: String
    public let Labels: String
}

public struct ContainerStats: Content {
    public let ID: String
    public let Name: String
    public let CPUPerc: String
    public let MemUsage: String
    public let MemPerc: String
    public let NetIO: String
    public let BlockIO: String
    public let PIDs: String
}
