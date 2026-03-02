import Fluent
import Vapor

public final class AutomationTask: Model, Content, @unchecked Sendable {
    public static let schema = "automation_tasks"
    
    @ID(key: .id)
    public var id: UUID?

    @Field(key: "name")
    public var name: String

    @Field(key: "trigger_type")
    public var triggerType: String // "cron", "watch", "event", "metric"

    @OptionalField(key: "cron_expression")
    public var cronExpression: String?

    @OptionalField(key: "watch_path")
    public var watchPath: String?

    @OptionalField(key: "event_type")
    public var eventType: String?

    @Field(key: "script_type")
    public var scriptType: String // "shell", "python", "swift"

    @Field(key: "script_content")
    public var scriptContent: String

    @Field(key: "is_enabled")
    public var isEnabled: Bool

    @Timestamp(key: "last_run_at", on: .none)
    public var lastRunAt: Date?

    public init() { }

    public init(id: UUID? = nil, name: String, triggerType: String, scriptType: String, scriptContent: String, isEnabled: Bool = true, cronExpression: String? = nil, watchPath: String? = nil, eventType: String? = nil) {
        self.id = id
        self.name = name
        self.triggerType = triggerType
        self.scriptType = scriptType
        self.scriptContent = scriptContent
        self.isEnabled = isEnabled
        self.cronExpression = cronExpression
        self.watchPath = watchPath
        self.eventType = eventType
    }
}
