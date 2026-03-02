import Fluent

struct CreateAutomationTask: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("automation_tasks")
            .id()
            .field("name", .string, .required)
            .field("trigger_type", .string, .required)
            .field("cron_expression", .string)
            .field("watch_path", .string)
            .field("event_type", .string)
            .field("script_type", .string, .required)
            .field("script_content", .string, .required)
            .field("is_enabled", .bool, .required)
            .field("last_run_at", .datetime)
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema("automation_tasks").delete()
    }
}
