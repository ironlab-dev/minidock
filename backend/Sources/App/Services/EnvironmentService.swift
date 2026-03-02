import Vapor
import Foundation

public actor EnvironmentService: MiniDockService {
    public let id: String = "env-service"
    public let name: String = "Environment Manager"
    public let type: ServiceType = .system
    
    public init() {}
    
    public struct ComponentStatus: Content {
        let name: String
        let isInstalled: Bool
        let path: String?
        let version: String?
    }
    
    public func getInfo(app: Application) async throws -> ServiceInfo {
        let status = try await getStatus()
        return ServiceInfo(
            id: id,
            name: name,
            type: type,
            status: status,
            description: "System environment and dependency manager.",
            stats: [
                "dependencies": "Check and install required system tools."
            ]
        )
    }
    
    public func getItems(app: Application) async throws -> [ServiceItem] {
        let componentStatuses = try await getComponentStatuses()
        return componentStatuses.map { comp in
            ServiceItem(
                id: comp.name,
                name: comp.name.capitalized,
                status: comp.isInstalled ? "running" : "stopped",
                metadata: [
                    "installed": comp.isInstalled ? "Yes" : "No",
                    "path": comp.path ?? "N/A",
                    "version": comp.version ?? "N/A"
                ]
            )
        }
    }
    
    public func getStatus() async throws -> ServiceStatus {
        return .running
    }
    
    public func start(app: Application) async throws {}
    public func stop(app: Application) async throws {}
    public func restart(app: Application) async throws {}
    
    public func getComponentStatuses() async throws -> [ComponentStatus] {
        return [
            try await checkComponent("brew"),
            try await checkComponent("docker"),
            try await checkComponent("qemu"),
            try await checkComponent("node")
        ]
    }
    
    private func checkComponent(_ name: String) async throws -> ComponentStatus {
        let path = try await findExecutable(name)
        let isInstalled = path != nil
        var version: String? = nil
        
        if let p = path {
            // Rough version check
            let flag = (name == "java") ? "-version" : "--version"
            version = try? await runCommand(p, [flag]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        
        // Normalize name for QEMU (reserved for future use)
        _ = name == "qemu" ? "QEMU" : name.capitalized
        
        return ComponentStatus(
            name: name,
            isInstalled: isInstalled,
            path: path,
            version: version
        )
    }
    
    private func findExecutable(_ name: String) async throws -> String? {
        // Special check for QEMU since it has multiple binaries
        if name == "qemu" {
            if let p = try? await findExecutable("qemu-system-aarch64") { return p }
            if let p = try? await findExecutable("qemu-system-x86_64") { return p }
            return nil
        }
        
        let paths = ["/opt/homebrew/bin/\(name)", "/usr/local/bin/\(name)", "/usr/bin/\(name)", "/bin/\(name)"]
        for p in paths {
            if FileManager.default.fileExists(atPath: p) {
                return p
            }
        }
        
        // Fallback to `which`
        if let whichPath = try? await runCommand("/usr/bin/which", [name]).trimmingCharacters(in: .whitespacesAndNewlines), !whichPath.isEmpty {
            return whichPath
        }
        
        return nil
    }
    
    public func install(app: Application, component: String) async throws {
        // Validate component name to prevent command injection
        let allowedComponents = ["qemu", "docker"]
        guard allowedComponents.contains(component.lowercased()) else {
            throw Abort(.badRequest, reason: "Invalid component name. Allowed: \(allowedComponents.joined(separator: ", "))")
        }
        
        let engine = app.instructionEngine
        let instructionId = await engine.emitStarted(app: app, command: "Install component: \(component)")
        
        // Use a detached task to run the script and stream logs
        Task {
            // Use absolute path from app bundle to prevent path traversal
            let scriptPath: String
            #if DEBUG
            // In development, use project directory
            scriptPath = FileManager.default.currentDirectoryPath + "/backend/scripts/install_component.sh"
            #else
            // In production, use app bundle resources
            guard let resourcePath = Bundle.main.resourcePath else {
                app.logger.error("Failed to locate app bundle resources")
                await app.instructionEngine.emitFinished(app: app, id: instructionId, output: "Error: App bundle resources not found", exitCode: 1)
                app.webSocketManager.broadcast(event: "env_install_complete", data: "{\"component\": \"\(component)\", \"status\": \"error\", \"message\": \"App bundle error\"}")
                return
            }
            scriptPath = resourcePath + "/backend/scripts/install_component.sh"
            #endif
            
            // Verify script exists and is executable
            guard FileManager.default.fileExists(atPath: scriptPath) else {
                app.logger.error("Install script not found at: \(scriptPath)")
                await app.instructionEngine.emitFinished(app: app, id: instructionId, output: "Error: Install script not found", exitCode: 1)
                app.webSocketManager.broadcast(event: "env_install_complete", data: "{\"component\": \"\(component)\", \"status\": \"error\", \"message\": \"Script not found\"}")
                return
            }
            
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/bin/bash")
            process.arguments = [scriptPath, component]
            
            let outputPipe = Pipe()
            process.standardOutput = outputPipe
            process.standardError = outputPipe
            
            var fullOutput = ""
            
            do {
                try process.run()
                
                // Set timeout (5 minutes for installation)
                let timeoutTask = Task {
                    try await Task.sleep(nanoseconds: 300_000_000_000) // 5 minutes
                    if process.isRunning {
                        app.logger.warning("Install script timeout, terminating process")
                        process.terminate()
                    }
                }
                
                let handle = outputPipe.fileHandleForReading
                for try await line in handle.bytes.lines {
                    // Escape special characters for JSON
                    let escapedLine = line
                        .replacingOccurrences(of: "\\", with: "\\\\")
                        .replacingOccurrences(of: "\"", with: "\\\"")
                        .replacingOccurrences(of: "\n", with: "\\n")
                        .replacingOccurrences(of: "\r", with: "\\r")
                        .replacingOccurrences(of: "\t", with: "\\t")
                    
                    let payload = "{\"component\": \"\(component)\", \"log\": \"\(escapedLine)\"}"
                    app.webSocketManager.broadcast(event: "env_install_progress", data: payload)
                    fullOutput += line + "\n"
                }
                
                process.waitUntilExit()
                timeoutTask.cancel()
                
                let engine = app.instructionEngine
                await engine.emitFinished(app: app, id: instructionId, output: fullOutput, exitCode: process.terminationStatus)
                
                if process.terminationStatus == 0 {
                    app.webSocketManager.broadcast(event: "env_install_complete", data: "{\"component\": \"\(component)\", \"status\": \"success\"}")
                } else {
                    app.webSocketManager.broadcast(event: "env_install_complete", data: "{\"component\": \"\(component)\", \"status\": \"error\", \"code\": \(process.terminationStatus)}")
                }
                
            } catch {
                app.logger.error("Failed to install \(component): \(error)")
                await app.instructionEngine.emitFinished(app: app, id: instructionId, output: "Installation failed", exitCode: 1)
                app.webSocketManager.broadcast(event: "env_install_complete", data: "{\"component\": \"\(component)\", \"status\": \"error\", \"message\": \"Installation failed\"}")
            }
        }
    }
    
    private func runCommand(_ executable: String, _ args: [String]) async throws -> String {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = args
        let pipe = Pipe()
        process.standardOutput = pipe
        try process.run()
        process.waitUntilExit()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        return String(data: data, encoding: .utf8) ?? ""
    }
}
