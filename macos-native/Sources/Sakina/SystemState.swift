import AppKit
import IOKit.pwr_mgt

/// Read-only probes into "is the human here, and is now a terrible moment to
/// black out the screen". Neither needs any permission.
enum SystemState {

    /// `kCGAnyInputEventType` isn't exposed to Swift as a case, so it has to be
    /// built from the raw value. Optional rather than force-unwrapped: if the
    /// bridge ever stops accepting it we want to fall back to "the user is
    /// here" and keep taking breaks, not crash.
    private static let anyInputEvent = CGEventType(rawValue: ~0)

    static func secondsSinceLastInput() -> TimeInterval {
        guard let event = anyInputEvent else { return 0 }
        return CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: event)
    }

    /// True while any process is holding the display awake — video playback,
    /// screen sharing, Keynote in presenter mode, most conferencing apps.
    static func displaySleepIsBlocked() -> Bool {
        var assertions: Unmanaged<CFDictionary>?
        guard IOPMCopyAssertionsStatus(&assertions) == kIOReturnSuccess,
              let counts = assertions?.takeRetainedValue() as? [String: Int] else {
            return false
        }
        let blocking = [
            kIOPMAssertionTypeNoDisplaySleep as String,
            kIOPMAssertionTypePreventUserIdleDisplaySleep as String,
        ]
        return blocking.contains { (counts[$0] ?? 0) > 0 }
    }
}
