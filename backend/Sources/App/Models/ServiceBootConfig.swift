import Fluent
import Vapor

final class ServiceBootConfig: Model, Content, @unchecked Sendable {
    static let schema = "service_boot_configs"
    
    @ID(key: .id)
    var id: UUID?
    
    @Field(key: "service_id")
    var serviceId: String
    
    // Optional: If present, targets a specific item (VM/Container). If nil, targets the Service itself.
    @OptionalField(key: "item_id")
    var itemId: String?
    
    @Field(key: "item_name")
    var itemName: String // Helper for UI display if item definition is missing
    
    @Field(key: "auto_start")
    var autoStart: Bool
    
    @Field(key: "boot_priority")
    var bootPriority: Int
    
    @Field(key: "boot_delay")
    var bootDelay: Int
    
    init() { }
    
    init(id: UUID? = nil, serviceId: String, itemId: String? = nil, itemName: String, autoStart: Bool, bootPriority: Int, bootDelay: Int) {
        self.id = id
        self.serviceId = serviceId
        self.itemId = itemId
        self.itemName = itemName
        self.autoStart = autoStart
        self.bootPriority = bootPriority
        self.bootDelay = bootDelay
    }
}
