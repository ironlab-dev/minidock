import Foundation
import Vapor
import Darwin

public actor TerminalService: MiniDockService {
    public let id: String = "terminal-service"
    public let name: String = "Terminal Service"
    public let type: ServiceType = .system
    
    private var sessions: [UUID: TerminalSession] = [:]
    private var cleanupTask: Task<Void, Error>? = nil
    
    private let logger: Logger
    
    public init(logger: Logger) {
        self.logger = logger
    }
    
    public func getInfo(app: Application) async throws -> ServiceInfo {
        return ServiceInfo(
            id: id,
            name: name,
            type: type,
            status: .running,
            description: "Native macOS Terminal Bridge via PTY.",
            stats: ["active_sessions": "\(sessions.count)"]
        )
    }
    
    public func getItems(app: Application) async throws -> [ServiceItem] {
        return []
    }
    
    public func getStatus() async throws -> ServiceStatus {
        return .running
    }
    
    public func start(app: Application) async throws {
        startCleanupTask()
    }
    
    public func stop(app: Application) async throws {
        cleanupTask?.cancel()
    }
    
    private func startCleanupTask() {
        cleanupTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 60 * 1_000_000_000) // 1 minute
                performCleanup()
            }
        }
    }
    
    private func performCleanup() {
        let now = Date()
        let timeout: TimeInterval = 600 // 10 minutes session persistence
        
        let expiredIds = sessions.filter { (_, session) in
            return !session.isConnected && now.timeIntervalSince(session.lastActivity) > timeout
        }.map { $0.key }
        
        for id in expiredIds {
            logger.info("[TerminalService] Cleaning up expired session: \(id)")
            terminateSession(id: id)
        }
    }
    
    public func getOrCreateSession(existingId: UUID?) -> UUID {
        if let id = existingId, sessions[id] != nil {
            return id
        }
        
        let sessionId = UUID()
        let session = TerminalSession()
        sessions[sessionId] = session
        
        return sessionId
    }
    
    public func attachSession(id: UUID, ws: WebSocket, eventLoop: EventLoop) {
        guard let session = sessions[id] else { return }
        session.attach(ws: ws, eventLoop: eventLoop)
    }
    
    public func detachSession(id: UUID) {
        sessions[id]?.detach()
    }
    
    public func handleInput(id: UUID, data: String) {
        guard let session = sessions[id] else {
            // Session 不存在，可能是已经被清理或从未创建
            return
        }
        session.write(data)
    }
    
    public func resize(id: UUID, cols: UInt16, rows: UInt16) {
        sessions[id]?.resize(cols: cols, rows: rows)
    }
    
    private func terminateSession(id: UUID) {
        sessions[id]?.terminate()
        sessions.removeValue(forKey: id)
    }
}

class TerminalSession: @unchecked Sendable {
    private var ws: WebSocket?
    private var eventLoop: EventLoop?
    private var wsAttachTime: Date? // 记录 ws 被 attach 的时间
    private var masterFd: Int32 = -1
    private var pid: pid_t = -1
    private let readQueue = DispatchQueue(label: "com.minidock.terminal.read")
    private var isTerminated = false
    private var readLoopRunning = false
    private let readLoopLock = NSLock()
    private let wsLock = NSLock() // 保护 ws 的线程安全访问
    public private(set) var lastActivity = Date()
    public var isConnected: Bool { 
        wsLock.lock()
        defer { wsLock.unlock() }
        return ws != nil 
    }
    private var history = Data()
    private let historyLock = NSLock()
    private let maxHistorySize = 1024 * 512 // 512KB history buffer
    
    init() {
        startShell()
    }
    
    func attach(ws: WebSocket, eventLoop: EventLoop) {
        wsLock.lock()
        // 先设置 eventLoop，再设置 ws，确保它们的一致性
        // 注意：这里直接设置新的 ws，即使旧的 ws 仍然存在
        // 因为新的连接已经建立，旧的连接应该会被关闭并调用 detach
        self.eventLoop = eventLoop
        self.ws = ws
        self.wsAttachTime = Date() // 记录 attach 时间
        wsLock.unlock()
        lastActivity = Date()
        
        // 确保 readLoop 正在运行（如果已经退出，重新启动）
        readLoopLock.lock()
        let needRestartReadLoop = !readLoopRunning && !isTerminated && masterFd != -1
        readLoopLock.unlock()
        
        if needRestartReadLoop {
            startReadLoop()
        }
        
        // 检查 shell 进程是否还在运行
        if pid > 0 {
            var status: Int32 = 0
            let result = waitpid(pid, &status, WNOHANG)
            if result == pid {
                // Shell 进程已结束，需要重新启动
                startShell()
            }
        } else {
            startShell()
        }
        
        eventLoop.execute { [weak self] in
            guard let self = self else { return }
            
            // Replay history safely
            self.historyLock.lock()
            let historyToReplay = self.history
            self.historyLock.unlock()
            
            if !historyToReplay.isEmpty {
                ws.send(raw: historyToReplay, opcode: .binary)
            }
            ws.send("terminal_reattached")
        }
    }
    
    func detach() {
        wsLock.lock()
        let currentWS = self.ws
        let hadWS = currentWS != nil
        let attachTime = self.wsAttachTime
        
        // 检查 attach 时间：如果 ws 是在最近 100ms 内被 attach 的，可能是新连接，不应该清空
        // 这样可以避免 detach（旧连接关闭）在 attach（新连接建立）之后执行时，清空新连接的 ws
        let shouldClear: Bool
        if hadWS, let attachTime = attachTime {
            let timeSinceAttach = Date().timeIntervalSince(attachTime)
            // 如果 attach 时间在最近 100ms 内，可能是新连接，不清空
            shouldClear = timeSinceAttach > 0.1
        } else {
            shouldClear = hadWS
        }
        
        if shouldClear && hadWS {
            self.ws = nil
            self.eventLoop = nil
            self.wsAttachTime = nil
        }
        wsLock.unlock()
        lastActivity = Date()
    }
    
    private func startShell() {
        var master: Int32 = 0
        let shell = "/bin/zsh"
        
        // Use forkpty for simplicity on macOS
        pid = forkpty(&master, nil, nil, nil)
        
        if pid < 0 {
            // No WS yet during init
            return
        }
        
        if pid == 0 {
            // Child process
            // Set environment
            setenv("TERM", "xterm-256color", 1)
            setenv("LANG", "en_US.UTF-8", 1)
            
            let args = [UnsafeMutablePointer(mutating: (shell as NSString).utf8String), nil]
            execvp(shell, args)
            exit(1)
        } else {
            // Parent process
            self.masterFd = master
            
            // Start reading from master PTY
            startReadLoop()
        }
    }
    
    private func startReadLoop() {
        readLoopLock.lock()
        let shouldStart = !readLoopRunning && !isTerminated && masterFd != -1
        if shouldStart {
            readLoopRunning = true
        }
        readLoopLock.unlock()
        
        if shouldStart {
            readQueue.async { [weak self] in
                self?.readLoop()
            }
        }
    }
    
    private var readLoopTask: DispatchWorkItem?
    
    private func readLoop() {
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 4096)
        defer { 
            buffer.deallocate()
            readLoopLock.lock()
            readLoopRunning = false
            readLoopLock.unlock()
        }
        
        while !isTerminated {
            let count = read(masterFd, buffer, 4096)
            if count <= 0 {
                if count == 0 {
                    // EOF: PTY 已关闭，shell 进程可能已结束
                    break
                } else {
                    let errnoValue = errno
                    // 只有 EAGAIN 或 EINTR 错误才重试，其他错误退出
                    if errnoValue == EAGAIN || errnoValue == EINTR {
                        usleep(10000) // 10ms
                        continue
                    } else {
                        break
                    }
                }
            }
            
            let data = Data(bytes: buffer, count: count)
            
            // Append to history with lock
            self.historyLock.lock()
            self.history.append(data)
            if self.history.count > self.maxHistorySize {
                self.history.removeFirst(self.history.count - self.maxHistorySize)
            }
            self.historyLock.unlock()
            
            if let string = String(data: data, encoding: .utf8) {
                // Send safely on EventLoop - 每次读取时都获取最新的 eventLoop 和 ws
                // 使用 wsLock 保护 eventLoop 和 ws 的读取
                // 注意：必须在锁保护下同时读取 ws 和 eventLoop，确保它们的一致性
                var eventLoopToUse: EventLoop?
                var currentWS: WebSocket?
                var hasWS = false
                
                self.wsLock.lock()
                eventLoopToUse = self.eventLoop
                currentWS = self.ws
                hasWS = currentWS != nil
                // 在锁内再次验证，确保读取的一致性
                let verifyWS = self.ws
                let verifyEventLoop = self.eventLoop
                self.wsLock.unlock()
                
                // 验证读取的一致性
                if verifyWS !== currentWS || verifyEventLoop !== eventLoopToUse {
                    // 重新读取
                    self.wsLock.lock()
                    eventLoopToUse = self.eventLoop
                    currentWS = self.ws
                    hasWS = currentWS != nil
                    self.wsLock.unlock()
                }
                
                if let eventLoop = eventLoopToUse, hasWS, let ws = currentWS {
                    // 在 eventLoop 上执行，直接使用捕获的 ws 引用
                    // 注意：这里直接使用 ws，因为 WebSocket 是线程安全的
                    eventLoop.execute {
                        ws.send("terminal_data:\(string)")
                    }
                }
            } else {
                // Send binary data safely on EventLoop - 每次读取时都获取最新的 eventLoop
                self.wsLock.lock()
                let eventLoopToUse = self.eventLoop
                let currentWS = self.ws
                let hasWS = currentWS != nil
                self.wsLock.unlock()
                
                if let eventLoop = eventLoopToUse, hasWS, let ws = currentWS {
                    // 在 eventLoop 上执行，直接使用捕获的 ws 引用
                    eventLoop.execute {
                        ws.send(raw: data, opcode: .text)
                    }
                }
            }
        }
    }
    
    func write(_ data: String) {
        guard masterFd != -1 else {
            // masterFd 无效，可能是 shell 进程未启动或已终止
            // 不在这里重新启动 shell，因为 write 可能在不同线程被调用
            // shell 的启动应该在 attach 时处理
            return
        }
        let written = data.withCString { ptr in
            Foundation.write(masterFd, ptr, strlen(ptr))
        }
        // 如果写入失败，记录错误但不尝试恢复
        // shell 的恢复应该在 attach 时检查和处理
        if written < 0 {
            // 写入失败，可能是 PTY 已关闭
            // 不在这里重新启动 shell，避免线程安全问题
        }
    }
    
    func resize(cols: UInt16, rows: UInt16) {
        guard masterFd != -1 else { return }
        var size = winsize()
        size.ws_col = cols
        size.ws_row = rows
        _ = ioctl(masterFd, UInt(TIOCSWINSZ), &size)
    }
    
    func terminate() {
        isTerminated = true
        readLoopLock.lock()
        readLoopRunning = false
        readLoopLock.unlock()
        if pid != -1 {
            kill(pid, SIGTERM)
            // Wait up to 2 seconds for graceful exit
            var status: Int32 = 0
            var waited = false
            for _ in 0..<20 {
                let result = waitpid(pid, &status, WNOHANG)
                if result == pid || result == -1 {
                    waited = true
                    break
                }
                usleep(100_000) // 100ms
            }
            if !waited {
                // Force kill if still running after timeout
                kill(pid, SIGKILL)
                waitpid(pid, &status, 0)
            }
            pid = -1
        }
        if masterFd != -1 {
            close(masterFd)
            masterFd = -1
        }
    }
}
