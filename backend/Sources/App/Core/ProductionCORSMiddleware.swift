import Vapor

struct ProductionCORSMiddleware: AsyncMiddleware {
    func respond(to request: Request, chainingTo next: AsyncResponder) async throws -> Response {
        let origin = request.headers.first(name: .origin)

        // Helper to add headers - only allow localhost origins for security
        func addHeaders(to response: Response) {
            if let o = origin, isAllowedOrigin(o) {
                response.headers.replaceOrAdd(name: .accessControlAllowOrigin, value: o)
                response.headers.replaceOrAdd(name: .accessControlAllowHeaders, value: "content-type, authorization, accept, origin, x-requested-with, access-control-allow-origin, x-upload-id, x-temp-path, x-file-name")
                response.headers.replaceOrAdd(name: .accessControlAllowMethods, value: "GET, POST, PUT, DELETE, OPTIONS")
                response.headers.replaceOrAdd(name: .accessControlAllowCredentials, value: "true")
            }
            // No origin or disallowed origin: do not set CORS headers (browser will block)
        }

        // Allow localhost and Tailscale CGNAT range (100.64.0.0/10) for remote access
        func isAllowedOrigin(_ origin: String) -> Bool {
            guard let url = URL(string: origin), let host = url.host else { return false }
            if host == "localhost" || host == "127.0.0.1" || host == "0.0.0.0" {
                return true
            }
            // Allow Tailscale CGNAT range (100.64.0.0 - 100.127.255.255)
            let parts = host.split(separator: ".").compactMap { Int($0) }
            if parts.count == 4 && parts[0] == 100 && parts[1] >= 64 && parts[1] <= 127 {
                return true
            }
            return false
        }

        // Handle Preflight OPTIONS
        if request.method == .OPTIONS {
            let response = Response(status: .ok)
            addHeaders(to: response)
            return response
        }
        
        do {
            let response = try await next.respond(to: request)
            addHeaders(to: response)
            return response
        } catch {
            // Create a response from the error to attach CORS headers
            let status: HTTPResponseStatus
            let reason: String
            
            if let abort = error as? AbortError {
                status = abort.status
                reason = abort.reason
            } else {
                status = .internalServerError
                reason = "An internal error occurred"
                request.logger.error("Unhandled error: \(error)")
            }
            
            // Create JSON error response
            struct ErrorResponse: Content {
                let error: Bool
                let reason: String
            }
            let errorResponse = Response(status: status)
            try? errorResponse.content.encode(ErrorResponse(error: true, reason: reason))
            
            addHeaders(to: errorResponse)
            
            return errorResponse
        }
    }
}
