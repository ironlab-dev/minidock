import Vapor

struct ConnectivityController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let connectivity = routes.grouped(
            CookieAuthMiddleware(),
            User.jwtAuthenticator(),
            User.guardMiddleware()
        ).grouped("connectivity")

        connectivity.post("check", use: check)
    }

    func check(req: Request) async throws -> ConnectivityCheckResponse {
        let request = try req.content.decode(ConnectivityCheckRequest.self)
        let service = ConnectivityService()
        
        var results: [PortCheckResult] = []
        
        for portCheck in request.ports {
            let (reachable, latency) = await service.checkPort(
                host: request.host,
                port: portCheck.port,
                timeout: 3.0
            )
            
            results.append(PortCheckResult(
                name: portCheck.name,
                port: portCheck.port,
                reachable: reachable,
                latency: latency
            ))
        }
        
        return ConnectivityCheckResponse(results: results)
    }
}
