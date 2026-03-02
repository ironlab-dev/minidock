import Foundation
import AppKit

class AppLifecycleManager {
    static let shared = AppLifecycleManager()
    
    private var backendProcess: Process?
    private var frontendProcess: Process?
    private var backendLogHandle: FileHandle?
    private var frontendLogHandle: FileHandle?
    private var healthCheckTimer: Timer?
    
    // Restart frequency limiting
    private var lastBackendRestart: Date?
    private var lastFrontendRestart: Date?
    private var backendRestartCount = 0
    private var frontendRestartCount = 0
    private let maxRestartsPerMinute = 3
    
    var onStatusChange: ((Bool, Bool) -> Void)?
    
    private var appBundleMode: Bool {
        #if DEBUG
        return false
        #else
        return true
        #endif
    }
    
    // Dynamic path resolution
    private var projectRoot: String {
        #if DEBUG
        // In DEBUG mode, use the current working directory
        return FileManager.default.currentDirectoryPath
        #else
        return Bundle.main.bundlePath
        #endif
    }
    
    private var backendPath: String {
        #if DEBUG
        return projectRoot + "/backend/.build/release/App"
        #else
        return Bundle.main.resourcePath! + "/backend/App"
        #endif
    }

    private var frontendPath: String {
        #if DEBUG
        return projectRoot + "/web"
        #else
        return Bundle.main.resourcePath! + "/web"
        #endif
    }
    
    init() {
        setupLogging()
    }
    
    private func setupLogging() {
        let fileManager = FileManager.default
        let logsUrl = fileManager.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Logs/MiniDock")
        
        do {
            try fileManager.createDirectory(at: logsUrl, withIntermediateDirectories: true)
            
            let backendUrl = logsUrl.appendingPathComponent("backend.log")
            let frontendUrl = logsUrl.appendingPathComponent("frontend.log")
            
            if !fileManager.fileExists(atPath: backendUrl.path) {
                fileManager.createFile(atPath: backendUrl.path, contents: nil)
            }
            if !fileManager.fileExists(atPath: frontendUrl.path) {
                fileManager.createFile(atPath: frontendUrl.path, contents: nil)
            }
            
            backendLogHandle = try FileHandle(forWritingTo: backendUrl)
            frontendLogHandle = try FileHandle(forWritingTo: frontendUrl)
            
            // Seek to end
            backendLogHandle?.seekToEndOfFile()
            frontendLogHandle?.seekToEndOfFile()
            
        } catch {
            print("❌ [AppLifecycle] Failed to setup logging: \(error)")
        }
    }
    
    func startServices() {
        print("🚀 [AppLifecycle] Starting services...")
        startBackend()
        startFrontend()
        startHealthMonitoring()
    }
    
    func stopServices() {
        print("🛑 [AppLifecycle] Stopping services...")
        stopHealthMonitoring()
        terminateProcess(backendProcess, name: "Backend")
        terminateProcess(frontendProcess, name: "Frontend")
        
        // Ensure ports are freed (failsafe)
        killPort(configuredBackendPort)
        killPort(configuredFrontendPort)
        
        // Reset restart counters
        backendRestartCount = 0
        frontendRestartCount = 0
        
        try? backendLogHandle?.close()
        try? frontendLogHandle?.close()
    }
    
    private var configuredBackendPort: Int {
        let saved = UserDefaults.standard.integer(forKey: "backendPort")
        return saved > 0 ? saved : 28080
    }
    
    private var configuredFrontendPort: Int {
        let saved = UserDefaults.standard.integer(forKey: "frontendPort")
        return saved > 0 ? saved : 23000
    }
    
    private func startBackend() {
        let port = configuredBackendPort
        killPort(port) // Cleanup previous
        
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        let workingDir = appBundleMode ? Bundle.main.resourcePath! + "/backend" : projectRoot + "/backend"
        process.currentDirectoryURL = URL(fileURLWithPath: workingDir)
        process.arguments = [
            backendPath,
            "serve",
            "--env", "production",
            "--port", "\(port)"
        ]
        
        // Set environment variable to indicate bundle mode
        var env = ProcessInfo.processInfo.environment
        if appBundleMode {
            env["MINIDOCK_BUNDLE_MODE"] = "true"
        }
        process.environment = env
        
        attachLogging(to: process, handle: backendLogHandle)
        
        do {
            try process.run()
            backendProcess = process
            print("✅ [AppLifecycle] Backend started (PID: \(process.processIdentifier))")
        } catch {
            print("❌ [AppLifecycle] Failed to start backend: \(error)")
        }
    }
    
    private func startFrontend() {
        let frontendPort = configuredFrontendPort
        let backendPort = configuredBackendPort
        killPort(frontendPort)
        
        let process = Process()
        let workingDir = appBundleMode ? Bundle.main.resourcePath! + "/web" : projectRoot + "/web"
        process.currentDirectoryURL = URL(fileURLWithPath: workingDir)
        
        // Environment setup
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        env["BACKEND_PORT"] = "\(backendPort)"
        env["PORT"] = "\(frontendPort)"
        env["NODE_ENV"] = "production"
        
        if appBundleMode {
            // In bundle mode: use node to run server.mjs (includes WebSocket proxy)
            let nodePath = FileManager.default.fileExists(atPath: "/opt/homebrew/bin/node") 
                ? "/opt/homebrew/bin/node" 
                : "/usr/local/bin/node"
            process.executableURL = URL(fileURLWithPath: nodePath)
            process.arguments = ["server.mjs"]
        } else {
            // Development mode: use npm
            process.executableURL = URL(fileURLWithPath: "/usr/bin/npm")
            process.arguments = ["start", "--", "-p", "\(frontendPort)"]
        }
        
        process.environment = env
        
        attachLogging(to: process, handle: frontendLogHandle)
        
        do {
            try process.run()
            frontendProcess = process
            print("✅ [AppLifecycle] Frontend started (PID: \(process.processIdentifier))")
        } catch {
            print("❌ [AppLifecycle] Failed to start frontend: \(error)")
        }
    }
    
    private func attachLogging(to process: Process, handle: FileHandle?) {
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        
        pipe.fileHandleForReading.readabilityHandler = { fileHandle in
            let data = fileHandle.availableData
            guard !data.isEmpty else { return }
            
            // Check dynamic preference
            if UserDefaults.standard.bool(forKey: "enableLogging") {
                handle?.write(data)
            }
        }
    }
    
    private func terminateProcess(_ process: Process?, name: String) {
        guard let process = process, process.isRunning else { return }
        process.terminate()
        // Wait up to 5 seconds for graceful shutdown
        let deadline = Date().addingTimeInterval(5.0)
        while process.isRunning && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.1)
        }
        if process.isRunning {
            // Force kill if still running after timeout
            kill(process.processIdentifier, SIGKILL)
            process.waitUntilExit()
            print("⚠️ [AppLifecycle] \(name) force-killed after timeout")
        } else {
            print("✅ [AppLifecycle] \(name) terminated gracefully")
        }
    }
    
    private func killPort(_ port: Int) {
        let task = Process()
        task.launchPath = "/bin/bash"
        task.arguments = ["-c", "lsof -ti:\(port) | xargs kill -9 2>/dev/null || true"]
        task.launch()
        task.waitUntilExit()
    }
    
    // MARK: - Health Monitoring
    
    private func startHealthMonitoring() {
        stopHealthMonitoring() // Ensure no duplicate timers
        
        healthCheckTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            self?.checkAndRecoverServices()
        }
        
        // Initial check after a short delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            self?.checkAndRecoverServices()
        }
    }
    
    private func stopHealthMonitoring() {
        healthCheckTimer?.invalidate()
        healthCheckTimer = nil
    }
    
    private func checkAndRecoverServices() {
        let backendAlive = backendProcess?.isRunning ?? false
        let frontendAlive = frontendProcess?.isRunning ?? false
        
        // Auto-recover backend if process died
        if !backendAlive && backendProcess != nil {
            if shouldAllowRestart(lastRestart: lastBackendRestart, restartCount: &backendRestartCount) {
                print("⚠️ [AppLifecycle] Backend process died, restarting...")
                backendProcess = nil
                lastBackendRestart = Date()
                // Delay to ensure port is released
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                    self?.startBackend()
                }
            } else {
                print("❌ [AppLifecycle] Backend restart limit reached, skipping auto-restart")
            }
        }
        
        // Auto-recover frontend if process died
        if !frontendAlive && frontendProcess != nil {
            if shouldAllowRestart(lastRestart: lastFrontendRestart, restartCount: &frontendRestartCount) {
                print("⚠️ [AppLifecycle] Frontend process died, restarting...")
                frontendProcess = nil
                lastFrontendRestart = Date()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                    self?.startFrontend()
                }
            } else {
                print("❌ [AppLifecycle] Frontend restart limit reached, skipping auto-restart")
            }
        }
        
        // Notify UI layer of status change
        let currentBackendAlive = backendProcess?.isRunning ?? false
        let currentFrontendAlive = frontendProcess?.isRunning ?? false
        onStatusChange?(currentBackendAlive, currentFrontendAlive)
    }
    
    private func shouldAllowRestart(lastRestart: Date?, restartCount: inout Int) -> Bool {
        if let lastRestart = lastRestart,
           Date().timeIntervalSince(lastRestart) < 60 {
            restartCount += 1
            if restartCount >= maxRestartsPerMinute {
                return false
            }
        } else {
            restartCount = 0
        }
        return true
    }
    
    func getServiceStatus() -> (backendRunning: Bool, frontendRunning: Bool) {
        return (
            backendRunning: backendProcess?.isRunning ?? false,
            frontendRunning: frontendProcess?.isRunning ?? false
        )
    }
}
