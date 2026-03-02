import Fluent

struct CreateSolutionDeployment: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("solution_deployments")
            .id()
            .field("solution_id", .string, .required)
            .field("status", .string, .required)
            .field("components_json", .string, .required)
            .field("media_path", .string, .required)
            .field("downloads_path", .string, .required)
            .field("config_json", .string)
            .field("created_at", .datetime)
            .field("updated_at", .datetime)
            .unique(on: "solution_id")
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema("solution_deployments").delete()
    }
}
