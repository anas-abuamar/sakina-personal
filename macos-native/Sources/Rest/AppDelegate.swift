import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private var statusItem: NSStatusItem!
    private let scheduler = BreakScheduler()
    private let overlay = BreakOverlayController()

    private let snoozeInterval: TimeInterval = 5 * 60

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.image = NSImage(systemSymbolName: "eye",
                                           accessibilityDescription: "Rest")

        scheduler.onBreakDue = { [weak self] in self?.startBreak() }
        scheduler.onStateChange = { [weak self] in self?.updateStatusIcon() }

        overlay.onFinish = { [weak self] _ in
            self?.scheduler.breakFinished()
        }

        let menu = NSMenu()
        menu.delegate = self
        menu.autoenablesItems = false
        statusItem.menu = menu

        scheduler.start()
        updateStatusIcon()
    }

    // MARK: - Breaks

    private func startBreak() {
        let dhikr = Settings.showDhikr ? Adhkar.advance() : nil
        overlay.present(duration: Settings.breakDuration, dhikr: dhikr)
    }

    @objc private func breakNow() {
        startBreak()
    }

    @objc private func snooze() {
        overlay.dismiss()
        scheduler.snooze(snoozeInterval)
    }

    @objc private func togglePause() {
        if !scheduler.isPaused { overlay.dismiss() }
        scheduler.setPaused(!scheduler.isPaused)
    }

    // MARK: - Settings actions

    @objc private func setInterval(_ sender: NSMenuItem) {
        guard let value = sender.representedObject as? TimeInterval else { return }
        Settings.workInterval = value
        scheduler.scheduleNext()
    }

    @objc private func setBreakDuration(_ sender: NSMenuItem) {
        guard let value = sender.representedObject as? TimeInterval else { return }
        Settings.breakDuration = value
    }

    @objc private func toggleDhikr() { Settings.showDhikr.toggle() }
    @objc private func toggleSkipWhenAway() { Settings.skipWhenAway.toggle() }
    @objc private func toggleSkipWhilePresenting() { Settings.skipWhilePresenting.toggle() }
    @objc private func togglePlaySound() { Settings.playSound.toggle() }

    @objc private func quit() { NSApp.terminate(nil) }

    // MARK: - Status icon

    /// The icon is the only always-visible surface, so it carries the one bit
    /// that matters at a glance: running or paused. The countdown lives in the
    /// menu rather than the menu bar to keep the bar quiet.
    private func updateStatusIcon() {
        let symbol = scheduler.isPaused ? "eye.slash" : "eye"
        statusItem.button?.image = NSImage(systemSymbolName: symbol,
                                           accessibilityDescription: "Rest")
    }

    // MARK: - Menu

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()

        menu.addItem(header(statusLine()))
        menu.addItem(.separator())

        menu.addItem(item("Take a Break Now", action: #selector(breakNow)))
        menu.addItem(item("Snooze 5 Minutes", action: #selector(snooze)))
        menu.addItem(item(scheduler.isPaused ? "Resume" : "Pause", action: #selector(togglePause)))

        menu.addItem(.separator())
        menu.addItem(intervalMenuItem())
        menu.addItem(breakLengthMenuItem())

        menu.addItem(.separator())

        let dhikr = item("Show Dhikr During Break", action: #selector(toggleDhikr))
        dhikr.state = Settings.showDhikr ? .on : .off
        menu.addItem(dhikr)
        if Settings.showDhikr {
            menu.addItem(header("Next:  \(Adhkar.all[(Settings.dhikrIndex + 1) % Adhkar.all.count].transliteration)"))
        }

        menu.addItem(.separator())

        let away = item("Skip When I'm Away", action: #selector(toggleSkipWhenAway))
        away.state = Settings.skipWhenAway ? .on : .off
        menu.addItem(away)

        let presenting = item("Wait While Presenting or Watching", action: #selector(toggleSkipWhilePresenting))
        presenting.state = Settings.skipWhilePresenting ? .on : .off
        menu.addItem(presenting)

        let sound = item("Play a Sound", action: #selector(togglePlaySound))
        sound.state = Settings.playSound ? .on : .off
        menu.addItem(sound)

        menu.addItem(.separator())
        menu.addItem(item("Quit Rest", action: #selector(quit), key: "q", modifiers: [.command]))
    }

    private func statusLine() -> String {
        if scheduler.isPaused { return "Paused" }
        guard let remaining = scheduler.timeRemaining else { return "Break in progress" }
        if remaining < 60 {
            return "Next break in \(Int(remaining.rounded(.up)))s"
        }
        let minutes = Int((remaining / 60).rounded(.up))
        return "Next break in \(minutes) min"
    }

    private func intervalMenuItem() -> NSMenuItem {
        let parent = NSMenuItem(title: "Remind Me Every", action: nil, keyEquivalent: "")
        let submenu = NSMenu()
        submenu.autoenablesItems = false
        for choice in Settings.workIntervalChoices {
            let entry = NSMenuItem(title: "\(Int(choice / 60)) minutes",
                                   action: #selector(setInterval(_:)),
                                   keyEquivalent: "")
            entry.target = self
            entry.representedObject = choice
            entry.state = Settings.workInterval == choice ? .on : .off
            submenu.addItem(entry)
        }
        parent.submenu = submenu
        return parent
    }

    private func breakLengthMenuItem() -> NSMenuItem {
        let parent = NSMenuItem(title: "Break Length", action: nil, keyEquivalent: "")
        let submenu = NSMenu()
        submenu.autoenablesItems = false
        for choice in Settings.breakDurationChoices {
            let entry = NSMenuItem(title: "\(Int(choice)) seconds",
                                   action: #selector(setBreakDuration(_:)),
                                   keyEquivalent: "")
            entry.target = self
            entry.representedObject = choice
            entry.state = Settings.breakDuration == choice ? .on : .off
            submenu.addItem(entry)
        }
        parent.submenu = submenu
        return parent
    }

    private func item(_ title: String,
                      action: Selector,
                      key: String = "",
                      modifiers: NSEvent.ModifierFlags = []) -> NSMenuItem {
        let entry = NSMenuItem(title: title, action: action, keyEquivalent: key)
        entry.keyEquivalentModifierMask = modifiers
        entry.target = self
        entry.isEnabled = true
        return entry
    }

    private func header(_ title: String) -> NSMenuItem {
        let entry = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        entry.isEnabled = false
        return entry
    }
}
