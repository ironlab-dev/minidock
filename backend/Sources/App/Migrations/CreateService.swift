import Fluent

struct CreateService: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema(ServiceModel.schema)
            .id()
            .field("service_id", .string, .required)
            .field("displayName", .string, .required)
            .field("isEnabled", .bool, .required)
            .field("autoStart", .bool, .required)
            .unique(on: "service_id")
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema(ServiceModel.schema).delete()
    }
}
