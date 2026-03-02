import Vapor

/// Extracts the JWT from the `minidock_session` httpOnly cookie and synthesizes
/// an `Authorization: Bearer` header so the standard `JWTAuthenticator` works
/// unchanged for both cookie-based and Bearer-based clients.
///
/// Place this middleware **before** `User.jwtAuthenticator()` in every protected
/// route group:
/// ```swift
/// routes.grouped(CookieAuthMiddleware(), User.jwtAuthenticator(), User.guardMiddleware())
/// ```
struct CookieAuthMiddleware: AsyncMiddleware {
    func respond(to request: Request, chainingTo next: AsyncResponder) async throws -> Response {
        // Only synthesize a Bearer header when none is present, so explicit
        // Authorization headers always take precedence.
        if request.headers[.authorization].isEmpty,
           let token = request.cookies["minidock_session"]?.string,
           !token.isEmpty {
            request.headers.replaceOrAdd(name: .authorization, value: "Bearer \(token)")
        }
        return try await next.respond(to: request)
    }
}
