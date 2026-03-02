import Foundation
import Vapor

public struct RsyncService: Sendable {
    public init() {}
    
    /// 检测 rsync 可用性
    /// - Returns: 是否可用
    public func checkAvailability(app: Application) async throws -> Bool {
        // 1. 检查 rsync 命令是否存在
        let rsyncCheck = try await runCommand("which rsync", app: app)
        guard rsyncCheck.exitCode == 0, !rsyncCheck.output.isEmpty else {
            app.logger.warning("[RsyncService] rsync command not found")
            return false
        }
        
        // 2. 检查 SSH 是否可用（尝试连接 localhost）
        _ = try await runCommand("ssh -o ConnectTimeout=2 -o StrictHostKeyChecking=no localhost 'echo ok' 2>&1", app: app)
        // SSH 连接可能失败，但只要命令能执行就说明 SSH 客户端可用
        // 我们主要检查 SSH 命令是否存在
        let sshExists = try await runCommand("which ssh", app: app)
        guard sshExists.exitCode == 0 else {
            app.logger.warning("[RsyncService] ssh command not found")
            return false
        }
        
        app.logger.info("[RsyncService] rsync and ssh are available")
        return true
    }
    
    /// 使用 rsync 上传文件
    /// - Parameters:
    ///   - source: 源文件路径
    ///   - destination: 目标路径
    ///   - uploadId: 上传 ID（用于 WebSocket 事件）
    ///   - app: Application 实例
    ///   - onProgress: 进度回调 (loaded, total, percent, speed, eta)
    public func uploadFile(
        source: String,
        destination: String,
        uploadId: String,
        app: Application,
        onProgress: @escaping @Sendable (Int64, Int64, Int, Double?, Int?) -> Void
    ) async throws {
        let fm = FileManager.default
        
        // 验证源文件存在
        guard fm.fileExists(atPath: source) else {
            throw Abort(.badRequest, reason: "Source file does not exist: \(source)")
        }
        
        // 获取文件大小
        let fileAttributes = try fm.attributesOfItem(atPath: source)
        guard let fileSize = fileAttributes[.size] as? Int64 else {
            throw Abort(.internalServerError, reason: "Failed to get file size")
        }
        
        // 确保目标目录存在
        let destinationDir = (destination as NSString).deletingLastPathComponent
        if !fm.fileExists(atPath: destinationDir) {
            try fm.createDirectory(atPath: destinationDir, withIntermediateDirectories: true)
        }
        
        // 构建 rsync 命令
        // 本地文件系统操作，不需要 SSH
        // -a: 归档模式
        // -v: 详细输出
        // -z: 压缩传输（本地操作时可选，但保留以保持一致性）
        // -P: --partial --progress
        // --partial: 保留部分传输的文件
        // --progress: 显示进度
        // --partial-dir: 部分文件临时目录
        let partialDir = (destinationDir as NSString).appendingPathComponent(".rsync-partial")
        if !fm.fileExists(atPath: partialDir) {
            try fm.createDirectory(atPath: partialDir, withIntermediateDirectories: true)
        }
        
        let rsyncArgs = [
            "-avzP", "--progress",
            "--partial", "--partial-dir=\(partialDir)",
            source,
            destination
        ]

        app.logger.info("[RsyncService] Starting rsync upload: \(source) -> \(destination)")

        // 执行 rsync 命令并实时解析进度
        try await runRsyncWithProgress(
            rsyncArgs: rsyncArgs,
            totalSize: fileSize,
            uploadId: uploadId,
            app: app,
            onProgress: onProgress
        )
        
        app.logger.info("[RsyncService] rsync upload completed")
    }
    
    /// 执行 rsync 命令并解析进度
    private func runRsyncWithProgress(
        rsyncArgs: [String],
        totalSize: Int64,
        uploadId: String,
        app: Application,
        onProgress: @escaping (Int64, Int64, Int, Double?, Int?) -> Void
    ) async throws {
        let task = Process()
        let outputPipe = Pipe()
        let errorPipe = Pipe()

        task.standardOutput = outputPipe
        task.standardError = errorPipe
        task.arguments = rsyncArgs
        // Use rsync directly instead of shell to prevent command injection
        task.executableURL = URL(fileURLWithPath: "/usr/bin/rsync")
        
        let env = ProcessInfo.processInfo.environment
        var newEnv = env
        newEnv["PATH"] = (env["PATH"] ?? "") + ":/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        task.environment = newEnv
        
        // 进度解析状态
        let progressThrottleInterval: TimeInterval = 0.1 // 100ms
        final class ProgressThrottle: @unchecked Sendable {
            private let lock = NSLock()
            private var lastTime: Date = Date()
            
            func shouldUpdate(now: Date, interval: TimeInterval) -> Bool {
                lock.lock()
                defer { lock.unlock() }
                
                if now.timeIntervalSince(lastTime) >= interval {
                    lastTime = now
                    return true
                }
                return false
            }
        }
        let throttle = ProgressThrottle()
        
        // 立即推送开始处理状态（90%）
        let startData: [String: Any] = [
            "uploadId": uploadId,
            "stage": "processing",
            "percent": 90,
            "loaded": 0,
            "total": totalSize,
            "speed": 0
        ]
        if let jsonData = try? JSONSerialization.data(withJSONObject: startData),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            app.webSocketManager.broadcast(event: "iso_upload_progress", data: jsonString)
        }
        
        // 心跳机制：即使没有详细进度也定期推送状态
        let heartbeatTask = Task { @Sendable in
            var heartbeatCount = 0
            
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 500_000_000) // 500ms心跳
                
                // 如果没有收到新的进度更新，推送心跳（轻微增加百分比以显示活动）
                heartbeatCount += 1
                let heartbeatPercent = min(90 + (heartbeatCount % 10), 99) // 90-99%之间循环
                
                let heartbeatData: [String: Any] = [
                    "uploadId": uploadId,
                    "stage": "processing",
                    "percent": heartbeatPercent,
                    "loaded": Int64(Double(totalSize) * Double(heartbeatPercent) / 100.0),
                    "total": totalSize,
                    "speed": 0
                ]
                
                if let jsonData = try? JSONSerialization.data(withJSONObject: heartbeatData),
                   let jsonString = String(data: jsonData, encoding: .utf8) {
                    app.webSocketManager.broadcast(event: "iso_upload_progress", data: jsonString)
                }
            }
        }
        
        // 启动进度解析任务
        let progressTask = Task { @Sendable in
            let fileHandle = outputPipe.fileHandleForReading
            var buffer = Data()
            
            while !Task.isCancelled {
                let availableData = fileHandle.availableData
                if availableData.isEmpty {
                    try? await Task.sleep(nanoseconds: 100_000_000) // 100ms
                    continue
                }
                
                buffer.append(availableData)
                
                // 解析进度行
                if let text = String(data: buffer, encoding: .utf8) {
                    let lines = text.components(separatedBy: .newlines)
                    // 保留最后一行（可能不完整）
                    if lines.count > 1, let lastLine = lines.last {
                        buffer = Data(lastLine.utf8)
                    }
                    
                    // 解析每一行
                    for line in lines.dropLast() {
                        if let progress = parseRsyncProgress(line: line, totalSize: totalSize) {
                            let now = Date()
                            if throttle.shouldUpdate(now: now, interval: progressThrottleInterval) {
                                // 直接推送 WebSocket 事件
                                let progressData: [String: Any] = [
                                    "uploadId": uploadId,
                                    "stage": "processing",
                                    "percent": 90 + (progress.percent * 10 / 100), // 映射到90-100%
                                    "loaded": progress.loaded,
                                    "total": progress.total,
                                    "speed": progress.speed ?? 0,
                                    "eta": progress.eta ?? 0
                                ]
                                
                                if let jsonData = try? JSONSerialization.data(withJSONObject: progressData),
                                   let jsonString = String(data: jsonData, encoding: .utf8) {
                                    app.webSocketManager.broadcast(event: "iso_upload_progress", data: jsonString)
                                }
                            }
                        }
                    }
                }
            }
        }
        
        do {
            try task.run()
            
            // 异步等待任务完成，不阻塞心跳和进度任务
            // 使用轮询方式检查进程状态，确保心跳和进度任务可以继续执行
            while task.isRunning {
                try await Task.sleep(nanoseconds: 100_000_000) // 100ms
            }
            
            // 取消所有任务
            progressTask.cancel()
            heartbeatTask.cancel()
            
            if task.terminationStatus != 0 {
                let errorPipeData = errorPipe.fileHandleForReading.readDataToEndOfFile()
                let errorOutput = String(data: errorPipeData, encoding: .utf8) ?? "Unknown error"
                app.logger.error("[RsyncService] rsync failed: \(errorOutput)")
                
                // 推送错误事件
                let errorEventData: [String: Any] = [
                    "uploadId": uploadId,
                    "stage": "error",
                    "percent": 0,
                    "loaded": 0,
                    "total": totalSize,
                    "error": errorOutput
                ]
                if let jsonData = try? JSONSerialization.data(withJSONObject: errorEventData),
                   let jsonString = String(data: jsonData, encoding: .utf8) {
                    app.webSocketManager.broadcast(event: "iso_upload_progress", data: jsonString)
                }
                
                throw Abort(.internalServerError, reason: "rsync failed: \(errorOutput)")
            }
            
            // 推送完成事件
            let completeData: [String: Any] = [
                "uploadId": uploadId,
                "stage": "completed",
                "percent": 100,
                "loaded": totalSize,
                "total": totalSize
            ]
            
            if let jsonData = try? JSONSerialization.data(withJSONObject: completeData),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                app.webSocketManager.broadcast(event: "iso_upload_progress", data: jsonString)
            }
            
        } catch {
            progressTask.cancel()
            heartbeatTask.cancel()
            throw error
        }
    }
    
    /// 解析 rsync --progress 输出
    /// 格式示例: "    1,234,567  12%  123.45kB/s    0:00:45" 或 "    1,234,567  12%"
    private func parseRsyncProgress(line: String, totalSize: Int64) -> (loaded: Int64, total: Int64, percent: Int, speed: Double?, eta: Int?)? {
        // 移除空格和制表符
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        
        // 匹配进度行格式（更宽松的正则，支持多种格式）
        // 格式1: "数字 百分比% 速度 剩余时间"
        // 格式2: "数字 百分比%"
        // 例如: "1,234,567  12%  123.45kB/s    0:00:45" 或 "1,234,567  12%"
        let pattern = #"(\d{1,3}(?:,\d{3})*)\s+(\d+)%(?:\s+([\d.]+)([kmg]?b?/s)?(?:\s+(\d+):(\d+):(\d+))?)?"#
        
        guard let regex = try? NSRegularExpression(pattern: pattern, options: []),
              let match = regex.firstMatch(in: trimmed, options: [], range: NSRange(location: 0, length: trimmed.utf16.count)) else {
            return nil
        }
        
        // 提取已传输字节数
        guard let loadedRange = Range(match.range(at: 1), in: trimmed),
              let loaded = Int64(trimmed[loadedRange].replacingOccurrences(of: ",", with: "")) else {
            return nil
        }
        
        // 提取百分比
        guard let percentRange = Range(match.range(at: 2), in: trimmed),
              let percent = Int(trimmed[percentRange]) else {
            return nil
        }
        
        // 提取速度（可选）
        var speed: Double? = nil
        if match.range(at: 3).location != NSNotFound,
           let speedRange = Range(match.range(at: 3), in: trimmed),
           let speedValue = Double(trimmed[speedRange]) {
            var multiplier: Double = 1.0
            if match.range(at: 4).location != NSNotFound,
               let unitRange = Range(match.range(at: 4), in: trimmed) {
                let unit = trimmed[unitRange].lowercased()
                if unit.contains("kb") || unit.contains("k") {
                    multiplier = 1024
                } else if unit.contains("mb") || unit.contains("m") {
                    multiplier = 1024 * 1024
                } else if unit.contains("gb") || unit.contains("g") {
                    multiplier = 1024 * 1024 * 1024
                }
            }
            speed = speedValue * multiplier
        }
        
        // 提取剩余时间（可选）
        var eta: Int? = nil
        if match.range(at: 5).location != NSNotFound,
           match.range(at: 6).location != NSNotFound,
           match.range(at: 7).location != NSNotFound,
           let hoursRange = Range(match.range(at: 5), in: trimmed),
           let minutesRange = Range(match.range(at: 6), in: trimmed),
           let secondsRange = Range(match.range(at: 7), in: trimmed),
           let hours = Int(trimmed[hoursRange]),
           let minutes = Int(trimmed[minutesRange]),
           let seconds = Int(trimmed[secondsRange]) {
            eta = hours * 3600 + minutes * 60 + seconds
        }
        
        return (loaded: loaded, total: totalSize, percent: percent, speed: speed, eta: eta)
    }
    
    /// 执行简单命令
    private func runCommand(_ command: String, app: Application) async throws -> (output: String, exitCode: Int32) {
        let task = Process()
        let pipe = Pipe()
        
        task.standardOutput = pipe
        task.standardError = pipe
        task.arguments = ["-c", command]
        task.executableURL = URL(fileURLWithPath: "/bin/zsh")
        
        let env = ProcessInfo.processInfo.environment
        var newEnv = env
        newEnv["PATH"] = (env["PATH"] ?? "") + ":/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        task.environment = newEnv
        
        try task.run()
        task.waitUntilExit()
        
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let output = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        
        return (output, task.terminationStatus)
    }
}
