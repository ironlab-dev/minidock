import Vapor
import Foundation
import Fluent

/// 统一的 Git 存储服务，提供所有服务的 Git 操作接口
public actor GitStorageService {
    public static let shared = GitStorageService()
    private let logger: Logger
    private init() {
        self.logger = Logger(label: "git-storage")
    }
    
    private var instructionId: UUID?

    /// Shell-escape a single argument for safe inclusion in a shell command
    private nonisolated func shellEscape(_ arg: String) -> String {
        "'\(arg.replacingOccurrences(of: "'", with: "'\\''"  ))'"
    }

    /// Execute a single git command via Shell.run (non-blocking, async)
    private func executeSingleGitCommand(args: [String], basePath: String) async throws -> (output: String, exitCode: Int32) {
        let escapedArgs = args.map { shellEscape($0) }.joined(separator: " ")
        let escapedPath = shellEscape(basePath)
        let command = "cd \(escapedPath) && git \(escapedArgs)"
        let result = try await Shell.run(command)
        return (result.output, result.exitCode)
    }

    /// Interpret a non-zero exit code, returning a user-friendly error message.
    /// Returns nil when the exit code is not a real error (e.g. nothing to commit).
    private nonisolated func interpretGitError(args: [String], output: String, exitCode: Int32) -> String? {
        // Special handling for git commit: exit status 1 often means nothing to commit
        if args.contains("commit") && exitCode == 1 && output.contains("nothing to commit") {
            return nil
        }
        var errorMessage = output
        if output.contains("index.lock") || output.contains("Unable to create") {
            errorMessage = "Git 操作被锁定。系统将自动重试。如果问题持续，请检查是否有其他 Git 进程正在运行。\n原始错误: \(output)"
        } else if output.contains("cannot lock ref") {
            errorMessage = "Git 引用被锁定。系统将自动重试。\n原始错误: \(output)"
        } else if output.contains("authentication") || output.contains("permission denied") || output.contains("Permission denied") {
            errorMessage = "Git 认证失败。请检查远程仓库的访问权限和 SSH 密钥配置。\n原始错误: \(output)"
        } else if output.contains("network") || output.contains("connection") || output.contains("Connection") || output.contains("timeout") {
            errorMessage = "Git 网络连接失败。请检查网络连接和远程仓库地址。\n原始错误: \(output)"
        } else if output.contains("rejected") || output.contains("non-fast-forward") {
            errorMessage = "Git push 被拒绝。远程分支可能有新的提交，请先拉取远程更改。\n原始错误: \(output)"
        } else if output.contains("remote:") && output.contains("error") {
            errorMessage = "远程仓库返回错误。请检查远程仓库状态和权限。\n原始错误: \(output)"
        }
        return errorMessage
    }

    /// 执行 Git 命令（带重试、锁文件清理）
    public func runGitCommand(args: [String], basePath: String, timeout: TimeInterval = 15.0, app: Application? = nil, track: Bool = false) async throws -> String {
        let commandDisplayName = "Git [\( (basePath as NSString).lastPathComponent )]: \(args.joined(separator: " "))"
        let engine = app?.instructionEngine
        if track, let engine = engine, let app = app {
            let fullCommand = "git \(args.joined(separator: " "))"
            instructionId = await engine.emitStarted(app: app, command: commandDisplayName, fullCommand: fullCommand)
        } else {
            instructionId = nil
        }
        let maxRetries = 3
        var currentAttempt = 0
        var lastError: Error?
        
        while currentAttempt < maxRetries {
            do {
                let (output, exitCode) = try await executeSingleGitCommand(args: args, basePath: basePath)
                if exitCode != 0 {
                    if let errorMessage = interpretGitError(args: args, output: output, exitCode: exitCode) {
                        throw Abort(.internalServerError, reason: "Git command failed: \(errorMessage)")
                    }
                    // interpretGitError returned nil → not a real error (e.g. nothing to commit)
                }

                if let id = instructionId, let engine = engine, let app = app {
                    await engine.emitFinished(app: app, id: id, output: output, exitCode: 0)
                }
                return output
            } catch {
                lastError = error
                let errorStr = String(describing: error)
                if errorStr.contains("index.lock") || errorStr.contains("cannot lock ref") || errorStr.contains("Unable to create") {
                    if currentAttempt < maxRetries - 1 {
                        self.cleanupStaleGitLock(basePath: basePath)
                        try? await Task.sleep(nanoseconds: UInt64(0.5 * Double(currentAttempt + 1) * 1_000_000_000))
                        currentAttempt += 1
                        continue
                    }
                }
                if currentAttempt >= maxRetries - 1 {
                    if let id = instructionId, let engine = engine, let app = app {
                        await engine.emitFinished(app: app, id: id, output: "Error: \(lastError?.localizedDescription ?? "Unknown")", exitCode: 1)
                    }
                    throw lastError ?? Abort(.internalServerError, reason: "Git command failed after \(maxRetries) retries")
                }
                currentAttempt += 1
                try? await Task.sleep(nanoseconds: UInt64(0.5 * Double(currentAttempt) * 1_000_000_000))
            }
        }

        if let id = instructionId, let engine = engine, let app = app {
            await engine.emitFinished(app: app, id: id, output: "Git command failed unexpectedly", exitCode: 1)
        }
        throw Abort(.internalServerError, reason: "Git command failed unexpectedly")
    }
    
    /// 清理过期的锁文件
    nonisolated public func cleanupStaleGitLock(basePath: String) {
        let fm = FileManager.default
        let staleThreshold: TimeInterval = 300 // 5 分钟
        
        // 清理 index.lock（如果 stale）
        let indexLockPath = (basePath as NSString).appendingPathComponent(".git/index.lock")
        if fm.fileExists(atPath: indexLockPath) {
            if let attrs = try? fm.attributesOfItem(atPath: indexLockPath),
               let modDate = attrs[.modificationDate] as? Date {
                let age = Date().timeIntervalSince(modDate)
                if age > staleThreshold {
                    do {
                        try fm.removeItem(atPath: indexLockPath)
                        logger.info("[GitStorage] Removed stale index.lock (age: \(Int(age))s)")
                    } catch {
                        logger.error("[GitStorage] Failed to remove index.lock: \(error)")
                    }
                }
            } else {
                logger.warning("[GitStorage] Cannot determine index.lock age, skipping cleanup")
            }
        }
        
        // 清理 refs lock 文件
        let refsDir = (basePath as NSString).appendingPathComponent(".git/refs/remotes/origin")
        if let refs = try? fm.contentsOfDirectory(atPath: refsDir) {
            for ref in refs {
                if ref.hasSuffix(".lock") {
                    let lockPath = (refsDir as NSString).appendingPathComponent(ref)
                    if let attrs = try? fm.attributesOfItem(atPath: lockPath),
                       let modDate = attrs[.modificationDate] as? Date {
                        let age = Date().timeIntervalSince(modDate)
                        if age > staleThreshold {
                            do {
                                try fm.removeItem(atPath: lockPath)
                                logger.info("[GitStorage] Removed stale ref lock: \(ref) (age: \(Int(age))s)")
                            } catch {
                                logger.error("[GitStorage] Failed to remove ref lock \(ref): \(error)")
                            }
                        }
                    }
                }
            }
        }
    }
    
    /// 初始化 Git 仓库（幂等操作）
    public func ensureGitInitialized(basePath: String) async throws {
        // 确保基本的 .gitignore 存在（如果不存在）
        let gitignorePath = (basePath as NSString).appendingPathComponent(".gitignore")
        if !FileManager.default.fileExists(atPath: gitignorePath) {
            let content = """
            .DS_Store
            *.log
            *.tmp
            *.cache
            """
            try content.write(toFile: gitignorePath, atomically: true, encoding: String.Encoding.utf8)
        }

        let gitDir = (basePath as NSString).appendingPathComponent(".git")
        if !FileManager.default.fileExists(atPath: gitDir) {
            _ = try await runGitCommand(args: ["init"], basePath: basePath)

            // 创建初始提交
            let fm = FileManager.default
            if fm.fileExists(atPath: basePath) {
                _ = try await runGitCommand(args: ["add", "."], basePath: basePath)
                // 使用 --allow-empty 确保即使没有文件也能创建初始提交
                _ = try? await runGitCommand(args: ["commit", "-m", "Initial commit"], basePath: basePath)
            }
        }
    }

    /// 生成动态分支名（基于主机名和路径）
    nonisolated public func getDynamicBranchName(basePath: String) -> String {
        // Sanitize hostname for git branch naming
        let hostname = Host.current().localizedName ?? ProcessInfo.processInfo.hostName
        let cleanHostname = hostname.lowercased()
            .components(separatedBy: .whitespacesAndNewlines).joined(separator: "-")
            .replacingOccurrences(of: ".", with: "-")
            .filter { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") }

        let finalHostname = cleanHostname.isEmpty ? "minidock" : cleanHostname

        // 2. Use last component of path
        let dirName = (basePath as NSString).lastPathComponent

        return "\(finalHostname)-\(dirName)"
    }

    /// 推送到远程仓库（支持动态分支名，后台执行）
    public func tryPush(app: Application, basePath: String, remoteKey: String, branchKey: String) async throws {
        // Get Remote URL
        let remoteSetting = try await SystemSetting.query(on: app.db)
            .filter(\SystemSetting.$key == remoteKey)
            .first()
        let remote = remoteSetting?.value

        guard let remoteURL = remote, !remoteURL.isEmpty else {
            app.logger.warning("[GitStorage] Skipping push: remote URL not configured for key '\(remoteKey)'")
            return
        }

        // Get Branch Name
        let branchSetting = try await SystemSetting.query(on: app.db)
            .filter(\SystemSetting.$key == branchKey)
            .first()

        let branch: String
        if let val = branchSetting?.value, !val.isEmpty {
            branch = val
        } else {
            branch = getDynamicBranchName(basePath: basePath)
        }

        // 预防性清理：在 push 前先清理所有可能的 stale lock 文件
        cleanupStaleGitLock(basePath: basePath)

        // Check if remote exists
        let remotes = try await runGitCommand(args: ["remote"], basePath: basePath)
        if !remotes.contains("origin") {
            _ = try await runGitCommand(args: ["remote", "add", "origin", remoteURL], basePath: basePath)
        } else {
            // Update remote just in case
            _ = try await runGitCommand(args: ["remote", "set-url", "origin", remoteURL], basePath: basePath)
        }

        // 遵循 Git 最佳实践：先 fetch 同步远程状态
        do {
            _ = try await runGitCommand(args: ["fetch", "origin"], basePath: basePath)
        } catch {
            // Fetch 失败不影响 push，记录警告即可
            app.logger.warning("[GitStorage] Git fetch failed (non-critical): \(error)")
        }

        // 检查并切换到目标分支
        let currentBranch = try? await runGitCommand(args: ["branch", "--show-current"], basePath: basePath)
        let trimmedCurrentBranch = currentBranch?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        if trimmedCurrentBranch != branch {
            // 检查分支是否存在（本地或远程）
            let localBranches = try? await runGitCommand(args: ["branch"], basePath: basePath)
            let remoteBranches = try? await runGitCommand(args: ["branch", "-r"], basePath: basePath)
            let branchExistsLocally = localBranches?.contains(branch) ?? false
            let branchExistsRemotely = remoteBranches?.contains("origin/\(branch)") ?? false

            if branchExistsLocally {
                // 切换到已存在的本地分支
                _ = try await runGitCommand(args: ["checkout", branch], basePath: basePath)
                app.logger.info("[GitStorage] Switched to existing branch: \(branch)")
            } else if branchExistsRemotely {
                // 从远程跟踪分支创建本地分支
                _ = try await runGitCommand(args: ["checkout", "-b", branch, "origin/\(branch)"], basePath: basePath)
                app.logger.info("[GitStorage] Created and switched to branch: \(branch) (tracking origin/\(branch))")
            } else {
                // 创建新分支并切换
                _ = try await runGitCommand(args: ["checkout", "-b", branch], basePath: basePath)
                app.logger.info("[GitStorage] Created and switched to new branch: \(branch)")
            }
        }

        // Push with automatic retry (handled by runGitCommand)
        // 使用 -u 设置上游分支（如果是新分支）
        _ = try await runGitCommand(args: ["push", "-u", "origin", branch], basePath: basePath)

        app.logger.info("[GitStorage] Successfully pushed to \(remoteURL) branch \(branch)")
    }

    /// Git 提交结构
    public struct GitCommit: Content {
        public let hash: String
        public let date: String
        public let message: String
        public let author: String

        public init(hash: String, date: String, message: String, author: String) {
            self.hash = hash
            self.date = date
            self.message = message
            self.author = author
        }
    }

    // 历史记录缓存（30秒）
    private var historyCache: [String: (commits: [GitCommit], timestamp: Date)] = [:]
    private let cacheTimeout: TimeInterval = 30.0
    private let maxCacheEntries = 100

    /// 获取提交历史（带缓存）
    public func getHistory(basePath: String, path: String, limit: Int = 20) async throws -> [GitCommit] {
        let cacheKey = "\(basePath):\(path)"

        // 检查缓存
        if let cached = historyCache[cacheKey],
           Date().timeIntervalSince(cached.timestamp) < cacheTimeout {
            return cached.commits
        }

        // 确保 Git 已初始化
        try await ensureGitInitialized(basePath: basePath)

        // Format: hash|date|author|message
        let args = ["log", "--format=%H|%ai|%an|%s", "-n", "\(limit)", "--", path]
        let output = try await runGitCommand(args: args, basePath: basePath)

        let commits = output.components(separatedBy: .newlines)
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
            .compactMap { line -> GitCommit? in
                let parts = line.components(separatedBy: "|")
                guard parts.count >= 4 else { return nil }
                return GitCommit(
                    hash: String(parts[0].prefix(7)),
                    date: parts[1],
                    message: parts[3],
                    author: parts[2]
                )
            }

        // Evict expired cache entries if we exceed the cap
        if historyCache.count >= maxCacheEntries {
            let now = Date()
            let expiredKeys = historyCache.filter { now.timeIntervalSince($0.value.timestamp) > cacheTimeout }.map { $0.key }
            for key in expiredKeys {
                historyCache.removeValue(forKey: key)
            }
        }
        // 更新缓存
        historyCache[cacheKey] = (commits: commits, timestamp: Date())

        return commits
    }

    /// 获取差异内容
    public func getDiff(basePath: String, path: String, commitHash: String) async throws -> String {
        // Check if this is the first commit (no parent)
        let parentCheckArgs = ["rev-parse", "--verify", commitHash + "^"]
        let parentCheck = try? await runGitCommand(args: parentCheckArgs, basePath: basePath)
        let isFirstCommit = parentCheck == nil || parentCheck?.isEmpty == true

        if isFirstCommit {
            // For first commit, show all files added
            let args = ["show", "--format=", "--name-status", commitHash, "--", path]
            return try await runGitCommand(args: args, basePath: basePath)
        } else {
            // For subsequent commits, show diff from parent
            let args = ["diff", commitHash + "^", commitHash, "--", path]
            return try await runGitCommand(args: args, basePath: basePath)
        }
    }

    /// 清除历史缓存（在提交后调用）
    public func clearHistoryCache(basePath: String) {
        let keysToRemove = historyCache.keys.filter { $0.hasPrefix(basePath) }
        for key in keysToRemove {
            historyCache.removeValue(forKey: key)
        }
    }
}
