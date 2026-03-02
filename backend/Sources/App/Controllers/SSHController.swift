import Vapor

struct SSHController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let ssh = routes.grouped(
            CookieAuthMiddleware(),
            User.jwtAuthenticator(),
            User.guardMiddleware()
        ).grouped("ssh")

        ssh.get("keys", use: listKeys)
        ssh.post("keys", use: addKey)
        ssh.delete("keys", use: deleteKey)
    }

    func listKeys(req: Request) async throws -> [SSHKey] {
        guard let sshService = req.application.serviceManager.getService(id: "ssh-manager") as? SSHService else {
            throw Abort(.notFound)
        }
        return try await sshService.listKeys()
    }

    func addKey(req: Request) async throws -> HTTPStatus {
        struct AddKeyPayload: Content {
            let key: String
        }
        let payload = try req.content.decode(AddKeyPayload.self)
        guard let sshService = req.application.serviceManager.getService(id: "ssh-manager") as? SSHService else {
            throw Abort(.notFound)
        }
        try await sshService.addKey(payload.key)
        return .created
    }

    func deleteKey(req: Request) async throws -> HTTPStatus {
        let signature = try req.query.get(String.self, at: "signature")

        guard let sshService = req.application.serviceManager.getService(id: "ssh-manager") as? SSHService else {
             throw Abort(.notFound)
        }
        try await sshService.deleteKey(signature)
        return .noContent
    }
}
