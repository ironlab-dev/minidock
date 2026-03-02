import Vapor

/// The status of a service managed by MiniDock
public enum ServiceStatus: String, Content {
    case running
    case stopped
    case starting
    case stopping
    case error
    case unknown
    case not_installed
}

/// Metadata about a service
public struct ServiceInfo: Content, Equatable {
    public let id: String
    public let name: String
    public let type: ServiceType
    public let status: ServiceStatus
    public let description: String?
    public let stats: [String: String]?
}

/// A specific item managed by a service (e.g., a container or a VM)
public struct ServiceItem: Content, Equatable {
    public let id: String
    public let name: String
    public let status: String
    public let metadata: [String: String]?
}

public enum ServiceType: String, Content {
    case docker
    case vm     // UTM
    case system // Native
    case automation
}

/// The foundational protocol all MiniDock services must implement
public protocol MiniDockService: Sendable {
    var id: String { get }
    var name: String { get }
    var type: ServiceType { get }
    
    func getStatus() async throws -> ServiceStatus
    func start(app: Application) async throws
    func stop(app: Application) async throws
    func restart(app: Application) async throws
    
    func getInfo(app: Application) async throws -> ServiceInfo
    func getItems(app: Application) async throws -> [ServiceItem]
    func performAction(app: Application) async throws
    func performItemAction(app: Application, itemId: String, action: String) async throws
    func getItemDetails(app: Application, itemId: String) async throws -> [String: String]
}

extension MiniDockService {
    public func start(app: Application) async throws {}
    public func stop(app: Application) async throws {}
    public func restart(app: Application) async throws {
        try await stop(app: app)
        try await start(app: app)
    }
    
    public func getInfo(app: Application) async throws -> ServiceInfo {
        let status = try await getStatus()
        return ServiceInfo(
            id: id,
            name: name,
            type: type,
            status: status,
            description: nil,
            stats: nil
        )
    }
    
    public func getItems(app: Application) async throws -> [ServiceItem] {
        return []
    }
    
    public func performAction(app: Application) async throws {}
    
    public func performItemAction(app: Application, itemId: String, action: String) async throws {
        // Default: no-op
    }
    
    public func getItemDetails(app: Application, itemId: String) async throws -> [String: String] {
        return [:]
    }
    
    public func checkPrerequisites() async -> Bool {
        return true
    }
}
