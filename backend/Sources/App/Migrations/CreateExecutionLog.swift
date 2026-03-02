import Fluent

struct CreateExecutionLog: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("execution_logs")
            .id()
            .field("task_id", .uuid, .required, .references("automation_tasks", "id"))
            .field("executed_at", .datetime, .required)
            .field("output", .string, .required)
            .field("exit_code", .int32, .required)
            .field("status", .string, .required)
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema("execution_logs").delete()
    }
}
