import Fluent
import Vapor

public final class SystemSetting: Model, Content, @unchecked Sendable {
    public static let schema = "system_settings"
    
    @ID(key: .id)
    public var id: UUID?

    @Field(key: "key")
    public var key: String

    @Field(key: "value")
    public var value: String

    @Field(key: "category")
    public var category: String // "automation", "notification", "system"

    @Field(key: "is_secret")
    public var isSecret: Bool

    public init() { }

    public init(id: UUID? = nil, key: String, value: String, category: String, isSecret: Bool = false) {
        self.id = id
        self.key = key
        self.value = value
        self.category = category
        self.isSecret = isSecret
    }
}
