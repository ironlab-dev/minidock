import Fluent

struct CreateUser: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("users")
            .id()
            .field("username", .string, .required)
            .field("password_hash", .string, .required)
            .field("role", .string, .required, .sql(.default("user")))
            .field("created_at", .datetime)
            .unique(on: "username")
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema("users").delete()
    }
}
