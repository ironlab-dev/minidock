import Fluent
import Vapor

public final class ExecutionLog: Model, Content, @unchecked Sendable {
    public static let schema = "execution_logs"
    
    @ID(key: .id)
    public var id: UUID?

    @Parent(key: "task_id")
    public var task: AutomationTask

    @Field(key: "executed_at")
    public var executedAt: Date

    @Field(key: "output")
    public var output: String

    @Field(key: "exit_code")
    public var exitCode: Int32

    @Field(key: "status")
    public var status: String // "success", "failure"

    public init() { }

    public init(id: UUID? = nil, taskId: UUID, executedAt: Date = Date(), output: String, exitCode: Int32, status: String) {
        self.id = id
        self.$task.id = taskId
        self.executedAt = executedAt
        self.output = output
        self.exitCode = exitCode
        self.status = status
    }
}
