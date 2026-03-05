import Vapor
import Fluent
import FluentSQLiteDriver

public func configure(_ app: Application) async throws {
    // Base directory for database
    let fileManager = FileManager.default
    let dataDir: URL

    if app.environment == .production {
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        dataDir = appSupport.appendingPathComponent("MiniDock/database")
    } else {
        dataDir = URL(fileURLWithPath: "Data/database")
    }

    if !fileManager.fileExists(atPath: dataDir.path) {
        try fileManager.createDirectory(at: dataDir, withIntermediateDirectories: true)
    }

    // CORS
    if app.environment == .production {
        // Support environment variable configuration for allowed origins
        if let allowedOrigins = Environment.get("ALLOWED_ORIGINS") {
            let origins = allowedOrigins.split(separator: ",").map { String($0).trimmingCharacters(in: .whitespaces) }
            let corsConfiguration = CORSMiddleware.Configuration(
                allowedOrigin: .any(origins),
                allowedMethods: [.GET, .POST, .PUT, .DELETE, .OPTIONS],
                allowedHeaders: [.contentType, .authorization, .accept, .origin, .xRequestedWith, .accessControlAllowOrigin, HTTPHeaders.Name("x-upload-id"), HTTPHeaders.Name("x-temp-path"), HTTPHeaders.Name("x-file-name")]
            )
            app.middleware.use(CORSMiddleware(configuration: corsConfiguration))
        } else {
            // Use dynamic CORS middleware (similar to development) for port forwarding scenarios
            app.middleware.use(ProductionCORSMiddleware())
        }
    } else {
        // In development, use custom middleware to mirror origin for dynamic ports
        app.middleware.use(DevelopmentCORSMiddleware())
    }

    // Database
    let dbPath = dataDir.appendingPathComponent("minidock.sqlite").path
    app.databases.use(.sqlite(.file(dbPath)), as: .sqlite)
    app.logger.info("Database initialized at: \(dbPath)")

    // Migrations
    app.migrations.add(CreateService())
    app.migrations.add(CreateAutomationTask())
    app.migrations.add(CreateExecutionLog())
    app.migrations.add(CreateSystemSetting())
    app.migrations.add(CreateServiceBootConfig())
    app.migrations.add(CreateUser())
    app.migrations.add(CreateInstruction())
    app.migrations.add(AddProgressToInstruction())
    app.migrations.add(AddDatabaseIndexes())
    app.migrations.add(CreateSolutionDeployment())

    // Increase max body size for ISO uploads
    app.routes.defaultMaxBodySize = "10GB"

    // JWT Configuration
    // Use environment variable or generate a random key (note: random key means invalidation on restart if not persisted)
    // For this local NAS context, we'll try to use a stable key if provided, or default to a persisted key in settings if possible,
    // but for simplicity here we will use a hardcoded fallback dev key if env is missing, OR better:
    // Generate a random key stored in memory - this means tokens expire on server restart.
    // The user requested "avoid frequent login", so we should ideally persist this key.
    // Let's check if we have a key in SystemSetting, if not generate and save it.

    // JWT secret: use env var, or auto-generate and persist to file on first launch
    let jwtSecret: String
    if let envSecret = Environment.get("JWT_SECRET") {
        jwtSecret = envSecret
    } else {
        let secretFile = dataDir.appendingPathComponent(".jwt_secret")
        if fileManager.fileExists(atPath: secretFile.path),
           let stored = try? String(contentsOf: secretFile, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines),
           !stored.isEmpty {
            jwtSecret = stored
        } else {
            // Generate a cryptographically random 32-byte key on first launch
            var bytes = [UInt8](repeating: 0, count: 32)
            _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
            let generated = bytes.map { String(format: "%02x", $0) }.joined()
            try generated.write(to: secretFile, atomically: true, encoding: .utf8)
            // Restrict file permissions to 0600 (owner read/write only)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: secretFile.path)
            app.logger.info("Generated new JWT secret key (persisted to disk)")
            jwtSecret = generated
        }
    }
    app.jwt.signers.use(.hs256(key: jwtSecret))

    // Routes
    try routes(app)
    try app.register(collection: AuthController())
    try app.register(collection: AdminController())

    // Start background monitoring (non-blocking, in background task)
    // This allows the server to start listening immediately without waiting for monitoring initialization
    Task {
        await app.serviceManager.startMonitoring(app: app)
    }

    // Auto-migrate automation tasks from database to file system
    Task {
        if let storage = await app.serviceManager.getService(id: "automation-storage") as? AutomationStorageService {
            do {
                try await storage.migrateFromDatabase(app: app)
            } catch {
                app.logger.warning("[Configure] Failed to migrate automation tasks: \(error)")
            }
        }
    }
}
