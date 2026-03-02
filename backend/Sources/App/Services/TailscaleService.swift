import Vapor
import Foundation

// MARK: - Data Models

/// Tailscale 连接状态
public struct TailscaleStatus: Content, Sendable {
    public let backendState: String          // "Running", "Stopped", "NeedsLogin", "NeedsMachineAuth"
    public let selfNode: TailscaleNode?
    public let peers: [String: TailscaleNode]?
    public let health: [String]?
    public let magicDNSSuffix: String?

    public var isConnected: Bool {
        backendState == "Running"
    }

    public var needsLogin: Bool {
        backendState == "NeedsLogin" || backendState == "NeedsMachineAuth"
    }

    enum CodingKeys: String, CodingKey {
        case backendState = "BackendState"
        case selfNode = "Self"
        case peers = "Peer"
        case health = "Health"
        case magicDNSSuffix = "MagicDNSSuffix"
    }
}

public struct TailscaleNode: Content, Sendable {
    public let id: String
    public let hostName: String
    public let dnsName: String
    public let tailscaleIPs: [String]
    public let online: Bool
    public let relay: String?               // DERP 中继名称，空字符串表示直连
    public let curAddr: String?             // 当前连接地址
    public let rxBytes: Int64?
    public let txBytes: Int64?

    enum CodingKeys: String, CodingKey {
        case id = "ID"
        case hostName = "HostName"
        case dnsName = "DNSName"
        case tailscaleIPs = "TailscaleIPs"
        case online = "Online"
        case relay = "Relay"
        case curAddr = "CurAddr"
        case rxBytes = "RxBytes"
        case txBytes = "TxBytes"
    }
}

public struct TailscaleAuthResponse: Content, Sendable {
    public let authURL: String?             // 需要用户访问的登录 URL
    public let success: Bool
    public let message: String?
}

public struct TailscaleInstallCheck: Content, Sendable {
    public let installed: Bool
    public let path: String?
    public let daemonRunning: Bool?
}

public struct TailscaleInstallProgress: Content, Sendable {
    public let stage: String        // "downloading", "installing", "completed", "failed"
    public let message: String
    public let progress: Int?       // 0-100
}

public enum TailscaleError: Error, LocalizedError {
    case notInstalled
    case commandFailed(String)
    case authRequired
    case parseError(String)
    case installFailed(String)

    public var errorDescription: String? {
        switch self {
        case .notInstalled:
            return "Tailscale is not installed"
        case .commandFailed(let message):
            return "Tailscale command failed: \(message)"
        case .authRequired:
            return "Authentication required"
        case .parseError(let message):
            return "Failed to parse Tailscale output: \(message)"
        case .installFailed(let message):
            return "Failed to install Tailscale: \(message)"
        }
    }
}

// MARK: - Service Implementation

/// Tailscale 远程访问服务
public struct TailscaleService: MiniDockService, @unchecked Sendable {
    public let id: String = "tailscale"
    public let name: String = "Remote Access"
    public let type: ServiceType = .system

    private let statusCache = StateCache<TailscaleStatus>(ttl: 5.0)

    public init() {}

    // MARK: - MiniDockService Protocol

    public func getStatus() async throws -> ServiceStatus {
        guard await isInstalled() else {
            return .not_installed
        }

        do {
            let status = try await getTailscaleStatus()
            switch status.backendState {
            case "Running":
                return .running
            case "Stopped":
                return .stopped
            case "NeedsLogin", "NeedsMachineAuth":
                return .stopped  // 需要登录视为未运行
            case "Starting":
                return .starting
            default:
                return .unknown
            }
        } catch {
            return .error
        }
    }

    public func getInfo(app: Application) async throws -> ServiceInfo {
        let status = try await getStatus()
        var stats: [String: String] = [:]

        if status == .running {
            if let tailscaleStatus = try? await getTailscaleStatus(),
               let selfNode = tailscaleStatus.selfNode {
                stats["ip"] = selfNode.tailscaleIPs.first ?? "N/A"
                stats["hostname"] = selfNode.hostName
                stats["dns_name"] = selfNode.dnsName
                stats["connection_type"] = (selfNode.relay?.isEmpty ?? true) ? "direct" : "relayed"
            }
        }

        return ServiceInfo(
            id: id,
            name: name,
            type: type,
            status: status,
            description: "Access your NAS from anywhere with Tailscale",
            stats: stats
        )
    }

    // MARK: - Tailscale Operations

    /// 检查 Tailscale 是否已安装
    public func isInstalled() async -> Bool {
        let path = await resolveTailscalePath()
        return path != nil
    }

    /// 检查 Tailscale 守护进程是否运行
    public func isDaemonRunning() async -> Bool {
        do {
            // 尝试获取状态，如果成功说明守护进程在运行
            _ = try await runCommand(["status", "--json"])
            return true
        } catch {
            return false
        }
    }

    /// 获取安装信息
    public func getInstallInfo() async -> TailscaleInstallCheck {
        let path = await resolveTailscalePath()
        let installed = path != nil
        let daemonRunning = installed ? await isDaemonRunning() : false
        return TailscaleInstallCheck(installed: installed, path: path, daemonRunning: daemonRunning)
    }

    /// 获取 Tailscale 完整状态
    public func getTailscaleStatus() async throws -> TailscaleStatus {
        if let cached = statusCache.get() {
            return cached
        }

        guard let path = await resolveTailscalePath() else {
            throw TailscaleError.notInstalled
        }

        // 直接执行命令，只使用 stdout（不混入 stderr 的 Warning）
        let process = Process()
        process.executableURL = URL(fileURLWithPath: path)
        process.arguments = ["status", "--json"]

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        do {
            try process.run()
            let stdoutData = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()

            // 只用 stdout 解析 JSON（stderr 可能包含 Warning 等非 JSON 内容）
            guard !stdoutData.isEmpty else {
                throw TailscaleError.parseError("Empty output from tailscale status")
            }

            let decoder = JSONDecoder()
            let status = try decoder.decode(TailscaleStatus.self, from: stdoutData)
            statusCache.set(status)
            return status
        } catch let error as TailscaleError {
            throw error
        } catch {
            throw TailscaleError.parseError("JSON decode error: \(error.localizedDescription)")
        }
    }

    /// 启用 Tailscale（生成登录 URL 或直接连接）
    public func enable() async throws -> TailscaleAuthResponse {
        guard await isInstalled() else {
            throw TailscaleError.notInstalled
        }

        // 先检查当前状态
        let currentStatus = try await getTailscaleStatus()
        if currentStatus.isConnected {
            return TailscaleAuthResponse(authURL: nil, success: true, message: "Already connected")
        }

        // 使用 tailscale up 启动连接
        // 注意：在非交互模式下，如果需要认证，会返回认证 URL
        do {
            let output = try await runCommand(["up", "--reset"])

            // 检查输出中是否包含认证 URL
            if let urlRange = output.range(of: "https://login.tailscale.com/[^\\s]+", options: .regularExpression) {
                let authURL = String(output[urlRange])
                statusCache.invalidate()
                return TailscaleAuthResponse(authURL: authURL, success: false, message: "Authentication required")
            }

            statusCache.invalidate()
            return TailscaleAuthResponse(authURL: nil, success: true, message: "Connected successfully")
        } catch {
            // 命令失败时也检查输出中的认证 URL
            let errorMessage = error.localizedDescription
            if let urlRange = errorMessage.range(of: "https://login.tailscale.com/[^\\s]+", options: .regularExpression) {
                let authURL = String(errorMessage[urlRange])
                statusCache.invalidate()
                return TailscaleAuthResponse(authURL: authURL, success: false, message: "Authentication required")
            }
            throw error
        }
    }

    /// 禁用 Tailscale（断开但保持登录状态）
    public func disable() async throws {
        guard await isInstalled() else {
            throw TailscaleError.notInstalled
        }

        _ = try await runCommand(["down"])
        statusCache.invalidate()
    }

    /// 完全登出（需要重新认证）
    public func logout() async throws {
        guard await isInstalled() else {
            throw TailscaleError.notInstalled
        }

        _ = try await runCommand(["logout"])
        statusCache.invalidate()
    }

    // MARK: - One-Click Installation Helpers

    /// 在 NAS 上打开 Mac App Store 的 Tailscale 页面
    public func openAppStoreOnNAS() async throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        // 使用 macappstore:// URL scheme 直接打开 App Store 应用
        process.arguments = ["macappstore://apps.apple.com/app/id1475387142"]

        try process.run()
        process.waitUntilExit()

        if process.terminationStatus != 0 {
            throw TailscaleError.commandFailed("Failed to open App Store")
        }
    }

    /// 在 NAS 上打开 Tailscale 应用（如果已安装）
    public func openTailscaleAppOnNAS() async throws -> Bool {
        // 检查 Tailscale.app 是否存在
        let appPath = "/Applications/Tailscale.app"
        guard FileManager.default.fileExists(atPath: appPath) else {
            return false
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        process.arguments = ["-a", "Tailscale"]

        try process.run()
        process.waitUntilExit()

        return process.terminationStatus == 0
    }

    /// 检查 Tailscale Mac App 是否已安装
    public func isTailscaleAppInstalled() async -> Bool {
        return FileManager.default.fileExists(atPath: "/Applications/Tailscale.app")
    }

    /// 从官网下载 Tailscale .pkg 并打开安装器
    public func downloadAndInstall(app: Application) async throws -> TailscaleInstallProgress {
        let fm = FileManager.default
        let downloadDir = "/tmp/minidock-tailscale"
        let pkgPath = "\(downloadDir)/Tailscale.pkg"

        // 创建临时目录
        if !fm.fileExists(atPath: downloadDir) {
            try fm.createDirectory(atPath: downloadDir, withIntermediateDirectories: true)
        }

        // 如果已存在旧的 pkg，删除它
        if fm.fileExists(atPath: pkgPath) {
            try fm.removeItem(atPath: pkgPath)
        }

        app.logger.info("[Tailscale] Fetching latest version from official website...")

        // 首先获取下载页面，解析最新版本号
        let pageProcess = Process()
        pageProcess.executableURL = URL(fileURLWithPath: "/usr/bin/curl")
        pageProcess.arguments = ["-sL", "https://pkgs.tailscale.com/stable/"]

        let pagePipe = Pipe()
        pageProcess.standardOutput = pagePipe
        pageProcess.standardError = Pipe()

        try pageProcess.run()
        pageProcess.waitUntilExit()

        let pageContent = String(data: pagePipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""

        // 从页面内容中提取最新的 macOS pkg 文件名
        // 格式: Tailscale-X.Y.Z-macos.pkg
        guard let range = pageContent.range(of: "Tailscale-[0-9.]+-macos\\.pkg", options: .regularExpression),
              !pageContent[range].isEmpty else {
            app.logger.error("[Tailscale] Failed to find macOS package on download page")
            throw TailscaleError.installFailed("无法获取最新版本信息")
        }

        let pkgFileName = String(pageContent[range])
        let downloadURL = "https://pkgs.tailscale.com/stable/\(pkgFileName)"

        app.logger.info("[Tailscale] Downloading \(pkgFileName)...")

        // 下载 pkg 文件
        let curlProcess = Process()
        curlProcess.executableURL = URL(fileURLWithPath: "/usr/bin/curl")
        curlProcess.arguments = ["-fSL", "-o", pkgPath, downloadURL]

        let outputPipe = Pipe()
        let errorPipe = Pipe()
        curlProcess.standardOutput = outputPipe
        curlProcess.standardError = errorPipe

        try curlProcess.run()
        curlProcess.waitUntilExit()

        if curlProcess.terminationStatus != 0 {
            let errorOutput = String(data: errorPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            app.logger.error("[Tailscale] Download failed: \(errorOutput)")
            throw TailscaleError.installFailed("下载失败，请检查网络连接")
        }

        // 验证文件是否下载成功
        guard fm.fileExists(atPath: pkgPath) else {
            throw TailscaleError.installFailed("下载文件未找到")
        }

        // 检查文件大小（至少应该有几MB）
        if let attrs = try? fm.attributesOfItem(atPath: pkgPath),
           let size = attrs[.size] as? Int64,
           size < 1_000_000 {
            app.logger.error("[Tailscale] Downloaded file too small: \(size) bytes")
            throw TailscaleError.installFailed("下载文件不完整")
        }

        app.logger.info("[Tailscale] Download complete, opening installer...")

        // 打开 pkg 安装器（用户需要点击确认）
        let openProcess = Process()
        openProcess.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        openProcess.arguments = [pkgPath]

        try openProcess.run()
        openProcess.waitUntilExit()

        if openProcess.terminationStatus != 0 {
            throw TailscaleError.installFailed("无法打开安装器")
        }

        return TailscaleInstallProgress(
            stage: "installer_opened",
            message: "安装器已打开，请在 NAS 屏幕上完成安装",
            progress: 50
        )
    }

    // MARK: - Installation

    /// 检查 Homebrew 是否可用
    public func isHomebrewAvailable() async -> Bool {
        let paths = [
            "/opt/homebrew/bin/brew",
            "/usr/local/bin/brew"
        ]
        return paths.contains { FileManager.default.fileExists(atPath: $0) }
    }

    /// 通过 Homebrew 安装 Tailscale
    public func installViaHomebrew(app: Application) async throws -> TailscaleInstallProgress {
        // 检查 Homebrew 是否可用
        guard await isHomebrewAvailable() else {
            throw TailscaleError.installFailed("Homebrew is not installed. Please install Homebrew first: https://brew.sh")
        }

        // 检查是否已安装
        if await isInstalled() {
            return TailscaleInstallProgress(stage: "completed", message: "Tailscale is already installed", progress: 100)
        }

        app.logger.info("[Tailscale] Starting installation via Homebrew...")

        // 执行安装命令
        let brewPath = FileManager.default.fileExists(atPath: "/opt/homebrew/bin/brew")
            ? "/opt/homebrew/bin/brew"
            : "/usr/local/bin/brew"

        let process = Process()
        process.executableURL = URL(fileURLWithPath: brewPath)
        process.arguments = ["install", "tailscale"]

        // 设置环境变量
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        env["HOMEBREW_NO_AUTO_UPDATE"] = "1"  // 跳过自动更新加快速度
        process.environment = env

        let outputPipe = Pipe()
        let errorPipe = Pipe()
        process.standardOutput = outputPipe
        process.standardError = errorPipe

        do {
            try process.run()
            process.waitUntilExit()

            let output = String(data: outputPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            let errorOutput = String(data: errorPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""

            if process.terminationStatus == 0 {
                app.logger.info("[Tailscale] Installation completed successfully")
                return TailscaleInstallProgress(stage: "completed", message: "Tailscale installed successfully", progress: 100)
            } else {
                let errorMsg = errorOutput.isEmpty ? output : errorOutput
                app.logger.error("[Tailscale] Installation failed: \(errorMsg)")
                throw TailscaleError.installFailed(errorMsg)
            }
        } catch let error as TailscaleError {
            throw error
        } catch {
            throw TailscaleError.installFailed(error.localizedDescription)
        }
    }

    /// 启动 Tailscale 守护进程（如果需要）
    public func startDaemon() async throws {
        // 在 macOS 上，通过 Homebrew 安装的 Tailscale 需要启动服务
        let brewPath = FileManager.default.fileExists(atPath: "/opt/homebrew/bin/brew")
            ? "/opt/homebrew/bin/brew"
            : "/usr/local/bin/brew"

        if FileManager.default.fileExists(atPath: brewPath) {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: brewPath)
            process.arguments = ["services", "start", "tailscale"]

            var env = ProcessInfo.processInfo.environment
            env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
            process.environment = env

            let pipe = Pipe()
            process.standardOutput = pipe
            process.standardError = pipe

            try process.run()
            process.waitUntilExit()
        }
    }

    // MARK: - Private Methods

    private func runCommand(_ args: [String]) async throws -> String {
        guard let path = await resolveTailscalePath() else {
            throw TailscaleError.notInstalled
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: path)
        process.arguments = args

        let outputPipe = Pipe()
        let errorPipe = Pipe()
        process.standardOutput = outputPipe
        process.standardError = errorPipe

        do {
            try process.run()

            let outputData = outputPipe.fileHandleForReading.readDataToEndOfFile()
            let errorData = errorPipe.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()

            let output = String(data: outputData, encoding: .utf8) ?? ""
            let errorOutput = String(data: errorData, encoding: .utf8) ?? ""

            // tailscale 命令有时会在 stderr 输出有用信息（如认证 URL）
            let combinedOutput = output + errorOutput

            // 退出码为 0 表示成功
            if process.terminationStatus == 0 {
                return combinedOutput
            }

            // 某些命令（如 up）可能返回非零退出码但仍然有用
            // 检查是否包含认证 URL
            if combinedOutput.contains("https://login.tailscale.com") {
                return combinedOutput
            }

            throw TailscaleError.commandFailed(combinedOutput.isEmpty ? "Unknown error (exit code: \(process.terminationStatus))" : combinedOutput)
        } catch let error as TailscaleError {
            throw error
        } catch {
            throw TailscaleError.commandFailed(error.localizedDescription)
        }
    }

    private func resolveTailscalePath() async -> String? {
        // 检查常见的安装路径
        let paths = [
            "/opt/homebrew/bin/tailscale",                          // Homebrew (Apple Silicon)
            "/usr/local/bin/tailscale",                             // Homebrew (Intel) / Manual install
            "/Applications/Tailscale.app/Contents/MacOS/Tailscale"  // Mac App Store / Direct download
        ]

        for path in paths {
            if FileManager.default.fileExists(atPath: path) {
                return path
            }
        }

        // 尝试使用 which 命令查找
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        task.arguments = ["tailscale"]

        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = pipe

        do {
            try task.run()
            task.waitUntilExit()

            if task.terminationStatus == 0 {
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                if let path = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
                   !path.isEmpty {
                    return path
                }
            }
        } catch {
            // which 命令失败，忽略
        }

        return nil
    }
}
