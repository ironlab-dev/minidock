import Vapor
import Foundation

public enum Shell {
    public struct CommandResult: Sendable {
        public let output: String
        public let exitCode: Int32
    }

    @discardableResult
    public static func run(_ command: String, app: Application? = nil, track: Bool = false, env extraEnv: [String: String]? = nil, workingDirectory: String? = nil, timeout: UInt64? = nil) async throws -> CommandResult {
        let engine = app?.instructionEngine
        let instructionId: UUID?
        
        if track, let engine = engine, let app = app {
            instructionId = await engine.emitStarted(app: app, command: command, fullCommand: command)
        } else {
            instructionId = nil
        }
        
        let process = Process()
        let pipe = Pipe()
        
        process.standardOutput = pipe
        process.standardError = pipe
        process.arguments = ["-c", command]
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        
        let env = ProcessInfo.processInfo.environment
        var newEnv = env
        newEnv["PATH"] = (env["PATH"] ?? "") + ":/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        
        let homeDir = FileManager.default.homeDirectoryForCurrentUser.path
        let orbPath = "\(homeDir)/.orbstack/bin"
        if FileManager.default.fileExists(atPath: orbPath) {
            newEnv["PATH"] = (newEnv["PATH"] ?? "") + ":\(orbPath)"
        }
        
        if let extraEnv = extraEnv {
            for (key, value) in extraEnv {
                newEnv[key] = value
            }
        }
        
        process.environment = newEnv
        
        if let workingDirectory = workingDirectory {
            process.currentDirectoryURL = URL(fileURLWithPath: workingDirectory)
        }
        
        return try await withThrowingTaskGroup(of: CommandResult?.self) { taskGroup in
            var finalResult: CommandResult? = nil
            
            // Start the main process execution task
            taskGroup.addTask {
                return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<CommandResult, Error>) in
                    // Note: We use process.waitUntilExit() instead of a separate continuation
                    // to wait for process completion. This avoids the "resume continuation more than once" bug.
                    
                    // Use a lock to prevent multiple resumes
                    let lock = NSLock()
                    var hasResumed = false
                    
                    // Set up termination handler to ensure we track process state
                    process.terminationHandler = { _ in
                        // Nothing to do here - we use waitUntilExit() instead
                    }
                    
                    // Try to start the process
                    do {
                        try process.run()
                        
                        // Wait for process to finish - this is blocking but safe
                        // We read data first, then wait for process to complete
                        let data = pipe.fileHandleForReading.readDataToEndOfFile()
                        let output = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                        
                        // Wait for process to exit
                        process.waitUntilExit()
                        
                        let result = CommandResult(output: output, exitCode: process.terminationStatus)
                        
                        // Emit finished event if tracking
                        if let id = instructionId, let engine = engine, let app = app {
                            Task {
                                await engine.emitFinished(app: app, id: id, output: output, exitCode: process.terminationStatus)
                            }
                        }
                        
                        // Safely resume the continuation
                        lock.lock()
                        if !hasResumed {
                            hasResumed = true
                            continuation.resume(returning: result)
                        }
                        lock.unlock()
                    } catch {
                        // Ensure process is terminated
                        if process.isRunning {
                            process.terminate()
                        }
                        
                        // Report error through instruction tracking if available
                        if let id = instructionId, let engine = engine, let app = app {
                            Task {
                                await engine.emitFinished(app: app, id: id, output: "Error: \(error.localizedDescription)", exitCode: 1)
                            }
                        }
                        
                        lock.lock()
                        if !hasResumed {
                            hasResumed = true
                            continuation.resume(throwing: error)
                        }
                        lock.unlock()
                    }
                }
            }
            
            // Add timeout task that can be properly cancelled
            let timeoutSeconds = timeout ?? 60
            taskGroup.addTask {
                try? await Task.sleep(nanoseconds: timeoutSeconds * 1_000_000_000)
                
                if process.isRunning {
                    process.terminate()
                }
                
                return nil
            }
            
            // Collect results from task group
            for try await result in taskGroup {
                if let result = result {
                    finalResult = result
                    // Cancel remaining tasks once we have the result
                    taskGroup.cancelAll()
                    break
                }
            }
            
            guard let result = finalResult else {
                throw NSError(domain: "Shell", code: -1, userInfo: [NSLocalizedDescriptionKey: "Process execution failed"])
            }
            
            return result
        }
    }
}
