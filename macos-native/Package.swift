// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Sakina",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "Sakina",
            path: "Sources/Sakina",
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("IOKit"),
            ]
        )
    ]
)
