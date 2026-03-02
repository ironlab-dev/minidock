// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "MiniDockApp",
    platforms: [
        .macOS(.v12)
    ],
    products: [
        .executable(name: "MiniDockApp", targets: ["MiniDockApp"]),
    ],
    dependencies: [
        .package(url: "https://github.com/Pepijn98/BCrypt.git", from: "1.0.0"),
    ],
    targets: [
        .executableTarget(
            name: "MiniDockApp",
            dependencies: [
                .product(name: "BCrypt", package: "BCrypt"),
            ],
            path: "Sources/MiniDockApp"
        ),
    ]
)
