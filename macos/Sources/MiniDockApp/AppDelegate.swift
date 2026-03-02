import Cocoa
import ApplicationServices
import LocalAuthentication
import BCrypt
import SQLite3

class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var popover: NSPopover!
    var eventMonitor: EventMonitor?
    
    private var backendStatusItem: NSMenuItem?
    private var frontendStatusItem: NSMenuItem?
    
    // Port configuration (can be customized via UserDefaults)
    private var frontendPort: Int {
        let saved = UserDefaults.standard.integer(forKey: "frontendPort")
        return saved > 0 ? saved : 23000
    }
    
    private var backendPort: Int {
        let saved = UserDefaults.standard.integer(forKey: "backendPort")
        return saved > 0 ? saved : 28080
    }
    
    private let defaultFrontendPort = 23000
    private let defaultBackendPort = 28080
    
    func applicationDidFinishLaunching(_ aNotification: Notification) {
        // 1. Start Background Services
        AppLifecycleManager.shared.startServices()
        
        // 2. Setup Status Change Callback
        AppLifecycleManager.shared.onStatusChange = { [weak self] backendRunning, frontendRunning in
            DispatchQueue.main.async {
                self?.updateServiceStatus(backendRunning: backendRunning, frontendRunning: frontendRunning)
            }
        }
        
        // 3. Setup Status Bar
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "server.rack", accessibilityDescription: "MiniDock")
            button.action = #selector(togglePopover(_:))
        }
        
        // 4. Setup Popover
        popover = NSPopover()
        popover.contentViewController = DashboardViewController()
        popover.behavior = .transient
        
        // 5. Setup Event Monitor to close popover on outside click
        eventMonitor = EventMonitor(mask: [.leftMouseDown, .rightMouseDown]) { [weak self] event in
            if let strongSelf = self, strongSelf.popover.isShown {
                strongSelf.closePopover(sender: event)
            }
        }
        
        // 6. Setup Menu
        statusItem.menu = createMenu()
        
        // 7. Initial status update
        let status = AppLifecycleManager.shared.getServiceStatus()
        updateServiceStatus(backendRunning: status.backendRunning, frontendRunning: status.frontendRunning)
    }
    
    private func createMenu() -> NSMenu {
        let menu = NSMenu()
        
        // === Service Status Section ===
        let backendStatus = AppLifecycleManager.shared.getServiceStatus()
        backendStatusItem = NSMenuItem(title: "后端服务: \(backendStatus.backendRunning ? "● 运行中" : "○ 已停止")", action: nil, keyEquivalent: "")
        backendStatusItem?.isEnabled = false
        menu.addItem(backendStatusItem ?? NSMenuItem())
        
        frontendStatusItem = NSMenuItem(title: "前端服务: \(backendStatus.frontendRunning ? "● 运行中" : "○ 已停止")", action: nil, keyEquivalent: "")
        frontendStatusItem?.isEnabled = false
        menu.addItem(frontendStatusItem ?? NSMenuItem())
        
        menu.addItem(NSMenuItem.separator())
        
        // === Open Section ===
        let openItem = NSMenuItem(title: "在浏览器中打开", action: #selector(openBrowser), keyEquivalent: "o")
        openItem.image = NSImage(systemSymbolName: "globe", accessibilityDescription: nil)
        menu.addItem(openItem)
        
        let openSettingsItem = NSMenuItem(title: "打开设置页面", action: #selector(openSettings), keyEquivalent: ",")
        openSettingsItem.image = NSImage(systemSymbolName: "gearshape", accessibilityDescription: nil)
        menu.addItem(openSettingsItem)
        
        menu.addItem(NSMenuItem.separator())
        
        // === Service Control Section ===
        let restartItem = NSMenuItem(title: "重启服务", action: #selector(restartServices), keyEquivalent: "r")
        restartItem.image = NSImage(systemSymbolName: "arrow.clockwise", accessibilityDescription: nil)
        menu.addItem(restartItem)
        
        menu.addItem(NSMenuItem.separator())
        
        // === Logs Section ===
        let logsSubmenu = NSMenu()
        
        let loggingItem = NSMenuItem(title: "启用日志记录", action: #selector(toggleLogging(_:)), keyEquivalent: "")
        loggingItem.state = UserDefaults.standard.bool(forKey: "enableLogging") ? .on : .off
        logsSubmenu.addItem(loggingItem)
        
        logsSubmenu.addItem(NSMenuItem.separator())
        
        let openLogsItem = NSMenuItem(title: "打开日志目录", action: #selector(openLogsFolder), keyEquivalent: "l")
        logsSubmenu.addItem(openLogsItem)
        
        let openBackendLogItem = NSMenuItem(title: "查看后端日志", action: #selector(openBackendLog), keyEquivalent: "")
        logsSubmenu.addItem(openBackendLogItem)
        
        let openFrontendLogItem = NSMenuItem(title: "查看前端日志", action: #selector(openFrontendLog), keyEquivalent: "")
        logsSubmenu.addItem(openFrontendLogItem)
        
        let logsMenuItem = NSMenuItem(title: "日志", action: nil, keyEquivalent: "")
        logsMenuItem.image = NSImage(systemSymbolName: "doc.text", accessibilityDescription: nil)
        logsMenuItem.submenu = logsSubmenu
        menu.addItem(logsMenuItem)
        
        menu.addItem(NSMenuItem.separator())
        
        // === Port Settings Section ===
        let portsItem = NSMenuItem(title: "端口设置", action: nil, keyEquivalent: "")
        portsItem.image = NSImage(systemSymbolName: "network", accessibilityDescription: nil)
        
        let portsSubmenu = NSMenu()
        
        let frontendPortItem = NSMenuItem(title: "前端端口: \(frontendPort)", action: #selector(configureFrontendPort), keyEquivalent: "")
        frontendPortItem.toolTip = "点击修改"
        portsSubmenu.addItem(frontendPortItem)
        
        let backendPortItem = NSMenuItem(title: "后端端口: \(backendPort)", action: #selector(configureBackendPort), keyEquivalent: "")
        backendPortItem.toolTip = "点击修改"
        portsSubmenu.addItem(backendPortItem)
        
        portsSubmenu.addItem(NSMenuItem.separator())
        
        let resetPortsItem = NSMenuItem(title: "恢复默认端口", action: #selector(resetPorts), keyEquivalent: "")
        portsSubmenu.addItem(resetPortsItem)
        
        portsSubmenu.addItem(NSMenuItem.separator())
        
        let copyUrlItem = NSMenuItem(title: "复制访问地址", action: #selector(copyAccessUrl), keyEquivalent: "c")
        portsSubmenu.addItem(copyUrlItem)
        
        portsItem.submenu = portsSubmenu
        menu.addItem(portsItem)
        
        // === Permissions Section ===
        let permissionsItem = NSMenuItem(title: "系统权限", action: nil, keyEquivalent: "")
        permissionsItem.image = NSImage(systemSymbolName: "lock.shield", accessibilityDescription: nil)
        
        let permissionsSubmenu = NSMenu()
        
        let fullDiskItem = NSMenuItem(title: "完全磁盘访问权限", action: #selector(openFullDiskAccess), keyEquivalent: "")
        fullDiskItem.state = checkFullDiskAccess() ? .on : .off
        permissionsSubmenu.addItem(fullDiskItem)
        
        let accessibilityItem = NSMenuItem(title: "辅助功能权限", action: #selector(openAccessibility), keyEquivalent: "")
        accessibilityItem.state = checkAccessibilityAccess() ? .on : .off
        permissionsSubmenu.addItem(accessibilityItem)
        
        permissionsSubmenu.addItem(NSMenuItem.separator())
        
        let refreshPermItem = NSMenuItem(title: "刷新权限状态", action: #selector(refreshPermissions), keyEquivalent: "")
        permissionsSubmenu.addItem(refreshPermItem)
        
        permissionsSubmenu.addItem(NSMenuItem.separator())
        
        let resetPasswordItem = NSMenuItem(title: "重置管理员密码", action: #selector(resetAdminPassword), keyEquivalent: "")
        resetPasswordItem.image = NSImage(systemSymbolName: "key.fill", accessibilityDescription: nil)
        permissionsSubmenu.addItem(resetPasswordItem)
        
        permissionsItem.submenu = permissionsSubmenu
        menu.addItem(permissionsItem)
        
        menu.addItem(NSMenuItem.separator())
        
        // === About & Quit ===
        let aboutItem = NSMenuItem(title: "关于 MiniDock", action: #selector(showAbout), keyEquivalent: "")
        aboutItem.image = NSImage(systemSymbolName: "info.circle", accessibilityDescription: nil)
        menu.addItem(aboutItem)
        
        menu.addItem(NSMenuItem.separator())
        
        let quitItem = NSMenuItem(title: "退出 MiniDock", action: #selector(quit), keyEquivalent: "q")
        menu.addItem(quitItem)
        
        return menu
    }

    func applicationWillTerminate(_ aNotification: Notification) {
        AppLifecycleManager.shared.stopServices()
    }
    
    // MARK: - Popover
    
    @objc func togglePopover(_ sender: Any?) {
        if popover.isShown {
            closePopover(sender: sender)
        } else {
            showPopover(sender: sender)
        }
    }
    
    func showPopover(sender: Any?) {
        if let button = statusItem.button {
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            eventMonitor?.start()
        }
    }
    
    func closePopover(sender: Any?) {
        popover.performClose(sender)
        eventMonitor?.stop()
    }
    
    // MARK: - Open Actions
    
    @objc func openBrowser() {
        if let url = URL(string: "http://127.0.0.1:\(frontendPort)") {
            NSWorkspace.shared.open(url)
        }
    }
    
    @objc func openSettings() {
        if let url = URL(string: "http://127.0.0.1:\(frontendPort)/settings") {
            NSWorkspace.shared.open(url)
        }
    }
    
    // MARK: - Service Control
    
    @objc func restartServices() {
        let alert = NSAlert()
        alert.messageText = "重启服务"
        alert.informativeText = "确定要重启 MiniDock 服务吗？这将会中断当前的连接。"
        alert.alertStyle = .warning
        alert.addButton(withTitle: "重启")
        alert.addButton(withTitle: "取消")
        
        if alert.runModal() == .alertFirstButtonReturn {
            AppLifecycleManager.shared.stopServices()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                AppLifecycleManager.shared.startServices()
            }
        }
    }
    
    // MARK: - Logs
    
    @objc func toggleLogging(_ sender: NSMenuItem) {
        let current = UserDefaults.standard.bool(forKey: "enableLogging")
        let newValue = !current
        UserDefaults.standard.set(newValue, forKey: "enableLogging")
        sender.state = newValue ? .on : .off
        print("📝 [AppDelegate] Logging enabled: \(newValue)")
        
        if newValue {
            openLogsFolder()
        }
    }
    
    @objc func openLogsFolder() {
        let logsPath = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/MiniDock")
        
        // Create directory if not exists
        try? FileManager.default.createDirectory(at: logsPath, withIntermediateDirectories: true)
        
        NSWorkspace.shared.open(logsPath)
    }
    
    @objc func openBackendLog() {
        let logPath = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Logs/MiniDock/backend.log")
        openLogFile(at: logPath)
    }
    
    @objc func openFrontendLog() {
        let logPath = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Logs/MiniDock/frontend.log")
        openLogFile(at: logPath)
    }
    
    private func openLogFile(at url: URL) {
        if FileManager.default.fileExists(atPath: url.path) {
            NSWorkspace.shared.open(url)
        } else {
            let alert = NSAlert()
            alert.messageText = "日志文件不存在"
            alert.informativeText = "请先启用日志记录，然后等待服务产生日志。\n\n日志路径: \(url.path)"
            alert.alertStyle = .informational
            alert.addButton(withTitle: "好的")
            alert.addButton(withTitle: "启用日志")
            
            if alert.runModal() == .alertSecondButtonReturn {
                UserDefaults.standard.set(true, forKey: "enableLogging")
                // Update menu item state
                if let menu = statusItem.menu,
                   let logsItem = menu.item(withTitle: "日志"),
                   let logsSubmenu = logsItem.submenu,
                   let loggingItem = logsSubmenu.item(withTitle: "启用日志记录") {
                    loggingItem.state = .on
                }
            }
        }
    }
    
    // MARK: - Port Configuration
    
    @objc func configureFrontendPort() {
        let newPort = showPortInputDialog(
            title: "设置前端端口",
            message: "请输入前端服务端口号（需要重启服务生效）",
            currentPort: frontendPort
        )
        
        if let port = newPort, port != frontendPort {
            UserDefaults.standard.set(port, forKey: "frontendPort")
            refreshMenu()
            promptRestart()
        }
    }
    
    @objc func configureBackendPort() {
        let newPort = showPortInputDialog(
            title: "设置后端端口",
            message: "请输入后端服务端口号（需要重启服务生效）",
            currentPort: backendPort
        )
        
        if let port = newPort, port != backendPort {
            UserDefaults.standard.set(port, forKey: "backendPort")
            refreshMenu()
            promptRestart()
        }
    }
    
    @objc func resetPorts() {
        let alert = NSAlert()
        alert.messageText = "恢复默认端口"
        alert.informativeText = "将端口恢复为默认值：\n前端: \(defaultFrontendPort)\n后端: \(defaultBackendPort)\n\n需要重启服务生效。"
        alert.alertStyle = .informational
        alert.addButton(withTitle: "恢复并重启")
        alert.addButton(withTitle: "取消")
        
        if alert.runModal() == .alertFirstButtonReturn {
            UserDefaults.standard.removeObject(forKey: "frontendPort")
            UserDefaults.standard.removeObject(forKey: "backendPort")
            refreshMenu()
            restartServicesNow()
        }
    }
    
    private func showPortInputDialog(title: String, message: String, currentPort: Int) -> Int? {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.alertStyle = .informational
        alert.addButton(withTitle: "确定")
        alert.addButton(withTitle: "取消")
        
        let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 200, height: 24))
        input.stringValue = "\(currentPort)"
        input.placeholderString = "端口号 (1024-65535)"
        alert.accessoryView = input
        
        if alert.runModal() == .alertFirstButtonReturn {
            if let port = Int(input.stringValue), port >= 1024 && port <= 65535 {
                return port
            } else {
                let errorAlert = NSAlert()
                errorAlert.messageText = "无效的端口号"
                errorAlert.informativeText = "请输入 1024-65535 之间的数字"
                errorAlert.alertStyle = .warning
                errorAlert.runModal()
            }
        }
        return nil
    }
    
    private func promptRestart() {
        let alert = NSAlert()
        alert.messageText = "端口已更改"
        alert.informativeText = "新的端口设置需要重启服务才能生效。"
        alert.alertStyle = .informational
        alert.addButton(withTitle: "立即重启")
        alert.addButton(withTitle: "稍后重启")
        
        if alert.runModal() == .alertFirstButtonReturn {
            restartServicesNow()
        }
    }
    
    private func restartServicesNow() {
        AppLifecycleManager.shared.stopServices()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            AppLifecycleManager.shared.startServices()
        }
    }
    
    private func refreshMenu() {
        statusItem.menu = createMenu()
        // Update status after menu refresh
        let status = AppLifecycleManager.shared.getServiceStatus()
        updateServiceStatus(backendRunning: status.backendRunning, frontendRunning: status.frontendRunning)
    }
    
    // MARK: - Service Status
    
    private func updateServiceStatus(backendRunning: Bool, frontendRunning: Bool) {
        // Update menu items
        backendStatusItem?.title = "后端服务: \(backendRunning ? "● 运行中" : "○ 已停止")"
        frontendStatusItem?.title = "前端服务: \(frontendRunning ? "● 运行中" : "○ 已停止")"
        
        // Update status bar icon
        updateStatusBarIcon(backendRunning: backendRunning, frontendRunning: frontendRunning)
    }
    
    private func updateStatusBarIcon(backendRunning: Bool, frontendRunning: Bool) {
        guard let button = statusItem.button else { return }
        
        // Use different icons to indicate status (more compatible with menubar)
        let symbolName: String
        if backendRunning && frontendRunning {
            // Both running - normal server icon
            symbolName = "server.rack"
        } else if backendRunning || frontendRunning {
            // One running - warning (exclamation mark)
            symbolName = "exclamationmark.triangle"
        } else {
            // Both stopped - error (x mark)
            symbolName = "xmark.circle"
        }
        
        if let image = NSImage(systemSymbolName: symbolName, accessibilityDescription: "MiniDock") {
            image.isTemplate = true
            button.image = image
        }
    }
    
    @objc func copyAccessUrl() {
        let url = "http://127.0.0.1:\(frontendPort)"
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(url, forType: .string)
        showCopiedNotification()
    }
    
    private func showCopiedNotification() {
        if let button = statusItem.button {
            let originalImage = button.image
            button.image = NSImage(systemSymbolName: "checkmark.circle.fill", accessibilityDescription: nil)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                button.image = originalImage
            }
        }
    }
    
    // MARK: - Permissions
    
    private func checkFullDiskAccess() -> Bool {
        // Try to access a protected directory to check Full Disk Access
        let testPath = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/com.apple.TCC/TCC.db")
        return FileManager.default.isReadableFile(atPath: testPath.path)
    }
    
    private func checkAccessibilityAccess() -> Bool {
        // Use AXIsProcessTrusted to check accessibility permission
        return AXIsProcessTrusted()
    }
    
    @objc func openFullDiskAccess() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles") {
            NSWorkspace.shared.open(url)
        }
    }
    
    @objc func openAccessibility() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
            NSWorkspace.shared.open(url)
        }
    }
    
    @objc func refreshPermissions() {
        refreshMenu()
        
        let fullDisk = checkFullDiskAccess()
        let accessibility = checkAccessibilityAccess()
        
        let alert = NSAlert()
        alert.messageText = "权限状态"
        alert.informativeText = """
        完全磁盘访问权限: \(fullDisk ? "✅ 已授权" : "❌ 未授权")
        辅助功能权限: \(accessibility ? "✅ 已授权" : "❌ 未授权")
        """
        alert.alertStyle = .informational
        alert.addButton(withTitle: "好的")
        alert.runModal()
    }
    
    // MARK: - About & Quit
    
    @objc func showAbout() {
        let alert = NSAlert()
        alert.messageText = "MiniDock"
        
        // Read version from bundle or version.json
        var version = "0.1.0"
        if let resourcePath = Bundle.main.resourcePath {
            let versionPath = (resourcePath as NSString).appendingPathComponent("version.json")
            if let data = FileManager.default.contents(atPath: versionPath),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let v = json["version"] as? String {
                version = v
            }
        }
        
        alert.informativeText = """
        版本: \(version)
        
        Mac Mini NAS 管理控制台
        
        日志目录: ~/Library/Logs/MiniDock/
        """
        alert.alertStyle = .informational
        alert.addButton(withTitle: "好的")
        alert.addButton(withTitle: "访问官网")
        
        if alert.runModal() == .alertSecondButtonReturn {
            if let url = URL(string: "https://minidock.net") {
                NSWorkspace.shared.open(url)
            }
        }
    }

    @objc func quit() {
        NSApplication.shared.terminate(self)
    }
    
    // MARK: - Reset Admin Password
    
    @objc func resetAdminPassword() {
        // Step 1: System Authentication
        let context = LAContext()
        var error: NSError?
        
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            let alert = NSAlert()
            alert.messageText = "无法进行身份验证"
            alert.informativeText = "系统不支持生物识别或密码验证。\n\n错误: \(error?.localizedDescription ?? "未知错误")"
            alert.alertStyle = .warning
            alert.addButton(withTitle: "好的")
            alert.runModal()
            return
        }
        
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "验证身份以重置管理员密码") { [weak self] success, authError in
            DispatchQueue.main.async {
                if success {
                    self?.showPasswordInputDialog()
                } else {
                    let alert = NSAlert()
                    alert.messageText = "身份验证失败"
                    alert.informativeText = authError?.localizedDescription ?? "用户取消了身份验证"
                    alert.alertStyle = .informational
                    alert.addButton(withTitle: "好的")
                    alert.runModal()
                }
            }
        }
    }
    
    private func showPasswordInputDialog() {
        // Get admin username from database
        let adminUsername = getAdminUsername() ?? "admin"
        
        let alert = NSAlert()
        alert.messageText = "重置管理员密码"
        alert.informativeText = "管理员账号: \(adminUsername)\n\n请输入新的管理员密码："
        alert.alertStyle = .informational
        alert.addButton(withTitle: "确定")
        alert.addButton(withTitle: "取消")
        
        let passwordField = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 300, height: 24))
        passwordField.placeholderString = "新密码"
        alert.accessoryView = passwordField
        
        let confirmField = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 300, height: 24))
        confirmField.placeholderString = "确认密码"
        
        let stackView = NSStackView(frame: NSRect(x: 0, y: 0, width: 300, height: 50))
        stackView.orientation = .vertical
        stackView.spacing = 8
        stackView.addArrangedSubview(passwordField)
        stackView.addArrangedSubview(confirmField)
        alert.accessoryView = stackView
        
        if alert.runModal() == .alertFirstButtonReturn {
            let newPassword = passwordField.stringValue
            let confirmPassword = confirmField.stringValue
            
            guard !newPassword.isEmpty else {
                showErrorAlert(title: "密码不能为空", message: "请输入新密码")
                return
            }
            
            guard newPassword == confirmPassword else {
                showErrorAlert(title: "密码不匹配", message: "两次输入的密码不一致，请重新输入")
                return
            }
            
            guard newPassword.count >= 6 else {
                showErrorAlert(title: "密码太短", message: "密码长度至少需要 6 个字符")
                return
            }
            
            updateAdminPassword(newPassword: newPassword)
        }
    }
    
    private func updateAdminPassword(newPassword: String) {
        // Generate BCrypt hash (use cost 12 to match existing users)
        let passwordHash: String
        do {
            let salt = try Salt(cost: 12)
            let bytes = try BCrypt.hash(message: newPassword, with: salt)
            passwordHash = bytes.string()
            
            // Verify hash format (should start with $2a$ or $2b$)
            guard passwordHash.hasPrefix("$2a$") || passwordHash.hasPrefix("$2b$") else {
                showErrorAlert(title: "密码哈希格式错误", message: "生成的哈希格式不正确")
                return
            }
        } catch {
            showErrorAlert(title: "密码哈希生成失败", message: "错误: \(error.localizedDescription)")
            return
        }
        
        // Update database
        let dbPath = getDatabasePath()
        guard FileManager.default.fileExists(atPath: dbPath) else {
            showErrorAlert(title: "数据库文件不存在", message: "无法找到数据库文件：\n\(dbPath)")
            return
        }
        
        var db: OpaquePointer?
        guard sqlite3_open(dbPath, &db) == SQLITE_OK else {
            let errorMsg = String(cString: sqlite3_errmsg(db))
            sqlite3_close(db)
            showErrorAlert(title: "无法打开数据库", message: "错误: \(errorMsg)")
            return
        }
        
        // Update admin password - use direct SQL with escaped string to avoid binding issues
        // SQLite's LIMIT 1 is not standard, use subquery instead
        let escapedHash = passwordHash.replacingOccurrences(of: "'", with: "''")
        let updateSQL = "UPDATE users SET password_hash = '\(escapedHash)' WHERE role = 'admin'"
        
        var errorMessage: UnsafeMutablePointer<CChar>?
        let result = sqlite3_exec(db, updateSQL, nil, nil, &errorMessage)
        
        if result == SQLITE_OK {
            let rowsAffected = sqlite3_changes(db)
            sqlite3_close(db)
            
            if rowsAffected > 0 {
                showSuccessAlert(password: newPassword)
            } else {
                showErrorAlert(title: "未找到管理员账号", message: "数据库中没有找到管理员账号（role='admin'）")
            }
        } else {
            let errorMsg = errorMessage.map { String(cString: $0) } ?? "Unknown error"
            sqlite3_free(errorMessage)
            sqlite3_close(db)
            showErrorAlert(title: "更新失败", message: "错误: \(errorMsg)")
        }
    }
    
    private func getDatabasePath() -> String {
        let homeDir = FileManager.default.homeDirectoryForCurrentUser
        let dbPath = homeDir.appendingPathComponent("Library/Application Support/cc.ironlab.minidock/database/minidock.sqlite")
        return dbPath.path
    }
    
    private func showErrorAlert(title: String, message: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.addButton(withTitle: "好的")
        alert.runModal()
    }
    
    private func getAdminUsername() -> String? {
        let dbPath = getDatabasePath()
        guard FileManager.default.fileExists(atPath: dbPath) else {
            return nil
        }
        
        var db: OpaquePointer?
        guard sqlite3_open(dbPath, &db) == SQLITE_OK else {
            sqlite3_close(db)
            return nil
        }
        
        let querySQL = "SELECT username FROM users WHERE role = 'admin' LIMIT 1"
        var statement: OpaquePointer?
        var username: String? = nil
        
        if sqlite3_prepare_v2(db, querySQL, -1, &statement, nil) == SQLITE_OK {
            if sqlite3_step(statement) == SQLITE_ROW {
                if let cString = sqlite3_column_text(statement, 0) {
                    username = String(cString: cString)
                }
            }
        }
        
        sqlite3_finalize(statement)
        sqlite3_close(db)
        return username
    }
    
    private func showSuccessAlert(password: String) {
        let adminUsername = getAdminUsername() ?? "admin"
        
        let alert = NSAlert()
        alert.messageText = "密码重置成功"
        alert.informativeText = """
        管理员账号: \(adminUsername)
        
        新密码: \(password)
        
        请妥善保管此密码，此对话框关闭后将不再显示。
        """
        alert.alertStyle = .informational
        alert.addButton(withTitle: "好的")
        alert.runModal()
    }
}
