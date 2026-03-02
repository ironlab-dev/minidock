import Fluent

struct CreateSystemSetting: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("system_settings")
            .id()
            .field("key", .string, .required)
            .field("value", .string, .required)
            .field("category", .string, .required)
            .field("is_secret", .bool, .required)
            .unique(on: "key") // Keys must be unique
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema("system_settings").delete()
    }
}
