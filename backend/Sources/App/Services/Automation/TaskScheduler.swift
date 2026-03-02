import Vapor
import Fluent

public final class TaskScheduler: Sendable {
    public init() {}
    
    public func tick(app: Application) async {
        do {
            let tasks = try await AutomationTask.query(on: app.db)
                .filter(\AutomationTask.$triggerType == "cron")
                .filter(\AutomationTask.$isEnabled == true)
                .all()
            
            for task in tasks {
                if let cron = task.cronExpression, let expression = try? CronExpression(cron) {
                    // Check if it matches NOW (minute precision)
                    if expression.isDue() {
                        // Check last run to avoid double execution in the same minute
                        // We need a way to ensure we run only once per minute.
                        // Ideally we store lastRunAt with minute precision or check if run in last 60s.
                        
                        let shouldRun: Bool
                        if let lastRun = task.lastRunAt {
                            // If last run was more than 59 seconds ago
                            shouldRun = Date().timeIntervalSince(lastRun) > 59
                        } else {
                            shouldRun = true
                        }
                        
                        if shouldRun {
                            if let automationService = await app.serviceManager.getService(id: "automation-engine") as? AutomationService {
                                 // Execute
                                 try? await automationService.runTask(app: app, task: task)
                            }
                        }
                    }
                }
            }
        } catch {
            app.logger.error("Scheduler error: \(error)")
        }
    }
}
