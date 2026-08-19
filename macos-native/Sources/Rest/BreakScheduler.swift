import AppKit

/// Owns the "when is the next break" clock. Knows nothing about how a break is
/// displayed — it just decides that one is due and calls `onBreakDue`.
final class BreakScheduler {

    /// You were away from the desk, not staring at pixels. Long, because idle
    /// input is a poor proxy for rested eyes: reading a page for four minutes
    /// without touching anything is peak strain, not a break.
    private let awayThreshold: TimeInterval = 5 * 60

    /// While something holds the display awake, retry soon rather than skipping
    /// a whole cycle — the break should land right after the video ends.
    private let presentingRetry: TimeInterval = 60

    var onBreakDue: (() -> Void)?
    var onStateChange: (() -> Void)?

    private(set) var isPaused = false
    private(set) var nextBreak: Date?

    private var ticker: Timer?
    private var breakInProgress = false

    init() {
        subscribeToPowerEvents()
    }

    deinit {
        ticker?.invalidate()
    }

    // MARK: - Control

    func start() {
        scheduleNext()
        ticker?.invalidate()
        let timer = Timer(timeInterval: 1.0, repeats: true) { [weak self] _ in self?.tick() }
        timer.tolerance = 0.25
        RunLoop.main.add(timer, forMode: .common)
        ticker = timer
    }

    /// Reset the clock to a full interval — used after a break, after waking,
    /// and after the interval setting changes.
    func scheduleNext(after interval: TimeInterval? = nil) {
        nextBreak = Date().addingTimeInterval(interval ?? Settings.workInterval)
        onStateChange?()
    }

    func snooze(_ interval: TimeInterval) {
        breakInProgress = false
        scheduleNext(after: interval)
    }

    func breakFinished() {
        breakInProgress = false
        scheduleNext()
    }

    func setPaused(_ paused: Bool) {
        isPaused = paused
        if !paused { scheduleNext() }
        onStateChange?()
    }

    /// Seconds until the next break, or nil while paused / mid-break.
    var timeRemaining: TimeInterval? {
        guard !isPaused, !breakInProgress, let nextBreak else { return nil }
        return max(0, nextBreak.timeIntervalSinceNow)
    }

    // MARK: - Tick

    private func tick() {
        guard !isPaused, !breakInProgress, let nextBreak else { return }
        onStateChange?()
        guard Date() >= nextBreak else { return }

        if Settings.skipWhenAway, SystemState.secondsSinceLastInput() >= awayThreshold {
            scheduleNext()
            return
        }
        if Settings.skipWhilePresenting, SystemState.displaySleepIsBlocked() {
            scheduleNext(after: presentingRetry)
            return
        }

        breakInProgress = true
        onBreakDue?()
    }

    // MARK: - Sleep, wake, lock

    private func subscribeToPowerEvents() {
        let workspace = NSWorkspace.shared.notificationCenter
        // Waking or unlocking means an unknown stretch away from the screen;
        // starting the interval over is both kinder and more accurate than
        // firing a break the instant the lid opens.
        workspace.addObserver(self, selector: #selector(resumeFresh),
                              name: NSWorkspace.didWakeNotification, object: nil)
        workspace.addObserver(self, selector: #selector(resumeFresh),
                              name: NSWorkspace.screensDidWakeNotification, object: nil)

        DistributedNotificationCenter.default().addObserver(
            self, selector: #selector(resumeFresh),
            name: NSNotification.Name("com.apple.screenIsUnlocked"), object: nil)
    }

    @objc private func resumeFresh() {
        guard !isPaused else { return }
        breakInProgress = false
        scheduleNext()
    }
}
