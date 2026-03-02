import Vapor
import NIOCore

/// In-memory rate limiter for protecting auth endpoints from brute-force attacks.
/// Uses a sliding window approach with per-IP tracking.
actor RateLimitStore {
    private var requests: [String: [Date]] = [:]
    private let maxRequests: Int
    private let window: TimeInterval

    init(maxRequests: Int, windowSeconds: TimeInterval) {
        self.maxRequests = maxRequests
        self.window = windowSeconds
    }

    func isAllowed(key: String) -> Bool {
        let now = Date()
        let cutoff = now.addingTimeInterval(-window)

        // Clean expired entries
        var timestamps = requests[key, default: []].filter { $0 > cutoff }

        if timestamps.count >= maxRequests {
            requests[key] = timestamps
            return false
        }

        timestamps.append(now)
        requests[key] = timestamps
        return true
    }

    /// Periodic cleanup of stale entries (call from a background task)
    func cleanup() {
        let cutoff = Date().addingTimeInterval(-window)
        for (key, timestamps) in requests {
            let filtered = timestamps.filter { $0 > cutoff }
            if filtered.isEmpty {
                requests.removeValue(forKey: key)
            } else {
                requests[key] = filtered
            }
        }
    }
}

struct RateLimitMiddleware: AsyncMiddleware {
    let store: RateLimitStore

    /// Creates a rate limiter.
    /// - Parameters:
    ///   - maxRequests: Maximum requests allowed in the window (default: 10)
    ///   - windowSeconds: Time window in seconds (default: 60)
    init(maxRequests: Int = 10, windowSeconds: TimeInterval = 60) {
        self.store = RateLimitStore(maxRequests: maxRequests, windowSeconds: windowSeconds)
    }

    func respond(to request: Request, chainingTo next: AsyncResponder) async throws -> Response {
        // Extract IP address without port (peerAddress.description includes ephemeral port)
        let key: String
        if let peerAddr = request.peerAddress {
            switch peerAddr {
            case .v4(let addr): key = addr.host
            case .v6(let addr): key = addr.host
            default: key = request.remoteAddress?.ipAddress ?? "unknown"
            }
        } else {
            key = request.remoteAddress?.ipAddress ?? "unknown"
        }

        let allowed = await store.isAllowed(key: key)
        guard allowed else {
            throw Abort(.tooManyRequests, reason: "Too many requests. Please try again later.")
        }

        return try await next.respond(to: request)
    }
}
