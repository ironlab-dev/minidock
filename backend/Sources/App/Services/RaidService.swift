import Vapor
import Foundation

public struct RaidService: Sendable {
    
    // MARK: - Cache
    
    private static let cache = RaidCache()
    
    actor RaidCache {
        private var cachedRaids: [RaidSet]?
        private var cacheTimestamp: Date?
        private let cacheTTL: TimeInterval = 5.0
        
        func get() -> [RaidSet]? {
            guard let cached = cachedRaids,
                  let timestamp = cacheTimestamp,
                  Date().timeIntervalSince(timestamp) < cacheTTL else {
                return nil
            }
            return cached
        }
        
        func set(_ raids: [RaidSet]) {
            cachedRaids = raids
            cacheTimestamp = Date()
        }
        
        func invalidate() {
            cachedRaids = nil
            cacheTimestamp = nil
        }
    }
    
    // MARK: - Models
    
    public struct RaidSet: Content, Equatable, Sendable {
        public let uniqueId: String
        public let name: String
        public let type: String
        public let status: String
        public let size: Int64
        public let deviceNode: String
        public let rebuild: String
        public let members: [RaidMember]
        
        public init(
            uniqueId: String,
            name: String,
            type: String,
            status: String,
            size: Int64,
            deviceNode: String,
            rebuild: String,
            members: [RaidMember]
        ) {
            self.uniqueId = uniqueId
            self.name = name
            self.type = type
            self.status = status
            self.size = size
            self.deviceNode = deviceNode
            self.rebuild = rebuild
            self.members = members
        }
    }
    
    public struct RaidMember: Content, Equatable, Sendable {
        public let index: Int
        public let deviceNode: String
        public let uuid: String
        public let status: String
        public let size: Int64
        
        public init(
            index: Int,
            deviceNode: String,
            uuid: String,
            status: String,
            size: Int64
        ) {
            self.index = index
            self.deviceNode = deviceNode
            self.uuid = uuid
            self.status = status
            self.size = size
        }
    }
    
    // MARK: - Request/Response Models
    
    public struct CreateRaidRequest: Content {
        public let type: String
        public let name: String
        public let disks: [String]
    }
    
    public struct AddMemberRequest: Content {
        public let disk: String
        public let asSpare: Bool?
    }
    
    public struct RemoveMemberRequest: Content {
        public let disk: String
    }
    
    public struct RepairRaidRequest: Content {
        public let disk: String
    }
    
    // MARK: - Initialization
    
    public init() {}
    
    // MARK: - Public Methods
    
    /// List all AppleRAID sets
    public func listRaids() async throws -> [RaidSet] {
        if let cached = await Self.cache.get() {
            return cached
        }
        
        let output = try await runDiskutilRaid(["list"])
        let raids = parseRaidList(output: output)
        
        await Self.cache.set(raids)
        return raids
    }
    
    /// Get details for a specific RAID set
    public func getRaid(uniqueId: String) async throws -> RaidSet {
        let raids = try await listRaids()
        guard let raid = raids.first(where: { $0.uniqueId == uniqueId }) else {
            throw Abort(.notFound, reason: "RAID set not found: \(uniqueId)")
        }
        return raid
    }
    
    /// Create a new RAID set
    public func createRaid(type: String, name: String, disks: [String]) async throws -> RaidSet {
        let validTypes = ["mirror", "stripe", "concat"]
        guard validTypes.contains(type.lowercased()) else {
            throw Abort(.badRequest, reason: "Invalid RAID type. Supported: mirror, stripe, concat")
        }
        
        guard !name.isEmpty && !name.contains(" ") else {
            throw Abort(.badRequest, reason: "Invalid RAID name")
        }
        
        guard disks.count >= 2 else {
            throw Abort(.badRequest, reason: "At least 2 disks are required")
        }
        
        var args = ["create", type, name]
        args.append(contentsOf: disks)
        
        _ = try await runDiskutilRaid(args)
        await Self.cache.invalidate()
        
        let raids = try await listRaids()
        guard let newRaid = raids.first(where: { $0.name == name }) else {
            throw Abort(.internalServerError, reason: "RAID created but not found in list")
        }
        return newRaid
    }
    
    /// Delete a RAID set
    public func deleteRaid(uniqueId: String) async throws {
        _ = try await runDiskutilRaid(["delete", uniqueId])
        await Self.cache.invalidate()
    }
    
    /// Add a member or spare disk to an existing RAID
    public func addMember(raidId: String, disk: String, asSpare: Bool) async throws {
        var args = ["add"]
        if asSpare {
            args.append("spare")
        } else {
            args.append("member")
        }
        args.append(disk)
        args.append(raidId)
        
        _ = try await runDiskutilRaid(args)
        await Self.cache.invalidate()
    }
    
    /// Remove a member from a RAID set
    public func removeMember(raidId: String, disk: String) async throws {
        _ = try await runDiskutilRaid(["remove", disk, raidId])
        await Self.cache.invalidate()
    }
    
    /// Repair a degraded mirror RAID
    public func repairMirror(raidId: String, disk: String) async throws {
        _ = try await runDiskutilRaid(["repairMirror", raidId, disk])
        await Self.cache.invalidate()
    }
    
    /// Update RAID settings (e.g., auto-rebuild)
    public func updateRaid(raidId: String, autoRebuild: Bool?) async throws {
        var args = ["update"]
        if let auto = autoRebuild {
            args.append("AutoRebuild")
            args.append(auto ? "yes" : "no")
        }
        args.append(raidId)
        
        _ = try await runDiskutilRaid(args)
        await Self.cache.invalidate()
    }
    
    // MARK: - Private Helpers
    
    private func runDiskutilRaid(_ arguments: [String]) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let process = Process()
                process.executableURL = URL(fileURLWithPath: "/usr/sbin/diskutil")
                process.arguments = ["appleRAID"] + arguments
                
                let stdoutPipe = Pipe()
                let stderrPipe = Pipe()
                process.standardOutput = stdoutPipe
                process.standardError = stderrPipe
                
                do {
                    try process.run()
                    process.waitUntilExit()
                    
                    let stdoutData = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
                    let stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()
                    let output = String(data: stdoutData, encoding: .utf8) ?? ""
                    
                    if process.terminationStatus != 0 {
                        let errorMsg = String(data: stderrData, encoding: .utf8) ?? "Unknown error"
                        continuation.resume(throwing: Abort(.internalServerError, reason: "diskutil appleRAID failed: \(errorMsg)"))
                    } else {
                        continuation.resume(returning: output)
                    }
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }
    
    /// Parse the output of `diskutil appleRAID list`
    private func parseRaidList(output: String) -> [RaidSet] {
        var raids: [RaidSet] = []
        let lines = output.components(separatedBy: .newlines)
        
        var currentRaid: (
            name: String?,
            uniqueId: String?,
            type: String?,
            status: String?,
            size: Int64?,
            deviceNode: String?,
            rebuild: String?,
            members: [RaidMember]
        ) = (nil, nil, nil, nil, nil, nil, nil, [])
        
        var inMemberSection = false
        
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            
            // Detect separator line (start of new RAID set or end)
            if trimmed.hasPrefix("===") {
                // If we have a complete RAID, save it
                if let name = currentRaid.name,
                   let uniqueId = currentRaid.uniqueId,
                   let type = currentRaid.type,
                   let status = currentRaid.status,
                   let size = currentRaid.size,
                   let deviceNode = currentRaid.deviceNode {
                    let raid = RaidSet(
                        uniqueId: uniqueId,
                        name: name,
                        type: type,
                        status: status,
                        size: size,
                        deviceNode: deviceNode,
                        rebuild: currentRaid.rebuild ?? "unknown",
                        members: currentRaid.members
                    )
                    raids.append(raid)
                }
                // Reset for next RAID
                currentRaid = (nil, nil, nil, nil, nil, nil, nil, [])
                inMemberSection = false
                continue
            }
            
            // Detect member section header
            if trimmed.hasPrefix("#") && trimmed.contains("DevNode") {
                inMemberSection = true
                continue
            }
            
            // Detect member section separator
            if trimmed.hasPrefix("---") {
                continue
            }
            
            // Parse RAID properties
            if let colonIndex = trimmed.firstIndex(of: ":") {
                let key = String(trimmed[..<colonIndex]).trimmingCharacters(in: .whitespaces)
                let value = String(trimmed[trimmed.index(after: colonIndex)...]).trimmingCharacters(in: .whitespaces)
                
                switch key {
                case "Name":
                    currentRaid.name = value
                case "Unique ID":
                    currentRaid.uniqueId = value
                case "Type":
                    currentRaid.type = value
                case "Status":
                    currentRaid.status = value
                case "Size":
                    currentRaid.size = parseSize(value)
                case "Device Node":
                    currentRaid.deviceNode = value.replacingOccurrences(of: "/dev/", with: "")
                case "Rebuild":
                    currentRaid.rebuild = value
                default:
                    break
                }
            }
            
            // Parse member lines (format: "0  disk10s2  UUID  Status  Size")
            if inMemberSection && !trimmed.isEmpty {
                let parts = trimmed.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
                if parts.count >= 5,
                   let index = Int(parts[0]) {
                    let member = RaidMember(
                        index: index,
                        deviceNode: parts[1],
                        uuid: parts[2],
                        status: parts[3],
                        size: Int64(parts[4]) ?? 0
                    )
                    currentRaid.members.append(member)
                }
            }
        }
        
        return raids
    }
    
    /// Parse size string (e.g., "16.0 TB (16000556662784 Bytes)") to bytes
    private func parseSize(_ sizeString: String) -> Int64 {
        // Try to extract bytes from parentheses first
        if let startParen = sizeString.firstIndex(of: "("),
           let endParen = sizeString.firstIndex(of: ")") {
            let bytesStr = String(sizeString[sizeString.index(after: startParen)..<endParen])
                .replacingOccurrences(of: " Bytes", with: "")
                .replacingOccurrences(of: ",", with: "")
            if let bytes = Int64(bytesStr) {
                return bytes
            }
        }
        
        // Fallback: parse human-readable format
        let parts = sizeString.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
        guard parts.count >= 2,
              let number = Double(parts[0]) else {
            return 0
        }
        
        let unit = parts[1].uppercased()
        let multiplier: Double
        switch unit {
        case "TB": multiplier = 1_000_000_000_000
        case "GB": multiplier = 1_000_000_000
        case "MB": multiplier = 1_000_000
        case "KB": multiplier = 1_000
        default: multiplier = 1
        }
        
        return Int64(number * multiplier)
    }
}
