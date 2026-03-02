import Vapor

struct RemoteAccessController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let remote = routes.grouped(
            CookieAuthMiddleware(),
            User.jwtAuthenticator(),
            User.guardMiddleware()
        ).grouped("remote")

        remote.get("status", use: getStatus)
        remote.get("installed", use: getInstalled)
        remote.post("enable", use: enable)
        remote.post("disable", use: disable)
        remote.post("logout", use: logout)
        remote.post("install", use: install)
        remote.get("homebrew", use: checkHomebrew)
        remote.post("open-appstore", use: openAppStore)
        remote.post("open-tailscale", use: openTailscale)
        remote.get("app-installed", use: checkAppInstalled)
        remote.post("download-install", use: downloadInstall)
    }

    func getStatus(req: Request) async throws -> TailscaleStatus {
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        return try await service.getTailscaleStatus()
    }

    func getInstalled(req: Request) async throws -> TailscaleInstallCheck {
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        return await service.getInstallInfo()
    }

    func enable(req: Request) async throws -> TailscaleAuthResponse {
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        return try await service.enable()
    }

    func disable(req: Request) async throws -> HTTPStatus {
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        try await service.disable()
        return .ok
    }

    func logout(req: Request) async throws -> HTTPStatus {
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        try await service.logout()
        return .ok
    }

    func install(req: Request) async throws -> TailscaleInstallProgress {
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        let result = try await service.installViaHomebrew(app: req.application)

        // 安装后启动守护进程
        if result.stage == "completed" {
            try? await service.startDaemon()
        }

        return result
    }

    func checkHomebrew(req: Request) async throws -> [String: Bool] {
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        let available = await service.isHomebrewAvailable()
        return ["available": available]
    }

    func openAppStore(req: Request) async throws -> HTTPStatus {
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        try await service.openAppStoreOnNAS()
        return .ok
    }

    func openTailscale(req: Request) async throws -> [String: Bool] {
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        let opened = try await service.openTailscaleAppOnNAS()
        return ["opened": opened]
    }

    func checkAppInstalled(req: Request) async throws -> [String: Bool] {
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        let installed = await service.isTailscaleAppInstalled()
        return ["installed": installed]
    }

    func downloadInstall(req: Request) async throws -> TailscaleInstallProgress {
        guard let service = req.application.serviceManager.getService(id: "tailscale") as? TailscaleService else {
            throw Abort(.serviceUnavailable, reason: "Tailscale service not available")
        }
        return try await service.downloadAndInstall(app: req.application)
    }
}
