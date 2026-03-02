import Vapor
import Fluent

public final class NotificationService: MiniDockService, @unchecked Sendable {
    public let id: String = "notification-manager"
    public let name: String = "Notification Manager"
    public let type: ServiceType = .system
    
    public init() {}
    
    public func getInfo(app: Application) async throws -> ServiceInfo {
        return ServiceInfo(
            id: id,
            name: name,
            type: type,
            status: .running,
            description: "Centralized notification dispatcher (Feishu/Generic).",
            stats: [:]
        )
    }
    
    public func getStatus() async throws -> ServiceStatus {
        return .running
    }
    
    public func start(app: Application) async throws { }
    public func stop(app: Application) async throws { }
    public func restart(app: Application) async throws { }
    
    public func getItems(app: Application) async throws -> [ServiceItem] {
        return []
    }
    
    public func send(app: Application, title: String, message: String) async {
        do {
            // Fetch Feishu Webhook URL from settings
            let setting = try await SystemSetting.query(on: app.db)
                .filter(\.$key == "FEISHU_BOT_WEBHOOK_URL")
                .first()
            
            if let webhookUrl = setting?.value, !webhookUrl.isEmpty {
                try await sendFeishu(app: app, url: webhookUrl, title: title, message: message)
            } else {
                app.logger.warning("Notification skipped: FEISHU_BOT_WEBHOOK_URL not configured.")
            }
        } catch {
            app.logger.error("Failed to fetch notification settings: \(error)")
        }
    }
    
    private func sendFeishu(app: Application, url: String, title: String, message: String) async throws {
        struct FeishuContent: Content {
            let text: String
        }
        struct FeishuPayload: Content {
            let msg_type: String
            let content: FeishuContent
        }
        
        let payload = FeishuPayload(
            msg_type: "text",
            content: FeishuContent(text: "[\(title)] \(message)")
        )
        
        let client = app.client
        let _ = try await client.post(URI(string: url), beforeSend: { req in
            try req.content.encode(payload, as: .json)
        })
        app.logger.info("Notification sent to Feishu: \(title)")
    }
}
