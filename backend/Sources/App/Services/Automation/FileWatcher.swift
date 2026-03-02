import Foundation
import Vapor
import Fluent

public actor FileWatcher {
    private let app: Application
    private var sources: [String: DispatchSourceFileSystemObject] = [:]
    private let queue = DispatchQueue(label: "com.minidock.filewatcher", attributes: .concurrent)
    
    public init(app: Application) {
        self.app = app
    }
    
    // We restart watchers periodically or on demand. For now, we'll have a method to sync watchers.
    public func syncWatchers() async {
        do {
            let tasks = try await AutomationTask.query(on: app.db)
                .filter(\AutomationTask.$triggerType == "watch")
                .filter(\AutomationTask.$isEnabled == true)
                .all()
            
            var newPaths = Set<String>()
            
            for task in tasks {
                if let path = task.watchPath {
                    newPaths.insert(path)
                    if sources[path] == nil {
                        startWatching(path: path, task: task)
                    }
                }
            }
            
            // Remove old watchers
            for (path, source) in sources {
                if !newPaths.contains(path) {
                    source.cancel()
                    sources.removeValue(forKey: path)
                }
            }
        } catch {
            app.logger.error("FileWatcher sync error: \(error)")
        }
    }
    
    private func startWatching(path: String, task: AutomationTask) {
        let fileURL = URL(fileURLWithPath: path)
        let handle = open(fileURL.path, O_EVTONLY)
        
        guard handle != -1 else {
            app.logger.error("Failed to open file for watching: \(path)")
            return
        }
        
        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: handle,
            eventMask: [.write, .extend, .delete, .rename, .attrib],
            queue: queue
        )
        
        source.setEventHandler { [weak self] in
            guard let self = self else { return }
            self.app.logger.info("File changed: \(path)")
            Task {
                if let service = await self.app.serviceManager.getService(id: "automation-engine") as? AutomationService {
                     // Fetch mostly current task data to ensure it's still valid
                     // For optimization we assume 'task' passed in is mostly key-valid, but we should re-fetch if we stored ID
                     try? await service.runTask(app: self.app, task: task)
                }
            }
        }
        
        source.setCancelHandler {
            close(handle)
        }
        
        source.resume()
        sources[path] = source
    }
    
    public func stop() {
        for source in sources.values {
            source.cancel()
        }
        sources.removeAll()
    }
}
