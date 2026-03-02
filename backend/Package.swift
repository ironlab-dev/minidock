// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MiniDockServer",
    platforms: [
       .macOS(.v14)
    ],
    dependencies: [
        .package(url: "https://github.com/vapor/vapor.git", from: "4.106.0"),
        .package(url: "https://github.com/vapor/fluent.git", from: "4.12.0"),
        .package(url: "https://github.com/vapor/fluent-sqlite-driver.git", from: "4.8.0"),
        .package(url: "https://github.com/vapor/jwt.git", from: "4.2.0"),
    ],
    targets: [
        .executableTarget(
            name: "App",
            dependencies: [
                .product(name: "Fluent", package: "fluent"),
                .product(name: "FluentSQLiteDriver", package: "fluent-sqlite-driver"),
                .product(name: "Vapor", package: "vapor"),
                .product(name: "JWT", package: "jwt")
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]
        )
    ]
)
