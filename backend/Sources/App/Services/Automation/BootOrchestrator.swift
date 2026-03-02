import Vapor
import Fluent

struct BootOrchestrator: Sendable {
    static func run(app: Application) {
        Task {
            // Wait for system to settle
            try? await Task.sleep(nanoseconds: 2 * 1_000_000_000)
            
            app.logger.info("[BootOrchestrator] Starting boot sequence...")
            
            do {
                // 1. Fetch configs
                let configs = try await ServiceBootConfig.query(on: app.db)
                    .filter(\.$autoStart == true)
                    .sort(\.$bootPriority, .ascending)
                    .all()
                
                guard !configs.isEmpty else {
                    app.logger.info("[BootOrchestrator] No auto-start items configured.")
                    return
                }
                
                // Log all auto-start configurations for debugging
                app.logger.info("[BootOrchestrator] Found \(configs.count) auto-start configuration(s):")
                for config in configs {
                    if let itemId = config.itemId {
                        app.logger.info("[BootOrchestrator]   - Item: \(config.itemName) (service: \(config.serviceId), item: \(itemId), priority: \(config.bootPriority))")
                    } else {
                        app.logger.info("[BootOrchestrator]   - Service: \(config.itemName) (service: \(config.serviceId), priority: \(config.bootPriority))")
                    }
                }
                
                // 2. Group by Priority
                let grouped = Dictionary(grouping: configs, by: { $0.bootPriority })
                let sortedPriorities = grouped.keys.sorted()
                
                for priority in sortedPriorities {
                    guard let group = grouped[priority] else { continue }
                    
                    app.logger.info("[BootOrchestrator] Processing Priority Group \(priority) (\(group.count) items)")
                    
                    var maxDelay = 0
                    
                    await withTaskGroup(of: Void.self) { taskGroup in
                        for config in group {
                            maxDelay = max(maxDelay, config.bootDelay)
                            
                            taskGroup.addTask {
                                guard let service = await app.serviceManager.getService(id: config.serviceId) else {
                                    app.logger.warning("[BootOrchestrator] Service not found: \(config.serviceId)")
                                    return
                                }
                                
                                do {
                                    if let itemId = config.itemId {
                                        // Boot Specific Item
                                        app.logger.info("[BootOrchestrator] Starting Item: \(config.itemName) (\(itemId))")
                                        try await service.performItemAction(app: app, itemId: itemId, action: "start")
                                        app.logger.info("[BootOrchestrator] Started Item: \(config.itemName)")
                                    } else {
                                        // Boot Service Itself - Check status first
                                        let currentStatus = try await service.getStatus()
                                        if currentStatus == .running {
                                            app.logger.info("[BootOrchestrator] Service \(service.name) is already running, skipping start")
                                            return
                                        }
                                        
                                        // Special handling for Docker: check if Docker is actually available
                                        if config.serviceId == "docker-engine" {
                                            if let dockerService = service as? DockerEngineService {
                                                let dockerStatus = try await dockerService.getStatus()
                                                if dockerStatus == .running {
                                                    app.logger.info("[BootOrchestrator] Docker is already available, skipping OrbStack/Docker Desktop start")
                                                    return
                                                }
                                            }
                                        }
                                        
                                        // Special handling for UTM: check if there are VMs to manage
                                        if config.serviceId == "utm-vms" {
                                            if let utmService = service as? UTMService {
                                                let utmStatus = try await utmService.getStatus()
                                                if utmStatus == .running {
                                                    app.logger.info("[BootOrchestrator] UTM is already running, skipping start")
                                                    return
                                                }
                                                
                                                // Check if there are any VMs to manage
                                                let vms = try? await utmService.getItems(app: app)
                                                if vms?.isEmpty ?? true {
                                                    app.logger.info("[BootOrchestrator] UTM has no VMs to manage, skipping start")
                                                    return
                                                }
                                            }
                                        }
                                        
                                        app.logger.info("[BootOrchestrator] Starting Service: \(service.name)")
                                        try await service.start(app: app)
                                        app.logger.info("[BootOrchestrator] Started Service: \(service.name)")
                                    }
                                } catch {
                                    app.logger.error("[BootOrchestrator] Failed to start \(config.itemName): \(error)")
                                }
                            }
                        }
                    }
                    
                    // 3. Delay
                    if maxDelay > 0 {
                        app.logger.info("[BootOrchestrator] Waiting \(maxDelay)s before next priority...")
                        try? await Task.sleep(nanoseconds: UInt64(maxDelay) * 1_000_000_000)
                    }
                }
                
                
                // 4. Auto-Start Native VMs
                app.logger.info("[BootOrchestrator] Checking for Auto-Start VMs...")
                if let vmStorage = await app.serviceManager.getService(id: "vm-storage") as? VMStorageService,
                   let nativeVM = await app.serviceManager.getService(id: "native-vm") as? NativeVMService {
                    
                    if let vms = try? await vmStorage.listVMs(app: app) {
                        for vm in vms where vm.autoStart == true {
                             app.logger.info("[BootOrchestrator] Auto-Starting Native VM: \(vm.name)")
                             Task {
                                 do {
                                     try await nativeVM.startVM(app: app, vmPath: vm.path)
                                     app.logger.info("[BootOrchestrator] Successfully started VM: \(vm.name)")
                                 } catch {
                                     app.logger.error("[BootOrchestrator] Failed to auto-start VM \(vm.name): \(error)")
                                 }
                             }
                        }
                    }
                }
                
                app.logger.info("[BootOrchestrator] Boot sequence complete.")
                
            } catch {
                app.logger.error("[BootOrchestrator] Error: \(error)")
            }
        }
    }
}
