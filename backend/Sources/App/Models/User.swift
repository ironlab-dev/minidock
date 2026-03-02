import Fluent
import Vapor
import JWT

final class User: Model, Content, @unchecked Sendable {
    static let schema = "users"

    @ID(key: .id)
    var id: UUID?

    @Field(key: "username")
    var username: String

    @Field(key: "password_hash")
    var passwordHash: String

    @Field(key: "role")
    var role: String

    @Timestamp(key: "created_at", on: .create)
    var createdAt: Date?

    init() { }

    init(id: UUID? = nil, username: String, passwordHash: String, role: String = "user") {
        self.id = id
        self.username = username
        self.passwordHash = passwordHash
        self.role = role
    }
}

extension User: ModelAuthenticatable {
    static let usernameKey: KeyPath<User, FieldProperty<User, String>> = \User.$username
    static let passwordHashKey: KeyPath<User, FieldProperty<User, String>> = \User.$passwordHash

    func verify(password: String) throws -> Bool {
        try Bcrypt.verify(password, created: self.passwordHash)
    }
}

// JWT Payload
struct UserPayload: JWTPayload {
    enum CodingKeys: String, CodingKey {
        case id
        case username
        case role
        case exp
    }

    let id: UUID
    let username: String
    let role: String
    let exp: ExpirationClaim
    
    init(id: UUID, username: String, role: String) {
        self.id = id
        self.username = username
        self.role = role
        // 2 hour access token (use /auth/refresh to renew)
        self.exp = ExpirationClaim(value: Date().addingTimeInterval(60 * 60 * 2))
    }
    
    func verify(using signer: JWTSigner) throws {
        try exp.verifyNotExpired()
    }
}

// JWT Authenticator
extension User: JWTAuthenticator {
    typealias Payload = UserPayload
    func authenticate(jwt: UserPayload, for request: Request) -> EventLoopFuture<Void> {
        User.find(jwt.id, on: request.db).map { user in
            if let user = user {
                request.auth.login(user)
            }
        }
    }

    static func jwtAuthenticator() -> Authenticator {
        return User()
    }
}
