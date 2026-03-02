import Fluent
import Vapor
import Foundation

public final class InstructionModel: Model, Content, @unchecked Sendable {
    public static let schema = "instructions"
    
    @ID(key: .id)
    public var id: UUID?

    @Field(key: "command")
    public var command: String

    @OptionalField(key: "full_command")
    public var fullCommand: String?

    @Field(key: "status")
    public var status: String // "running", "success", "failure"

    @Field(key: "start_time")
    public var startTime: Date

    @OptionalField(key: "end_time")
    public var endTime: Date?

    @Field(key: "output")
    public var output: String

    @OptionalField(key: "exit_code")
    public var exitCode: Int32?

    @OptionalField(key: "progress")
    public var progress: Int?

    public init() { }

    public init(id: UUID? = nil, command: String, fullCommand: String? = nil, status: String = "running", startTime: Date = Date(), endTime: Date? = nil, output: String = "", exitCode: Int32? = nil, progress: Int? = nil) {
        self.id = id
        self.command = command
        self.fullCommand = fullCommand
        self.status = status
        self.startTime = startTime
        self.endTime = endTime
        self.output = output
        self.exitCode = exitCode
        self.progress = progress
    }
}
