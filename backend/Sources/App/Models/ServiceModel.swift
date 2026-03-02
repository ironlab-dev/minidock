import Vapor
import Fluent

public final class ServiceModel: Model, Content, @unchecked Sendable {
    public static let schema = "services"
    
    @ID(key: .id)
    public var id: UUID?
    
    @Field(key: "service_id")
    public var serviceId: String
    
    @Field(key: "displayName")
    public var displayName: String
    
    @Field(key: "isEnabled")
    public var isEnabled: Bool
    
    @Field(key: "autoStart")
    public var autoStart: Bool
    
    public init() { }
    
    public init(id: UUID? = nil, serviceId: String, displayName: String, isEnabled: Bool = true, autoStart: Bool = false) {
        self.id = id
        self.serviceId = serviceId
        self.displayName = displayName
        self.isEnabled = isEnabled
        self.autoStart = autoStart
    }
}
