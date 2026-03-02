import Cocoa

// Entry point
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory) // Hide from Dock, only Menu Bar
_ = NSApplicationMain(CommandLine.argc, CommandLine.unsafeArgv)
