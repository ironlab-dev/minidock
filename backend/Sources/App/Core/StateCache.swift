import Foundation

/// A simple thread-safe cache for service status and items
public final class StateCache<T>: @unchecked Sendable {
    private var data: T?
    private var lastUpdate: Date?
    private let ttl: TimeInterval
    private let lock = NSLock()
    
    public init(ttl: TimeInterval = 3.0) {
        self.ttl = ttl
    }
    
    public func get() -> T? {
        lock.lock()
        defer { lock.unlock() }
        
        guard let lastUpdate = lastUpdate,
              Date().timeIntervalSince(lastUpdate) < ttl else {
            return nil
        }
        
        return data
    }
    
    public func set(_ value: T) {
        lock.lock()
        defer { lock.unlock() }
        
        self.data = value
        self.lastUpdate = Date()
    }
    
    public func invalidate() {
        lock.lock()
        defer { lock.unlock() }
        
        self.data = nil
        self.lastUpdate = nil
    }
}
