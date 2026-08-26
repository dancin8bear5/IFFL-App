// swift-tools-version: 6.0
// IFFLCore — pure-Swift library shared by the SwiftUI app and tests.
// Holds calculators (mirroring SQL functions) and the model layer that
// matches the Postgres schema.

import PackageDescription

let package = Package(
    name: "IFFLCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "IFFLCore", targets: ["IFFLCore"]),
    ],
    targets: [
        .target(
            name: "IFFLCore",
            path: "IFFL",
            exclude: ["Resources"],
            sources: [
                "Models/Owner.swift",
                "Models/Team.swift",
                "Models/Player.swift",
                "Models/Contract.swift",
                "Services/KeeperCostCalculator.swift",
                "Services/LuxuryTaxCalculator.swift",
            ]
        ),
        .testTarget(
            name: "IFFLCoreTests",
            dependencies: ["IFFLCore"],
            path: "IFFLTests"
        ),
    ]
)
