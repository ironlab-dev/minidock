import Fluent
import Vapor

public final class SolutionDeployment: Model, Content, @unchecked Sendable {
    public static let schema = "solution_deployments"

    @ID(key: .id)
    public var id: UUID?

    @Field(key: "solution_id")
    public var solutionId: String

    @Field(key: "status")
    public var status: String

    @Field(key: "components_json")
    public var componentsJSON: String

    @Field(key: "media_path")
    public var mediaPath: String

    @Field(key: "downloads_path")
    public var downloadsPath: String

    @OptionalField(key: "config_json")
    public var configJSON: String?

    @Timestamp(key: "created_at", on: .create)
    public var createdAt: Date?

    @Timestamp(key: "updated_at", on: .update)
    public var updatedAt: Date?

    public init() {}

    public init(
        id: UUID? = nil,
        solutionId: String,
        status: String,
        componentsJSON: String,
        mediaPath: String,
        downloadsPath: String,
        configJSON: String? = nil
    ) {
        self.id = id
        self.solutionId = solutionId
        self.status = status
        self.componentsJSON = componentsJSON
        self.mediaPath = mediaPath
        self.downloadsPath = downloadsPath
        self.configJSON = configJSON
    }
}
