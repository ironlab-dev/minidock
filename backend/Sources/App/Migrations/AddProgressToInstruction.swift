import Fluent

struct AddProgressToInstruction: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("instructions")
            .field("progress", .int)
            .update()
    }

    func revert(on database: Database) async throws {
        try await database.schema("instructions")
            .deleteField("progress")
            .update()
    }
}
