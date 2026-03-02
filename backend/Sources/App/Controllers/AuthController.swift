import Fluent
import Vapor
import JWT

struct AuthController: RouteCollection {
    // Rate limiter: 10 attempts per 60 seconds per IP for login/register
    private let rateLimiter = RateLimitMiddleware(maxRequests: 10, windowSeconds: 60)

    func boot(routes: RoutesBuilder) throws {
        let auth = routes.grouped("auth")
        let rateLimited = auth.grouped(rateLimiter)
        rateLimited.post("register", use: register)
        rateLimited.post("login", use: login)
        auth.get("policy", use: getPolicy)
        
        // Protected routes
        let protected = auth.grouped(User.jwtAuthenticator(), User.guardMiddleware())
        protected.get("me", use: me)
        protected.put("password", use: changePassword)
        protected.post("refresh", use: refreshToken)
        protected.post("logout", use: logout)
    }

    // DTOs
    struct PolicyResponse: Content {
        let canRegister: Bool
    }
    
    struct RegisterPayload: Content {
        let username: String
        let password: String
        let confirmPassword: String
    }
    
    struct LoginPayload: Content {
        let username: String
        let password: String
    }
    
    struct TokenResponse: Content {
        let token: String
        let user: UserResponse
    }
    
    struct UserResponse: Content {
        let id: UUID
        let username: String
        let role: String
        let createdAt: Date?

        init(user: User) throws {
            guard let id = user.id else {
                throw Abort(.internalServerError, reason: "User ID is missing")
            }
            self.id = id
            self.username = user.username
            self.role = user.role
            self.createdAt = user.createdAt
        }
    }
    
    struct ChangePasswordPayload: Content {
        let oldPassword: String
        let newPassword: String
        let confirmNewPassword: String
    }

    // Handlers
    func register(req: Request) async throws -> TokenResponse {
        let payload = try req.content.decode(RegisterPayload.self)
        
        guard payload.password == payload.confirmPassword else {
            throw Abort(.badRequest, reason: "Passwords do not match")
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
        
        // 1. Check if ANY users exist. If valid users count is 0, this first user becomes ADMIN automatically.
        let userCount = try await User.query(on: req.db).count()
        let isFirstUser = userCount == 0
        
        // 2. If not first user, check if public registration is allowed
        if !isFirstUser {
            let allowRegistration = try await SystemSetting.query(on: req.db)
                .filter(\.$key == "auth_allow_registration")
                .first()?.value ?? "true" // Default to true if setting missing (will be seeded in configure)
            
            if allowRegistration == "false" {
                 throw Abort(.forbidden, reason: "Public registration is disabled.")
            }
        }
        
        // 3. Create user
        let passwordHash = try Bcrypt.hash(payload.password)
        let user = User(
            username: payload.username,
            passwordHash: passwordHash,
            role: isFirstUser ? "admin" : "user"
        )
        
        do {
            try await user.save(on: req.db)
        } catch {
            throw Abort(.conflict, reason: "Username already exists")
        }
        
        // 4. Generate Token
        let token = try req.jwt.sign(UserPayload(id: user.requireID(), username: user.username, role: user.role))
        
        return TokenResponse(token: token, user: try UserResponse(user: user))
    }

    func login(req: Request) async throws -> TokenResponse {
        let payload = try req.content.decode(LoginPayload.self)
        
        guard let user = try await User.query(on: req.db)
            .filter(\.$username == payload.username)
            .first() else {
            throw Abort(.unauthorized, reason: "Invalid username or password")
        }
        
        guard try user.verify(password: payload.password) else {
            throw Abort(.unauthorized, reason: "Invalid username or password")
        }
        
        let token = try req.jwt.sign(UserPayload(id: user.requireID(), username: user.username, role: user.role))
        return TokenResponse(token: token, user: try UserResponse(user: user))
    }

    func getPolicy(req: Request) async throws -> PolicyResponse {
        let allowRegistration = try await SystemSetting.query(on: req.db)
            .filter(\.$key == "auth_allow_registration")
            .first()?.value ?? "true"
        
        return PolicyResponse(canRegister: allowRegistration == "true")
    }

    func me(req: Request) async throws -> UserResponse {
        let user = try req.auth.require(User.self)
        return try UserResponse(user: user)
    }
    
    func refreshToken(req: Request) async throws -> TokenResponse {
        let user = try req.auth.require(User.self)
        let newToken = try req.jwt.sign(UserPayload(id: user.requireID(), username: user.username, role: user.role))
        return TokenResponse(token: newToken, user: try UserResponse(user: user))
    }

    func logout(req: Request) async throws -> HTTPStatus {
        // Client should discard the token; server-side we just return OK
        // With short-lived tokens (2h), forced expiration is handled by TTL
        return .ok
    }

    func changePassword(req: Request) async throws -> HTTPStatus {
        let user = try req.auth.require(User.self)
        let payload = try req.content.decode(ChangePasswordPayload.self)
        
        guard try user.verify(password: payload.oldPassword) else {
            throw Abort(.unauthorized, reason: "Incorrect old password")
        }
        
        guard payload.newPassword == payload.confirmNewPassword else {
            throw Abort(.badRequest, reason: "New passwords do not match")
        }
        
        user.passwordHash = try Bcrypt.hash(payload.newPassword)
        try await user.save(on: req.db)
        
        return .ok
    }
}


