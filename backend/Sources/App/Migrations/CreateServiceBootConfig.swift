import Fluent

struct CreateServiceBootConfig: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("service_boot_configs")
            .id()
            .field("service_id", .string, .required)
            .field("item_id", .string)
            .field("item_name", .string, .required)
            .field("auto_start", .bool, .required)
            .field("boot_priority", .int, .required)
            .field("boot_delay", .int, .required)
            // Composite unique constraint: We only want one config per (service_id, item_id)
            // However, Fluent doesn't easily support composite unique in strict syntax sometimes, 
            // but we can add a unique index.
            .unique(on: "service_id", "item_id") 
            .create()
    }
    
    func revert(on database: Database) async throws {
        try await database.schema("service_boot_configs").delete()
    }
}
