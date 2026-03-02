import Vapor

struct LicenseController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let licenseGroup = routes.grouped("license")
        
        licenseGroup.get("status", use: getStatus)
        licenseGroup.post("activate", use: activate)
        licenseGroup.post("deactivate", use: deactivate)
    }
    
    func getStatus(req: Request) async throws -> LicenseStatusResponse {
        let (isActivated, maskedKey, isTrialExpired, daysLeft) = await LicenseService.shared.checkStatus()
        return LicenseStatusResponse(
            isActivated: isActivated,
            maskedKey: maskedKey,
            isTrialExpired: isTrialExpired,
            trialDaysLeft: daysLeft
        )
    }
    
    func activate(req: Request) async throws -> Response {
        struct ActivatePayload: Content {
            let key: String
        }
        let payload = try req.content.decode(ActivatePayload.self)
        
        do {
            let success = try await LicenseService.shared.activate(key: payload.key, req: req)
            if success {
                return Response(status: .ok, body: .init(string: "{\"success\": true}"))
            } else {
                throw Abort(.badRequest, reason: "Invalid license key")
            }
        } catch let error as AbortError {
            throw error
        } catch {
            throw Abort(.internalServerError, reason: error.localizedDescription)
        }
    }
    
    func deactivate(req: Request) async throws -> Response {
        try await LicenseService.shared.deactivate(req: req)
        return Response(status: .ok, body: .init(string: "{\"success\": true}"))
    }
}

struct LicenseStatusResponse: Content {
    let isActivated: Bool
    let maskedKey: String?
    let isTrialExpired: Bool
    let trialDaysLeft: Int
}
