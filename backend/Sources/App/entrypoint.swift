import Vapor
import Logging

@main
struct Entrypoint {
    static func main() async throws {
        var env = try Environment.detect()
        try LoggingSystem.bootstrap(from: &env)
        
        let app = try await Application.make(env)
        defer { 
            Task {
                try await app.asyncShutdown()
            }
        }
        
        do {
            try await configure(app)
        } catch {
            app.logger.report(error: error)
            throw error
        }
        
        try await app.autoMigrate()
        try await app.execute()
    }
}
