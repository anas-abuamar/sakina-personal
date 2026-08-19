// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Rest",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "Rest",
            path: "Sources/Rest",
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("IOKit"),
            ]
        )
    ]
)
