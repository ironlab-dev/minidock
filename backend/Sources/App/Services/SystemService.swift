import Vapor
import Foundation

// Shared URLSession for external IP checks (defined outside actor to avoid isolation issues)
private let sharedIPCheckSession: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 5
    config.timeoutIntervalForResource = 10
    config.urlCache = nil
    config.requestCachePolicy = .reloadIgnoringLocalCacheData
    return URLSession(configuration: config)
}()

public actor SystemService: MiniDockService {
    public let id: String = "system-core"
    public let name: String = "macOS System"
    public let type: ServiceType = .system
    
    public struct ScreenSharingStatus: Content, Sendable {
        public let enabled: Bool
        public let listening: Bool
        public let processName: String?
        public let primaryIP: String?
    }

    private var lastCPUTime: host_cpu_load_info?
    private var lastNetworkStats: (in: UInt64, out: UInt64)?
    private var lastNetworkTime: Date?
    
    private struct ProcessNetworkHistory {
        var inBytes: Int64
        var outBytes: Int64
        var timestamp: Date
    }
    private var processNetworkHistory: [String: ProcessNetworkHistory] = [:]
    // Configuration constants
    private let maxNetworkHistoryEntries = 100
    private let cacheTTLSeconds: TimeInterval = 300  // 5 minutes
    private let maxTopProcesses = 15
    private let networkSampleIntervalSeconds: TimeInterval = 10
    private let historyCleanupThresholdSeconds: TimeInterval = 60
    
    private var cpuModelName: String?
    
    // Public IP cache
    private var cachedPublicIP: String?
    private var lastPublicIPFetch: Date?
    
    // Dual IP cache (domestic and overseas)
    private var cachedPublicIPDomestic: String?
    private var cachedPublicIPOverseas: String?
    private var lastPublicIPDomesticFetch: Date?
    private var lastPublicIPOverseasFetch: Date?

    private let logger: Logger

    public init(logger: Logger) {
        self.logger = logger
    }
    
    public func getInfo(app: Application) async throws -> ServiceInfo {
        let stats = try await getStats()
        var stringStats: [String: String] = [:]
        for (key, value) in stats {
            stringStats[key] = "\(value)"
        }
        
        return ServiceInfo(
            id: id,
            name: name,
            type: type,
            status: .running,
            description: "Native macOS system orchestration and monitoring.",
            stats: stringStats
        )
    }
    
    public func getItems(app: Application) async throws -> [ServiceItem] {
        let metrics = try await getStats()
        return [
            ServiceItem(id: "cpu", name: "CPU Cores", status: "running", metadata: ["count": "\(metrics["processorCount"] ?? 0)"]),
            ServiceItem(id: "memory", name: "Memory", status: "running", metadata: ["total": "\(metrics["memorySize"] ?? 0)"]),
            ServiceItem(id: "host", name: "Hostname", status: "running", metadata: ["name": "\(metrics["hostName"] ?? "Unknown")"])
        ]
    }
    
    public func getStatus() async throws -> ServiceStatus {
        return .running
    }
    
    public func start(app: Application) async throws { }
    public func stop(app: Application) async throws {
        let script = "tell application \"System Events\" to shut down"
        _ = try await runAppleScript(script, app: app)
    }
    
    public func restart(app: Application) async throws {
        let script = "tell application \"System Events\" to restart"
        _ = try await runAppleScript(script, app: app)
    }
    
    private func runAppleScript(_ script: String, app: Application) async throws -> String {
        let escapedScript = script.replacingOccurrences(of: "'", with: "'\\''")
        let result = try await Shell.run("/usr/bin/osascript -e '\(escapedScript)'", app: app, track: true)
        return result.output
    }
    
    public func getStats() async throws -> [String: Any] {
        let start = Date()
        let processInfo = ProcessInfo.processInfo
        let cpuModel = try await getCPUModelName()
        let uptime = processInfo.systemUptime
        let duration = Date().timeIntervalSince(start)
        
        if duration > 0.5 {
            logger.warning("[SystemService] getStats took \(String(format: "%.3f", duration))s - high latency detected")
        }
        
        return [
            "uptime": uptime,
            "processorCount": processInfo.processorCount,
            "activeProcessorCount": processInfo.activeProcessorCount,
            "memorySize": processInfo.physicalMemory,
            "cpuModel": cpuModel,
            "hostName": Host.current().localizedName ?? "Unknown"
        ]
    }

    public func getCPUModelName() async throws -> String {
        if let cached = cpuModelName { return cached }
        
        var name = (try? await Shell.run("/usr/sbin/sysctl -n machdep.cpu.brand_string"))?.output
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        
        if name.isEmpty {
            // Fallback for some ARM models where brand_string might be empty
            name = (try? await Shell.run("/usr/sbin/sysctl -n hw.model"))?.output
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? "Apple Silicon"
        }
        
        self.cpuModelName = name
        return name
    }

    public struct NetworkInterface: Content {
        public let device: String
        public let name: String // e.g., "Wi-Fi"
        public let address: String?
        public let ipAddress: String?
        public let isActive: Bool
    }

    public func getPrimaryIP() async throws -> String? {
        let result = try await Shell.run("/sbin/ifconfig")
        let output = result.output
        guard !output.isEmpty else { return nil }
        
        let lines = output.components(separatedBy: .newlines)
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("inet ") {
                let parts = trimmed.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
                if parts.count >= 2 {
                    let ip = parts[1]
                    if ip != "127.0.0.1" {
                        return ip
                    }
                }
            }
        }
        return nil
    }
    


    public func getNetworkInterfaces() async throws -> [NetworkInterface] {
        guard let output = (try? await Shell.run("/usr/sbin/networksetup -listallhardwareports"))?.output, !output.isEmpty else {
            return []
        }
        
        var interfaces: [NetworkInterface] = []
        let blocks = output.components(separatedBy: "\n\n")
        
        for block in blocks {
            let lines = block.components(separatedBy: .newlines)
            var name: String?
            var device: String?
            var address: String?
            var ipAddress: String?
            var isActive: Bool = false
            
            for line in lines {
                if line.hasPrefix("Hardware Port: ") {
                    name = line.replacingOccurrences(of: "Hardware Port: ", with: "").trimmingCharacters(in: .whitespaces)
                } else if line.hasPrefix("Device: ") {
                    device = line.replacingOccurrences(of: "Device: ", with: "").trimmingCharacters(in: .whitespaces)
                    // Once we have device name (en0, etc), we can try to find its IP and status
                    if let d = device {
                        let info = try? await getInterfaceInfo(d)
                        ipAddress = info?.ip
                        isActive = info?.active ?? false
                    }
                } else if line.hasPrefix("Ethernet Address: ") {
                    address = line.replacingOccurrences(of: "Ethernet Address: ", with: "").trimmingCharacters(in: .whitespaces)
                }
            }
            
            if let n = name, let d = device {
                interfaces.append(NetworkInterface(device: d, name: n, address: address, ipAddress: ipAddress, isActive: isActive))
            }
        }
        
        return interfaces
    }

    private func getInterfaceInfo(_ device: String) async throws -> (ip: String?, active: Bool) {
        guard let output = (try? await Shell.run("/sbin/ifconfig \(device)"))?.output, !output.isEmpty else {
            return (nil, false)
        }
        
        var ip: String?
        var active = false
        
        let lines = output.components(separatedBy: .newlines)
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("inet ") {
                let parts = trimmed.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
                if parts.count >= 2 {
                    ip = parts[1]
                }
            } else if trimmed.lowercased().hasPrefix("status:") {
                if trimmed.lowercased().contains("active") && !trimmed.lowercased().contains("inactive") {
                    active = true
                }
            }
        }
        return (ip, active)
    }

    private func checkScreenSharingViaSystemPreferences() -> Bool {
        // Check system preferences plist for screen sharing status
        // Only use plist file reads (no Process calls to avoid blocking actor)
        let plistPath = "/Library/Preferences/com.apple.RemoteManagement.plist"
        let userPlistPath = NSString(string: NSHomeDirectory()).appendingPathComponent("Library/Preferences/com.apple.RemoteManagement.plist")
        
        // Try to read system plist
        if let plistData = NSDictionary(contentsOfFile: plistPath) {
            // Check RemoteDesktopEnabled (traditional screen sharing)
            if let enabled = plistData["RemoteDesktopEnabled"] as? Bool, enabled {
                return true
            }
            // Check VNCLegacyConnectionsEnabled (Remote Management with VNC)
            if let vncEnabled = plistData["VNCLegacyConnectionsEnabled"] as? Bool, vncEnabled {
                return true
            }
            // Check if Remote Management is enabled (ARD_AllLocalUsers or LoadRemoteManagementMenuExtra)
            if let loadMenuExtra = plistData["LoadRemoteManagementMenuExtra"] as? Bool, loadMenuExtra {
                // If menu extra is loaded, Remote Management is likely enabled
                return true
            }
        }
        
        // Try user plist
        if let userPlistData = NSDictionary(contentsOfFile: userPlistPath) {
            if let enabled = userPlistData["RemoteDesktopEnabled"] as? Bool, enabled {
                return true
            }
            if let vncEnabled = userPlistData["VNCLegacyConnectionsEnabled"] as? Bool, vncEnabled {
                return true
            }
        }
        
        return false
    }
    
    public nonisolated func getScreenSharingStatus(app: Application) async throws -> Bool {
        app.logger.info("[SystemService] getScreenSharingStatus called, starting check: system preferences")
        // Simplified check: Only use system preferences to avoid blocking
        // System preferences check is fast and reliable for detecting if screen sharing is enabled
        let prefsEnabled = checkScreenSharingViaSystemPreferencesNonisolated()
        if prefsEnabled {
            app.logger.info("[SystemService] Screen sharing detected via system preferences")
            return true
        }
        
        app.logger.info("[SystemService] Screen sharing not detected via system preferences")
        return false
    }
    
    private nonisolated func checkScreenSharingViaSystemPreferencesNonisolated() -> Bool {
        // Check system preferences plist for screen sharing status
        // Only use plist file reads (no Process calls to avoid blocking actor)
        let plistPath = "/Library/Preferences/com.apple.RemoteManagement.plist"
        let userPlistPath = NSString(string: NSHomeDirectory()).appendingPathComponent("Library/Preferences/com.apple.RemoteManagement.plist")
        
        // Try to read system plist
        if let plistData = NSDictionary(contentsOfFile: plistPath) {
            // Check RemoteDesktopEnabled (traditional screen sharing)
            if let enabled = plistData["RemoteDesktopEnabled"] as? Bool, enabled {
                return true
            }
            // Check VNCLegacyConnectionsEnabled (Remote Management with VNC)
            if let vncEnabled = plistData["VNCLegacyConnectionsEnabled"] as? Bool, vncEnabled {
                return true
            }
            // Check if Remote Management is enabled (ARD_AllLocalUsers or LoadRemoteManagementMenuExtra)
            if let loadMenuExtra = plistData["LoadRemoteManagementMenuExtra"] as? Bool, loadMenuExtra {
                // If menu extra is loaded, Remote Management is likely enabled
                return true
            }
        }
        
        // Try user plist
        if let userPlistData = NSDictionary(contentsOfFile: userPlistPath) {
            if let enabled = userPlistData["RemoteDesktopEnabled"] as? Bool, enabled {
                return true
            }
            if let vncEnabled = userPlistData["VNCLegacyConnectionsEnabled"] as? Bool, vncEnabled {
                return true
            }
        }
        
        return false
    }

    public func isVNCListening(app: Application) async throws -> Bool {
        do {
            guard let output = (try? await Shell.run("/usr/sbin/netstat -an -p tcp"))?.output, !output.isEmpty else {
                app.logger.warning("[SystemService] VNC Listening check: no output")
                return false
            }
            
            let lines = output.components(separatedBy: .newlines)
            
            // Check for port 5900 in various formats: .5900, :5900, *.5900, etc.
            for line in lines {
                let hasPort5900 = line.contains(".5900") || line.contains(":5900") || line.contains("*.5900")
                let hasListen = line.contains("LISTEN")
                
                if hasPort5900 && hasListen {
                    app.logger.info("[SystemService] VNC Listening check on 5900 (netstat): true")
                    return true
                }
            }
            
            app.logger.info("[SystemService] VNC Listening check on 5900 (netstat): false")
            return false
    }
    }

    public func getVNCProcessName() async throws -> String? {
        // Check via netstat for launchd
        if let netstatOutput = (try? await Shell.run("/usr/sbin/netstat -anv -p tcp"))?.output {
            if netstatOutput.contains(".5900") && netstatOutput.contains("LISTEN") {
                if netstatOutput.contains("launchd") {
                    return "macOS Screen Sharing (Idle)"
                }
            }
        }

        // Try lsof as well (works if MiniDock runs with enough privileges or process is user-owned)
        if let lsofOutput = (try? await Shell.run("/usr/sbin/lsof -i :5900 -sTCP:LISTEN -F c"))?.output {
            let lines = lsofOutput.components(separatedBy: .newlines)
            for line in lines {
                if line.hasPrefix("c") {
                    let name = String(line.dropFirst())
                    logger.info("[SystemService] VNC Process found (lsof): \(name)")
                    return name
                }
            }
        }
        
        return nil
    }
    
    public struct USBDevice: Content, Sendable {
        public let name: String
        public let vendorID: String?
        public let productID: String?
        public let serialNumber: String?
        public let manufacturer: String?
    }
    
    public struct LocalIPInfo: Content, Sendable {
        public let name: String
        public let address: String
        public let device: String
    }
    
    public struct IPInfo: Content, Sendable {
        public let localIP: String?
        public let publicIP: String?
        public let publicIPDomestic: String?
        public let publicIPOverseas: String?
        public let localIPs: [LocalIPInfo]
    }
    
    public func getExternalIP() async throws -> String? {
        // Backward compatibility: prefer domestic IP, fallback to overseas
        if let domestic = try? await getExternalIPDomestic() {
            return domestic
        }
        return try? await getExternalIPOverseas()
    }
    
    public func getExternalIPDomestic() async throws -> String? {
        // Check cache (5 minutes TTL)
        let cacheTTL = cacheTTLSeconds
        if let cached = cachedPublicIPDomestic,
           let lastFetch = lastPublicIPDomesticFetch,
           Date().timeIntervalSince(lastFetch) < cacheTTL {
            return cached
        }
        
        // IP detection services (tried in order, first success wins)
        let services = [
            "https://icanhazip.com",
            "https://api.ipify.org",
            "https://ifconfig.me/ip"
        ]
        
        for service in services {
            guard let url = URL(string: service) else { continue }
            do {
                let (data, response) = try await sharedIPCheckSession.data(from: url)
                
                // Check HTTP status
                if let httpResponse = response as? HTTPURLResponse,
                   (200...299).contains(httpResponse.statusCode) {
                    if let rawResponse = String(data: data, encoding: .utf8)?
                        .trimmingCharacters(in: .whitespacesAndNewlines),
                       !rawResponse.isEmpty {
                        // Extract IP from response (handles both plain IP and JSON format)
                        let ip = extractIPFromResponse(rawResponse)
                        if let ip = ip, !ip.isEmpty {
                            // Cache the result
                            cachedPublicIPDomestic = ip
                            lastPublicIPDomesticFetch = Date()
                            // Also update legacy cache for backward compatibility
                            cachedPublicIP = ip
                            lastPublicIPFetch = Date()
                            return ip
                        }
                    }
                }
            } catch {
                continue
            }
        }
        
        // If all services failed but we have cached value, return it even if expired
        if let cached = cachedPublicIPDomestic {
            return cached
        }
        
        return nil
    }
    
    private func extractIPFromResponse(_ response: String) -> String? {
        // Try to parse as JSON first (e.g., {"ip":"x.x.x.x"})
        if response.hasPrefix("{") {
            if let data = response.data(using: .utf8),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let ip = json["ip"] as? String {
                return ip.trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
        
        // Plain IP address - validate format
        let trimmed = response.trimmingCharacters(in: .whitespacesAndNewlines)
        let ipPattern = "^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$"
        if let regex = try? NSRegularExpression(pattern: ipPattern),
           regex.firstMatch(in: trimmed, range: NSRange(trimmed.startIndex..., in: trimmed)) != nil {
            return trimmed
        }
        
        return nil
    }
    
    public func getExternalIPOverseas() async throws -> String? {
        // Check cache (5 minutes TTL)
        let cacheTTL = cacheTTLSeconds
        if let cached = cachedPublicIPOverseas,
           let lastFetch = lastPublicIPOverseasFetch,
           Date().timeIntervalSince(lastFetch) < cacheTTL {
            return cached
        }
        
        // Overseas IP detection services (may go through proxy)
        let services = [
            "https://icanhazip.com",
            "https://ifconfig.me/ip",
            "https://api.ipify.org"
        ]
        
        for service in services {
            guard let url = URL(string: service) else { continue }
            do {
                let (data, response) = try await sharedIPCheckSession.data(from: url)
                
                // Check HTTP status
                if let httpResponse = response as? HTTPURLResponse,
                   (200...299).contains(httpResponse.statusCode) {
                    if let rawResponse = String(data: data, encoding: .utf8)?
                        .trimmingCharacters(in: .whitespacesAndNewlines),
                       !rawResponse.isEmpty {
                        // Extract IP from response (validates format)
                        let ip = extractIPFromResponse(rawResponse)
                        if let ip = ip, !ip.isEmpty {
                            // Cache the result
                            cachedPublicIPOverseas = ip
                            lastPublicIPOverseasFetch = Date()
                            return ip
                        }
                    }
                }
            } catch {
                continue
            }
        }
        
        // If all services failed but we have cached value, return it even if expired
        if let cached = cachedPublicIPOverseas {
            return cached
        }
        
        return nil
    }
    
    public func getIPInfo() async throws -> IPInfo {
        let interfaces = try await getNetworkInterfaces()
        let activeIPs: [LocalIPInfo] = interfaces.filter { $0.isActive && $0.ipAddress != nil }.compactMap {
            guard let ipAddress = $0.ipAddress else { return nil }
            return LocalIPInfo(name: $0.name, address: ipAddress, device: $0.device)
        }
        
        let localIP = try await getPrimaryIP()
        
        // Fetch both domestic and overseas IPs in parallel
        async let domesticIP = getExternalIPDomestic()
        async let overseasIP = getExternalIPOverseas()
        
        let publicIPDomestic = try? await domesticIP
        let publicIPOverseas = try? await overseasIP
        
        // For backward compatibility, prefer domestic IP
        let publicIP = publicIPDomestic ?? publicIPOverseas
        
        return IPInfo(
            localIP: localIP,
            publicIP: publicIP,
            publicIPDomestic: publicIPDomestic,
            publicIPOverseas: publicIPOverseas,
            localIPs: activeIPs
        )
    }
    
    // Internal helper for JSON decoding
    private struct SPUSBItem: Decodable {
        let _name: String
        let vendor_id: String?
        let product_id: String?
        let serial_num: String?
        let manufacturer: String?
        let _items: [SPUSBItem]?
        
        enum CodingKeys: String, CodingKey {
            case _name
            case vendor_id
            case product_id
            case serial_num
            case manufacturer
            case _items
        }
    }
    
    private struct SPUSBDataTypeRoot: Decodable {
        let SPUSBDataType: [SPUSBItem]
    }
    
    public func getUSBDevices() async throws -> [USBDevice] {
        guard let output = (try? await Shell.run("/usr/sbin/system_profiler SPUSBDataType -json"))?.output, !output.isEmpty else {
            return []
        }
        
        let data = output.data(using: .utf8) ?? Data()
        let decoder = JSONDecoder()
        guard let root = try? decoder.decode(SPUSBDataTypeRoot.self, from: data) else {
            return []
        }
        
        var devices: [USBDevice] = []
        func recurse(_ items: [SPUSBItem]) {
            for item in items {
                // Filter out Hubs often, but maybe user wants to pass through a hub?
                // Usually we want actual devices. Let's keep everything that has IDs.
                if let vid = item.vendor_id, let pid = item.product_id {
                    // Clean up IDs: "0x1234 (Vendor Name)" -> "0x1234"
                    // Usually they come as "0x1234".
                    let cleanVID = vid.components(separatedBy: " ").first?.trimmingCharacters(in: .whitespaces)
                    let cleanPID = pid.components(separatedBy: " ").first?.trimmingCharacters(in: .whitespaces)
                    
                    devices.append(USBDevice(
                        name: item._name,
                        vendorID: cleanVID,
                        productID: cleanPID,
                        serialNumber: item.serial_num,
                        manufacturer: item.manufacturer
                    ))
                }
                
                if let children = item._items {
                    recurse(children)
                }
            }
        }
        
        recurse(root.SPUSBDataType)
        return devices
    }
    
    public func broadcastMetrics(app: Application) async {
        do {
            let cpuUsage = try await getCPUUsage()
            let memUsage = try await getMemoryUsage()
            let (netIn, netOut) = try await getNetworkRates(app: app)
            let cpuModel = try await getCPUModelName()
            let memTotal = ProcessInfo.processInfo.physicalMemory
            let uptime = ProcessInfo.processInfo.systemUptime

            let data = "{\"cpu\": \(cpuUsage), \"mem\": \(memUsage), \"netIn\": \(netIn), \"netOut\": \(netOut), \"cpuModel\": \"\(cpuModel)\", \"memTotal\": \(memTotal), \"uptime\": \(uptime)}"
            app.webSocketManager.broadcast(event: "system_metrics", data: data)
        } catch {
            app.logger.error("Failed to broadcast system metrics: \(error)")
        }
    }
    
    public func getCPUUsage() async throws -> Double {
        var hostInfo = host_cpu_load_info()
        var count = mach_msg_type_number_t(MemoryLayout<host_cpu_load_info>.size / MemoryLayout<integer_t>.size)
        
        let result = withUnsafeMutablePointer(to: &hostInfo) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, $0, &count)
            }
        }
        
        guard result == KERN_SUCCESS else { return 0.0 }
        
        guard let last = lastCPUTime else {
            lastCPUTime = hostInfo
            return 0.0
        }
        
        let userDiff = Double(hostInfo.cpu_ticks.0 - last.cpu_ticks.0)
        let sysDiff = Double(hostInfo.cpu_ticks.1 - last.cpu_ticks.1)
        let idleDiff = Double(hostInfo.cpu_ticks.2 - last.cpu_ticks.2)
        let niceDiff = Double(hostInfo.cpu_ticks.3 - last.cpu_ticks.3)
        
        let totalDiff = userDiff + sysDiff + idleDiff + niceDiff
        lastCPUTime = hostInfo
        
        guard totalDiff > 0 else { return 0.0 }
        return ((userDiff + sysDiff + niceDiff) / totalDiff) * 100.0
    }
    
    public func getMemoryUsage() async throws -> Double {
        var stats = vm_statistics64()
        var count = mach_msg_type_number_t(MemoryLayout<vm_statistics64>.size / MemoryLayout<integer_t>.size)
        
        let result = withUnsafeMutablePointer(to: &stats) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics64(mach_host_self(), HOST_VM_INFO64, $0, &count)
            }
        }
        
        guard result == KERN_SUCCESS else { return 0.0 }
        
        var pageSize: vm_size_t = 0
        host_page_size(mach_host_self(), &pageSize)
        let pageSize64 = UInt64(pageSize)
        
        let active = UInt64(stats.active_count) * pageSize64
        let inactive = UInt64(stats.inactive_count) * pageSize64
        let wired = UInt64(stats.wire_count) * pageSize64
        let compressed = UInt64(stats.compressor_page_count) * pageSize64
        
        let used = active + inactive + wired + compressed
        let total = ProcessInfo.processInfo.physicalMemory
        
        return (Double(used) / Double(total)) * 100.0
    }
    
    public func getNetworkRates(app: Application) async throws -> (in: Double, out: Double) {
        let currentStats = try await getNetworkBytes(app: app)
        let currentTime = Date()
        
        guard let lastStats = lastNetworkStats, let lastTime = lastNetworkTime else {
            lastNetworkStats = currentStats
            lastNetworkTime = currentTime
            return (0.0, 0.0)
        }
        
        let timeInterval = currentTime.timeIntervalSince(lastTime)
        guard timeInterval > 0 else { return (0.0, 0.0) }
        
        // Handle 32-bit wrap-around if necessary (though currentStats are UInt64, 
        // they come from 32-bit if_data fields)
        let inDiff = currentStats.in >= lastStats.in ? currentStats.in - lastStats.in : (UInt64(UInt32.max) - lastStats.in + currentStats.in + 1)
        let outDiff = currentStats.out >= lastStats.out ? currentStats.out - lastStats.out : (UInt64(UInt32.max) - lastStats.out + currentStats.out + 1)
        
        let netInRate = Double(inDiff) / timeInterval
        let netOutRate = Double(outDiff) / timeInterval
        
        lastNetworkStats = currentStats
        lastNetworkTime = currentTime
        
        return (netInRate, netOutRate)
    }
    
    private func getNetworkBytes(app: Application) async throws -> (in: UInt64, out: UInt64) {
        do {
            guard let output = (try? await Shell.run("/usr/sbin/netstat -ibn"))?.output, !output.isEmpty else {
                return (0, 0)
            }
            
            var totalIn: UInt64 = 0
            var totalOut: UInt64 = 0
            
            let lines = output.components(separatedBy: .newlines)
            for line in lines {
                let parts = line.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
                // We want lines with 3rd column starting with <Link#
                guard parts.count >= 6, parts[2].hasPrefix("<Link#") else { continue }
                
                let name = parts[0]
                // Exclude loopback
                if name == "lo0" { continue }
                
                // netstat output format varies if Address is present
                // Col 0: Name, Col 1: Mtu, Col 2: Network, Col 3: Address or Ipkts
                
                var inIdx = 6
                var outIdx = 9
                
                if parts[3].contains(":") || parts[3].contains(".") || parts[3].lowercased() == "none" {
                    // Address is present (e.g. MAC address)
                    inIdx = 6
                    outIdx = 9
                } else {
                    // Address is missing, everything shifted left
                    inIdx = 5
                    outIdx = 8
                }
                
                if parts.count > outIdx {
                    let ibytes = UInt64(parts[inIdx]) ?? 0
                    let obytes = UInt64(parts[outIdx]) ?? 0
                    
                    if ibytes > 0 || obytes > 0 {
                        // app.logger.info("DEBUG: netstat \(name) -> In: \(ibytes), Out: \(obytes)")
                        totalIn += ibytes
                        totalOut += obytes
                    }
                }
            }
            
            // app.logger.info("DEBUG: Total Net In: \(totalIn), Total Net Out: \(totalOut)")
            return (totalIn, totalOut)
        }
    }

    public func getTopProcesses(type: String) async throws -> [[String: String]] {
        let args: [String]
        if type == "cpu" {
             // -A: All processes, -c: executable name, -e: environment, -o: format, -r: sort by CPU
            args = ["-Aceo", "pcpu,comm", "-r"]
        } else {
             // -m: sort by memory
            args = ["-Aceo", "pmem,comm", "-m"]
        }
        
        let result = try await Shell.run("/bin/ps \(args.joined(separator: " "))")
        let output = result.output
        guard !output.isEmpty else { return [] }
        
        var results: [[String: String]] = []
        let lines = output.components(separatedBy: .newlines)
        
        // Skip header, take top 15
        let dataLines = lines.dropFirst().prefix(maxTopProcesses)
        
        for line in dataLines {
            let parts = line.trimmingCharacters(in: .whitespaces).components(separatedBy: .whitespaces).filter { !$0.isEmpty }
            guard parts.count >= 2 else { continue }
            
            let value = parts[0]
            // Join the rest as command name (spaces might be in app names)
            let name = parts.dropFirst().joined(separator: " ")
            
            results.append(["name": name, "value": value])
        }
        
        return results
    }

    public func getNetworkProcessDetails() async throws -> [[String: String]] {
        // nettop is interactive by default, -L 1 -P passes 1 sample and exits
        // -x: extended format (needed for full process names sometimes, but mainly bytes)
        // -J: specify columns
        // Note: nettop generally requires sudo for full details, but for user processes it might show some info.
        // However, in many containerized/sandbox envs this might fail or show empty.
        // We verified it works with `dev.sh` (user mode) for own processes.
        do {
            guard let output = (try? await Shell.run("/usr/bin/nettop -L 1 -P -x -J bytes_in,bytes_out"))?.output, !output.isEmpty else {
                return []
            }
            
            let currentTime = Date()
            var procStats: [String: (inBytes: Int64, outBytes: Int64)] = [:]
            
            let lines = output.components(separatedBy: .newlines)
            for line in lines {
                if line.isEmpty || line.starts(with: ",") { continue }
                
                let parts = line.components(separatedBy: ",")
                guard parts.count >= 3 else { continue }
                
                let nameWithPid = parts[0]
                let bytesInStr = parts[1]
                let bytesOutStr = parts[2]
                
                guard let bytesIn = Int64(bytesInStr), let bytesOut = Int64(bytesOutStr) else { continue }
                
                var cleanName = nameWithPid
                if let lastDotIndex = nameWithPid.lastIndex(of: ".") {
                    cleanName = String(nameWithPid[..<lastDotIndex])
                }
                
                let total = bytesIn + bytesOut
                if total > 0 {
                    if let existing = procStats[cleanName] {
                        procStats[cleanName] = (existing.inBytes + bytesIn, existing.outBytes + bytesOut)
                    } else {
                        procStats[cleanName] = (bytesIn, bytesOut)
                    }
                }
            }
            
            var result: [[String: String]] = []
            
            for (processName, currentStats) in procStats {
                let inSpeed: Double
                let outSpeed: Double
                
                if let history = processNetworkHistory[processName] {
                    let timeInterval = currentTime.timeIntervalSince(history.timestamp)
                    if timeInterval > 0 && timeInterval < networkSampleIntervalSeconds {
                        let inDiff = currentStats.inBytes >= history.inBytes 
                            ? currentStats.inBytes - history.inBytes 
                            : 0
                        let outDiff = currentStats.outBytes >= history.outBytes 
                            ? currentStats.outBytes - history.outBytes 
                            : 0
                        
                        inSpeed = max(0, Double(inDiff) / timeInterval)
                        outSpeed = max(0, Double(outDiff) / timeInterval)
                    } else {
                        inSpeed = 0
                        outSpeed = 0
                    }
                } else {
                    inSpeed = 0
                    outSpeed = 0
                }
                
                processNetworkHistory[processName] = ProcessNetworkHistory(
                    inBytes: currentStats.inBytes,
                    outBytes: currentStats.outBytes,
                    timestamp: currentTime
                )
                
                let totalSpeed = inSpeed + outSpeed
                result.append([
                    "name": processName,
                    "in": "\(Int64(inSpeed))",
                    "out": "\(Int64(outSpeed))",
                    "total": "\(Int64(totalSpeed))"
                ])
            }
            
            let sorted = result.sorted { (a, b) -> Bool in
                let aTotal = Int64(a["total"] ?? "0") ?? 0
                let bTotal = Int64(b["total"] ?? "0") ?? 0
                return aTotal > bTotal
            }
            
            // Cleanup old network history entries if needed
            cleanupNetworkHistoryIfNeeded()
            
            return Array(sorted.prefix(maxTopProcesses))
        }
    }
    
    private func cleanupNetworkHistoryIfNeeded() {
        guard processNetworkHistory.count > maxNetworkHistoryEntries else { return }
        
        // Remove entries older than 60 seconds
        let threshold = Date().addingTimeInterval(-historyCleanupThresholdSeconds)
        processNetworkHistory = processNetworkHistory.filter { 
            $0.value.timestamp > threshold 
        }
    }
    
    public func getHardwareInfo(dataType: String) async throws -> String {
        let result = try await Shell.run("/usr/sbin/system_profiler \(dataType) -json")
        guard !result.output.isEmpty else { return "{}" }
        return result.output
    }
}
