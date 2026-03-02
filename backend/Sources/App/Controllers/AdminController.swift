import Fluent
import Vapor

struct AdminController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        // All routes here require Admin role
        let admin = routes.grouped("admin")
            .grouped(CookieAuthMiddleware(), User.jwtAuthenticator(), User.guardMiddleware())
            .grouped(AdminMiddleware())
            
        admin.get("users", use: listUsers)
        admin.post("users", use: createUser)
        admin.put("users", ":id", "password", use: resetUserPassword)
        
        // Admin-only settings (convenience route, though normal settings API could also be used if protected)
        admin.put("settings", "registration", use: toggleRegistration)
    }

    // Middleware to ensure user is admin
    struct AdminMiddleware: AsyncMiddleware {
        func respond(to req: Request, chainingTo next: AsyncResponder) async throws -> Response {
            let user = try req.auth.require(User.self)
            guard user.role == "admin" else {
                throw Abort(.forbidden, reason: "Admin access required")
            }
            return try await next.respond(to: req)
        }
    }

    // DTOs
    struct CreateUserPayload: Content {
        let username: String
        let password: String
        let role: String // "user" or "admin"
    }
    
    struct ResetPasswordPayload: Content {
        let newPassword: String
    }
    
    struct ToggleRegistrationPayload: Content {
        let allow: Bool
    }

    // Handlers
    func listUsers(req: Request) async throws -> [AuthController.UserResponse] {
        let users = try await User.query(on: req.db).all()
        return try users.map { try AuthController.UserResponse(user: $0) }
    }
    
    func createUser(req: Request) async throws -> AuthController.UserResponse {
        let payload = try req.content.decode(CreateUserPayload.self)

        // Validate role
        guard ["user", "admin"].contains(payload.role) else {
            throw Abort(.badRequest, reason: "Role must be 'user' or 'admin'")
        }

        // Validate username
        guard payload.username.count >= 2, payload.username.count <= 50,
              payload.username.range(of: #"^[a-zA-Z0-9_-]+$"#, options: .regularExpression) != nil else {
            throw Abort(.badRequest, reason: "Username must be 2-50 characters (alphanumeric, underscore, hyphen)")
        }

        // Validate password strength
        guard payload.password.count >= 6 else {
            throw Abort(.badRequest, reason: "Password must be at least 6 characters")
        }

        let passwordHash = try Bcrypt.hash(payload.password)
        let user = User(
            username: payload.username,
            passwordHash: passwordHash,
            role: payload.role
        )
        
        do {
            try await user.save(on: req.db)
        } catch {
            throw Abort(.conflict, reason: "Username already exists")
        }
        
        return try AuthController.UserResponse(user: user)
    }

    func resetUserPassword(req: Request) async throws -> HTTPStatus {
        guard let id = req.parameters.get("id", as: UUID.self),
              let user = try await User.find(id, on: req.db) else {
            throw Abort(.notFound)
        }
        
        let payload = try req.content.decode(ResetPasswordPayload.self)
        user.passwordHash = try Bcrypt.hash(payload.newPassword)
        try await user.save(on: req.db)
        
        return .ok
    }
    
    func toggleRegistration(req: Request) async throws -> SystemSetting {
        let payload = try req.content.decode(ToggleRegistrationPayload.self)
        let newValue = String(payload.allow)
        
        // Upsert setting
        if let existing = try await SystemSetting.query(on: req.db)
            .filter(\.$key == "auth_allow_registration")
            .first() {
            existing.value = newValue
            try await existing.update(on: req.db)
            return existing
        } else {
            let setting = SystemSetting(
                key: "auth_allow_registration",
                value: newValue,
                category: "system",
                isSecret: false
            )
            try await setting.create(on: req.db)
            return setting
        }
    }
}
