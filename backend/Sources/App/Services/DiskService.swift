import Vapor
import Foundation

public struct DiskService: Sendable {
    
    // MARK: - Cache
    
    private static let cache = DiskCache()
    
    actor DiskCache {
        private var cachedDisks: [DiskInfo]?
        private var cacheTimestamp: Date?
        private let cacheTTL: TimeInterval = 5.0
        
        func get() -> [DiskInfo]? {
            guard let cached = cachedDisks,
                  let timestamp = cacheTimestamp,
                  Date().timeIntervalSince(timestamp) < cacheTTL else {
                return nil
            }
            return cached
        }
        
        func set(_ disks: [DiskInfo]) {
            cachedDisks = disks
            cacheTimestamp = Date()
        }
        
        func invalidate() {
            cachedDisks = nil
            cacheTimestamp = nil
        }
    }
    
    // MARK: - Models
    
    public struct DiskInfo: Content {
        public let deviceIdentifier: String
        public let volumeName: String?
        public let size: Int64
        public let deviceNode: String
        public let mountPoint: String?
        public let content: String?
        public var partitions: [DiskInfo]?
        public var isInternal: Bool
        public let isWholeDisk: Bool
        
        // Extended Metadata
        public var model: String?
        public var busProtocol: String?
        public var isVirtual: Bool
        public var isSnapshot: Bool = false
        public var apfsPhysicalStores: [String]?
        
        // Usage Stats
        public var freeSpace: Int64?
        public var totalSpace: Int64?
        
        // RAID Info
        public var raidSetId: String?
        public var isRaidMember: Bool = false
        
        public init(
            deviceIdentifier: String,
            volumeName: String? = nil,
            size: Int64,
            deviceNode: String,
            mountPoint: String? = nil,
            content: String? = nil,
            partitions: [DiskInfo]? = nil,
            isInternal: Bool = false,
            isWholeDisk: Bool = false,
            model: String? = nil,
            busProtocol: String? = nil,
            isVirtual: Bool = false,
            isSnapshot: Bool = false,
            apfsPhysicalStores: [String]? = nil,
            freeSpace: Int64? = nil,
            totalSpace: Int64? = nil,
            raidSetId: String? = nil,
            isRaidMember: Bool = false
        ) {
            self.deviceIdentifier = deviceIdentifier
            self.volumeName = volumeName
            self.size = size
            self.deviceNode = deviceNode
            self.mountPoint = mountPoint
            self.content = content
            self.partitions = partitions
            self.isInternal = isInternal
            self.isWholeDisk = isWholeDisk
            self.model = model
            self.busProtocol = busProtocol
            self.isVirtual = isVirtual
            self.isSnapshot = isSnapshot
            self.apfsPhysicalStores = apfsPhysicalStores
            self.freeSpace = freeSpace
            self.totalSpace = totalSpace
            self.raidSetId = raidSetId
            self.isRaidMember = isRaidMember
        }
    }
    
    // MARK: - Initialization
    
    public init() {}
    
    // MARK: - Public Methods
    
    /// List all disks with enhanced hierarchy and metadata
    public func listDisks() async throws -> [DiskInfo] {
        // 检查缓存
        if let cached = await Self.cache.get() {
            return cached
        }
        
        // 1. Get raw list from diskutil
        let listOutput = try await runDiskutil(["list", "-plist"])
        var (disks, wholeDiskIds) = try parseDiskList(plistData: listOutput)
        
        // 2. Enhance metadata for Whole Disks (Roots)
        // We fetching info for ALL whole disks to get Model, Protocol, and Virtual status
        disks = await fetchMetadata(for: disks, wholeDiskIds: wholeDiskIds)
        
        // 3. Reconstruct Hierarchy (Link APFS Containers to Physical Stores)
        disks = reconstructHierarchy(disks)
        
        // 4. Default Sort: Internal first, then External, then Virtual
        let result = disks.sorted {
            if $0.isInternal != $1.isInternal { return $0.isInternal }
            if $0.isVirtual != $1.isVirtual { return !$0.isVirtual } // Virtual last
            return $0.deviceIdentifier < $1.deviceIdentifier
        }
        
        // 更新缓存
        await Self.cache.set(result)
        return result
    }
    
    /// Get detailed info for a specific disk using `diskutil info -plist`
    public func getDiskInfo(id: String) async throws -> [String: String] {
        let output = try await runDiskutil(["info", "-plist", id])
        return try parseDiskInfo(plistData: output)
    }
    
    /// Mount a disk
    public func mount(id: String) async throws {
        _ = try await runDiskutil(["mount", id])
        await Self.cache.invalidate()
    }
    
    /// Unmount a disk
    public func unmount(id: String) async throws {
        _ = try await runDiskutil(["unmount", id])
        await Self.cache.invalidate()
    }
    
    /// Eject a disk
    public func eject(id: String) async throws {
        _ = try await runDiskutil(["eject", id])
        await Self.cache.invalidate()
    }
    
    /// Erase/Format a disk or volume
    /// - Parameters:
    ///   - id: Device identifier (e.g., disk2s1)
    ///   - format: Filesystem format (e.g., APFS, ExFAT, MS-DOS)
    ///   - name: New volume name
    public func erase(id: String, format: String, name: String) async throws {
        // Validating format to prevent command injection
        let validFormats = ["APFS", "ExFAT", "MS-DOS", "HFS+"]
        guard validFormats.contains(format) else {
            throw Abort(.badRequest, reason: "Invalid format. Supported: \(validFormats.joined(separator: ", "))")
        }
        
        // Basic validation for name
        guard !name.contains("\"") && !name.contains("'") && !name.isEmpty else {
             throw Abort(.badRequest, reason: "Invalid volume name")
        }
        
        // Determine if we are erasing a whole disk or just a volume
        // Ideally we should check if 'id' is a physical disk or a slice, but diskutil 'eraseDisk' vs 'eraseVolume' handles this.
        // For simplicity and safety, let's stick to eraseVolume which is safer for partitions.
        // If users want to erase the whole disk, they should likely use 'eraseDisk', but that requires more rigorous checks.
        // Let's implement 'eraseVolume' for now as it's safer.
        // TODO: Support 'eraseDisk' if needed for full initialization.
        
        _ = try await runDiskutil(["eraseVolume", format, name, id])
        await Self.cache.invalidate()
    }
    
    // MARK: - Private Helpers
    
    private func runDiskutil(_ arguments: [String]) async throws -> Data {
        try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let process = Process()
                process.executableURL = URL(fileURLWithPath: "/usr/sbin/diskutil")
                process.arguments = arguments
                
                let stdoutPipe = Pipe()
                let stderrPipe = Pipe()
                process.standardOutput = stdoutPipe
                process.standardError = stderrPipe
                
                do {
                    try process.run()
                    process.waitUntilExit()
                    
                    let stdoutData = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
                    let stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()
                    
                    if process.terminationStatus != 0 {
                        let errorMsg = String(data: stderrData, encoding: .utf8) ?? "Unknown error"
                        continuation.resume(throwing: Abort(.internalServerError, reason: "diskutil failed: \(errorMsg)"))
                    } else {
                        continuation.resume(returning: stdoutData)
                    }
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }
    
    // Returns (All Disks Flat List, Set of WholeDisk Identifiers)
    private func parseDiskList(plistData: Data) throws -> ([DiskInfo], Set<String>) {
        guard let plist = try? PropertyListSerialization.propertyList(from: plistData, options: [], format: nil) as? [String: Any],
              let allDisksAndPartitions = plist["AllDisksAndPartitions"] as? [[String: Any]],
              let wholeDisksData = plist["WholeDisks"] as? [String] else {
            throw Abort(.internalServerError, reason: "Failed to parse diskutil list output")
        }
        
        let wholeDiskIds = Set(wholeDisksData)
        let disks = allDisksAndPartitions.compactMap { parseDiskEntry($0, wholeDiskIds: wholeDiskIds) }
        return (disks, wholeDiskIds)
    }
    
    private func parseDiskEntry(_ entry: [String: Any], wholeDiskIds: Set<String>) -> DiskInfo? {
        guard let deviceIdentifier = entry["DeviceIdentifier"] as? String,
              let size = entry["Size"] as? Int64 else {
            return nil
        }
        
        let volumeName = entry["VolumeName"] as? String
        let content = entry["Content"] as? String
        let mountPoint = entry["MountPoint"] as? String
        let isInternal = entry["OSInternal"] as? Bool ?? false
        let isWholeDisk = wholeDiskIds.contains(deviceIdentifier)
        
        // Parse APFS Physical Stores to link containers later
        var apfsPhysicalStores: [String]? = nil
        if let stores = entry["APFSPhysicalStores"] as? [[String: String]] {
            apfsPhysicalStores = stores.compactMap { $0["DeviceIdentifier"] }
        }
        
        var allChildren: [DiskInfo] = []
        if let partitionsData = entry["Partitions"] as? [[String: Any]] {
            allChildren.append(contentsOf: partitionsData.compactMap { parseDiskEntry($0, wholeDiskIds: wholeDiskIds) })
        }
        if let volumesData = entry["APFSVolumes"] as? [[String: Any]] {
            allChildren.append(contentsOf: volumesData.compactMap { parseDiskEntry($0, wholeDiskIds: wholeDiskIds) })
        }
        
        let partitions = allChildren.isEmpty ? nil : allChildren
        
        // Check if this partition is a RAID member
        let isRaidMember = content == "Apple_RAID"
        
        return DiskInfo(
            deviceIdentifier: deviceIdentifier,
            volumeName: volumeName,
            size: size,
            deviceNode: "/dev/" + deviceIdentifier,
            mountPoint: mountPoint,
            content: content,
            partitions: partitions,
            isInternal: isInternal,
            isWholeDisk: isWholeDisk,
            isSnapshot: entry["APFSSnapshot"] as? Bool ?? false,
            apfsPhysicalStores: apfsPhysicalStores,
            isRaidMember: isRaidMember
        )
    }
    
    private func fetchMetadata(for disks: [DiskInfo], wholeDiskIds: Set<String>) async -> [DiskInfo] {
        return await withTaskGroup(of: (Int, DiskInfo).self) { group in
            for (index, disk) in disks.enumerated() {
                group.addTask {
                    var updatedDisk = disk
                    // Fetch for roots OR if it has a VolumeName/MountPoint OR if it's an APFS container/volume
                    let isAPFS = disk.content?.contains("APFS") ?? false
                    if disk.isWholeDisk || disk.volumeName != nil || disk.mountPoint != nil || isAPFS {
                        try? await updatedDisk.updateMetadata(using: self)
                    }
                    
                    // Filter out snapshots and empty children
                    if let children = updatedDisk.partitions {
                         updatedDisk.partitions = await self.fetchMetadata(for: children, wholeDiskIds: wholeDiskIds)
                             .filter { !$0.isSnapshot }
                    }
                    
                    return (index, updatedDisk)
                }
            }
            
            var result = disks
            for await (index, updatedDisk) in group {
                result[index] = updatedDisk
            }
            return result
        }
    }
    
    private func reconstructHierarchy(_ disks: [DiskInfo]) -> [DiskInfo] {
        var rootDisks = disks
        var indexesToRemove = Set<Int>()
        
        // APFS Containers often appear as separate roots but point to a physical partition
        // We move them to their respective parents.
        for i in 0..<rootDisks.count {
            guard let stores = rootDisks[i].apfsPhysicalStores, !stores.isEmpty else { continue }
            
            for storeId in stores {
                for j in 0..<rootDisks.count {
                    if i == j { continue }
                    
                    if let updatedParent = attachContainer(rootDisks[i], to: storeId, in: rootDisks[j]) {
                        rootDisks[j] = updatedParent
                        indexesToRemove.insert(i)
                        break
                    }
                }
            }
        }
        
        return rootDisks
            .enumerated()
            .filter { !indexesToRemove.contains($0.offset) }
            .map { $0.element }
    }
    
    // Recursive helper to find a partition by ID and attach the container as a child
    private func attachContainer(_ container: DiskInfo, to storeId: String, in disk: DiskInfo) -> DiskInfo? {
        var updatedDisk = disk
        
        if disk.deviceIdentifier == storeId {
            var parts = updatedDisk.partitions ?? []
            // Avoid duplicates
            if !parts.contains(where: { $0.deviceIdentifier == container.deviceIdentifier }) {
                parts.append(container)
            }
            updatedDisk.partitions = parts
            return updatedDisk
        }
        
        if let partitions = disk.partitions {
            var updatedPartitions = partitions
            var found = false
            for k in 0..<updatedPartitions.count {
                if let updatedChild = attachContainer(container, to: storeId, in: updatedPartitions[k]) {
                    updatedPartitions[k] = updatedChild
                    found = true
                    break
                }
            }
            if found {
                updatedDisk.partitions = updatedPartitions
                return updatedDisk
            }
        }
        
        return nil
    }
    
    private func parseDiskInfo(plistData: Data) throws -> [String: String] {
        guard let plist = try? PropertyListSerialization.propertyList(from: plistData, options: [], format: nil) as? [String: Any] else {
            throw Abort(.internalServerError, reason: "Failed to parse diskutil info output")
        }
        
        var result = [String: String]()
        for (key, value) in plist {
            result[key] = "\(value)"
        }
        
        if let internalVal = plist["Internal"] as? Bool { result["Internal"] = internalVal ? "true" : "false" }
        if let snapshot = plist["APFSSnapshot"] as? Bool { result["APFSSnapshot"] = snapshot ? "true" : "false" }
        
        return result
    }
}

extension DiskService.DiskInfo {
    mutating func updateMetadata(using service: DiskService) async throws {
        let info = try await service.runDiskutil(["info", "-plist", self.deviceIdentifier])
        let parsed = try service.parseDiskInfo(plistData: info)
        
        self.model = parsed["MediaName"]
        self.busProtocol = parsed["BusProtocol"]
        self.isVirtual = parsed["VirtualOrPhysical"] == "Virtual"
        
        if let freeStr = parsed["FreeSpace"], let free = Int64(freeStr), free > 0 {
            self.freeSpace = free
        } else if let apfsFreeStr = parsed["APFSContainerFree"], let apfsFree = Int64(apfsFreeStr) {
            // APFS Container free space is shared across volumes, but useful to show
            self.freeSpace = apfsFree
        }
        
        if let totalStr = parsed["TotalSize"], let total = Int64(totalStr) {
            self.totalSpace = total
        } else {
            self.totalSpace = self.size
        }
        
        if let internalStr = parsed["Internal"] {
             self.isInternal = internalStr == "true"
        }
        self.isSnapshot = parsed["APFSSnapshot"] == "true"
        
        // Improve name for APFS Containers
        if self.isVirtual && (self.model == nil || self.model == "" || self.model?.contains("APPLE SSD") == true || self.model == "AppleAPFSMedia") {
             if self.content == "Apple_APFS_Container" {
                 self.model = "APFS Container"
             }
        }
        
        // If it's a root physical disk, clarify it's the physical media
        if self.isWholeDisk && !self.isVirtual && self.model != nil {
             self.model = (self.model ?? "") + " (物理硬盘)"
        }

        // If it's a whole disk but not a container, we don't want to show usage info
        // (because physical disks often report 0 free space)
        if self.isWholeDisk && self.content != "Apple_APFS_Container" {
            self.freeSpace = nil
            self.totalSpace = nil
        }
    }
}
