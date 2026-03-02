import Vapor
import Foundation

// Instruction is now InstructionModel (database-backed)

public actor InstructionService: MiniDockService {
    public let id: String = "instruction-engine"
    public let name: String = "Instruction Engine"
    public let type: ServiceType = .system
    
    // Keep track of active instructions in memory for fast broadcast
    // Capped to prevent unbounded memory growth
    private var activeInstructions: [UUID: InstructionModel] = [:]
    private let maxActiveInstructions = 100

    // Registry for cancellable tasks (e.g. Process, URLSessionTask)
    private var cancellableTasks: [UUID: @Sendable () -> Void] = [:]

    private let maxItemHistory = 20
    
    // 批量写入配置
    private var pendingOutputUpdates: Set<UUID> = []  // 有待写入的指令 ID
    private var lastFlushTime: Date = Date()
    private let flushInterval: TimeInterval = 3.0     // 最大 flush 间隔（秒）
    private let flushThreshold: Int = 10_000          // 累积输出达到此大小时触发 flush
    
    public init() {}
    
    public func getStatus() async throws -> ServiceStatus {
        return .running
    }
    
    public func getInfo(app: Application) async throws -> ServiceInfo {
        let count = try? await InstructionModel.query(on: app.db).count()
        return ServiceInfo(
            id: id,
            name: name,
            type: type,
            status: .running,
            description: "Tracks and broadcasts system command executions.",
            stats: ["historyCount": "\(count ?? 0)"]
        )
    }
    
    public func getItems(app: Application) async throws -> [ServiceItem] {
        // Fetch from database
        let instructions = try await InstructionModel.query(on: app.db)
            .sort(\.$startTime, .descending)
            .range(0..<maxItemHistory)
            .all()
            
        return instructions.map { inst in
            ServiceItem(
                id: inst.id?.uuidString ?? "",
                name: inst.command,
                status: inst.status,
                metadata: [
                    "startTime": "\(inst.startTime)",
                    "duration": inst.endTime.map { "\($0.timeIntervalSince(inst.startTime))s" } ?? "running",
                    "fullCommand": inst.fullCommand ?? ""
                ]
            )
        }
    }
    
    public func start(app: Application) async throws {}
    
    public func stop(app: Application) async throws {
        // 服务关闭时强制 flush 所有待写入的输出
        await forceFlush(app: app)
    }
    
    public func restart(app: Application) async throws {
        try await stop(app: app)
        try await start(app: app)
    }
    
    public func performAction(app: Application) async throws {}
    
    public func performItemAction(app: Application, itemId: String, action: String) async throws {
        if action == "cancel" {
            guard let uuid = UUID(uuidString: itemId) else { return }
            await cancelInstruction(id: uuid)
        }
    }
    
    public func cancelInstruction(id: UUID) async {
        if let cancelAction = cancellableTasks[id] {
            cancelAction()
            cancellableTasks.removeValue(forKey: id)
        }
    }
    
    public func registerCancellable(id: UUID, action: @escaping @Sendable () -> Void) {
        cancellableTasks[id] = action
    }
    
    public func unregisterCancellable(id: UUID) {
        cancellableTasks.removeValue(forKey: id)
    }
    public func getItemDetails(app: Application, itemId: String) async throws -> [String: String] {
        guard let uuid = UUID(uuidString: itemId),
              let inst = try await InstructionModel.find(uuid, on: app.db) else {
            return [:]
        }
        return [
            "command": inst.command,
            "fullCommand": inst.fullCommand ?? "N/A",
            "status": inst.status,
            "output": inst.output,
            "exitCode": inst.exitCode.map { "\($0)" } ?? "N/A",
            "startTime": "\(inst.startTime)",
            "endTime": inst.endTime.map { "\($0)" } ?? "N/A"
        ]
    }
    

    
    public func emitStarted(app: Application, command: String, fullCommand: String? = nil) async -> UUID {
        let inst = InstructionModel(command: command, fullCommand: fullCommand)
        inst.id = UUID() // Pre-assign ID so it is available even if DB persistence fails
        do {
            try await inst.save(on: app.db)
        } catch {
            app.logger.error("[InstructionService] Failed to persist instruction to DB: \(error)")
        }
        let id = inst.id! // Safe: ID was pre-assigned above
        activeInstructions[id] = inst

        // Evict oldest completed entries if we exceed the cap
        if activeInstructions.count > maxActiveInstructions {
            let staleIds = activeInstructions
                .filter { $0.value.status == "success" || $0.value.status == "failure" || $0.value.status == "cancelled" }
                .map { $0.key }
            for staleId in staleIds {
                activeInstructions.removeValue(forKey: staleId)
                cancellableTasks.removeValue(forKey: staleId)
            }
        }

        broadcast(ws: app.webSocketManager, event: "instruction_started", instruction: inst)
        return id
    }
    
    public func emitFinished(app: Application, id: UUID, output: String, exitCode: Int32) async {
        // 先移除待写入标记（避免重复写入）
        pendingOutputUpdates.remove(id)
        
        let inst: InstructionModel?
        if let active = activeInstructions[id] {
            inst = active
        } else {
            inst = try? await InstructionModel.find(id, on: app.db)
        }
        
        guard let instruction = inst else { return }
        
        let maxOutputSize = 50000
        let finalOutput = output.count > maxOutputSize ? String(output.prefix(maxOutputSize)) + "\n... (truncated for performance)" : output
        
        instruction.status = exitCode == 0 ? "success" : (exitCode == -1 ? "cancelled" : "failure")
        instruction.endTime = Date()
        instruction.output = finalOutput
        instruction.exitCode = exitCode
        
        // 指令完成时立即写入数据库（确保数据持久化）
        try? await instruction.save(on: app.db)
        activeInstructions.removeValue(forKey: id)
        cancellableTasks.removeValue(forKey: id)
        
        broadcast(ws: app.webSocketManager, event: "instruction_finished", instruction: instruction)
    }
    
    public func emitProgress(app: Application, id: UUID, percent: Int) async {
        guard let inst = activeInstructions[id] else { return }
        
        inst.progress = percent
        try? await inst.save(on: app.db)
        
        broadcast(ws: app.webSocketManager, event: "instruction_progress", instruction: inst)
    }
    
    public func emitOutput(app: Application, id: UUID, output: String) async {
        guard let inst = activeInstructions[id] else { return }
        
        // Append output to the buffer
        inst.output += output
        
        // Limit buffer size
        let maxOutputSize = 50000
        if inst.output.count > maxOutputSize {
            inst.output = String(inst.output.suffix(maxOutputSize))
        }
        
        // 标记为待写入
        pendingOutputUpdates.insert(id)
        
        // WebSocket 实时推送（不受批量写入影响）
        broadcast(ws: app.webSocketManager, event: "instruction_output", instruction: inst)
        
        // 检查是否需要 flush 到数据库
        await flushIfNeeded(app: app)
    }
    
    /// 检查是否需要将缓冲写入数据库
    private func flushIfNeeded(app: Application) async {
        let now = Date()
        let timeSinceLastFlush = now.timeIntervalSince(lastFlushTime)
        
        // 计算累积的待写入输出大小
        var totalPendingSize = 0
        for id in pendingOutputUpdates {
            if let inst = activeInstructions[id] {
                totalPendingSize += inst.output.count
            }
        }
        
        // 达到时间阈值或大小阈值时触发 flush
        let shouldFlush = timeSinceLastFlush >= flushInterval || totalPendingSize >= flushThreshold
        
        if shouldFlush && !pendingOutputUpdates.isEmpty {
            await flushPendingOutputs(app: app)
        }
    }
    
    /// 将所有待写入的输出批量保存到数据库
    private func flushPendingOutputs(app: Application) async {
        guard !pendingOutputUpdates.isEmpty else { return }
        
        let idsToFlush = pendingOutputUpdates
        pendingOutputUpdates.removeAll()
        lastFlushTime = Date()
        
        for id in idsToFlush {
            if let inst = activeInstructions[id] {
                try? await inst.save(on: app.db)
            }
        }
    }
    
    /// 强制 flush 所有待写入的输出（用于服务关闭或指令完成时）
    public func forceFlush(app: Application) async {
        await flushPendingOutputs(app: app)
    }
    
    private func broadcast(ws: WebSocketManager, event: String, instruction: InstructionModel) {
        if let data = try? JSONEncoder().encode(instruction),
           let json = String(data: data, encoding: .utf8) {
            ws.broadcast(event: event, data: json)
        }
    }
}
