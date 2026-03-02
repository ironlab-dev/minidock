import Fluent
import SQLiteNIO

struct AddDatabaseIndexes: AsyncMigration {
    func prepare(on database: Database) async throws {
        guard let sqlite = database as? (any SQLiteDatabase) else { return }

        let indexes = [
            "CREATE INDEX IF NOT EXISTS idx_automation_tasks_enabled_trigger ON automation_tasks(is_enabled, trigger_type)",
            "CREATE INDEX IF NOT EXISTS idx_service_boot_configs_auto_priority ON service_boot_configs(auto_start, boot_priority)",
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)",
            "CREATE INDEX IF NOT EXISTS idx_execution_logs_task_id ON execution_logs(task_id)",
        ]

        for sql in indexes {
            _ = try await sqlite.query(sql)
        }
    }

    func revert(on database: Database) async throws {
        guard let sqlite = database as? (any SQLiteDatabase) else { return }

        let drops = [
            "DROP INDEX IF EXISTS idx_automation_tasks_enabled_trigger",
            "DROP INDEX IF EXISTS idx_service_boot_configs_auto_priority",
            "DROP INDEX IF EXISTS idx_users_username",
            "DROP INDEX IF EXISTS idx_execution_logs_task_id",
        ]

        for sql in drops {
            _ = try await sqlite.query(sql)
        }
    }
}
