import Foundation

/// Thin, typed wrapper over UserDefaults — same shape as OutLoud's, kept
/// separate so the two apps can't collide on a key.
enum Settings {
    private static let store = UserDefaults.standard

    private enum Key {
        static let workInterval = "workInterval"
        static let breakDuration = "breakDuration"
        static let showDhikr = "showDhikr"
        static let dhikrIndex = "dhikrIndex"
        static let skipWhenAway = "skipWhenAway"
        static let skipWhilePresenting = "skipWhilePresenting"
        static let playSound = "playSound"
    }

    /// The 20 in 20-20-20. Offered up to an hour because the rule is a floor,
    /// not a law — some people find a 20-minute interrupt worse for their eyes
    /// than the strain it prevents.
    static let workIntervalChoices: [TimeInterval] = [20 * 60, 25 * 60, 30 * 60, 45 * 60, 60 * 60]
    static let breakDurationChoices: [TimeInterval] = [20, 30, 60]

    static var workInterval: TimeInterval {
        get { (store.object(forKey: Key.workInterval) as? TimeInterval) ?? 20 * 60 }
        set { store.set(newValue, forKey: Key.workInterval) }
    }

    static var breakDuration: TimeInterval {
        get { (store.object(forKey: Key.breakDuration) as? TimeInterval) ?? 20 }
        set { store.set(newValue, forKey: Key.breakDuration) }
    }

    static var showDhikr: Bool {
        get { (store.object(forKey: Key.showDhikr) as? Bool) ?? true }
        set { store.set(newValue, forKey: Key.showDhikr) }
    }

    static var dhikrIndex: Int {
        get { store.integer(forKey: Key.dhikrIndex) }
        set { store.set(newValue, forKey: Key.dhikrIndex) }
    }

    /// Don't interrupt an empty chair. Only triggers after a long absence —
    /// sitting still while *reading* is exactly when eyes need the break most,
    /// so brief input idleness is deliberately not enough.
    static var skipWhenAway: Bool {
        get { (store.object(forKey: Key.skipWhenAway) as? Bool) ?? true }
        set { store.set(newValue, forKey: Key.skipWhenAway) }
    }

    /// Dropping a black panel over a video call or a presentation is worse than
    /// a late break, so postpone while something holds a display-sleep
    /// assertion.
    static var skipWhilePresenting: Bool {
        get { (store.object(forKey: Key.skipWhilePresenting) as? Bool) ?? true }
        set { store.set(newValue, forKey: Key.skipWhilePresenting) }
    }

    static var playSound: Bool {
        get { (store.object(forKey: Key.playSound) as? Bool) ?? false }
        set { store.set(newValue, forKey: Key.playSound) }
    }
}
