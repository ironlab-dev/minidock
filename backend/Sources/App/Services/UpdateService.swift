import Vapor
import Foundation

public actor UpdateService: MiniDockService {
    public let id: String = "system-update"
    public let name: String = "System Update"
    public let type: ServiceType = .system
    
    private var localVersion: String = "0.0.0"
    private var buildDate: String = "Unknown"
    
    public init() {
        let bundlePath = Bundle.main.resourcePath ?? ""
        let versionPath = bundlePath + "/version.json"
        
        var ver = "0.0.0"
        var date = "Unknown"
        
        if let data = try? Data(contentsOf: URL(fileURLWithPath: versionPath)),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: String] {
            ver = json["version"] ?? "0.0.0"
            date = json["buildDate"] ?? "Unknown"
        } else {
            // Fallback for dev mode
            let rootPath = FileManager.default.currentDirectoryPath
            let devVersionPath = rootPath + "/VERSION"
            if let v = try? String(contentsOfFile: devVersionPath, encoding: .utf8) {
                ver = v.trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
        
        self.localVersion = ver
        self.buildDate = date
    }
    
    public func getInfo(app: Application) async throws -> ServiceInfo {
        let status = try await getStatus()
        return ServiceInfo(
            id: id,
            name: name,
            type: type,
            status: status,
            description: "Manage and monitor MiniDock version and updates.",
            stats: [
                "version": localVersion,
                "build_at": buildDate
            ]
        )
    }
    
    public func getStatus() async throws -> ServiceStatus {
        return .running
    }
    
    public func start(app: Application) async throws { }
    public func stop(app: Application) async throws { }
    public func restart(app: Application) async throws { }
}
