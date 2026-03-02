import Vapor
import Foundation

public struct JellyfinNativeService: Sendable {
    public init() {}

    /// Check if Jellyfin.app is installed
    public func isInstalled() -> Bool {
        let paths = [
            "/Applications/Jellyfin.app",
            NSHomeDirectory() + "/Applications/Jellyfin.app"
        ]
        return paths.contains { FileManager.default.fileExists(atPath: $0) }
    }

    /// Get the path where Jellyfin.app is installed
    public func installedPath() -> String? {
        let paths = [
            "/Applications/Jellyfin.app",
            NSHomeDirectory() + "/Applications/Jellyfin.app"
        ]
        return paths.first { FileManager.default.fileExists(atPath: $0) }
    }

    /// Check if Jellyfin process is running
    public func isRunning() async -> Bool {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/pgrep")
        process.arguments = ["-x", "Jellyfin"]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = Pipe()
        do {
            try process.run()
            process.waitUntilExit()
            return process.terminationStatus == 0
        } catch {
            return false
        }
    }

    /// Check health via HTTP
    public func checkHealth() async -> Bool {
        guard let url = URL(string: "http://localhost:8096/health") else { return false }
        do {
            var request = URLRequest(url: url)
            request.timeoutInterval = 3
            let (_, response) = try await URLSession.shared.data(for: request)
            if let httpResponse = response as? HTTPURLResponse {
                return httpResponse.statusCode == 200
            }
            return false
        } catch {
            return false
        }
    }

    /// Install Jellyfin using best available method:
    /// 1. Homebrew Cask (preferred, most reliable)
    /// 2. DMG download (fallback)
    /// 3. User-friendly error with guidance link
    public func install(app: Application, onProgress: @Sendable @escaping (String) -> Void) async throws {
        // Strategy 1: Try Homebrew Cask
        if let brewPath = findBrewPath() {
            onProgress("Installing via Homebrew...")
            app.logger.info("[JellyfinNative] Attempting brew install --cask jellyfin")

            let brewProcess = Process()
            brewProcess.executableURL = URL(fileURLWithPath: brewPath)
            brewProcess.arguments = ["install", "--cask", "jellyfin"]
            let brewPipe = Pipe()
            brewProcess.standardOutput = brewPipe
            brewProcess.standardError = brewPipe
            do {
                try brewProcess.run()
                brewProcess.waitUntilExit()

                if brewProcess.terminationStatus == 0 {
                    onProgress("Jellyfin installed successfully via Homebrew")
                    app.logger.info("[JellyfinNative] Homebrew install succeeded")
                    return
                }
                let brewOutput = String(data: brewPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                app.logger.warning("[JellyfinNative] Homebrew install failed (exit \(brewProcess.terminationStatus)): \(brewOutput)")
            } catch {
                app.logger.warning("[JellyfinNative] Homebrew process error: \(error)")
            }

            onProgress("Homebrew install failed, trying DMG download...")
        }

        // Strategy 2: DMG download
        do {
            try await installViaDMG(app: app, onProgress: onProgress)
            return
        } catch {
            app.logger.error("[JellyfinNative] DMG install also failed: \(error)")
        }

        // Strategy 3: Both failed — throw user-friendly error with guidance
        throw Abort(.internalServerError, reason: "Jellyfin auto-install failed. Please install manually: open https://jellyfin.org/downloads/macos and drag Jellyfin.app to /Applications, then retry.")
    }

    /// DMG-based installation (fallback)
    private func installViaDMG(app: Application, onProgress: @Sendable @escaping (String) -> Void) async throws {
        let arch = ProcessInfo.processInfo.machineArchitecture
        let dmgArch = arch == "arm64" ? "arm64" : "amd64"
        let downloadURL = "https://repo.jellyfin.org/files/server/macos/latest-stable/\(dmgArch)/jellyfin-server_latest-stable_\(dmgArch).dmg"

        onProgress("Downloading Jellyfin DMG...")
        app.logger.info("[JellyfinNative] Downloading from: \(downloadURL)")

        let tempDir = NSTemporaryDirectory()
        let dmgPath = (tempDir as NSString).appendingPathComponent("jellyfin.dmg")

        // Download
        let curlProcess = Process()
        curlProcess.executableURL = URL(fileURLWithPath: "/usr/bin/curl")
        curlProcess.arguments = ["-L", "-o", dmgPath, "-#", "--fail", downloadURL]
        let curlPipe = Pipe()
        curlProcess.standardOutput = curlPipe
        curlProcess.standardError = curlPipe
        try curlProcess.run()
        curlProcess.waitUntilExit()

        guard curlProcess.terminationStatus == 0 else {
            let curlOutput = String(data: curlPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            app.logger.error("[JellyfinNative] curl failed: \(curlOutput)")
            throw Abort(.internalServerError, reason: "Failed to download Jellyfin DMG")
        }

        // Verify file size (DMG should be > 1MB)
        let fm = FileManager.default
        if let attrs = try? fm.attributesOfItem(atPath: dmgPath),
           let size = attrs[.size] as? Int, size < 1_000_000 {
            try? fm.removeItem(atPath: dmgPath)
            throw Abort(.internalServerError, reason: "Downloaded DMG is too small (\(size) bytes), likely a 404 redirect")
        }

        onProgress("Mounting DMG...")

        // Mount DMG
        let mountProcess = Process()
        mountProcess.executableURL = URL(fileURLWithPath: "/usr/bin/hdiutil")
        mountProcess.arguments = ["attach", dmgPath, "-nobrowse", "-noverify", "-noautoopen"]
        let mountPipe = Pipe()
        mountProcess.standardOutput = mountPipe
        let mountErrPipe = Pipe()
        mountProcess.standardError = mountErrPipe
        try mountProcess.run()
        mountProcess.waitUntilExit()

        guard mountProcess.terminationStatus == 0 else {
            let errOutput = String(data: mountErrPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            try? fm.removeItem(atPath: dmgPath)
            app.logger.error("[JellyfinNative] hdiutil mount failed: \(errOutput)")
            throw Abort(.internalServerError, reason: "Failed to mount DMG: \(errOutput.prefix(200))")
        }

        // Find mounted volume
        let mountOutput = String(data: mountPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        let volumePath = mountOutput.components(separatedBy: "\t").last?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "/Volumes/Jellyfin"

        onProgress("Installing Jellyfin.app...")

        // Copy app to /Applications
        let srcApp = (volumePath as NSString).appendingPathComponent("Jellyfin.app")
        let dstApp = "/Applications/Jellyfin.app"

        if fm.fileExists(atPath: dstApp) {
            try fm.removeItem(atPath: dstApp)
        }
        try fm.copyItem(atPath: srcApp, toPath: dstApp)

        // Detach DMG
        let detachProcess = Process()
        detachProcess.executableURL = URL(fileURLWithPath: "/usr/bin/hdiutil")
        detachProcess.arguments = ["detach", volumePath, "-quiet"]
        try detachProcess.run()
        detachProcess.waitUntilExit()

        // Cleanup
        try? fm.removeItem(atPath: dmgPath)

        onProgress("Jellyfin installed successfully")
        app.logger.info("[JellyfinNative] DMG installation complete")
    }

    /// Find brew executable path
    private func findBrewPath() -> String? {
        // Apple Silicon default
        if FileManager.default.fileExists(atPath: "/opt/homebrew/bin/brew") {
            return "/opt/homebrew/bin/brew"
        }
        // Intel default
        if FileManager.default.fileExists(atPath: "/usr/local/bin/brew") {
            return "/usr/local/bin/brew"
        }
        return nil
    }

    /// Start Jellyfin
    public func start() async throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        process.arguments = ["-a", "Jellyfin"]
        try process.run()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            throw Abort(.internalServerError, reason: "Failed to start Jellyfin")
        }
    }

    /// Stop Jellyfin
    public func stop() async throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/pkill")
        process.arguments = ["-x", "Jellyfin"]
        try process.run()
        process.waitUntilExit()
    }
}

// Helper extension
extension ProcessInfo {
    var machineArchitecture: String {
        var sysinfo = utsname()
        uname(&sysinfo)
        let machine = withUnsafePointer(to: &sysinfo.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) {
                String(cString: $0)
            }
        }
        return machine
    }
}
