import Vapor
import Fluent

public final class AutomationService: MiniDockService, @unchecked Sendable {
    public let id: String = "automation-engine"
    public let name: String = "Automation Engine"
    public let type: ServiceType = .automation
    
    private let cronScheduler = TaskScheduler()
    private var fileWatcher: FileWatcher?
    
    public init() {}
    
    public func getInfo(app: Application) async throws -> ServiceInfo {
        return ServiceInfo(
            id: id,
            name: name,
            type: type,
            status: .running,
            description: "Scriptable automation engine (Shell/Python/Swift).",
            stats: [
                "description": "Customizable automation with multiple script languages and triggers."
            ]
        )
    }
    
    public func getStatus() async throws -> ServiceStatus {
        return .running
    }
    
    public func start(app: Application) async throws { 
        // Initial start logic if needed
    }
    
    public func stop(app: Application) async throws { 
        await fileWatcher?.stop()
    }
    
    public func restart(app: Application) async throws { 
        try await stop(app: app)
        try await start(app: app)
    }
    
    public func getItems(app: Application) async throws -> [ServiceItem] {
        return []
    }
    
    // Main sync loop called by ServiceManager
    public func sync(app: Application) async {
        // Initialize file watcher if needed
        if fileWatcher == nil {
            fileWatcher = FileWatcher(app: app)
        }
        
        // 1. Tick Cron
        await cronScheduler.tick(app: app)
        
        // 2. Sync File Watchers
        await fileWatcher?.syncWatchers()
    }
    
    // Trigger event-based tasks
    public func triggerEventTasks(app: Application, eventType: String) async throws {
        do {
            let tasks = try await AutomationTask.query(on: app.db)
                .filter(\.$isEnabled == true)
                .filter(\.$triggerType == "event")
                .all()
            
            for task in tasks {
                // Match event type (exact match or wildcard)
                if let taskEventType = task.eventType {
                    if taskEventType == eventType || taskEventType == "*" {
                        app.logger.info("Triggering event task '\(task.name)' for event type '\(eventType)'")
                        try? await runTask(app: app, task: task)
                    }
                } else if eventType.isEmpty {
                    // If no eventType specified in task, trigger on any event
                    app.logger.info("Triggering event task '\(task.name)' for event type '\(eventType)'")
                    try? await runTask(app: app, task: task)
                }
            }
        } catch {
            app.logger.error("Failed to trigger event tasks: \(error)")
            throw error
        }
    }
    
    // Evaluation logic for Metrics (called manually or via sync if we move it there)
    public func evaluateMetricRules(app: Application, cpu: Double, mem: Double) async {
        do {
            let tasks = try await AutomationTask.query(on: app.db)
                .filter(\.$isEnabled == true)
                .filter(\.$triggerType == "metric")
                .all()
            
            for task in tasks {
                guard let condition = task.eventType, !condition.isEmpty else {
                    continue
                }
                
                // Parse condition like "cpu > 80" or "memory < 20"
                if evaluateMetricCondition(condition: condition, cpu: cpu, mem: mem) {
                    app.logger.info("Metric condition '\(condition)' met (CPU: \(cpu)%, Memory: \(mem)%). Triggering task '\(task.name)'")
                    try? await runTask(app: app, task: task)
                }
            }
        } catch {
            app.logger.error("Failed to evaluate metric tasks: \(error)")
        }
    }
    
    // Pre-compiled regexes for metric condition parsing (avoids re-compiling on every evaluation)
    private static let metricRegexes: [(metric: String, op: String, regex: NSRegularExpression)] = {
        var result: [(String, String, NSRegularExpression)] = []
        for metric in ["cpu", "memory"] {
            for op in [">=", "<=", "==", ">", "<"] {
                let escapedOp = NSRegularExpression.escapedPattern(for: op)
                if let regex = try? NSRegularExpression(pattern: "\(metric)\\s*\(escapedOp)\\s*(\\d+)", options: []) {
                    result.append((metric, op, regex))
                }
            }
        }
        return result
    }()

    // Evaluate metric condition expression
    private func evaluateMetricCondition(condition: String, cpu: Double, mem: Double) -> Bool {
        let trimmed = condition.trimmingCharacters(in: .whitespaces).lowercased()

        for (metric, op, regex) in Self.metricRegexes {
            guard let match = regex.firstMatch(in: trimmed, range: NSRange(trimmed.startIndex..., in: trimmed)),
                  let thresholdRange = Range(match.range(at: 1), in: trimmed),
                  let threshold = Double(trimmed[thresholdRange]) else {
                continue
            }

            let value = (metric == "cpu") ? cpu : mem
            switch op {
            case ">=": return value >= threshold
            case "<=": return value <= threshold
            case "==": return abs(value - threshold) < 0.1
            case ">":  return value > threshold
            case "<":  return value < threshold
            default: continue
            }
        }

        // Fallback: simple numeric comparison if condition is just a number
        if let threshold = Double(trimmed) {
            return cpu >= threshold || mem >= threshold
        }

        return false
    }
    
    // Core execution method
    public func runTask(app: Application, task: AutomationTask) async throws {
        guard let taskId = task.id else { return }
        
        // Ensure task exists in database (for foreign key constraint)
        // If task was loaded from file system, it might not be in DB
        if let existingTask = try await AutomationTask.find(taskId, on: app.db) {
            // Update task fields from file system version
            existingTask.name = task.name
            existingTask.triggerType = task.triggerType
            existingTask.scriptType = task.scriptType
            existingTask.scriptContent = task.scriptContent
            existingTask.isEnabled = task.isEnabled
            existingTask.cronExpression = task.cronExpression
            existingTask.watchPath = task.watchPath
            existingTask.eventType = task.eventType
            try await existingTask.update(on: app.db)
        } else {
            // Create task in database if it doesn't exist
            try await task.create(on: app.db)
            app.logger.info("Created task \(task.name) in database for execution log")
        }
        
        let language = ScriptLanguage(rawValue: task.scriptType) ?? .shell
        let result: ScriptResult
        
        // Fetch all system settings to inject as environment variables
        let settings = try await SystemSetting.query(on: app.db).all()
        var env: [String: String] = [:]
        for setting in settings {
            env[setting.key] = setting.value
        }
        
        do {
            result = try await ScriptExecutor.execute(
                script: task.scriptContent,
                language: language,
                env: env,
                app: app
            )
            
            // Log success
            let log = ExecutionLog(
                taskId: taskId,
                output: result.output,
                exitCode: result.exitCode,
                status: result.exitCode == 0 ? "success" : "failure"
            )
            try await log.save(on: app.db)
            
            // Update last run
            if let taskToUpdate = try await AutomationTask.find(taskId, on: app.db) {
                taskToUpdate.lastRunAt = Date()
                try await taskToUpdate.update(on: app.db)
            }
            
            app.logger.info("Task \(task.name) executed. Status: \(log.status)")
            
            // Broadcast if it failed
            if log.status == "failure" {
                app.webSocketManager.broadcast(event: "automation_error", data: "{\"task\": \"\(task.name)\", \"error\": \"Exit code \(result.exitCode)\"}")
            }
        } catch {
            app.logger.error("Failed to execute task \(task.name): \(error)")
            let log = ExecutionLog(
                taskId: taskId,
                output: "System Error: \(error.localizedDescription)",
                exitCode: -1,
                status: "failure"
            )
            try await log.save(on: app.db)
        }
    }
}
