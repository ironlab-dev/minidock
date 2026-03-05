export interface CommunityVM {
    id: string;
    name: string;
    description: string;
    logo: string; // URL or path
    category: string;
    architectures: string[]; // ["arm64", "amd64"]
    downloadUrl: string; // For Linux ISOs
    filename: string; // Predicted filename
    website: string;

    // Suggested defaults
    defaultRam: number; // MB
    defaultCpu: number;
    defaultDisk: number; // GB
    currentVersion?: string;
    lastVerified?: string;
}

export const communityVMs: CommunityVM[] = [
    {
        id: "ubuntu-24.04-server",
        name: "Ubuntu Server 24.04 LTS",
        description: "The latest LTS version of Ubuntu Server. Excellent for general purpose server usage.",
        logo: "/icons/vms/ubuntu.png",
        category: "Linux",
        architectures: ["arm64", "amd64"],
        downloadUrl: "https://releases.ubuntu.com/24.04/ubuntu-24.04-live-server-arm64.iso", // Dynamically switch based on host arch in component if needed, but for now hardcode arm64 for mac?
        // Actually we should provide map or logic. For simplicity, let's assume we are running on Apple Silicon (arm64) mostly,
        // but we should support x86_64 if user is on Intel.
        // Let's make downloadUrl a map or just provide arm64 for now as primary target for this user (macOS).
        // User is on macOS. Most likely Apple Silicon.
        // Let's provide arm64 link.
        filename: "ubuntu-24.04-live-server-arm64.iso",
        currentVersion: "24.04.1",
        lastVerified: "2025-01-14",
        website: "https://ubuntu.com",
        defaultRam: 2048,
        defaultCpu: 2,
        defaultDisk: 20
    },
    {
        id: "debian-12-netinst",
        name: "Debian 12 (Bookworm)",
        description: "The universal operating system. Stable and secure.",
        logo: "/icons/vms/debian.png",
        category: "Linux",
        architectures: ["arm64"],
        downloadUrl: "https://cdimage.debian.org/debian-cd/current/arm64/iso-cd/debian-12.5.0-arm64-netinst.iso",
        filename: "debian-12.5.0-arm64-netinst.iso",
        currentVersion: "12.8.0",
        lastVerified: "2025-01-14",
        website: "https://debian.org",
        defaultRam: 1024,
        defaultCpu: 1,
        defaultDisk: 10
    },
    {
        id: "alpine-standard",
        name: "Alpine Linux (Standard)",
        description: "Small. Simple. Secure. Ideal for containers and lightweight VMs.",
        logo: "/icons/vms/alpine-linux.svg",
        category: "Linux",
        architectures: ["arm64"],
        downloadUrl: "https://dl-cdn.alpinelinux.org/alpine/v3.21/releases/aarch64/alpine-virt-3.21.0-aarch64.iso",
        filename: "alpine-virt-3.21.0-aarch64.iso",
        website: "https://alpinelinux.org",
        defaultRam: 512,
        defaultCpu: 1,
        defaultDisk: 2
    },
    {
        id: "arch-linux-archboot",
        name: "Arch Linux (Archboot)",
        description: "Lightweight and flexible Linux distribution. Archboot provides a friendly installer for AArch64.",
        logo: "/icons/vms/arch-linux.svg",
        category: "Linux",
        architectures: ["arm64"],
        downloadUrl: "https://release.archboot.net/aarch64/latest/iso/archboot-2026.01.10-02.07-6.18.3-1-aarch64-ARCH-aarch64.iso",
        filename: "archboot-aarch64.iso",
        website: "https://archboot.com",
        defaultRam: 2048,
        defaultCpu: 2,
        defaultDisk: 20
    },
    {
        id: "nixos-minimal",
        name: "NixOS Minimal",
        description: "Purely functional Linux distribution. Declarative configuration and reliable upgrades.",
        logo: "https://raw.githubusercontent.com/walkxcode/dashboard-icons/master/svg/nixos.svg",
        category: "Linux",
        architectures: ["arm64"],
        downloadUrl: "https://channels.nixos.org/nixos-24.11/latest-nixos-minimal-aarch64-linux.iso",
        filename: "nixos-minimal-aarch64.iso",
        website: "https://nixos.org",
        defaultRam: 2048,
        defaultCpu: 2,
        defaultDisk: 20
    },
    {
        id: "openwrt-generic",
        name: "OpenWrt (Generic EFI)",
        description: "Linux distribution for embedded devices. High performance router firmware.",
        logo: "https://raw.githubusercontent.com/walkxcode/dashboard-icons/master/svg/openwrt.svg",
        category: "Router",
        architectures: ["arm64"],
        downloadUrl: "", // Manual download from openwrt.ai
        filename: "openwrt-arm64-efi.img",
        website: "https://openwrt.ai/?target=armsr%2Farmv8&id=generic",
        defaultRam: 1024,
        defaultCpu: 1,
        defaultDisk: 4
    },
    {
        id: "tinycore-picore64",
        name: "Tiny Core Linux (piCore64)",
        description: "Extremely small Linux distribution. Runs entirely in RAM.",
        logo: "/icons/vms/tux.png",
        category: "Linux",
        architectures: ["arm64"],
        downloadUrl: "", // Manual download
        filename: "piCore64-15.0.zip",
        website: "http://www.tinycorelinux.net/15.x/aarch64/releases/RPi/",
        defaultRam: 256,
        defaultCpu: 1,
        defaultDisk: 1
    },
    {
        id: "windows-11",
        name: "Windows 11 on ARM",
        description: "Microsoft Windows 11. Requires manual ISO download due to licensing.",
        logo: "https://upload.wikimedia.org/wikipedia/commons/e/e6/Windows_11_logo.svg",
        category: "Windows",
        architectures: ["arm64"],
        downloadUrl: "", // Empty indicates manual download required
        filename: "Windows11_InsiderPreview_Client_ARM64_en-us.iso",
        website: "https://www.microsoft.com/en-us/software-download/windowsinsiderpreviewARM64",
        defaultRam: 4096,
        defaultCpu: 2,
        defaultDisk: 64
    }
];
