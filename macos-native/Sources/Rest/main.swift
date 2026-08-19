import AppKit

if CommandLine.arguments.dropFirst().first == "--probe" {
    Probe.run(arguments: Array(CommandLine.arguments.dropFirst(2)))
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
