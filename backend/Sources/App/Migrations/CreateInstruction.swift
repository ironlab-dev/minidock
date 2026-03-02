import Fluent

struct CreateInstruction: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("instructions")
            .id()
            .field("command", .string, .required)
            .field("full_command", .string)
            .field("status", .string, .required)
            .field("start_time", .datetime, .required)
            .field("end_time", .datetime)
            .field("output", .string, .required)
            .field("exit_code", .int32)
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema("instructions").delete()
    }
}
