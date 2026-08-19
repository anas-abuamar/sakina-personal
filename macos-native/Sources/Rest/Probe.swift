import AppKit

/// Development helper, same spirit as OutLoud's `--probe`.
///
///     Rest --probe state              # what the scheduler's guards currently see
///     Rest --probe overlay out.png    # render one break screen to a PNG
///
/// The overlay probe exists because the only other way to check the break
/// screen is to black out every display and wait — fine once, useless when
/// you're iterating on the layout.
enum Probe {
    static func run(arguments: [String]) -> Never {
        switch arguments.first {
        case "state":
            printState()
        case "overlay":
            let rest = Array(arguments.dropFirst())
            renderOverlay(to: rest.first ?? "break.png",
                          dhikrIndex: rest.dropFirst().first.flatMap(Int.init))
        default:
            print("usage: Rest --probe [state | overlay <out.png>]")
            exit(1)
        }
        exit(0)
    }

    private static func printState() {
        let idle = SystemState.secondsSinceLastInput()
        print(String(format: "seconds since last input : %.1f", idle))
        print("display sleep blocked    : \(SystemState.displaySleepIsBlocked())")
        print("work interval            : \(Int(Settings.workInterval / 60)) min")
        print("break duration           : \(Int(Settings.breakDuration))s")
        print("next dhikr               : \(Adhkar.current.transliteration)")
    }

    private static func renderOverlay(to path: String, dhikrIndex: Int?) {
        let size = NSSize(width: 1440, height: 900)
        let dhikr = dhikrIndex.map { Adhkar.all[$0 % Adhkar.all.count] } ?? Adhkar.current
        let view = BreakScreenView(frame: NSRect(origin: .zero, size: size),
                                   duration: Settings.breakDuration,
                                   dhikr: dhikr)
        view.update(remaining: Settings.breakDuration)
        view.layoutSubtreeIfNeeded()

        guard let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else {
            print("could not create a bitmap for the view")
            exit(1)
        }
        view.cacheDisplay(in: view.bounds, to: rep)
        guard let png = rep.representation(using: .png, properties: [:]) else {
            print("could not encode PNG")
            exit(1)
        }
        do {
            try png.write(to: URL(fileURLWithPath: path))
            print("wrote \(path)")
        } catch {
            print("write failed: \(error.localizedDescription)")
            exit(1)
        }
    }
}
