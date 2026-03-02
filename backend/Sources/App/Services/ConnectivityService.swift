import Foundation
import Vapor
import Network

public struct ConnectivityService: Sendable {
    public init() {}
    
    /// 检测端口是否可达
    /// - Parameters:
    ///   - host: 主机地址（域名或 IP）
    ///   - port: 端口号
    ///   - timeout: 超时时间（秒），默认 3 秒
    /// - Returns: (是否可达, 延迟毫秒数)
    public func checkPort(host: String, port: UInt16, timeout: TimeInterval = 3.0) async -> (reachable: Bool, latency: Int?) {
        let startTime = Date()
        
        // 使用 Network framework 的 NWConnection
        guard let nwPort = NWEndpoint.Port(rawValue: port) else {
            return (false, nil)
        }
        
        let hostEndpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(host), port: nwPort)
        let connection = NWConnection(to: hostEndpoint, using: .tcp)
        
        // 使用线程安全的类来管理状态
        final class ConnectionState: @unchecked Sendable {
            private let lock = NSLock()
            private var _hasResumed = false
            
            var hasResumed: Bool {
                lock.lock()
                defer { lock.unlock() }
                return _hasResumed
            }
            
            func setResumed() -> Bool {
                lock.lock()
                defer { lock.unlock() }
                if _hasResumed { return false }
                _hasResumed = true
                return true
            }
        }
        
        let state = ConnectionState()
        
        return await withCheckedContinuation { continuation in
            connection.stateUpdateHandler = { connState in
                switch connState {
                case .ready:
                    if state.setResumed() {
                        let latency = Int((Date().timeIntervalSince(startTime) * 1000))
                        connection.cancel()
                        continuation.resume(returning: (true, latency))
                    }
                case .failed(_), .waiting(_):
                    if state.setResumed() {
                        connection.cancel()
                        continuation.resume(returning: (false, nil))
                    }
                case .cancelled:
                    if state.setResumed() {
                        continuation.resume(returning: (false, nil))
                    }
                default:
                    break
                }
            }
            
            connection.start(queue: DispatchQueue.global())
            
            // 设置超时
            Task {
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                if state.setResumed() {
                    connection.cancel()
                    continuation.resume(returning: (false, nil))
                }
            }
        }
    }
}

public struct ConnectivityCheckRequest: Content {
    let host: String
    let ports: [PortCheck]
}

public struct PortCheck: Content {
    let name: String
    let port: UInt16
}

public struct ConnectivityCheckResponse: Content {
    let results: [PortCheckResult]
}

public struct PortCheckResult: Content {
    let name: String
    let port: UInt16
    let reachable: Bool
    let latency: Int?
}
