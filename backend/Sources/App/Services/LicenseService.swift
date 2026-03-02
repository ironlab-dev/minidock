import Foundation
import Vapor
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

struct LicenseData: Codable {
    let licenseKey: String
    let instanceId: String
    let instanceName: String
    let expiresAt: Date?
    let activatedAt: Date
}

struct LemonSqueezyActivateRequest: Content {
    let license_key: String
    let instance_name: String
}

struct LemonSqueezyActivateResponse: Content {
    let activated: Bool
    let instance: InstanceData?
    let meta: MetaData?
    let error: String?
    
    struct InstanceData: Content {
        let id: String
        let name: String
        let created_at: String
    }
    
    struct MetaData: Content {
        let store_id: Int
        let order_id: Int
        let order_item_id: Int
        let product_id: Int
        let product_name: String
    }
}

public actor LicenseService: Sendable {
    public static let shared = LicenseService()
    
    private let storageURL: URL
    private let trialStorageURL: URL
    private var licenseData: LicenseData?
    private var trialStartDate: Date?
    
    private let lemonSqueezyEndpoint = "https://api.lemonsqueezy.com/v1/licenses/activate"
    private let trialDays: Int = 14
    
    private init() {
        let homeDir = FileManager.default.homeDirectoryForCurrentUser
        let minidockDir = homeDir.appendingPathComponent("minidock").appendingPathComponent("config")
        
        try? FileManager.default.createDirectory(at: minidockDir, withIntermediateDirectories: true)
        self.storageURL = minidockDir.appendingPathComponent("license.json")
        self.trialStorageURL = minidockDir.appendingPathComponent(".trial_info")
        
        if let data = try? Data(contentsOf: storageURL),
           let decoded = try? JSONDecoder().decode(LicenseData.self, from: data) {
            self.licenseData = decoded
        } else {
            self.licenseData = nil
        }
        
        if let trialData = try? Data(contentsOf: trialStorageURL),
           let savedDate = try? JSONDecoder().decode(Date.self, from: trialData) {
            self.trialStartDate = savedDate
        } else {
            let now = Date()
            self.trialStartDate = now
            if let encoded = try? JSONEncoder().encode(now) {
                try? encoded.write(to: trialStorageURL)
            }
        }
    }
    
    private func saveLicense(_ data: LicenseData?) {
        self.licenseData = data
        if let data = data, let encoded = try? JSONEncoder().encode(data) {
            try? encoded.write(to: storageURL)
        } else {
            try? FileManager.default.removeItem(at: storageURL)
        }
    }
    
    private func getHardwareUUID() -> String {
        let matchingDict = IOServiceMatching("IOPlatformExpertDevice")
        let platformExpert = IOServiceGetMatchingService(kIOMainPortDefault, matchingDict)
        if platformExpert != 0 {
            if let uuid = IORegistryEntryCreateCFProperty(platformExpert, kIOPlatformUUIDKey as CFString, kCFAllocatorDefault, 0).takeRetainedValue() as? String {
                IOObjectRelease(platformExpert)
                return uuid
            }
            IOObjectRelease(platformExpert)
        }
        return Host.current().localizedName ?? "Mac Mini"
    }
    
    public func checkStatus() -> (isActivated: Bool, maskedKey: String?, isTrialExpired: Bool, daysLeft: Int) {
        if let data = licenseData {
            let key = data.licenseKey
            let masked = key.count > 10 ? String(key.prefix(4)) + "..." + String(key.suffix(4)) : "..."
            return (true, masked, false, 0)
        }
        
        guard let start = trialStartDate else {
            return (false, nil, false, trialDays)
        }
        
        let elapsed = Calendar.current.dateComponents([.day], from: start, to: Date()).day ?? 0
        let daysLeft = max(0, trialDays - elapsed)
        let isExpired = elapsed >= trialDays
        
        return (false, nil, isExpired, daysLeft)
    }
    
    public func activate(key: String, req: Request) async throws -> Bool {
        let hwUUID = getHardwareUUID()
        let activatePayload = LemonSqueezyActivateRequest(license_key: key, instance_name: hwUUID)
        
        var clientReq = ClientRequest(method: .POST, url: URI(string: lemonSqueezyEndpoint))
        try clientReq.content.encode(activatePayload)
        
        let response = try await req.client.send(clientReq)
        let result = try response.content.decode(LemonSqueezyActivateResponse.self)
        
        if result.activated, let instance = result.instance {
            let newData = LicenseData(
                licenseKey: key,
                instanceId: instance.id,
                instanceName: instance.name,
                expiresAt: nil,
                activatedAt: Date()
            )
            saveLicense(newData)
            return true
        } else {
            req.logger.error("License activation failed: \(result.error ?? "Unknown error")")
            throw Abort(.badRequest, reason: result.error ?? "Invalid License Key")
        }
    }
    
    public func deactivate(req: Request) async throws {
        guard let data = licenseData else { return }
        
        let deactivateEndpoint = "https://api.lemonsqueezy.com/v1/licenses/deactivate"
        struct DeactivateRequest: Content {
            let license_key: String
            let instance_id: String
        }
        
        let payload = DeactivateRequest(license_key: data.licenseKey, instance_id: data.instanceId)
        var clientReq = ClientRequest(method: .POST, url: URI(string: deactivateEndpoint))
        try clientReq.content.encode(payload)
        
        let _ = try await req.client.send(clientReq)
        saveLicense(nil)
    }
}
