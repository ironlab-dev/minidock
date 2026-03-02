import Vapor

public struct SparkleUpdateService: Sendable {
    public static let shared = SparkleUpdateService()
    
    // 你的官网存放 appcast.xml (更新日志与版本文件) 的地址
    private let appcastUrl = "https://minidock.net/appcast.xml"
    
    // 你可以使用 Vapor 直接拉取最新的版本并推送给前端 UI 提示
    public func fetchLatestVersion(req: Request) async throws -> String? {
        // 这里可以执行 HTTP 请求解析 appcast.xml，提取 <sparkle:version>
        // 前端也可以调用这个接口实现 "检查更新" 按钮
        
        // 示例：简单 HTTP 请求并提取版本号 (可用 Regex)
        let response = try await req.client.get(URI(string: appcastUrl))
        guard let body = response.body, let str = body.getString(at: 0, length: body.readableBytes) else {
            return nil
        }
        
        // 解析 <sparkle:shortVersionString>1.1.0</sparkle:shortVersionString>
        if let range = str.range(of: "(?<=<sparkle:shortVersionString>).+?(?=</sparkle:shortVersionString>)", options: .regularExpression) {
            return String(str[range])
        }
        return nil
    }
}
