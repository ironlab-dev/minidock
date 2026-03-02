import Vapor
import Foundation
import Fluent

/// 自动化任务存储服务，提供文件系统存储和 Git 版本控制
public struct AutomationStorageService: MiniDockService, @unchecked Sendable {
    public let id: String = "automation-storage"
    public let name: String = "Automation Storage Manager"
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
        let tasks = try await listTasks(app: app)
        return ServiceInfo(
            id: id,
            name: name,
            type: type,
            status: status,
            description: "Manage automation task storage and Git version control.",
            stats: [
                "tasks_total": "\(tasks.count)"
            ]
        )
    }
    
    public func getItems(app: Application) async throws -> [ServiceItem] {
        let tasks = try await listTasks(app: app)
        return tasks.map { task in
            ServiceItem(
                id: task.id?.uuidString ?? "",
                name: task.name,
                status: task.isEnabled ? "enabled" : "disabled",
                metadata: [
                    "trigger_type": task.triggerType,
                    "script_type": task.scriptType
                ]
            )
        }
    }
    
    /// 获取基础路径
    public func getBasePath(app: Application) async throws -> String {
        let setting = try await SystemSetting.query(on: app.db)
            .filter(\SystemSetting.$key == "AUTOMATION_BASE_PATH")
            .first()
        
        if let path = setting?.value, !path.isEmpty {
            return path
        }
        
        // 默认路径
        let fileManager = FileManager.default
        let homeDir = fileManager.homeDirectoryForCurrentUser.path
        let defaultPath = (homeDir as NSString).appendingPathComponent("minidock/automation")
        
        // 确保目录存在
        if !fileManager.fileExists(atPath: defaultPath) {
            try fileManager.createDirectory(atPath: defaultPath, withIntermediateDirectories: true)
        }
        
        return defaultPath
    }
    
    /// 获取脚本文件扩展名
    private func getFileExtension(scriptType: String) -> String {
        switch scriptType.lowercased() {
        case "shell", "sh", "bash", "zsh":
            return "sh"
        case "python", "py":
            return "py"
        case "swift":
            return "swift"
        default:
            return "sh"
        }
    }
    
    /// 获取脚本文件路径
    private func getScriptFilePath(basePath: String, taskId: UUID, taskName: String, scriptType: String) -> String {
        let ext = getFileExtension(scriptType: scriptType)
        let fileName = "\(taskId.uuidString)_\(sanitizeFileName(taskName)).\(ext)"
        return (basePath as NSString).appendingPathComponent(fileName)
    }
    
    /// 清理文件名（移除不安全字符）
    private func sanitizeFileName(_ name: String) -> String {
        let invalidChars = CharacterSet(charactersIn: "/\\?%*|\"<>")
        return name.components(separatedBy: invalidChars).joined(separator: "_")
            .trimmingCharacters(in: .whitespaces)
    }
    
    /// 获取 tasks.json 路径
    private func getTasksJsonPath(basePath: String) -> String {
        return (basePath as NSString).appendingPathComponent("tasks.json")
    }
    
    /// 任务元数据结构
    private struct TaskMetadata: Codable {
        let id: String
        let name: String
        let triggerType: String
        let cronExpression: String?
        let watchPath: String?
        let eventType: String?
        let scriptType: String
        let isEnabled: Bool
        let lastRunAt: String?
    }
    
    /// 读取 tasks.json
    private func loadTasksMetadata(basePath: String) throws -> [TaskMetadata] {
        let jsonPath = getTasksJsonPath(basePath: basePath)
        let fm = FileManager.default
        
        guard fm.fileExists(atPath: jsonPath) else {
            return []
        }
        
        let data = try Data(contentsOf: URL(fileURLWithPath: jsonPath))
        let decoder = JSONDecoder()
        return try decoder.decode([TaskMetadata].self, from: data)
    }
    
    /// 保存 tasks.json
    private func saveTasksMetadata(basePath: String, tasks: [TaskMetadata]) throws {
        let jsonPath = getTasksJsonPath(basePath: basePath)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(tasks)
        try data.write(to: URL(fileURLWithPath: jsonPath))
    }
    
    /// 从文件系统加载任务
    public func loadTaskFromFileSystem(app: Application, taskId: UUID) async throws -> AutomationTask? {
        let basePath = try await getBasePath(app: app)
        let metadataList = try loadTasksMetadata(basePath: basePath)
        
        guard let metadata = metadataList.first(where: { $0.id == taskId.uuidString }) else {
            return nil
        }
        
        // 读取脚本文件
        let scriptPath = getScriptFilePath(basePath: basePath, taskId: taskId, taskName: metadata.name, scriptType: metadata.scriptType)
        let fm = FileManager.default
        
        guard fm.fileExists(atPath: scriptPath) else {
            return nil
        }
        
        // 检查文件大小（限制 10MB）
        let fileAttributes = try fm.attributesOfItem(atPath: scriptPath)
        if let fileSize = fileAttributes[.size] as? Int64, fileSize > 10 * 1024 * 1024 {
            throw Abort(.payloadTooLarge, reason: "Script file size exceeds 10MB limit")
        }
        
        let scriptContent = try String(contentsOfFile: scriptPath, encoding: .utf8)
        
        // 转换为 AutomationTask
        let task = AutomationTask(
            id: taskId,
            name: metadata.name,
            triggerType: metadata.triggerType,
            scriptType: metadata.scriptType,
            scriptContent: scriptContent,
            isEnabled: metadata.isEnabled,
            cronExpression: metadata.cronExpression,
            watchPath: metadata.watchPath,
            eventType: metadata.eventType
        )
        
        if let lastRunAtStr = metadata.lastRunAt,
           let lastRunAt = ISO8601DateFormatter().date(from: lastRunAtStr) {
            task.lastRunAt = lastRunAt
        }
        
        return task
    }
    
    /// 保存任务到文件系统
    public func saveTaskToFileSystem(app: Application, task: AutomationTask) async throws {
        guard let taskId = task.id else {
            throw Abort(.badRequest, reason: "Task ID is required")
        }
        
        let basePath = try await getBasePath(app: app)
        let fm = FileManager.default
        
        // 确保目录存在
        if !fm.fileExists(atPath: basePath) {
            try fm.createDirectory(atPath: basePath, withIntermediateDirectories: true)
        }
        
        // 初始化 Git 仓库
        try await gitService.ensureGitInitialized(basePath: basePath)
        
        // 保存脚本文件
        let scriptPath = getScriptFilePath(basePath: basePath, taskId: taskId, taskName: task.name, scriptType: task.scriptType)
        try task.scriptContent.write(toFile: scriptPath, atomically: true, encoding: .utf8)
        
        // 更新 tasks.json
        var metadataList = try loadTasksMetadata(basePath: basePath)
        
        // 移除旧的任务元数据（如果存在）
        metadataList.removeAll { $0.id == taskId.uuidString }
        
        // 添加新的任务元数据
        let metadata = TaskMetadata(
            id: taskId.uuidString,
            name: task.name,
            triggerType: task.triggerType,
            cronExpression: task.cronExpression,
            watchPath: task.watchPath,
            eventType: task.eventType,
            scriptType: task.scriptType,
            isEnabled: task.isEnabled,
            lastRunAt: task.lastRunAt.map { ISO8601DateFormatter().string(from: $0) }
        )
        metadataList.append(metadata)
        
        try saveTasksMetadata(basePath: basePath, tasks: metadataList)
        
        // Git 提交
        _ = try await gitService.runGitCommand(args: ["add", "."], basePath: basePath)
        let commitMessage = task.id == nil ? "Create automation task: \(task.name)" : "Update automation task: \(task.name)"
        _ = try await gitService.runGitCommand(args: ["commit", "-m", commitMessage], basePath: basePath)
        
        // 清除历史缓存
        await gitService.clearHistoryCache(basePath: basePath)
        
        // 后台推送（不阻塞）
        Task.detached { [weak app] in
            guard let app = app else { return }
            do {
                try await gitService.tryPush(app: app, basePath: basePath, remoteKey: "AUTOMATION_GIT_REMOTE", branchKey: "AUTOMATION_GIT_BRANCH")
            } catch {
                app.logger.warning("[AutomationStorage] Git push failed (non-critical): \(error)")
            }
        }
    }
    
    /// 删除任务
    public func deleteTask(app: Application, taskId: UUID) async throws {
        let basePath = try await getBasePath(app: app)
        
        // 从 tasks.json 中获取任务信息
        let metadataList = try loadTasksMetadata(basePath: basePath)
        guard let metadata = metadataList.first(where: { $0.id == taskId.uuidString }) else {
            throw Abort(.notFound, reason: "Task not found in file system")
        }
        
        // 删除脚本文件
        let scriptPath = getScriptFilePath(basePath: basePath, taskId: taskId, taskName: metadata.name, scriptType: metadata.scriptType)
        let fm = FileManager.default
        if fm.fileExists(atPath: scriptPath) {
            try fm.removeItem(atPath: scriptPath)
        }
        
        // 更新 tasks.json
        var updatedList = metadataList
        updatedList.removeAll { $0.id == taskId.uuidString }
        try saveTasksMetadata(basePath: basePath, tasks: updatedList)
        
        // Git 提交
        _ = try await gitService.runGitCommand(args: ["add", "."], basePath: basePath)
        _ = try await gitService.runGitCommand(args: ["commit", "-m", "Delete automation task: \(metadata.name)"], basePath: basePath)
        
        // 清除历史缓存
        await gitService.clearHistoryCache(basePath: basePath)
        
        // 后台推送
        Task.detached { [weak app] in
            guard let app = app else { return }
            do {
                try await gitService.tryPush(app: app, basePath: basePath, remoteKey: "AUTOMATION_GIT_REMOTE", branchKey: "AUTOMATION_GIT_BRANCH")
            } catch {
                app.logger.warning("[AutomationStorage] Git push failed (non-critical): \(error)")
            }
        }
    }
    
    /// 列出所有任务（从文件系统）
    public func listTasks(app: Application) async throws -> [AutomationTask] {
        let basePath = try await getBasePath(app: app)
        let metadataList = try loadTasksMetadata(basePath: basePath)
        
        var tasks: [AutomationTask] = []
        for metadata in metadataList {
            guard let taskId = UUID(uuidString: metadata.id) else { continue }
            if let task = try await loadTaskFromFileSystem(app: app, taskId: taskId) {
                tasks.append(task)
            }
        }
        
        return tasks
    }
    
    /// 自动迁移：将数据库中的任务导出到文件系统
    public func migrateFromDatabase(app: Application) async throws {
        let basePath = try await getBasePath(app: app)
        let fm = FileManager.default
        
        // 确保目录存在
        if !fm.fileExists(atPath: basePath) {
            try fm.createDirectory(atPath: basePath, withIntermediateDirectories: true)
        }
        
        // 初始化 Git 仓库
        try await gitService.ensureGitInitialized(basePath: basePath)
        
        // 获取数据库中的所有任务
        let dbTasks = try await AutomationTask.query(on: app.db).all()
        
        // 获取文件系统中已有的任务 ID
        let existingMetadata = try loadTasksMetadata(basePath: basePath)
        let existingIds = Set(existingMetadata.map { $0.id })
        
        var migratedCount = 0
        
        for task in dbTasks {
            guard let taskId = task.id else { continue }
            
            // 如果文件系统中已存在，跳过
            if existingIds.contains(taskId.uuidString) {
                continue
            }
            
            // 保存到文件系统
            try await saveTaskToFileSystem(app: app, task: task)
            migratedCount += 1
        }
        
        if migratedCount > 0 {
            app.logger.info("[AutomationStorage] Migrated \(migratedCount) tasks from database to file system")
        }
    }
    
    /// 获取任务历史
    public func getHistory(app: Application, taskId: UUID) async throws -> [GitStorageService.GitCommit] {
        let basePath = try await getBasePath(app: app)
        
        // 获取任务元数据以确定文件路径
        let metadataList = try loadTasksMetadata(basePath: basePath)
        guard let metadata = metadataList.first(where: { $0.id == taskId.uuidString }) else {
            throw Abort(.notFound, reason: "Task not found")
        }
        
        let scriptPath = getScriptFilePath(basePath: basePath, taskId: taskId, taskName: metadata.name, scriptType: metadata.scriptType)
        let fileName = (scriptPath as NSString).lastPathComponent
        
        return try await gitService.getHistory(basePath: basePath, path: fileName)
    }
    
    /// 获取任务差异
    public func getDiff(app: Application, taskId: UUID, commitHash: String) async throws -> String {
        let basePath = try await getBasePath(app: app)
        
        // 获取任务元数据以确定文件路径
        let metadataList = try loadTasksMetadata(basePath: basePath)
        guard let metadata = metadataList.first(where: { $0.id == taskId.uuidString }) else {
            throw Abort(.notFound, reason: "Task not found")
        }
        
        let scriptPath = getScriptFilePath(basePath: basePath, taskId: taskId, taskName: metadata.name, scriptType: metadata.scriptType)
        let fileName = (scriptPath as NSString).lastPathComponent
        
        return try await gitService.getDiff(basePath: basePath, path: fileName, commitHash: commitHash)
    }
}

