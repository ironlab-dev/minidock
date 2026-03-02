import Foundation
import Vapor

public actor SSHService: MiniDockService {
    public let id: String = "ssh-manager"
    public let name: String = "SSH Manager"
    public let type: ServiceType = .system
    
    private var cachedExternalIP: String?
    private var cachedExternalIPTime: Date?
    private let externalIPCacheTTL: TimeInterval = 300
    
    public init() {}
    
    public func getInfo(app: Application) async throws -> ServiceInfo {
        let externalIP = await getExternalIPCached() ?? "Unknown"
        let status = try await getStatus()
        
        // Fetch custom connectivity settings
        let settings = try await SystemSetting.query(on: app.db).all()
        let extHost = settings.first { $0.key == "EXTERNAL_HOST" }?.value ?? ""
        let extSshPort = settings.first { $0.key == "EXTERNAL_SSH_PORT" }?.value ?? "22"
        let extVncPort = settings.first { $0.key == "EXTERNAL_VNC_PORT" }?.value ?? "5900"

        return ServiceInfo(
            id: id,
            name: name,
            type: type,
            status: status,
            description: "SSH management and external connectivity status.",
            stats: [
                "external_ip": externalIP,
                "ssh_enabled": status == .running ? "true" : "false",
                "external_host": extHost,
                "external_ssh_port": extSshPort,
                "external_vnc_port": extVncPort
            ]
        )
    }
    
    public func getItems(app: Application) async throws -> [ServiceItem] {
        return []
    }
    
    public func getStatus() async throws -> ServiceStatus {
        return try await isSSHEnabled() ? .running : .stopped
    }
    
    public func start(app: Application) async throws {
        // macOS: sudo systemsetup -setremotelogin on
        // Requires sudo, which we might not have. Guidance might be better.
    }
    
    public func stop(app: Application) async throws {
        // macOS: sudo systemsetup -setremotelogin off
    }
    
    // SSH Key Management
    public func listKeys() throws -> [SSHKey] {
        let path = NSString(string: "~/.ssh/authorized_keys").expandingTildeInPath
        guard FileManager.default.fileExists(atPath: path) else { return [] }
        
        let content = try String(contentsOfFile: path, encoding: .utf8)
        let lines = content.components(separatedBy: .newlines)
        
        return lines.compactMap { line in
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty || trimmed.hasPrefix("#") { return nil }
            return SSHKey(raw: trimmed)
        }
    }
    
    public func addKey(_ key: String) throws {
        let sshDir = NSString(string: "~/.ssh").expandingTildeInPath
        let authKeysPath = (sshDir as NSString).appendingPathComponent("authorized_keys")
        
        if !FileManager.default.fileExists(atPath: sshDir) {
            try FileManager.default.createDirectory(atPath: sshDir, withIntermediateDirectories: true, attributes: [FileAttributeKey.posixPermissions: 0o700])
        }
        
        var content = ""
        if FileManager.default.fileExists(atPath: authKeysPath) {
            content = try String(contentsOfFile: authKeysPath, encoding: .utf8)
            if !content.hasSuffix("\n") && !content.isEmpty {
                content += "\n"
            }
        }
        
        content += key + "\n"
        try content.write(toFile: authKeysPath, atomically: true, encoding: .utf8)
        
        // Fix permissions
        try FileManager.default.setAttributes([FileAttributeKey.posixPermissions: 0o600], ofItemAtPath: authKeysPath)
    }
    
    public func deleteKey(_ keySignature: String) throws {
        let path = NSString(string: "~/.ssh/authorized_keys").expandingTildeInPath
        guard FileManager.default.fileExists(atPath: path) else { return }
        
        let content = try String(contentsOfFile: path, encoding: .utf8)
        let lines = content.components(separatedBy: .newlines)
        
        let filtered = lines.filter { line in
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            // If the line contains the signature or exactly matches (for now using contains is simpler)
            return !trimmed.contains(keySignature) && !trimmed.isEmpty
        }
        
        try filtered.joined(separator: "\n").write(toFile: path, atomically: true, encoding: .utf8)
    }
    
    // System Helpers
    private func isSSHEnabled() async throws -> Bool {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/systemsetup")
        process.arguments = ["-getremotelogin"]
        let pipe = Pipe()
        process.standardOutput = pipe
        
        do {
            try process.run()
            process.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: data, encoding: .utf8) ?? ""
            return output.contains("On")
        } catch {
            return false
        }
    }
    
    private func getExternalIPCached() async -> String? {
        let now = Date()
        if let cached = cachedExternalIP,
           let cachedTime = cachedExternalIPTime,
           now.timeIntervalSince(cachedTime) < externalIPCacheTTL {
            return cached
        }
        
        let ip = await getExternalIP()
        if let ip = ip {
            cachedExternalIP = ip
            cachedExternalIPTime = now
        }
        return ip
    }
    
    private func getExternalIP() async -> String? {
        let services = [
            "https://icanhazip.com",
            "https://ifconfig.me/ip",
            "https://api.ipify.org"
        ]
        
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 1
        let session = URLSession(configuration: config)
        
        for service in services {
            guard let url = URL(string: service) else { continue }
            do {
                let (data, _) = try await session.data(from: url)
                if let ip = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
                   !ip.isEmpty {
                    return ip
                }
            } catch {
                continue
            }
        }
        return nil
    }
}

public struct SSHKey: Content {
    public let type: String
    public let key: String
    public let comment: String
    public let raw: String
    
    init(raw: String) {
        self.raw = raw
        let parts = raw.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
        self.type = parts.count > 0 ? parts[0] : "unknown"
        self.key = parts.count > 1 ? parts[1] : ""
        self.comment = parts.count > 2 ? parts[2...] .joined(separator: " ") : ""
    }
}
