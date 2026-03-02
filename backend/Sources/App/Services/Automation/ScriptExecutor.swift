import Foundation
import Vapor

public enum ScriptLanguage: String {
    case shell = "shell"
    case python = "python"
    case swift = "swift"
    
    var interpreter: String {
        switch self {
        case .shell: return "/bin/zsh"
        case .python: return "/usr/bin/python3"
        case .swift: return "/usr/bin/swift"
        }
    }
}

public struct ScriptResult {
    public let output: String
    public let exitCode: Int32
}

public final class ScriptExecutor: Sendable {
    /// Maximum execution time for scripts (5 minutes)
    private static let scriptTimeout: UInt64 = 300
    public static func execute(script: String, language: ScriptLanguage, env: [String: String] = [:], app: Application) async throws -> ScriptResult {
        let engine = app.instructionEngine
        let instructionId = await engine.emitStarted(app: app, command: script.prefix(100) + (script.count > 100 ? "..." : ""), fullCommand: script)
        app.logger.info("Executing \(language.rawValue) script...")

        do {
            let command: String
            var tempFileURL: URL? = nil
        switch language {
            case .shell:
                command = script
            case .python, .swift:
                let tempDir = FileManager.default.temporaryDirectory
                let fileName = "minidock_script_\(UUID().uuidString)"
                let ext = language == .python ? "py" : "swift"
                let fileURL = tempDir.appendingPathComponent("\(fileName).\(ext)")
                try script.write(to: fileURL, atomically: true, encoding: .utf8)
                tempFileURL = fileURL
                command = "\(language.interpreter) \(fileURL.path)"
            }

            let shellResult = try await Shell.run(
                command,
                app: app,
                track: false,
                env: env.isEmpty ? nil : env,
                timeout: scriptTimeout
            )

            // Cleanup temp file for non-shell scripts
            if let tempFileURL = tempFileURL {
                try? FileManager.default.removeItem(at: tempFileURL)
            }

            let result = ScriptResult(output: shellResult.output, exitCode: shellResult.exitCode)
            await engine.emitFinished(app: app, id: instructionId, output: result.output, exitCode: result.exitCode)
            return result
        } catch {
            await engine.emitFinished(app: app, id: instructionId, output: error.localizedDescription, exitCode: -1)
            throw error
        }
    }
}
