import Vapor
import Foundation

/// 系统级文件管理服务
/// 提供安全的系统文件操作，支持路径验证和访问控制
public struct SystemFileService: Sendable {
    
    // FileItem structure for directory listing
    public struct FileItem: Content {
        public let name: String
        public let type: String  // "file" or "directory"
        public let path: String
        public let size: Int64?  // Only files have size
    }
    
    // FileInfo structure for file properties
    public struct FileInfo: Content {
        public let name: String
        public let path: String
        public let type: String  // "file" or "directory"
        public let size: Int64?
        public let created: String?
        public let modified: String?
        public let permissions: String?
        public let owner: String?
        public let `extension`: String?
        public let mimeType: String?
    }
    
    /// 获取默认允许的根目录列表
    private func getAllowedRootDirectories() -> [String] {
        let fm = FileManager.default
        let homeDir = fm.homeDirectoryForCurrentUser.path
        
        var allowed: [String] = []
        
        // 用户 minidock 目录
        let minidockDir = (homeDir as NSString).appendingPathComponent("minidock")
        allowed.append(minidockDir)
        
        // 共享目录
        allowed.append("/Users/Shared")
        
        return allowed
    }
    
    /// 获取禁止访问的目录列表
    private func getForbiddenDirectories() -> [String] {
        let fm = FileManager.default
        let homeDir = fm.homeDirectoryForCurrentUser.path
        
        var forbidden: [String] = []
        
        // 系统目录
        forbidden.append(contentsOf: [
            "/System",
            "/Library",
            "/usr",
            "/bin",
            "/sbin",
            "/etc",
            "/var",
            "/private",
            "/Applications",
            "/Developer",
            "/cores",
            "/opt",
            "/tmp"
        ])
        
        // 用户敏感目录（但允许访问 Containers 目录以支持 UTM 虚拟机管理）
        forbidden.append(contentsOf: [
            (homeDir as NSString).appendingPathComponent("Documents"),
            (homeDir as NSString).appendingPathComponent("Desktop"),
            (homeDir as NSString).appendingPathComponent("Downloads"),
            (homeDir as NSString).appendingPathComponent("Movies"),
            (homeDir as NSString).appendingPathComponent("Music"),
            (homeDir as NSString).appendingPathComponent("Pictures")
        ])
        
        // Library 目录：禁止访问大部分子目录，但允许 Containers（用于 UTM 等应用数据）
        // 注意：Library 本身不在禁止列表中，但会在下面的检查中特殊处理
        
        return forbidden
    }
    
    /// 验证路径是否安全
    private func validatePath(_ path: String, app: Application) throws -> String {
        let fm = FileManager.default
        let homeDir = fm.homeDirectoryForCurrentUser.path
        
        // 处理特殊路径：~ 表示用户主目录
        var normalized = path
        if normalized == "~" {
            normalized = homeDir
        } else if normalized.hasPrefix("~/") {
            // 用户主目录相对路径
            let relativePath = String(normalized.dropFirst(2))
            normalized = (homeDir as NSString).appendingPathComponent(relativePath)
        }
        
        // 规范化路径（去除结尾的斜杠，但保留开头的斜杠和根目录的单个斜杠）
        if normalized != "/" {
            // 记录是否为绝对路径
            let isAbsolute = normalized.hasPrefix("/")
            // 去除开头和结尾的斜杠
            normalized = normalized.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            // 如果是绝对路径，恢复开头的斜杠
            if isAbsolute {
                normalized = "/" + normalized
            }
        }
        
        // 防止路径遍历攻击
        if normalized.contains("..") || (normalized != "/" && normalized.contains("//")) {
            throw Abort(.badRequest, reason: "Invalid path: directory traversal not allowed")
        }
        
        // 解析为绝对路径
        var absolutePath: String
        if normalized == "/" {
            // 根目录
            absolutePath = "/"
        } else if normalized.hasPrefix("/") {
            // 绝对路径
            absolutePath = normalized
        } else if normalized.isEmpty {
            // 如果路径为空，默认使用用户主目录
            return homeDir
        } else {
            // 相对路径，从用户主目录开始
            absolutePath = (homeDir as NSString).appendingPathComponent(normalized)
        }
        
        // Resolve symlinks and standardize path to prevent symlink-based traversal
        let pathURL = URL(fileURLWithPath: absolutePath).standardizedFileURL
        let resolvedPath: String
        
        if fm.fileExists(atPath: pathURL.path) {
            // File exists: directly resolve symlinks
            resolvedPath = (pathURL.path as NSString).resolvingSymlinksInPath
        } else {
            // File doesn't exist: resolve parent directory to prevent symlink bypass
            let parentPath = (pathURL.path as NSString).deletingLastPathComponent
            let fileName = pathURL.lastPathComponent
            
            if fm.fileExists(atPath: parentPath) {
                let resolvedParent = (parentPath as NSString).resolvingSymlinksInPath
                resolvedPath = (resolvedParent as NSString).appendingPathComponent(fileName)
            } else {
                // Parent doesn't exist, use standardized path
                resolvedPath = pathURL.path
            }
        }
        
        // 检查是否为根目录
        if resolvedPath == "/" {
            return "/"
        }
        
        // 检查是否在禁止的目录下
        let forbiddenDirs = getForbiddenDirectories()
        for forbiddenDir in forbiddenDirs {
            let forbiddenURL = URL(fileURLWithPath: forbiddenDir).standardizedFileURL
            if resolvedPath.hasPrefix(forbiddenURL.path) || resolvedPath == forbiddenURL.path {
                // 特殊处理：允许访问 Library/Containers 目录（用于 UTM 等应用数据）
                let containersPath = (homeDir as NSString).appendingPathComponent("Library/Containers")
                let containersURL = URL(fileURLWithPath: containersPath).standardizedFileURL
                if resolvedPath.hasPrefix(containersURL.path) {
                    // 允许访问 Containers 目录
                    break
                }
                
                app.logger.warning("[SystemFile] Attempted access to forbidden directory: \(resolvedPath)")
                // 区分系统目录和用户敏感目录
                let isSystemDir = forbiddenDir.hasPrefix("/") && !forbiddenDir.hasPrefix(homeDir)
                if isSystemDir {
                    throw Abort(.forbidden, reason: "Access to system directory is not allowed for security reasons")
                } else {
                    throw Abort(.forbidden, reason: "Access to this user directory is not allowed for privacy reasons")
                }
            }
        }
        
        // Whitelist policy: only allow access to explicitly permitted directories
        // Check user home directory (already filtered by forbidden list above)
        let homeURL = URL(fileURLWithPath: homeDir).standardizedFileURL
        if resolvedPath.hasPrefix(homeURL.path) || resolvedPath == homeURL.path {
            return resolvedPath
        }

        // Check allowed root directories (~/minidock, /Users/Shared)
        let allowedDirs = getAllowedRootDirectories()
        for allowedDir in allowedDirs {
            let allowedURL = URL(fileURLWithPath: allowedDir).standardizedFileURL
            if resolvedPath.hasPrefix(allowedURL.path) || resolvedPath == allowedURL.path {
                return resolvedPath
            }
        }

        // Also allow /Volumes for external disk management (core NAS feature)
        if resolvedPath.hasPrefix("/Volumes") {
            return resolvedPath
        }

        // Deny everything else
        app.logger.warning("[SystemFile] Access denied to path outside whitelist: \(resolvedPath)")
        throw Abort(.forbidden, reason: "Access to this path is not allowed")
    }
    
    /// 解析文件路径
    private func resolveFilePath(_ path: String, app: Application) async throws -> String {
        let validatedPath = try validatePath(path, app: app)
        
        let fm = FileManager.default
        var isDir: ObjCBool = false
        
        // 检查路径是否存在
        if !fm.fileExists(atPath: validatedPath, isDirectory: &isDir) {
            throw Abort(.notFound, reason: "File or directory not found")
        }
        
        // 如果是目录，抛出错误
        if isDir.boolValue {
            throw Abort(.badRequest, reason: "Path points to a directory, not a file")
        }
        
        return validatedPath
    }
    
    /// 解析目录路径
    private func resolveDirectoryPath(_ path: String, app: Application) async throws -> String {
        let validatedPath = try validatePath(path, app: app)
        
        let fm = FileManager.default
        var isDir: ObjCBool = false
        
        // 检查路径是否存在
        if !fm.fileExists(atPath: validatedPath, isDirectory: &isDir) {
            throw Abort(.notFound, reason: "Directory not found")
        }
        
        // 如果不是目录，抛出错误
        if !isDir.boolValue {
            throw Abort(.badRequest, reason: "Path points to a file, not a directory")
        }
        
        return validatedPath
    }
    
    /// 计算相对路径（从当前目录）
    private func getRelativePath(_ absolutePath: String, from currentDir: String) -> String {
        let absoluteURL = URL(fileURLWithPath: absolutePath).standardizedFileURL
        let currentURL = URL(fileURLWithPath: currentDir).standardizedFileURL
        
        // 如果是根目录，返回完整路径
        if currentDir == "/" {
            return absolutePath
        }
        
        // 如果路径在当前目录下，返回相对路径
        if absoluteURL.path.hasPrefix(currentURL.path) {
            let relativePath = String(absoluteURL.path.dropFirst(currentURL.path.count))
            return relativePath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        }
        
        // 否则返回完整路径
        return absolutePath
    }
    
    /// 列出目录内容
    public func listDirectory(app: Application, path: String) async throws -> [FileItem] {
        let dirPath = try await resolveDirectoryPath(path, app: app)
        let fm = FileManager.default
        
        // 列出目录内容
        guard let contents = try? fm.contentsOfDirectory(atPath: dirPath) else {
            return []
        }
        
        var items: [FileItem] = []
        
        for itemName in contents {
            let itemPath = (dirPath as NSString).appendingPathComponent(itemName)
            var isItemDir: ObjCBool = false
            
            guard fm.fileExists(atPath: itemPath, isDirectory: &isItemDir) else {
                continue
            }
            
            // 计算相对路径（从当前目录）
            let relativePath = getRelativePath(itemPath, from: dirPath)
            
            if isItemDir.boolValue {
                items.append(FileItem(name: itemName, type: "directory", path: relativePath, size: nil))
            } else {
                // 获取文件大小
                let fileAttributes = try? fm.attributesOfItem(atPath: itemPath)
                let fileSize = fileAttributes?[.size] as? Int64
                items.append(FileItem(name: itemName, type: "file", path: relativePath, size: fileSize))
            }
        }
        
        // 排序：目录在前，文件在后，都按字母顺序
        return items.sorted { item1, item2 in
            if item1.type != item2.type {
                return item1.type == "directory"
            }
            return item1.name.lowercased() < item2.name.lowercased()
        }
    }
    
    /// 读取文件内容
    public func readFile(app: Application, filePath: String) async throws -> String {
        let resolvedPath = try await resolveFilePath(filePath, app: app)
        
        if !FileManager.default.fileExists(atPath: resolvedPath) {
            return ""
        }
        
        // 检查文件大小，限制为 10MB
        let fileAttributes = try FileManager.default.attributesOfItem(atPath: resolvedPath)
        if let fileSize = fileAttributes[.size] as? Int64, fileSize > 10 * 1024 * 1024 {
            throw Abort(.payloadTooLarge, reason: "File size exceeds 10MB limit")
        }
        
        // 使用 Data 读取文件，避免潜在的内存问题
        let fileURL = URL(fileURLWithPath: resolvedPath)
        let data = try Data(contentsOf: fileURL)
        
        guard let content = String(data: data, encoding: .utf8) else {
            throw Abort(.badRequest, reason: "File is not valid UTF-8")
        }
        
        return content
    }
    
    /// 读取文件为二进制数据（用于图片等）
    public func readFileAsData(app: Application, filePath: String) async throws -> Data {
        let resolvedPath = try await resolveFilePath(filePath, app: app)
        
        if !FileManager.default.fileExists(atPath: resolvedPath) {
            throw Abort(.notFound, reason: "File not found")
        }
        
        // 检查文件大小，限制为 10MB
        let fileAttributes = try FileManager.default.attributesOfItem(atPath: resolvedPath)
        if let fileSize = fileAttributes[.size] as? Int64, fileSize > 10 * 1024 * 1024 {
            throw Abort(.payloadTooLarge, reason: "File size exceeds 10MB limit")
        }
        
        let fileURL = URL(fileURLWithPath: resolvedPath)
        let data = try Data(contentsOf: fileURL)
        
        return data
    }
    
    /// 写入文件
    public func writeFile(app: Application, filePath: String, content: String) async throws {
        // validatePath 已经处理了所有必要的路径验证（包括禁止目录检查）
        let validatedPath = try validatePath(filePath, app: app)
        
        // 确保父目录存在
        let parentDir = (validatedPath as NSString).deletingLastPathComponent
        let fm = FileManager.default
        
        // 验证父目录
        var isParentDir: ObjCBool = false
        if !fm.fileExists(atPath: parentDir, isDirectory: &isParentDir) || !isParentDir.boolValue {
            // 如果父目录不存在，尝试创建
            // 但首先需要验证父目录路径是否安全
            let parentPath = (filePath as NSString).deletingLastPathComponent
            if !parentPath.isEmpty {
                // validatePath 已经处理了所有必要的验证
                let _ = try validatePath(parentPath, app: app)
            }
            try fm.createDirectory(atPath: parentDir, withIntermediateDirectories: true)
        }
        
        // 写入文件
        try content.write(toFile: validatedPath, atomically: true, encoding: .utf8)
    }
    
    /// 删除文件
    public func deleteFile(app: Application, filePath: String) async throws {
        let resolvedPath = try await resolveFilePath(filePath, app: app)
        
        let fm = FileManager.default
        if !fm.fileExists(atPath: resolvedPath) {
            throw Abort(.notFound, reason: "File not found")
        }
        
        try fm.removeItem(atPath: resolvedPath)
    }
    
    /// 重命名文件
    public func renameFile(app: Application, oldPath: String, newName: String) async throws {
        let oldResolvedPath = try await resolveFilePath(oldPath, app: app)
        
        // 验证新名称
        if newName.contains("/") || newName.contains("..") || newName.isEmpty {
            throw Abort(.badRequest, reason: "Invalid file name")
        }
        
        let parentDir = (oldResolvedPath as NSString).deletingLastPathComponent
        let newPath = (parentDir as NSString).appendingPathComponent(newName)
        
        // 验证新路径（validatePath 已经处理了所有必要的验证，包括禁止目录检查）
        // 直接使用新路径进行验证，validatePath 会处理所有路径类型
        let newPathToValidate = newPath
        
        // validatePath 已经处理了所有必要的验证（包括禁止目录检查）
        let _ = try validatePath(newPathToValidate, app: app)
        
        let fm = FileManager.default
        if fm.fileExists(atPath: newPath) {
            throw Abort(.conflict, reason: "File with this name already exists")
        }
        
        try fm.moveItem(atPath: oldResolvedPath, toPath: newPath)
    }
    
    /// 创建目录
    public func createDirectory(app: Application, path: String) async throws {
        // 对于创建操作，目录可能不存在，所以我们需要不同的验证逻辑
        let validatedPath = try validatePath(path, app: app)
        
        let fm = FileManager.default
        if fm.fileExists(atPath: validatedPath) {
            var isDir: ObjCBool = false
            if fm.fileExists(atPath: validatedPath, isDirectory: &isDir) && isDir.boolValue {
                throw Abort(.conflict, reason: "Directory already exists")
            } else {
                throw Abort(.conflict, reason: "File with this name already exists")
            }
        }
        
        // 验证父目录是否存在且安全
        let parentDir = (validatedPath as NSString).deletingLastPathComponent
        var isParentDir: ObjCBool = false
        if !fm.fileExists(atPath: parentDir, isDirectory: &isParentDir) || !isParentDir.boolValue {
            // 如果父目录不存在，使用 createDirectory 的 withIntermediateDirectories 参数自动创建
            // 但首先需要验证父目录路径是否在允许的范围内
            let parentPath = (path as NSString).deletingLastPathComponent
            if !parentPath.isEmpty {
                let _ = try validatePath(parentPath, app: app)
            }
        }
        
        try fm.createDirectory(atPath: validatedPath, withIntermediateDirectories: true)
    }
    
    /// 获取 MIME 类型
    public func getMimeType(for fileName: String) -> String {
        let ext = (fileName as NSString).pathExtension.lowercased()
        switch ext {
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "svg": return "image/svg+xml"
        case "webp": return "image/webp"
        case "bmp": return "image/bmp"
        case "ico": return "image/x-icon"
        default: return "application/octet-stream"
        }
    }
    
    /// 判断是否为图片文件
    public func isImageFile(_ fileName: String) -> Bool {
        let ext = (fileName as NSString).pathExtension.lowercased()
        return ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"].contains(ext)
    }
    
    /// 获取文件信息
    public func getFileInfo(app: Application, filePath: String) async throws -> FileInfo {
        let resolvedPath: String
        let fm = FileManager.default
        var isDir: ObjCBool = false
        
        // 验证并解析路径
        if filePath.hasPrefix("~") || filePath.hasPrefix("/") {
            // 绝对路径或用户主目录路径
            resolvedPath = try await validatePath(filePath, app: app)
        } else {
            // 相对路径，需要先解析
            resolvedPath = try await resolveFilePath(filePath, app: app)
        }
        
        // 检查文件是否存在
        guard fm.fileExists(atPath: resolvedPath, isDirectory: &isDir) else {
            throw Abort(.notFound, reason: "File or directory not found")
        }
        
        let fileURL = URL(fileURLWithPath: resolvedPath)
        let fileName = fileURL.lastPathComponent
        
        // 获取文件属性
        let attributes = try fm.attributesOfItem(atPath: resolvedPath)
        let fileSize = attributes[.size] as? Int64
        let createdDate = attributes[.creationDate] as? Date
        let modifiedDate = attributes[.modificationDate] as? Date
        
        // 格式化日期
        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let createdString = createdDate.map { dateFormatter.string(from: $0) }
        let modifiedString = modifiedDate.map { dateFormatter.string(from: $0) }
        
        // 获取权限信息
        var permissionsString: String? = nil
        if let posixPermissions = attributes[.posixPermissions] as? NSNumber {
            let perms = posixPermissions.intValue
            permissionsString = String(format: "%o", perms)
        }
        
        // 获取所有者信息
        var ownerString: String? = nil
        if let ownerAccountName = attributes[.ownerAccountName] as? String {
            ownerString = ownerAccountName
        }
        
        // 获取文件扩展名和 MIME 类型
        var fileExtension: String? = nil
        var mimeType: String? = nil
        if !isDir.boolValue {
            fileExtension = fileURL.pathExtension.isEmpty ? nil : fileURL.pathExtension
            mimeType = getMimeType(for: fileName)
        }
        
        return FileInfo(
            name: fileName,
            path: resolvedPath,
            type: isDir.boolValue ? "directory" : "file",
            size: fileSize,
            created: createdString,
            modified: modifiedString,
            permissions: permissionsString,
            owner: ownerString,
            extension: fileExtension,
            mimeType: mimeType
        )
    }
}
