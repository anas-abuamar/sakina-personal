import AppKit

/// Borderless full-screen panel, one per display. Floats above full-screen
/// apps (`.screenSaver`) and follows you between Spaces rather than living on
/// the one that happened to be active when the break started.
final class OverlayPanel: NSPanel {
    var onCancel: (() -> Void)?

    override var canBecomeKey: Bool { true }

    /// Esc. Taking key focus during the break is intentional: whatever you type
    /// while the screen is covered should land nowhere, not in your document.
    override func cancelOperation(_ sender: Any?) {
        onCancel?()
    }
}

/// Presents the break: dims every display, counts down, shows the dhikr.
final class BreakOverlayController {

    /// Called when the break ends. `completed` is false when it was skipped
    /// with Esc, so the caller can tell "rested" from "dismissed".
    var onFinish: ((_ completed: Bool) -> Void)?

    private var panels: [OverlayPanel] = []
    private var screenViews: [BreakScreenView] = []
    private var countdown: Timer?
    private var endsAt: Date?

    var isPresenting: Bool { !panels.isEmpty }

    func present(duration: TimeInterval, dhikr: Dhikr?) {
        guard !isPresenting else { return }

        let end = Date().addingTimeInterval(duration)
        endsAt = end

        for screen in NSScreen.screens {
            let view = BreakScreenView(frame: screen.frame, duration: duration, dhikr: dhikr)
            let panel = OverlayPanel(contentRect: screen.frame,
                                     styleMask: [.borderless],
                                     backing: .buffered,
                                     defer: false)
            panel.contentView = view
            panel.isOpaque = false
            panel.backgroundColor = .clear
            panel.level = .screenSaver
            panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
            panel.hidesOnDeactivate = false
            panel.isMovable = false
            panel.alphaValue = 0
            panel.onCancel = { [weak self] in self?.finish(completed: false) }
            panel.setFrame(screen.frame, display: true)
            panel.orderFrontRegardless()

            panels.append(panel)
            screenViews.append(view)
        }

        NSApp.activate(ignoringOtherApps: true)
        panels.first?.makeKey()

        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.4
            context.timingFunction = CAMediaTimingFunction(name: .easeOut)
            panels.forEach { $0.animator().alphaValue = 1 }
        }
        screenViews.forEach { $0.startRing(duration: duration) }

        if Settings.playSound { NSSound(named: "Submarine")?.play() }

        tick()
        let timer = Timer(timeInterval: 0.2, repeats: true) { [weak self] _ in self?.tick() }
        timer.tolerance = 0.05
        RunLoop.main.add(timer, forMode: .common)
        countdown = timer
    }

    private func tick() {
        guard let endsAt else { return }
        let remaining = endsAt.timeIntervalSinceNow
        if remaining <= 0 {
            finish(completed: true)
            return
        }
        screenViews.forEach { $0.update(remaining: remaining) }
    }

    private func finish(completed: Bool) {
        guard isPresenting else { return }
        countdown?.invalidate()
        countdown = nil
        endsAt = nil

        let closing = panels
        panels = []
        screenViews = []

        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.3
            context.timingFunction = CAMediaTimingFunction(name: .easeIn)
            closing.forEach { $0.animator().alphaValue = 0 }
        } completionHandler: {
            closing.forEach { $0.orderOut(nil) }
            NSApp.deactivate()
        }

        onFinish?(completed)
    }

    func dismiss() {
        finish(completed: false)
    }
}

// MARK: - Screen contents

final class BreakScreenView: NSView {
    private let ring = CAShapeLayer()
    private let ringTrack = CAShapeLayer()
    private let secondsLabel = NSTextField(labelWithString: "")
    private let duration: TimeInterval

    /// Everything is sized off the display so the break reads the same on a
    /// 13" laptop and a 32" monitor.
    private let scale: CGFloat

    init(frame: NSRect, duration: TimeInterval, dhikr: Dhikr?) {
        self.duration = duration
        self.scale = min(max(frame.height / 1000, 0.72), 1.5)
        super.init(frame: frame)

        wantsLayer = true
        layer?.backgroundColor = NSColor.black.withAlphaComponent(0.94).cgColor

        let ringSize = 168 * scale
        let ringHost = NSView(frame: NSRect(x: 0, y: 0, width: ringSize, height: ringSize))
        ringHost.wantsLayer = true
        ringHost.translatesAutoresizingMaskIntoConstraints = false
        buildRing(in: ringHost, size: ringSize)

        secondsLabel.font = .monospacedDigitSystemFont(ofSize: 54 * scale, weight: .light)
        secondsLabel.textColor = .white
        secondsLabel.alignment = .center
        secondsLabel.translatesAutoresizingMaskIntoConstraints = false
        ringHost.addSubview(secondsLabel)

        let title = label("Look away",
                          size: 34 * scale, weight: .semibold, alpha: 1.0)
        let subtitle = label("Focus on something about 20 feet (6 m) away until the ring closes.",
                             size: 16 * scale, weight: .regular, alpha: 0.62, wraps: true)

        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 14 * scale
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.addArrangedSubview(ringHost)
        stack.setCustomSpacing(30 * scale, after: ringHost)
        stack.addArrangedSubview(title)
        stack.addArrangedSubview(subtitle)

        if let dhikr {
            // The list ranges from "الْحَمْدُ لِلَّهِ" to a full sentence, so a fixed
            // point size either wastes the short ones or overflows the long ones.
            let arabicSize = fittedSize(for: dhikr.arabic,
                                        base: 46 * scale,
                                        minimum: 22 * scale,
                                        maxWidth: frame.width * 0.78,
                                        weight: .medium)
            let arabic = label(dhikr.arabic, size: arabicSize, weight: .medium, alpha: 0.95)
            arabic.baseWritingDirection = .rightToLeft
            let translit = label(dhikr.transliteration, size: 17 * scale, weight: .regular, alpha: 0.58)
            let meaning = label(dhikr.translation, size: 15 * scale, weight: .regular,
                                alpha: 0.40, wraps: true)

            stack.setCustomSpacing(56 * scale, after: subtitle)
            stack.addArrangedSubview(arabic)
            stack.setCustomSpacing(12 * scale, after: arabic)
            stack.addArrangedSubview(translit)
            stack.addArrangedSubview(meaning)
        }

        let hint = label("Press Esc to skip", size: 13 * scale, weight: .regular, alpha: 0.28)
        hint.translatesAutoresizingMaskIntoConstraints = false

        addSubview(stack)
        addSubview(hint)

        NSLayoutConstraint.activate([
            ringHost.widthAnchor.constraint(equalToConstant: ringSize),
            ringHost.heightAnchor.constraint(equalToConstant: ringSize),
            secondsLabel.centerXAnchor.constraint(equalTo: ringHost.centerXAnchor),
            secondsLabel.centerYAnchor.constraint(equalTo: ringHost.centerYAnchor),

            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            stack.widthAnchor.constraint(lessThanOrEqualTo: widthAnchor, multiplier: 0.86),

            hint.centerXAnchor.constraint(equalTo: centerXAnchor),
            hint.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -46 * scale),
        ])
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    private func buildRing(in host: NSView, size: CGFloat) {
        let lineWidth = 5 * scale
        let inset = lineWidth / 2
        let rect = NSRect(x: inset, y: inset, width: size - lineWidth, height: size - lineWidth)
        let path = CGPath(ellipseIn: rect, transform: nil)

        ringTrack.path = path
        ringTrack.fillColor = nil
        ringTrack.strokeColor = NSColor.white.withAlphaComponent(0.12).cgColor
        ringTrack.lineWidth = lineWidth

        ring.path = path
        ring.fillColor = nil
        ring.strokeColor = NSColor.white.withAlphaComponent(0.85).cgColor
        ring.lineWidth = lineWidth
        ring.lineCap = .round
        ring.strokeEnd = 1
        // Start the sweep at 12 o'clock and run it clockwise, which is what
        // people expect from a timer.
        ring.transform = CATransform3DMakeRotation(.pi / 2, 0, 0, 1)
        ring.anchorPoint = CGPoint(x: 0.5, y: 0.5)
        ring.frame = NSRect(x: 0, y: 0, width: size, height: size)

        host.layer?.addSublayer(ringTrack)
        host.layer?.addSublayer(ring)
    }

    /// Drives the ring with Core Animation rather than the countdown timer, so
    /// it stays smooth regardless of how often we tick the label.
    func startRing(duration: TimeInterval) {
        let animation = CABasicAnimation(keyPath: "strokeEnd")
        animation.fromValue = 1.0
        animation.toValue = 0.0
        animation.duration = duration
        animation.timingFunction = CAMediaTimingFunction(name: .linear)
        animation.fillMode = .forwards
        animation.isRemovedOnCompletion = false
        ring.add(animation, forKey: "countdown")
    }

    func update(remaining: TimeInterval) {
        secondsLabel.stringValue = String(Int(remaining.rounded(.up)))
    }

    /// Largest point size at or below `base` that keeps the string on one line
    /// within `maxWidth`.
    private func fittedSize(for text: String,
                            base: CGFloat,
                            minimum: CGFloat,
                            maxWidth: CGFloat,
                            weight: NSFont.Weight) -> CGFloat {
        var size = base
        while size > minimum {
            let font = NSFont.systemFont(ofSize: size, weight: weight)
            let width = (text as NSString).size(withAttributes: [.font: font]).width
            if width <= maxWidth { break }
            size -= 2
        }
        return max(size, minimum)
    }

    /// `wraps` is not cosmetic: a wrapping label reports an intrinsic width that
    /// the stack will happily shrink, which silently truncates short phrases
    /// mid-word. Only the two prose lines wrap; the dhikr and its transliteration
    /// stay on one line with compression resistance pinned, so they can never be
    /// cut in half.
    private func label(_ text: String,
                       size: CGFloat,
                       weight: NSFont.Weight,
                       alpha: CGFloat,
                       wraps: Bool = false) -> NSTextField {
        let field = NSTextField(labelWithString: text)
        field.font = .systemFont(ofSize: size, weight: weight)
        field.textColor = NSColor.white.withAlphaComponent(alpha)
        field.alignment = .center

        if wraps {
            field.lineBreakMode = .byWordWrapping
            field.maximumNumberOfLines = 3
            field.preferredMaxLayoutWidth = frame.width * 0.66
        } else {
            field.lineBreakMode = .byClipping
            field.maximumNumberOfLines = 1
            field.setContentCompressionResistancePriority(.required, for: .horizontal)
        }
        return field
    }
}
