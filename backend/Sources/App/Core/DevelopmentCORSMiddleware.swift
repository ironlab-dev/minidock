import Vapor

struct DevelopmentCORSMiddleware: AsyncMiddleware {
    func respond(to request: Request, chainingTo next: AsyncResponder) async throws -> Response {
        let origin = request.headers.first(name: .origin)
        
        // Helper to add headers
        func addHeaders(to response: Response) {
            let allowedOriginPrefixes = ["http://localhost:", "https://localhost:", "http://127.0.0.1:", "https://127.0.0.1:"]
            if let o = origin, allowedOriginPrefixes.contains(where: { o.hasPrefix($0) }) {
                response.headers.replaceOrAdd(name: .accessControlAllowOrigin, value: o)
                response.headers.replaceOrAdd(name: .accessControlAllowHeaders, value: "content-type, authorization, accept, origin, x-requested-with, access-control-allow-origin, x-upload-id, x-temp-path, x-file-name")
                response.headers.replaceOrAdd(name: .accessControlAllowMethods, value: "GET, POST, PUT, DELETE, OPTIONS")
                response.headers.replaceOrAdd(name: .accessControlAllowCredentials, value: "true")
            } else if origin == nil {
                // No Origin header (typically non-browser requests), allow through
                response.headers.replaceOrAdd(name: .accessControlAllowOrigin, value: "http://localhost:23000")
            }
            // Non-matching origin: no CORS headers added, browser will block cross-origin request (secure)
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
                reason = "Internal Server Error: \(error)"
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
