import Vapor
import Foundation

public struct UTMService: MiniDockService, @unchecked Sendable {
    public let id: String = "utm-vms"
    public let name: String = "UTM Virtual Machines"
    public let type: ServiceType = .vm
    
    private let statusCache = StateCache<ServiceStatus>(ttl: 2.0)
    private let vmCache = StateCache<[UTMVM]>(ttl: 3.0)
    
    public init() {}
    
    public func getInfo(app: Application) async throws -> ServiceInfo {
        let status = try await getStatus()
        var stats: [String: String] = [:]
        
        // Only attempt to list VMs for stats if UTM is actually running
        if status == .running {
            do {
                let vms = try await listVMs(app: app)
                stats["vms_total"] = "\(vms.count)"
                stats["vms_running"] = "\(vms.filter { $0.status == "running" }.count)"
            } catch {
                // Ignore error for stats
            }
        } else {
            stats["vms_total"] = "0"
            stats["vms_running"] = "0"
            stats["note"] = "UTM is not running"
        }
        
        return ServiceInfo(
            id: id,
            name: name,
            type: type,
            status: status,
            description: "Manage and monitor UTM Virtual Machines instances and health.",
            stats: stats
        )
    }
    

    
    public func getStatus() async throws -> ServiceStatus {
        guard await checkPrerequisites() else {
            return .not_installed
        }
        
        if let cached = statusCache.get() {
            return cached
        }
        
        // Use pgrep for the most silent and lightweight check (no AppleScript/GUI interaction)
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/pgrep")
        process.arguments = ["-x", "UTM"]
        let pipe = Pipe()
        process.standardOutput = pipe
        try? process.run()
        process.waitUntilExit()
        
        let status: ServiceStatus = process.terminationStatus == 0 ? .running : .stopped
        statusCache.set(status)
        return status
    }
    
    public func start(app: Application) async throws {
        // Check if UTM is already running
        let currentStatus = try await getStatus()
        if currentStatus == .running {
            app.logger.info("[UTMService] UTM is already running, skipping start")
            return
        }
        
        // Check if there are any VMs to manage before starting UTM
        // Note: We can't check VMs if UTM is not running, so we'll start it anyway
        // but the BootOrchestrator will handle the check at a higher level
        let script = "tell application \"UTM\" to activate"
        _ = try await runAppleScript(script, app: app, track: true)
        invalidateCaches()
    }
    
    public func stop(app: Application) async throws {
        let script = "tell application \"UTM\" to quit"
        _ = try await runAppleScript(script, app: app, track: true)
        invalidateCaches()
    }
    
    public func restart(app: Application) async throws {
        try await stop(app: app)
        try await start(app: app)
        invalidateCaches()
    }
    
    public func getItems(app: Application) async throws -> [ServiceItem] {
        // Only list items if UTM is running
        let status = try await getStatus()
        guard status == .running else {
            return []
        }

        let vms = try await listVMs(app: app)
        return vms.map { vm in
            ServiceItem(
                id: vm.uuid,
                name: vm.name,
                status: vm.status,
                metadata: nil
            )
        }
    }
    
    public func performItemAction(app: Application, itemId: String, action: String) async throws {
        let utmctlPath = "/Applications/UTM.app/Contents/MacOS/utmctl"
        let utmAction: String
        switch action {
        case "start": utmAction = "start"
        case "stop": utmAction = "stop"
        case "suspend": utmAction = "suspend"
        default: throw Abort(.badRequest, reason: "Unsupported UTM action: \(action)")
        }
        
        _ = try await runCLI(path: utmctlPath, args: [utmAction, itemId], app: app, track: true)
        invalidateCaches()
    }
    
    private func invalidateCaches() {
        statusCache.invalidate()
        vmCache.invalidate()
    }
    
    public func listVMs(app: Application) async throws -> [UTMVM] {
        if let cached = vmCache.get() {
            return cached
        }
        
        let status = try await getStatus()
        guard status == .running else { return [] }
        
        // Use AppleScript to get EVERYTHING silently (ID, Name, Status)
        // This avoids calling 'utmctl list' which inside the app bundle often triggers a Dock bounce.
        let script = """
        tell application "UTM"
            set vmList to virtual machines
            set resultList to {}
            repeat with vm in vmList
                set vmName to name of vm
                set vmId to id of vm
                set vmStatus to status of vm
                copy (vmId & "|" & vmName & "|" & vmStatus) to end of resultList
            end repeat
            return resultList
        end tell
        """
        
        let output = try await runAppleScript(script, app: app, track: false)
        let lines = output.components(separatedBy: ", ").map { $0.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines) }
        
        var vms: [UTMVM] = []
        for line in lines where !line.isEmpty {
            let parts = line.components(separatedBy: "|")
            if parts.count >= 3 {
                // Map AppleScript status to MiniDock status
                let rawStatus = parts[2].lowercased()
                let mappedStatus: String
                if rawStatus == "started" {
                    mappedStatus = "running"
                } else if rawStatus == "stopped" || rawStatus == "off" {
                    mappedStatus = "stopped"
                } else {
                    mappedStatus = rawStatus
                }
                
                vms.append(UTMVM(uuid: parts[0], name: parts[1], status: mappedStatus))
            }
        }
        
        vmCache.set(vms)
        return vms
    }
    
    private func runCLI(path: String, args: [String], app: Application, track: Bool = false) async throws -> String {
        let command = "\(path) \(args.joined(separator: " "))"
        
        let engine = app.instructionEngine
        let instructionId = track ? await engine.emitStarted(app: app, command: command) : nil
        
        let process = Process()
        process.executableURL = URL(fileURLWithPath: path)
        process.arguments = args
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        
        do {
            try process.run()
            process.waitUntilExit()
            
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: data, encoding: .utf8) ?? ""
            
            if let id = instructionId {
                await engine.emitFinished(app: app, id: id, output: output, exitCode: process.terminationStatus)
            }
            
            return output
        } catch {
            if let id = instructionId {
                await engine.emitFinished(app: app, id: id, output: "Error: \(error.localizedDescription)", exitCode: 1)
            }
            throw error
        }
    }
    
    private func runAppleScript(_ script: String, app: Application, track: Bool = false) async throws -> String {
        let command = "AppleScript: \(script.prefix(50))..."
        
        let engine = app.instructionEngine
        let instructionId = track ? await engine.emitStarted(app: app, command: command) : nil
        
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-e", script]
        let outputPipe = Pipe()
        process.standardOutput = outputPipe
        process.standardError = outputPipe
        
        do {
            try process.run()
            process.waitUntilExit()
            
            let data = outputPipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: data, encoding: .utf8) ?? ""
            
            if let id = instructionId {
                await engine.emitFinished(app: app, id: id, output: output, exitCode: process.terminationStatus)
            }
            
            return output
        } catch {
            if let id = instructionId {
                await engine.emitFinished(app: app, id: id, output: "Error: \(error.localizedDescription)", exitCode: 1)
            }
            throw error
        }
    }
    
    public func checkPrerequisites() async -> Bool {
        return FileManager.default.fileExists(atPath: "/Applications/UTM.app")
    }
}

public struct UTMVM: Content {
    public let uuid: String
    public let name: String
    public let status: String
}
