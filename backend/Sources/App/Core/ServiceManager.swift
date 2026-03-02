import Vapor

public actor ServiceManager {
    private let logger: Logger
    private let services: [String: any MiniDockService]
    private var cachedInfos: [ServiceInfo] = []
    private var cachedItems: [String: [ServiceItem]] = [:]
    
    // 增量更新优化：使用哈希值快速检测变化
    private var cachedInfosHash: Int = 0
    private var cachedItemsHash: [String: Int] = [:]
    
    // 定期强制全量同步（防止状态不同步）
    private var lastFullSyncTime: Date = Date()
    private let fullSyncInterval: TimeInterval = 30.0  // 每 30 秒强制全量同步一次
    
    public init(logger: Logger) {
        self.logger = logger
        // Initialize services
        let system = SystemService(logger: logger)
        let dockerEngine = DockerEngineService()
        let utm = UTMService()
        let automation = AutomationService()
        let notification = NotificationService()
        let update = UpdateService()
        let dockerStorage = DockerStorageService()
        let vmStorage = VMStorageService()
        let nativeVM = NativeVMService()
        let envService = EnvironmentService()
        let automationStorage = AutomationStorageService()
        let instruction = InstructionService()
        let terminal = TerminalService(logger: logger)
        let ssh = SSHService()
        let tailscale = TailscaleService()
        let solution = SolutionService()

        self.services = [
            system.id: system,
            dockerEngine.id: dockerEngine,
            utm.id: utm,
            automation.id: automation,
            notification.id: notification,
            update.id: update,
            dockerStorage.id: dockerStorage,
            vmStorage.id: vmStorage,
            nativeVM.id: nativeVM,
            envService.id: envService,
            automationStorage.id: automationStorage,
            instruction.id: instruction,
            terminal.id: terminal,
            ssh.id: ssh,
            tailscale.id: tailscale,
            solution.id: solution
        ]
    }
    
    public func listServices(app: Application) async throws -> [ServiceInfo] {
        try await withThrowingTaskGroup(of: ServiceInfo?.self) { group in
            for service in services.values {
                group.addTask {
                    do {
                        return try await self.withTimeout(seconds: 3.0) {
                            try await service.getInfo(app: app)
                        }
                    } catch {
                        app.logger.warning("Failed to refresh service info for \(service.id): \(error)")
                        // Return a degraded service info so the list is not empty
                        return ServiceInfo(
                            id: service.id,
                            name: service.name,
                            type: service.type,
                            status: .unknown,
                            description: "Status unavailable (timeout)",
                            stats: nil
                        )
                    }
                }
            }
            
            var infos: [ServiceInfo] = []
            for try await info in group {
                if let info = info {
                    infos.append(info)
                }
            }
            return infos.sorted { $0.id < $1.id }
        }
    }
    
    nonisolated public func getService(id: String) -> (any MiniDockService)? {
        return services[id]
    }
    
    public func startMonitoring(app: Application) {
        Task {
            app.logger.info("🚀 Starting high-performance real-time monitoring...")
            
            // Start all services
            for service in services.values {
                app.logger.debug("Starting service: \(service.id)")
                do {
                    try await service.start(app: app)
                } catch {
                    app.logger.warning("Service \(service.id) failed to start: \(error)")
                }
            }
            
            // 轮询间隔配置
            let activeInterval: UInt64 = 2_000_000_000     // 2s - 有客户端连接时
            let idleInterval: UInt64 = 30_000_000_000      // 30s - 无客户端连接时（休眠模式）
            let minAutomationInterval = 4                   // 每 N 次休眠轮询执行一次自动化检查
            
            var tick = 0
            var idleTick = 0
            var wasIdle = false
            
            while !Task.isCancelled {
                tick += 1
                
                let hasClients = app.webSocketManager.hasActiveClients
                
                // 从休眠模式唤醒时，立即执行一次完整刷新
                if hasClients && wasIdle {
                    app.logger.info("📡 Client connected, switching to active monitoring mode")
                    wasIdle = false
                    idleTick = 0
                    
                    // 立即刷新并推送最新数据
                    if let system = services["system-core"] as? SystemService {
                        await system.broadcastMetrics(app: app)
                    }
                    await refreshAndBroadcast(app: app)
                }
                
                if hasClients {
                    // 活跃模式：高频轮询
                    
                    // 1. High frequency: System Metrics (every 2s)
                    if let system = services["system-core"] as? SystemService {
                        await system.broadcastMetrics(app: app)
                    }
                    
                    // 2. Medium frequency: Service Status & Items (every 4s)
                    if tick % 2 == 0 {
                        await refreshAndBroadcast(app: app)
                    }
                    
                    try? await Task.sleep(nanoseconds: activeInterval)
                    
                } else {
                    // 休眠模式：低频轮询
                    if !wasIdle {
                        app.logger.info("💤 No active clients, switching to idle monitoring mode")
                        wasIdle = true
                    }
                    
                    idleTick += 1
                    
                    // 即使无客户端，也需要定期执行自动化任务评估
                    if idleTick % minAutomationInterval == 0 {
                        // 仅执行自动化相关的刷新，跳过广播
                        if let system = services["system-core"] as? SystemService,
                           let automation = services["automation-engine"] as? AutomationService {
                            let cpu = (try? await system.getCPUUsage()) ?? 0.0
                            let mem = (try? await system.getMemoryUsage()) ?? 0.0
                            await automation.sync(app: app)
                            await automation.evaluateMetricRules(app: app, cpu: cpu, mem: mem)
                        }
                    }
                    
                    try? await Task.sleep(nanoseconds: idleInterval)
                }
            }
        }
    }
    
    private struct ServiceRefreshResult {
        let id: String
        let info: ServiceInfo
        let items: [ServiceItem]
    }
    
    /// 计算 ServiceItem 数组的哈希值（用于快速变化检测）
    private func computeItemsHash(_ items: [ServiceItem]) -> Int {
        var hasher = Hasher()
        for item in items {
            hasher.combine(item.id)
            hasher.combine(item.name)
            hasher.combine(item.status)
            // metadata 的哈希（简化版：只包含 key-value 数量和部分关键字段）
            if let metadata = item.metadata {
                hasher.combine(metadata.count)
                if let status = metadata["status"] {
                    hasher.combine(status)
                }
                if let ports = metadata["ports"] {
                    hasher.combine(ports)
                }
            }
        }
        return hasher.finalize()
    }
    
    /// 计算 ServiceInfo 数组的哈希值
    private func computeInfosHash(_ infos: [ServiceInfo]) -> Int {
        var hasher = Hasher()
        for info in infos {
            hasher.combine(info.id)
            hasher.combine(info.status.rawValue)
            // stats 的哈希（简化版）
            hasher.combine(info.stats?.count ?? 0)
        }
        return hasher.finalize()
    }
    
    private func withTimeout<T: Sendable>(seconds: Double, operation: @escaping @Sendable () async throws -> T) async throws -> T {
        try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask {
                try await operation()
            }
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                throw Abort(.gatewayTimeout, reason: "Service refresh timed out after \(seconds)s")
            }
            
            do {
                guard let result = try await group.next() else {
                    throw Abort(.internalServerError, reason: "Task group had no results")
                }
                group.cancelAll()
                return result
            } catch {
                group.cancelAll()
                throw error
            }
        }
    }
    
    private func refreshAndBroadcast(app: Application) async {
        let results = await withTaskGroup(of: ServiceRefreshResult?.self) { group in
            for (id, service) in services {
                group.addTask {
                    do {
                        // Apply a 5-second timeout to each service refresh to prevent hangs
                        return try await self.withTimeout(seconds: 5.0) {
                            let info = try await service.getInfo(app: app)
                            let items = try await service.getItems(app: app)
                            return ServiceRefreshResult(id: id, info: info, items: items)
                        }
                    } catch {
                        app.logger.warning("Failed to refresh service \(id) (likely timeout or hang): \(error)")
                        return nil
                    }
                }
            }
            
            var collected: [ServiceRefreshResult] = []
            for await result in group {
                if let result = result {
                    collected.append(result)
                }
            }
            return collected
        }
        
        let newInfos = results.map { $0.info }.sorted { $0.id < $1.id }
        
        // 检查是否需要强制全量同步
        let now = Date()
        let forceFullSync = now.timeIntervalSince(lastFullSyncTime) >= fullSyncInterval
        if forceFullSync {
            lastFullSyncTime = now
        }
        
        for result in results {
            let id = result.id
            let items = result.items
            
            // 使用哈希值快速检测变化
            let newHash = computeItemsHash(items)
            let oldHash = cachedItemsHash[id] ?? 0
            
            // 仅在哈希值变化或强制同步时才进行详细比较和推送
            if newHash != oldHash || forceFullSync {
                let oldItems = cachedItems[id] ?? []
                // 哈希值变化时进行详细比较确认
                if items != oldItems || forceFullSync {
                    cachedItems[id] = items
                    cachedItemsHash[id] = newHash
                    
                    if forceFullSync {
                        app.logger.debug("🔄 [Sync] Force sync items for \(id)")
                    } else {
                        app.logger.info("📢 [Push] Items updated for \(id)")
                    }
                    if let data = try? JSONEncoder().encode(items),
                       let json = String(data: data, encoding: .utf8) {
                        app.webSocketManager.broadcast(event: "items_update", data: "{\"serviceId\": \"\(id)\", \"items\": \(json)}")
                    }
                } else {
                    // 哈希碰撞但数据相同，只更新哈希缓存
                    cachedItemsHash[id] = newHash
                }
            }
        }
        
        // 服务状态更新
        let newInfosHash = computeInfosHash(newInfos)
        if newInfosHash != cachedInfosHash || forceFullSync {
            if newInfos != cachedInfos || forceFullSync {
                cachedInfos = newInfos
                cachedInfosHash = newInfosHash
                
                if forceFullSync {
                    app.logger.debug("🔄 [Sync] Force sync service status")
                } else {
                    app.logger.info("📢 [Push] Service status updated")
                }
                if let data = try? JSONEncoder().encode(newInfos),
                   let json = String(data: data, encoding: .utf8) {
                    app.webSocketManager.broadcast(event: "services_update", data: json)
                }
            } else {
                cachedInfosHash = newInfosHash
            }
        }
        
        // Automation evaluation
        if let system = services["system-core"] as? SystemService,
           let automation = services["automation-engine"] as? AutomationService {
            let cpu = (try? await system.getCPUUsage()) ?? 0.0
            let mem = (try? await system.getMemoryUsage()) ?? 0.0
            await automation.sync(app: app)
            await automation.evaluateMetricRules(app: app, cpu: cpu, mem: mem)
        }
    }
}

// Vapor Storage integration
extension Application {
    public var serviceManager: ServiceManager {
        get {
            if let manager = self.storage[ServiceManagerKey.self] {
                return manager
            }
            let manager = ServiceManager(logger: self.logger)
            self.storage[ServiceManagerKey.self] = manager
            return manager
        }
        set {
            self.storage[ServiceManagerKey.self] = newValue
        }
    }
    
    struct ServiceManagerKey: StorageKey {
        typealias Value = ServiceManager
    }

    public var instructionEngine: InstructionService {
        guard let service = self.serviceManager.getService(id: "instruction-engine") as? InstructionService else {
            fatalError("Instruction service not available - this should never happen as it's registered in init")
        }
        return service
    }
}
