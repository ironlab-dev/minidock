import Vapor
import Foundation

public struct NativeVMService: MiniDockService, @unchecked Sendable {
    public let id: String = "native-vm"
    public let name: String = "Native VM Engine"
    public let type: ServiceType = .vm
    
    private let statusCache = StateCache<ServiceStatus>(ttl: 2.0)
    
    public init() {}
    
    public func getStatus() async throws -> ServiceStatus {
        if await checkQEMU() {
            return .running
        }
        return .not_installed
    }
    
    public func start(app: Application) async throws {
        // This starts the "Engine" (checking prerequisites)
    }
    
    public func stop(app: Application) async throws {
        // This stops all VMs? For now, no-op or specific to the engine
    }
    
    public func restart(app: Application) async throws {
        try await stop(app: app)
        try await start(app: app)
    }
    // MARK: - Safe Process Management
    /// Safely find QEMU processes by VM path without shell injection risk
    private func findQEMUProcesses(vmPath: String) async throws -> [Int32] {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/ps")
        process.arguments = ["-axw", "-o", "pid,args"]
        
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        
        try process.run()
        process.waitUntilExit()
        
        let fileHandle = pipe.fileHandleForReading
        let data = try fileHandle.readToEnd() ?? Data()
        try fileHandle.close()
        
        guard let output = String(data: data, encoding: .utf8) else {
            return []
        }
        
        var pids: [Int32] = []
        for line in output.components(separatedBy: .newlines) {
            // Check if line contains qemu and target path (exact match, no escaping needed)
            if line.contains("qemu") && line.contains(vmPath) && !line.contains("grep") {
                let parts = line.trimmingCharacters(in: .whitespaces)
                    .components(separatedBy: .whitespaces)
                    .filter { !$0.isEmpty }
                if let pidStr = parts.first, let pid = Int32(pidStr) {
                    pids.append(pid)
                }
            }
        }
        return pids
    }
    
    public func getItems(app: Application) async throws -> [ServiceItem] {
        // We can't easily get 'app' here without changing the protocol or passing it in init.
        // Now it's passed in!
        
        let result = try await Shell.run("ps aux | grep qemu | grep -v grep")
        let lines = result.output.components(separatedBy: .newlines).filter { !$0.isEmpty }
        
        return lines.map { line in
            ServiceItem(
                id: (line as NSString).lastPathComponent,
                name: "Running VM",
                status: "running",
                metadata: ["process": line]
            )
        }
    }
    
    // --- VM Specific Operations ---
    
    public func startVM(app: Application, vmPath: String) async throws {
        // Check if VM is already running
        let status = try await getVMStatus(vmPath: vmPath)
        if status.status == "running" {
            app.logger.warning("VM is already running: \(vmPath)")
            return
        }
        
        guard let config = try? await getVMConfig(at: vmPath) else {
            throw Abort(.notFound, reason: "VM configuration not found")
        }
        
        // Save current config as config_running.plist
        let currentPlistPath = (vmPath as NSString).appendingPathComponent("config.plist")
        
        // Defensive: Check and warn about abnormal VM memory size
        if let currentConfig = try? await getVMConfig(at: vmPath) {
            if currentConfig.memory < 128 || currentConfig.memory > 65536 {
                app.logger.warning("Starting VM '\(currentConfig.name)' with abnormal memory size: \(currentConfig.memory)MB. It will be sanitized to 2048MB for QEMU arguments.")
            }
        }

        let runningPlistPath = (vmPath as NSString).appendingPathComponent("config_running.plist")
        try? FileManager.default.removeItem(atPath: runningPlistPath)
        try? FileManager.default.copyItem(atPath: currentPlistPath, toPath: runningPlistPath)
        
        let qemuPath = try await resolveQEMUPath(arch: config.arch)
        
        // Clean up old socket files
        let qmpSocket = (vmPath as NSString).appendingPathComponent("qmp.sock")
        let qgaSocket = (vmPath as NSString).appendingPathComponent("qga.sock")
        let fm = FileManager.default
        try? fm.removeItem(atPath: qmpSocket)
        try? fm.removeItem(atPath: qgaSocket)
        
        // Find an available VNC port (starting from 5900)
        let vncPort = try await findAvailableVNCPort(bindAll: config.vncBindAll)
        
        // Build arguments - try bridge mode if configured, with automatic fallback
        var args = try buildQEMUArguments(app: app, config: config, vmPath: vmPath, vncPort: vncPort, forceUserMode: false)
        let useBridgeMode = config.networks.contains { $0.mode == "bridge" }
        
        app.logger.info("Starting VM: \(config.name) with QEMU: \(qemuPath) on VNC port \(vncPort) (network: \(useBridgeMode ? "bridge" : "user"))")
        app.logger.debug("QEMU Args: \(args.joined(separator: " "))")
        
        let logPath = (vmPath as NSString).appendingPathComponent("vm.log")
        FileManager.default.createFile(atPath: logPath, contents: nil)
        
        // Try to start VM
        let engine = app.instructionEngine
        let instructionId = await engine.emitStarted(app: app, command: "Start VM: \(config.name)")
        
        var process = Process()
        process.executableURL = URL(fileURLWithPath: qemuPath)
        process.arguments = args
        
        if let logHandle = FileHandle(forWritingAtPath: logPath) {
            process.standardOutput = logHandle
            process.standardError = logHandle
        }
        
        do {
            try process.run()
            // We'll mark it as "success" (started) once it survives the sleep check below
        } catch {
            let logContent = (try? String(contentsOfFile: logPath)) ?? "No log output"
            app.logger.error("Failed to start VM process: \(error). Log: \(logContent)")
            await engine.emitFinished(app: app, id: instructionId, output: "Error: \(error.localizedDescription)\n\nLog:\n\(logContent)", exitCode: 1)
            throw Abort(.internalServerError, reason: "Failed to start VM: \(error.localizedDescription)")
        }
        
        // Wait to check if VM starts successfully
        try await Task.sleep(nanoseconds: 2_000_000_000) // 2s for better stability check
        
        // Check log for errors - read multiple times to ensure log is flushed
        var logContent = (try? String(contentsOfFile: logPath)) ?? "No log output"
        try await Task.sleep(nanoseconds: 500_000_000) // Additional 0.5s wait
        let finalLogContent = (try? String(contentsOfFile: logPath)) ?? logContent
        logContent = finalLogContent.isEmpty ? "No log output" : finalLogContent
        
        // Check for vmnet/bridge errors - be more specific
        let hasVmnetError = logContent.contains("cannot create vmnet") || 
                           logContent.contains("vmnet") && logContent.contains("privileges") ||
                           logContent.contains("vmnet") && logContent.contains("general failure")
        
        app.logger.debug("VM startup check - isRunning: \(process.isRunning), hasVmnetError: \(hasVmnetError), logPreview: \(logContent.prefix(200))")
        
        // Check if process is still running and if there are errors in log
        if !process.isRunning || hasVmnetError {
            // If bridge mode failed, try fallback to user mode
            if useBridgeMode && hasVmnetError {
                app.logger.warning("Bridge mode failed due to permissions, falling back to user mode for VM \(config.name)")
                
                // Clean up failed process if still running
                if process.isRunning {
                    process.terminate()
                    try await Task.sleep(nanoseconds: 500_000_000) // Wait for termination
                }
                
                // Create fallback config with user mode
                let fallbackConfig = VMConfigParsed(
                    name: config.name,
                    arch: config.arch,
                    memory: config.memory,
                    cpuCount: config.cpuCount,
                    uefi: config.uefi,
                    sharedDirectories: config.sharedDirectories,
                    networks: config.networks.map { net in
                        var newNet = net
                        newNet.mode = "user"
                        return newNet
                    },
                    bootDevice: config.bootDevice,
                    displayResolution: config.displayResolution,
                    autoStart: config.autoStart,
                    usbDevices: config.usbDevices,
                    emulatedDisplayCard: config.emulatedDisplayCard,
                    vgaRAM: config.vgaRAM,
                    upscalingFilter: config.upscalingFilter,
                    downscalingFilter: config.downscalingFilter,
                    retinaMode: config.retinaMode,
                    qemuArguments: config.qemuArguments,
                    serials: config.serials,
                    sounds: config.sounds,
                    drives: config.drives,
                    vncBindAll: config.vncBindAll
                )
                
                // Clear log and retry with user mode
                FileManager.default.createFile(atPath: logPath, contents: nil)
                args = try await buildQEMUArguments(app: app, config: fallbackConfig, vmPath: vmPath, vncPort: vncPort, forceUserMode: true)
                
                process = Process()
                process.executableURL = URL(fileURLWithPath: qemuPath)
                process.arguments = args
                
                if let logHandle = FileHandle(forWritingAtPath: logPath) {
                    process.standardOutput = logHandle
                    process.standardError = logHandle
                }
                
                try process.run()
                try await Task.sleep(nanoseconds: 1_500_000_000)
                
                if !process.isRunning {
                    let fallbackLogContent = (try? String(contentsOfFile: logPath)) ?? "No log output"
                    app.logger.error("VM failed to start even with user mode. Log: \(fallbackLogContent)")
                    throw Abort(.internalServerError, reason: "VM failed to start. Check logs for details.")
                }
                
                app.logger.info("VM \(config.name) started successfully with user mode (bridge mode unavailable)")
            } else {
                app.logger.error("VM failed to stay alive. Log: \(logContent)")
                await engine.emitFinished(app: app, id: instructionId, output: "VM exited immediately.\n\nLog:\n\(logContent)", exitCode: 1)
                throw Abort(.internalServerError, reason: "VM exited immediately. Check logs for details.")
            }
        } else {
            app.logger.info("VM \(config.name) started successfully on VNC port \(vncPort)")
            await engine.emitFinished(app: app, id: instructionId, output: "VM started successfully on VNC port \(vncPort)", exitCode: 0)
        }
    }
    
    public func stopVM(app: Application, vmPath: String) async throws {
        // Clean up running config on stop
        let runningPlistPath = (vmPath as NSString).appendingPathComponent("config_running.plist")
        try? FileManager.default.removeItem(atPath: runningPlistPath)

        // Find process by vmPath using safe native API
        let pids = try await findQEMUProcesses(vmPath: vmPath)
        
        if pids.isEmpty {
            app.logger.info("No running VM process found for: \(vmPath)")
            // Clean up socket files anyway
            let qmpSocket = (vmPath as NSString).appendingPathComponent("qmp.sock")
            let qgaSocket = (vmPath as NSString).appendingPathComponent("qga.sock")
            try? FileManager.default.removeItem(atPath: qmpSocket)
            try? FileManager.default.removeItem(atPath: qgaSocket)
            return
        }
        
        app.logger.info("Stopping VM at \(vmPath), found \(pids.count) process(es)")
        
        // First, try graceful shutdown via QMP
        let qmpSocket = (vmPath as NSString).appendingPathComponent("qmp.sock")
        if FileManager.default.fileExists(atPath: qmpSocket) {
            do {
                _ = try await queryQMP(vmPath: vmPath, command: "system_powerdown")
                // Wait a bit for graceful shutdown
                try await Task.sleep(nanoseconds: 3_000_000_000) // 3 seconds
            } catch {
                app.logger.warning("QMP graceful shutdown failed, using kill: \(error)")
            }
        }
        
        // Check if still running using safe API
        let remainingPids = try await findQEMUProcesses(vmPath: vmPath)
        
        for pid in remainingPids {
            app.logger.info("Force killing QEMU process: \(pid)")
            // Try TERM first, then KILL if needed
            let pidStr = String(pid)
            try await Shell.run("kill -TERM \(pidStr)", app: app)
            try await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
            
            // Check if still running
            let psResult = try await Shell.run("ps -p \(pidStr)", app: app)
            if !psResult.output.isEmpty {
                try await Shell.run("kill -KILL \(pidStr)", app: app)
            }
        }
        
        // Clean up socket files
        try? FileManager.default.removeItem(atPath: qmpSocket)
        try? FileManager.default.removeItem(atPath: (vmPath as NSString).appendingPathComponent("qga.sock"))
        
        app.logger.info("VM stopped successfully: \(vmPath)")
    }
    
    public func getVMStatus(vmPath: String) async throws -> (status: String, vncPort: Int?, ipAddress: String?, macAddress: String?, cpuUsage: String?, memoryUsage: String?, qgaVerified: Bool?, configChanged: Bool?, configDifferences: [String]?, vncBindAddress: String?) {
        let psCommand = "ps -axww -o pcpu,pmem,args | grep qemu | grep '\(vmPath)' | grep -v grep"
        let psResult = try await Shell.run(psCommand)
        
        if psResult.output.isEmpty {
            return ("stopped", nil, nil, nil, nil, nil, false, nil, nil, nil)
        }
        
        let parts = psResult.output.trimmingCharacters(in: .whitespaces).components(separatedBy: .whitespaces).filter { !$0.isEmpty }
        var cpuUsage: String? = nil
        var memoryUsage: String? = nil
        
        if parts.count >= 2 {
            cpuUsage = parts[0] + "%"
            memoryUsage = parts[1] + "%"
        }
        
        // Try to parse vnc port from args if present: -vnc 127.0.0.1:N
        var vncPort: Int? = nil
        var vncBindAddress: String? = nil
        
        if let range = psResult.output.range(of: "-vnc 127.0.0.1:(\\d+)", options: .regularExpression) {
            let match = String(psResult.output[range])
            if let portStr = match.components(separatedBy: ":").last, let portOffset = Int(portStr) {
                vncPort = 5900 + portOffset
                vncBindAddress = "127.0.0.1"
            }
        } else if let range = psResult.output.range(of: "-vnc 0.0.0.0:(\\d+)", options: .regularExpression) {
            let match = String(psResult.output[range])
            if let portStr = match.components(separatedBy: ":").last, let portOffset = Int(portStr) {
                vncPort = 5900 + portOffset
                vncBindAddress = "0.0.0.0"
            }
        }
        
        // Try to get network info via QMP
        let networkInfo = try? await getVMNetworkInfo(vmPath: vmPath)
        
        // Check for configuration changes
        var configChanged = false
        var differences: [String] = []
        
        let runningPlistPath = (vmPath as NSString).appendingPathComponent("config_running.plist")
        
        if FileManager.default.fileExists(atPath: runningPlistPath) {
            if let runningConfig = try? await getVMConfig(at: vmPath, useRunning: true),
               let currentConfig = try? await getVMConfig(at: vmPath, useRunning: false) {
                if runningConfig != currentConfig {
                    configChanged = true
                    differences = calculateDifferences(from: runningConfig, to: currentConfig)
                }
            }
        }
        
        return ("running", vncPort, networkInfo?.ip, networkInfo?.mac, cpuUsage, memoryUsage, networkInfo?.qgaVerified, configChanged, differences.isEmpty ? nil : differences, vncBindAddress)
    }

    public func getVMNetworkInfo(vmPath: String) async throws -> (ip: String?, mac: String?, qgaVerified: Bool) {
        // We first try guest-network-get-interfaces (requires Guest Agent)
        let res = try? await queryQMP(vmPath: vmPath, command: "guest-network-get-interfaces")
        
        // If we get a valid return array, it means QGA is running and responding
        // even if we find no usable IP addresses below.
        let isQGARunning = (res?["return"] as? [[String: Any]]) != nil
        
        if let interfaces = res?["return"] as? [[String: Any]] {
            for interface in interfaces {
                // Skip loopback
                if let name = interface["name"] as? String, name == "lo" { continue }
                
                if let ipAddrs = interface["ip-addresses"] as? [[String: Any]] {
                    for addr in ipAddrs {
                        if let type = addr["ip-address-type"] as? String, type == "ipv4",
                           let ip = addr["ip-address"] as? String {
                            let mac = interface["hardware-address"] as? String
                            return (ip, mac, true)
                        }
                    }
                }
            }
        }
        
        // Fallback: If no guest agent, try to find MAC from QEMU network info
        // and IP from ARP (though ARP is harder if it's user/slirp)
        _ = try? await queryQMP(vmPath: vmPath, command: "query-pci")
        // Parsing PCI interfaces to find virtio-net MAC
        // (Simplified for now, as Guest Agent is the preferred way)
        
        return (nil, nil, isQGARunning)
    }

    private func queryQMP(vmPath: String, command: String, arguments: [String: Any]? = nil) async throws -> [String: Any] {
        let qmpSocket = (vmPath as NSString).appendingPathComponent("qmp.sock")
        guard FileManager.default.fileExists(atPath: qmpSocket) else {
            throw Abort(.notFound, reason: "QMP socket not found")
        }

        var execute: [String: Any] = ["execute": command]
        if let args = arguments {
            execute["arguments"] = args
        }
        
        guard let jsonData = try? JSONSerialization.data(withJSONObject: execute),
              let jsonStr = String(data: jsonData, encoding: .utf8) else {
            throw Abort(.internalServerError)
        }

        // Python bridge for QMP handshake and command execution
        let escapedJson = jsonStr.replacingOccurrences(of: "'", with: "\\'")
        let pyScript = """
import socket, json, sys
try:
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(1.5)
    s.connect("\(qmpSocket)")
    s.recv(1024) # Greeting
    s.send(b'{"execute":"qmp_capabilities"}\\n')
    s.recv(1024) # Ack
    s.send('\(escapedJson)\\n'.encode())
    res = b""
    while True:
        chunk = s.recv(4096)
        res += chunk
        if b'\\n' in chunk: break
    print(res.decode())
    s.close()
except Exception as e:
    print(json.dumps({"error": str(e)}))
"""
        let qmpResult = try await Shell.run("python3 -c '\(pyScript)'")
        guard let data = qmpResult.output.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return ["error": "Failed to parse QMP response", "output": qmpResult.output]
        }
        return json
    }

    // --- Private Helpers ---

    private func checkQEMU() async -> Bool {
        #if arch(arm64)
        let arch = "aarch64"
        #else
        let arch = "x86_64"
        #endif
        return (try? await Shell.run("which qemu-system-\(arch)")).map { $0.exitCode == 0 } ?? false
    }
    
    private func resolveQEMUPath(arch: String) async throws -> String {
        let qemuBin = "qemu-system-\(arch)"
        let result = try await Shell.run("which \(qemuBin)")
        guard result.exitCode == 0 else {
            throw Abort(.internalServerError, reason: "\(qemuBin) not found. Please install QEMU via Homebrew.")
        }
        return result.output
    }
    
    private struct NetworkInterface: Equatable {
        var mode: String
        var interface: String?
        var macAddress: String?
    }

    private struct VMConfigParsed: Equatable {
        let name: String
        let arch: String
        struct SerialInstance: Equatable {
            let mode: String
            let target: String?
            let address: String?
            let port: Int?
            let telnet: Bool
            let waitForConnection: Bool
        }

        struct SoundInstance: Equatable {
            let hardware: String
            let audioInput: Bool
        }

        struct DriveInstance: Equatable {
            let imageName: String
            let imagePath: String?
            let interface: String
            let isISO: Bool
            let isReadOnly: Bool
            let bootOrder: Int?
            let size: Int64
        }

        let memory: Int
        let cpuCount: Int
        let uefi: Bool
        let sharedDirectories: [[String: String]]
        let networks: [NetworkInterface]
        let bootDevice: String?
        let displayResolution: String?
        let autoStart: Bool
        let usbDevices: [[String: String]]
        let emulatedDisplayCard: String?
        let vgaRAM: Int?
        let upscalingFilter: String?
        let downscalingFilter: String?
        let retinaMode: Bool?
        let qemuArguments: String?
        let serials: [SerialInstance]
        let sounds: [SoundInstance]
        let drives: [DriveInstance]
        let vncBindAll: Bool
    }

    private func getVMConfig(at path: String, useRunning: Bool = false) async throws -> VMConfigParsed {
        let filename = useRunning ? "config_running.plist" : "config.plist"
        let plistPath = (path as NSString).appendingPathComponent(filename)
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: plistPath)),
              let plist = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any] else {
            throw Abort(.internalServerError, reason: "Invalid config.plist")
        }
        
        let info = plist["Information"] as? [String: Any]
        let name = info?["Name"] as? String ?? "Unknown"
        
        let system = plist["System"] as? [String: Any]
        let arch = system?["Architecture"] as? String ?? "aarch64"
        let memory = system?["MemorySize"] as? Int ?? 2048
        let cpuCount = system?["CPUCount"] as? Int ?? 2
        let uefi = system?["UEFIBoot"] as? Bool ?? false
        let autoStart = system?["AutoStart"] as? Bool ?? false
        let bootDevice = system?["BootDevice"] as? String
        let qemuArguments = system?["QEMUArguments"] as? String
        
        let sharing = plist["Sharing"] as? [String: Any]
        let sharedDirs = sharing?["DirectoryShareFolders"] as? [[String: String]] ?? []
        
        var parsedNetworks: [NetworkInterface] = []
        if let networksArray = plist["Network"] as? [[String: Any]] {
            // New format: Array of network dicts
            for net in networksArray {
                parsedNetworks.append(NetworkInterface(
                    mode: net["NetworkMode"] as? String ?? "user",
                    interface: net["BridgeInterface"] as? String,
                    macAddress: net["HardwareAddress"] as? String
                ))
            }
        } else if let network = plist["Network"] as? [String: Any] {
            // Legacy format: Single dict
            parsedNetworks.append(NetworkInterface(
                mode: network["NetworkMode"] as? String ?? "user",
                interface: network["BridgeInterface"] as? String,
                macAddress: network["HardwareAddress"] as? String
            ))
        } else {
            // Default: no network? or just user mode
            parsedNetworks.append(NetworkInterface(mode: "user", interface: nil, macAddress: nil))
        }
        
        let display = plist["Display"] as? [String: Any]
        let displayRes = display?["Resolution"] as? String
        let emulatedDisplayCard = display?["EmulatedDisplayCard"] as? String
        let vgaRAM = display?["VGAMemoryMB"] as? Int
        let upscalingFilter = display?["UpscalingFilter"] as? String
        let downscalingFilter = display?["DownscalingFilter"] as? String
        let retinaMode = display?["RetinaMode"] as? Bool

        let usbDevices = plist["USBDevices"] as? [[String: String]] ?? []
        
        let networkSettings = plist["NetworkSettings"] as? [String: Any]
        let vncBindAll = networkSettings?["VNCBindAll"] as? Bool ?? false
        
        let serialsArray = plist["Serial"] as? [[String: Any]] ?? []
        let parsedSerials = serialsArray.map { dict in
            VMConfigParsed.SerialInstance(
                mode: dict["Mode"] as? String ?? "builtin",
                target: dict["Target"] as? String,
                address: dict["Address"] as? String,
                port: dict["Port"] as? Int,
                telnet: dict["Telnet"] as? Bool ?? false,
                waitForConnection: dict["WaitForConnection"] as? Bool ?? false
            )
        }

        let soundsArray = plist["Sound"] as? [[String: Any]] ?? []
        let parsedSounds = soundsArray.map { dict in
            VMConfigParsed.SoundInstance(
                hardware: dict["Hardware"] as? String ?? "intel-hda",
                audioInput: dict["AudioInput"] as? Bool ?? false
            )
        }

        // Parse drives
        let drivesArray = plist["Drives"] as? [[String: Any]] ?? []
        let parsedDrives = drivesArray.map { dict in
            let bootOrder: Int
            if let intValue = dict["BootOrder"] as? Int {
                bootOrder = intValue
            } else if let int64Value = dict["BootOrder"] as? Int64 {
                bootOrder = Int(int64Value)
            } else if let stringValue = dict["BootOrder"] as? String {
                bootOrder = Int(stringValue) ?? 0
            } else {
                bootOrder = 0
            }
            
            return VMConfigParsed.DriveInstance(
                imageName: dict["ImageName"] as? String ?? "",
                imagePath: dict["ImagePath"] as? String,
                interface: dict["Interface"] as? String ?? "virtio",
                isISO: dict["IsISO"] as? Bool ?? false,
                isReadOnly: dict["ReadOnly"] as? Bool ?? false,
                bootOrder: bootOrder > 0 ? bootOrder : nil,
                size: dict["Size"] as? Int64 ?? 0
            )
        }

        var computedBootOrder: String? = nil
        
        // If BootDevice is explicitly set, use it (backward compatibility)
        if let explicitBoot = bootDevice {
            computedBootOrder = explicitBoot
        } else {
            // Otherwise, compute from drive BootOrder
            let bootableDrives = drivesArray.compactMap { drive -> (order: Int, type: String)? in
                let bootOrder: Int?
                if let intValue = drive["BootOrder"] as? Int {
                    bootOrder = intValue
                } else if let int64Value = drive["BootOrder"] as? Int64 {
                    bootOrder = Int(int64Value)
                } else if let stringValue = drive["BootOrder"] as? String {
                    bootOrder = Int(stringValue)
                } else {
                    bootOrder = nil
                }
                
                guard let order = bootOrder, order > 0 else {
                    return nil
                }
                let isISO = drive["IsISO"] as? Bool ?? false
                let interface = drive["Interface"] as? String ?? "virtio"
                let driveType = (isISO || interface == "cdrom") ? "d" : "c"
                return (order: order, type: driveType)
            }
            
            if !bootableDrives.isEmpty {
                let sorted = bootableDrives.sorted { $0.order < $1.order }
                computedBootOrder = sorted.map { $0.type }.joined()
            }
        }

        return VMConfigParsed(
            name: name,
            arch: arch,
            memory: memory,
            cpuCount: cpuCount,
            uefi: uefi,
            sharedDirectories: sharedDirs,
            networks: parsedNetworks,
            bootDevice: computedBootOrder,
            displayResolution: displayRes,
            autoStart: autoStart,
            usbDevices: usbDevices,
            emulatedDisplayCard: emulatedDisplayCard,
            vgaRAM: vgaRAM,
            upscalingFilter: upscalingFilter,
            downscalingFilter: downscalingFilter,
            retinaMode: retinaMode,
            qemuArguments: qemuArguments,
            serials: parsedSerials,
            sounds: parsedSounds,
            drives: parsedDrives,
            vncBindAll: vncBindAll
        )
    }
    
    private func buildQEMUArguments(app: Application, config: VMConfigParsed, vmPath: String, vncPort: Int, forceUserMode: Bool = false) throws -> [String] {
        let dataPath = (vmPath as NSString).appendingPathComponent("Data")
        let fm = FileManager.default

        let qmpSocket = (vmPath as NSString).appendingPathComponent("qmp.sock")
        let qgaSocket = (vmPath as NSString).appendingPathComponent("qga.sock")
        
        // Sanitize memory size: 128MB to 64GB
        var sanitizedMemory = config.memory
        if sanitizedMemory < 128 || sanitizedMemory > 65536 {
            sanitizedMemory = 2048
        }

        var args = [
            "-name", config.name,
            "-m", "\(sanitizedMemory)",
            "-smp", "cpus=\(config.cpuCount)",
        ]
        
        // Determine Accelerator and CPU
        // Check if we can use hardware acceleration (HVF)
        #if arch(arm64)
        let hostArch = "aarch64"
        #else
        let hostArch = "x86_64"
        #endif
        
        let isNative = (config.arch == hostArch)
        
        if isNative {
             args.append(contentsOf: ["-accel", "hvf"])
             args.append(contentsOf: ["-cpu", "host"])
        } else {
             args.append(contentsOf: ["-accel", "tcg"])
             if config.arch == "x86_64" {
                 args.append(contentsOf: ["-cpu", "qemu64"])
             } else if config.arch == "aarch64" {
                 args.append(contentsOf: ["-cpu", "cortex-a57"])
             } else {
                 args.append(contentsOf: ["-cpu", "max"])
             }
        }
        
        // Determine Machine Type
        if config.arch == "aarch64" {
            args.append(contentsOf: ["-M", "virt,highmem=off", "-cpu", "host", "-accel", "hvf"])
            // Always add a serial log for aarch64 debugging
            args.append(contentsOf: ["-serial", "file:\((vmPath as NSString).appendingPathComponent("serial.log"))"])
        } else if config.arch == "x86_64" {
            args.append(contentsOf: ["-M", "q35"])
        } else {
             // Fallback/Default
             args.append(contentsOf: ["-M", "virt"])
        }
        
        args.append(contentsOf: [
            "-display", "none",
            "-vnc", "\(config.vncBindAll ? "0.0.0.0" : "127.0.0.1"):\(vncPort - 5900)",
            "-qmp", "unix:\(qmpSocket),server,nowait",
            
            // USB Controller (XHCI) and Input Devices
            "-device", "qemu-xhci,id=xhci",
            "-device", "usb-kbd",
            "-device", "usb-tablet",
        ])

        // Display Devices
        // Default Logic:
        // - aarch64: virtio-ramfb (Combined device used logically)
        // - others: virtio-gpu-pci (Standard)
        
        let selectedDisplay = config.emulatedDisplayCard ?? (config.arch == "aarch64" ? "virtio-ramfb" : "virtio-gpu-pci")
        app.logger.debug("Using Display Configuration: \(selectedDisplay)")

        let vgaMem = config.vgaRAM ?? 16
        if selectedDisplay == "virtio-ramfb" {
            // Emulate "virtio-ramfb" by adding ramfb (boot) and virtio-gpu-pci (OS)
            // This ensures display works during both host firmware (UEFI) and OS phases.
            args.append(contentsOf: ["-device", "ramfb"])
            args.append(contentsOf: ["-device", "virtio-gpu-pci,edid=on"])
        } else if selectedDisplay == "virtio-gpu-pci" && config.arch == "aarch64" {
            // For ARM64, bare virtio-gpu-pci sometimes fails to show early boot without ramfb
            // adding edid=on helps resolution detection.
            args.append(contentsOf: ["-device", "virtio-gpu-pci,edid=on"])
        } else if selectedDisplay == "none" {
            // No display device
        } else if selectedDisplay.contains("gl") {
            // GPU Supported cards
            args.append(contentsOf: ["-device", "\(selectedDisplay),vgamem_mb=\(vgaMem),edid=on"])
        } else {
            // Pass through directly with memory if applicable
            if selectedDisplay.contains("vga") || selectedDisplay.contains("gpu") || selectedDisplay.contains("qxl") {
                args.append(contentsOf: ["-device", "\(selectedDisplay),vgamem_mb=\(vgaMem),edid=on"])
            } else {
                args.append(contentsOf: ["-device", selectedDisplay])
            }
        }

        args.append(contentsOf: [
            // QEMU Guest Agent
            
            // QEMU Guest Agent
            "-device", "virtio-serial",
            "-device", "virtserialport,chardev=qga0,name=org.qemu.guest_agent.0",
            "-chardev", "socket,path=\(qgaSocket),server=on,wait=off,id=qga0"
        ])
        
        // UEFI Support
        if config.uefi {
            var firmwarePath = "/opt/homebrew/share/qemu"
            if !fm.fileExists(atPath: firmwarePath) {
                // Fallback for Intel Macs
                firmwarePath = "/usr/local/share/qemu"
            }
            let codeFile = config.arch == "aarch64" ? "edk2-aarch64-code.fd" : "edk2-x86_64-code.fd"
            let codePath = (firmwarePath as NSString).appendingPathComponent(codeFile)
            
            if fm.fileExists(atPath: codePath) {
                // Read-only firmware code
                args.append(contentsOf: ["-drive", "if=pflash,format=raw,readonly=on,file=\(codePath)"])
                
                // Read-write variables (copy to VM directory if not exists)
                let varsFile = "\(config.arch)_vars.fd"
                let varsPath = (vmPath as NSString).appendingPathComponent(varsFile)
                if !fm.fileExists(atPath: varsPath) {
                    let sourceVars = (firmwarePath as NSString).appendingPathComponent(config.arch == "aarch64" ? "edk2-arm-vars.fd" : "edk2-i386-vars.fd")
                    if fm.fileExists(atPath: sourceVars) {
                        try? fm.copyItem(atPath: sourceVars, toPath: varsPath)
                    }
                }
                if fm.fileExists(atPath: varsPath) {
                    args.append(contentsOf: ["-drive", "if=pflash,format=raw,file=\(varsPath)"])
                }
            }
        }
        
        // Shared Directories (9p)
        for dir in config.sharedDirectories {
            if let path = dir["Path"], let tag = dir["Tag"] {
                args.append(contentsOf: [
                    "-virtfs", "local,path=\(path),mount_tag=\(tag),security_model=mapped-xattr"
                ])
            }
        }
        
        // USB Passthrough
        for usb in config.usbDevices {
            if let vid = usb["VendorID"], let pid = usb["ProductID"] {
                // vid/pid format: 0x1234
                // qemu expects integers, but hex formatted with 0x is usually fine.
                // However, QEMU sometimes prefers decimal.
                // Safest is often passing hex if supported, or parsing.
                // "usb-host,vendorid=X,productid=Y"
                args.append(contentsOf: [
                    "-device", "usb-host,vendorid=\(vid),productid=\(pid)"
                ])
            }
        }
        
        // Network
        for (index, net) in config.networks.enumerated() {
            let netType: String
            let actualNetworkMode: String
            
            if forceUserMode {
                actualNetworkMode = "user"
                netType = "user"
            } else if net.mode == "bridge", let iface = net.interface {
                netType = "vmnet-bridged,ifname=\(iface)"
                actualNetworkMode = "bridge"
            } else {
                netType = "user"
                actualNetworkMode = "user"
            }
            
            let netdevId = "net\(index)"
            var netdevStr = "\(netType),id=\(netdevId)"
            
            if actualNetworkMode == "user" {
                // Forward SSH and common NAS ports using spreads to avoid VM-to-VM conflicts
                // For multiple networks, we only do hostfwd on the first one to avoid confusion/conflicts
                if index == 0 {
                    let portOffset = (vncPort - 5900) * 10
                    let baseHostPort = 10000 + portOffset
                    
                    netdevStr += ",hostfwd=tcp::\(baseHostPort + 0)-:22" // SSH
                    netdevStr += ",hostfwd=tcp::\(baseHostPort + 1)-:80" // HTTP
                    netdevStr += ",hostfwd=tcp::\(baseHostPort + 2)-:443" // HTTPS
                    netdevStr += ",hostfwd=tcp::\(baseHostPort + 3)-:8080" // Alternative HTTP
                }
            }
            
            args.append(contentsOf: ["-netdev", netdevStr])
            var deviceStr = "virtio-net-pci,netdev=\(netdevId)"
            if let mac = net.macAddress {
                deviceStr += ",mac=\(mac)"
            }
            args.append(contentsOf: ["-device", deviceStr])
        }
        
        // Drives and Boot
        if config.drives.isEmpty {
            // No drives
        } else {
            // Controller setup
            let hasSATA = config.drives.contains { $0.interface == "sata" }
            let hasSCSI = config.arch == "aarch64" || config.drives.contains { $0.interface == "scsi" }

            if hasSCSI {
                args.append(contentsOf: ["-device", "virtio-scsi-pci,id=scsi0"])
            }
            if hasSATA {
                args.append(contentsOf: ["-device", "ich9-ahci,id=ahci0"])
            }

            for (index, drive) in config.drives.enumerated() {
                let driveId = "drive\(index)"
                let deviceId = "device\(index)"
                
                // Construct file path
                var filePath = (dataPath as NSString).appendingPathComponent(drive.imageName)
                if drive.isISO, let imagePath = drive.imagePath, fm.fileExists(atPath: imagePath) {
                    filePath = imagePath
                }

                // Modern syntax: -drive if=none + -device
                var driveArg = "file=\(filePath),id=\(driveId),if=none"
                if drive.isISO || drive.interface == "cdrom" {
                    driveArg += ",media=cdrom,readonly=on"
                } else {
                    driveArg += ",cache=writethrough"
                }
                args.append(contentsOf: ["-drive", driveArg])

                var deviceArg = ""
                let interface = drive.interface.lowercased()
                
                if drive.isISO || interface == "cdrom" {
                    if config.arch == "aarch64" {
                        deviceArg = "scsi-cd,drive=\(driveId),bus=scsi0.0,id=\(deviceId)"
                    } else {
                        deviceArg = "ide-cd,drive=\(driveId),bus=ide.0,id=\(deviceId)"
                    }
                } else {
                    switch interface {
                    case "nvme":
                        deviceArg = "nvme,drive=\(driveId),id=\(deviceId),serial=drive\(index)"
                    case "sata":
                        deviceArg = "ide-hd,drive=\(driveId),bus=ahci0.\(index),id=\(deviceId)"
                    case "ide":
                        deviceArg = "ide-hd,drive=\(driveId),bus=ide.0,id=\(deviceId)"
                    case "scsi":
                        deviceArg = "scsi-hd,drive=\(driveId),bus=scsi0.0,id=\(deviceId)"
                    default: // virtio or fallback
                        deviceArg = "virtio-blk-pci,drive=\(driveId),id=\(deviceId)"
                    }
                }

                // Apply bootindex if set
                if let order = drive.bootOrder, order > 0 {
                    deviceArg += ",bootindex=\(order)"
                }
                
                args.append(contentsOf: ["-device", deviceArg])
            }
        }
        
        if let boot = config.bootDevice {
            // QEMU legacy boot order (c, d, n, etc.)
            // Note: device-specific bootindex usually takes precedence in UEFI
            args.append(contentsOf: ["-boot", "order=\(boot)"])
        } else {
            args.append(contentsOf: ["-boot", "menu=on"])
        }

        // Serial
        for (index, serial) in config.serials.enumerated() {
            let charId = "char_serial\(index)"
            var chardevConfig = ""
            
            switch serial.mode {
            case "builtin":
                chardevConfig = "vc,id=\(charId)" // Use virtual console if builtin
            case "pty":
                chardevConfig = "pty,id=\(charId)"
            case "tcp_client":
                if let addr = serial.address, let port = serial.port {
                    chardevConfig = "socket,id=\(charId),host=\(addr),port=\(port)"
                }
            case "tcp_server":
                if let addr = serial.address, let port = serial.port {
                    chardevConfig = "socket,id=\(charId),host=\(addr),port=\(port),server=on,wait=\(serial.waitForConnection ? "on" : "off")"
                    if serial.telnet {
                        chardevConfig += ",telnet=on"
                    }
                }
            default:
                continue
            }
            
            if !chardevConfig.isEmpty {
                args.append(contentsOf: ["-chardev", chardevConfig])
                if serial.target == "virtio" {
                    args.append(contentsOf: ["-device", "virtserialport,chardev=\(charId),name=org.minidock.serial.\(index)"])
                } else {
                    // Use correct device model based on architecture
                    if config.arch == "aarch64" {
                        args.append(contentsOf: ["-device", "pci-serial,chardev=\(charId)"])
                    } else {
                        args.append(contentsOf: ["-device", "isa-serial,chardev=\(charId)"])
                    }
                }
            }
        }

        // Sound
        if !config.sounds.isEmpty {
            // On macOS, coreaudio is the primary backend. Enable input if any sound card needs it.
            let hasInput = config.sounds.contains { $0.audioInput }
            var audiodev = "coreaudio,id=audio0"
            if hasInput {
                audiodev += ",in.mixing-engine=on"
            }
            args.append(contentsOf: ["-audiodev", audiodev])
            for sound in config.sounds {
                if sound.hardware == "intel-hda" {
                    args.append(contentsOf: ["-device", "intel-hda", "-device", "hda-duplex,audiodev=audio0"])
                } else {
                    args.append(contentsOf: ["-device", "\(sound.hardware),audiodev=audio0"])
                }
            }
        }
        
        // Custom QEMU Arguments
        if let customArgs = config.qemuArguments, !customArgs.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let parts = customArgs.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
            args.append(contentsOf: parts)
        }
        
        return args
    }

    private func findAvailableVNCPort(bindAll: Bool = false) async throws -> Int {
        for port in 5900...5910 {
            // Check availability robustly.
            // If we are binding to 0.0.0.0, we need to make sure NOTHING is on 5900 (listen local or remote).
            // If we are binding to 127.0.0.1, we need to make sure 127.0.0.1 is free.
            
            // We check 127.0.0.1 first as it's the most common conflict source.
            let localResult = try await Shell.run("nc -z -w 1 127.0.0.1 \(port)")
            if localResult.exitCode == 0 { continue } // Port in use locally

            // Check IPv6 Localhost (Screen Sharing often binds here too)
            let v6Result = try await Shell.run("nc -z -w 1 ::1 \(port)")
            if v6Result.exitCode == 0 { continue } // Port in use locally (IPv6)

            // If bindAll is requested, we also check 0.0.0.0 explicitly (though usually covered by local check if bound to all, but if bound to specific IP, might be missed).
            // Actually, `nc -z -w 1 0.0.0.0 port` checks if we can connect to ANY interface.
            
            let anyResult = try await Shell.run("nc -z -w 1 0.0.0.0 \(port)")
            if anyResult.exitCode == 0 { continue } // Port in use on some interface

            // Additional check using netstat/lsof to be absolutely sure? 
            // `lsof -i :port` is very reliable but might require privileges or show different users.
            // `ps` check (used in previous logic for finding my OWN ports) is also good.
            // The previous logic I saw in `findAvailableVNCPort` used `nc`.
            // Let's stick to `nc` but double check.
            
            return port
        }
        throw Abort(.internalServerError, reason: "No available VNC ports (5900-5910)")
    }

    private func calculateDifferences(from old: VMConfigParsed, to new: VMConfigParsed) -> [String] {
        var diffs: [String] = []
        if old.memory != new.memory { diffs.append("Memory: \(old.memory)MB -> \(new.memory)MB") }
        if old.cpuCount != new.cpuCount { diffs.append("CPU: \(old.cpuCount) -> \(new.cpuCount)") }
        if old.arch != new.arch { diffs.append("Architecture: \(old.arch) -> \(new.arch)") }
        if old.uefi != new.uefi { diffs.append("UEFI: \(old.uefi) -> \(new.uefi)") }
        if old.networks.count != new.networks.count {
            diffs.append("Network Interfaces: \(old.networks.count) -> \(new.networks.count)")
        } else {
            for i in 0..<old.networks.count {
                if old.networks[i] != new.networks[i] {
                    diffs.append("Network Interface \(i) changed")
                }
            }
        }
        if old.bootDevice != new.bootDevice { diffs.append("Boot: \(old.bootDevice ?? "Default") -> \(new.bootDevice ?? "Default")") }
        if old.emulatedDisplayCard != new.emulatedDisplayCard { diffs.append("Display: \(old.emulatedDisplayCard ?? "Default") -> \(new.emulatedDisplayCard ?? "Default")") }
        if old.sharedDirectories.count != new.sharedDirectories.count {
            diffs.append("Shared Folders changed")
        }
        if old.usbDevices.count != new.usbDevices.count {
            diffs.append("USB Devices changed")
        }
        if old.serials.count != new.serials.count {
            diffs.append("Serial Ports: \(old.serials.count) -> \(new.serials.count)")
        } else {
            for i in 0..<old.serials.count {
                if old.serials[i] != new.serials[i] {
                    diffs.append("Serial Port \(i) configuration changed")
                }
            }
        }
        if old.sounds.count != new.sounds.count {
            diffs.append("Sound Cards: \(old.sounds.count) -> \(new.sounds.count)")
        } else {
            for i in 0..<old.sounds.count {
                if old.sounds[i] != new.sounds[i] {
                    diffs.append("Sound Card \(i) hardware changed")
                }
            }
        }
        if old.qemuArguments != new.qemuArguments {
            diffs.append("Custom QEMU Arguments changed")
        }
        if old.vncBindAll != new.vncBindAll {
             diffs.append("External VNC: \(old.vncBindAll ? "Enabled" : "Disabled") -> \(new.vncBindAll ? "Enabled" : "Disabled")")
        }
        return diffs
    }
}
