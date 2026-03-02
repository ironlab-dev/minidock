import Vapor
import Fluent

struct SettingsController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let settings = routes.grouped(
            CookieAuthMiddleware(),
            User.jwtAuthenticator(),
            User.guardMiddleware()
        ).grouped("settings")

        settings.get(use: list)
        settings.post(use: create)
        settings.put(use: update)
        settings.delete(":key", use: delete)
        settings.post("test-notification", use: testNotification)
        settings.get("gitops-defaults", use: gitopsDefaults)
        settings.post("preview-directory", use: previewDirectory)
    }

    func list(req: Request) async throws -> [SystemSetting] {
        try await SystemSetting.query(on: req.db).all()
    }

    func create(req: Request) async throws -> SystemSetting {
        let setting = try req.content.decode(SystemSetting.self)
        
        // Upsert: 如果存在就更新，不存在就创建
        if let existing = try await SystemSetting.query(on: req.db)
            .filter(\.$key == setting.key)
            .first() {
            existing.value = setting.value
            existing.category = setting.category
            existing.isSecret = setting.isSecret
            try await existing.update(on: req.db)
            return existing
        } else {
            try await setting.create(on: req.db)
            return setting
        }
    }

    func update(req: Request) async throws -> SystemSetting {
        let setting = try req.content.decode(SystemSetting.self)
        guard let existing = try await SystemSetting.query(on: req.db)
            .filter(\.$key == setting.key)
            .first() else {
            throw Abort(.notFound)
        }
        existing.value = setting.value
        existing.category = setting.category
        existing.isSecret = setting.isSecret
        try await existing.update(on: req.db)
        return existing
    }

    func delete(req: Request) async throws -> HTTPStatus {
        guard let key = req.parameters.get("key") else {
            throw Abort(.badRequest, reason: "Missing key parameter")
        }
        // Idempotent delete: return success even if setting doesn't exist
        if let setting = try await SystemSetting.query(on: req.db).filter(\.$key == key).first() {
            try await setting.delete(on: req.db)
        }
        return .noContent
    }

    func testNotification(req: Request) async throws -> HTTPStatus {
        struct TestPayload: Content {
            let title: String
            let message: String
        }
        let payload = try req.content.decode(TestPayload.self)
        if let notificationService = req.application.serviceManager.getService(id: "notification-manager") as? NotificationService {
            await notificationService.send(app: req.application, title: payload.title, message: payload.message)
            return .ok
        }
        throw Abort(.serviceUnavailable)
    }

    func gitopsDefaults(req: Request) async throws -> [String: String] {
        let dockerStorage = req.application.serviceManager.getService(id: "docker-storage") as? DockerStorageService
        let vmStorage = req.application.serviceManager.getService(id: "vm-storage") as? VMStorageService
        let automationStorage = req.application.serviceManager.getService(id: "automation-storage") as? AutomationStorageService
        
        let dockerBasePath = try await dockerStorage?.getBasePath(app: req.application) ?? "/Users/shared/minidock/docker"
        let vmBasePath = try await vmStorage?.getBasePath(app: req.application) ?? "/Users/shared/minidock/vms"
        let automationBasePath = try await automationStorage?.getBasePath(app: req.application) ?? "/Users/shared/minidock/automation"
        
        let dockerDefault = await dockerStorage?.getDynamicBranchName(basePath: dockerBasePath) ?? "main"
        let vmDefault = await vmStorage?.getDynamicBranchName(basePath: vmBasePath) ?? "main"
        let automationDefault = await GitStorageService.shared.getDynamicBranchName(basePath: automationBasePath)
        
        return [
            "dockerDefaultBranch": dockerDefault,
            "vmDefaultBranch": vmDefault,
            "automationDefaultBranch": automationDefault,
            "dockerBasePath": dockerBasePath,
            "vmBasePath": vmBasePath
        ]
    }

    func previewDirectory(req: Request) async throws -> DirectoryPreviewResponse {
        struct PreviewRequest: Content {
            let path: String
            let type: String  // "docker" | "vm"
        }
        
        let request = try req.content.decode(PreviewRequest.self)
        let basePath = request.path
        let type = request.type.lowercased()
        
        // 路径安全验证
        guard !basePath.contains("..") else {
            throw Abort(.badRequest, reason: "Invalid path: path traversal not allowed")
        }
        
        let fm = FileManager.default
        var preview = DirectoryPreviewResponse(
            exists: false,
            isGitRepo: false,
            hasUncommittedChanges: false,
            items: [],
            actions: []
        )
        
        // 检查目录是否存在
        var isDir: ObjCBool = false
        if fm.fileExists(atPath: basePath, isDirectory: &isDir), isDir.boolValue {
            preview.exists = true
            
            // 检查是否是 Git 仓库
            let gitDir = (basePath as NSString).appendingPathComponent(".git")
            if fm.fileExists(atPath: gitDir) {
                preview.isGitRepo = true
                
                // 检查是否有未提交的更改
                do {
                    let status = try await GitStorageService.shared.runGitCommand(
                        args: ["status", "--porcelain"],
                        basePath: basePath,
                        timeout: 5.0
                    )
                    preview.hasUncommittedChanges = !status.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                } catch {
                    // Git 命令失败，假设没有未提交的更改
                    preview.hasUncommittedChanges = false
                }
            }
            
            // 扫描目录内容
            if let contents = try? fm.contentsOfDirectory(atPath: basePath) {
                if type == "docker" {
                    // Docker: 扫描非隐藏的子目录
                    for name in contents {
                        var itemIsDir: ObjCBool = false
                        let itemPath = (basePath as NSString).appendingPathComponent(name)
                        if fm.fileExists(atPath: itemPath, isDirectory: &itemIsDir),
                           itemIsDir.boolValue,
                           !name.hasPrefix(".") {
                            preview.items.append(PreviewItem(name: name, type: "service"))
                        }
                    }
                } else if type == "vm" {
                    // VM: 扫描 .utm 结尾的目录
                    let vmStorage = VMStorageService()
                    for dirName in contents where dirName.hasSuffix(".utm") {
                        let vmPath = (basePath as NSString).appendingPathComponent(dirName)
                        if let config = vmStorage.parseVMConfig(at: vmPath) {
                            preview.items.append(PreviewItem(name: config.name, type: "vm"))
                        }
                    }
                }
            }
        }
        
        // 生成操作描述
        var actions: [String] = []
        
        if !preview.exists {
            actions.append("将创建目录并初始化 Git 仓库")
        } else {
            if preview.isGitRepo {
                actions.append("将使用现有 Git 仓库，不会修改历史记录")
                if preview.hasUncommittedChanges {
                    actions.append("检测到未提交的更改，这些更改将保留")
                }
            } else {
                actions.append("将初始化 Git 仓库并提交现有内容")
            }
            
            if preview.items.count > 0 {
                let itemType = type == "docker" ? "服务" : "虚拟机"
                actions.append("将接管管理 \(preview.items.count) 个已存在的\(itemType)")
            }
        }
        
        preview.actions = actions
        
        return preview
    }
}
