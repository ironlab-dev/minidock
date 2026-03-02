import Vapor
import Fluent

struct AutomationController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let protected = routes.grouped(
            CookieAuthMiddleware(),
            User.jwtAuthenticator(),
            User.guardMiddleware()
        )
        
        let automation = protected.grouped("automation", "tasks")

        automation.get(use: list)
        automation.post(use: create)
        automation.put(":id", use: update)
        automation.delete(":id", use: delete)
        automation.get(":id", "history", use: getHistory)
        automation.get(":id", "diff", ":hash", use: getDiff)
        automation.get(":id", "script", use: getScript)
        automation.post(":id", "run", use: run)
        automation.get(":id", "logs", use: getLogs)
        
        // Event-based automation triggers
        protected.post("automation", "events", ":eventType", use: triggerEvent)
    }

    func list(req: Request) async throws -> [AutomationTask] {
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

    func create(req: Request) async throws -> AutomationTask {
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

    func update(req: Request) async throws -> AutomationTask {
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

    func delete(req: Request) async throws -> HTTPStatus {
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

    func getHistory(req: Request) async throws -> [GitStorageService.GitCommit] {
        guard let id = req.parameters.get("id", as: UUID.self),
              let storage = req.application.serviceManager.getService(id: "automation-storage") as? AutomationStorageService else {
            throw Abort(.notFound)
        }
        return try await storage.getHistory(app: req.application, taskId: id)
    }

    func getDiff(req: Request) async throws -> PageContent {
        guard let id = req.parameters.get("id", as: UUID.self),
              let hash = req.parameters.get("hash"),
              let storage = req.application.serviceManager.getService(id: "automation-storage") as? AutomationStorageService else {
            throw Abort(.notFound)
        }
        let diff = try await storage.getDiff(app: req.application, taskId: id, commitHash: hash)
        return PageContent(content: diff)
    }

    func getScript(req: Request) async throws -> PageContent {
        guard let id = req.parameters.get("id", as: UUID.self),
              let storage = req.application.serviceManager.getService(id: "automation-storage") as? AutomationStorageService else {
            throw Abort(.notFound)
        }
        guard let task = try await storage.loadTaskFromFileSystem(app: req.application, taskId: id) else {
            throw Abort(.notFound, reason: "Task not found in file system")
        }
        return PageContent(content: task.scriptContent)
    }

    func run(req: Request) async throws -> HTTPStatus {
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

    func getLogs(req: Request) async throws -> [ExecutionLog] {
        guard let id = req.parameters.get("id", as: UUID.self) else {
            throw Abort(.badRequest)
        }
        return try await ExecutionLog.query(on: req.db)
            .filter(\ExecutionLog.$task.$id == id)
            .sort(\ExecutionLog.$executedAt, .descending)
            .range(0..<50)
            .all()
    }

    func triggerEvent(req: Request) async throws -> HTTPStatus {
        guard let eventType = req.parameters.get("eventType"),
              let automationService = req.application.serviceManager.getService(id: "automation-engine") as? AutomationService else {
            throw Abort(.notFound)
        }

        // Trigger all enabled tasks matching this event type
        try await automationService.triggerEventTasks(app: req.application, eventType: eventType)
        return .ok
    }
}
