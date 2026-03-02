<div align="center">

# MiniDock

**Transform your Mac mini into the ultimate home NAS**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![macOS](https://img.shields.io/badge/macOS-14%2B-000000?logo=apple)](https://www.apple.com/macos/)
[![Swift](https://img.shields.io/badge/Swift-6.0-FA7343?logo=swift)](https://swift.org)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js)](https://nextjs.org)
[![Backend CI](https://github.com/ironlab-dev/minidock/actions/workflows/backend.yml/badge.svg)](https://github.com/ironlab-dev/minidock/actions/workflows/backend.yml)
[![Frontend CI](https://github.com/ironlab-dev/minidock/actions/workflows/frontend.yml/badge.svg)](https://github.com/ironlab-dev/minidock/actions/workflows/frontend.yml)

[English](README.md) | [简体中文](README.zh-CN.md)

[Website](https://minidock.net) • [Documentation](docs/) • [Community](https://github.com/ironlab-dev/minidock/discussions)

![MiniDock Dashboard](screenshots/dashboard.png)

</div>

---

## 💡 The Problem

You have a Mac mini sitting idle, but setting up a home NAS is:
- 😫 **Complex** - Traditional NAS systems require extensive configuration
- 💸 **Expensive** - Proprietary hardware costs thousands of dollars
- 🔒 **Limited** - Closed ecosystems restrict what you can do
- 🐌 **Slow** - Weak CPUs struggle with modern workloads

## ✨ The Solution

MiniDock transforms your Mac mini into a **powerful, easy-to-use home server** with:
- 🎯 **One-Click Setup** - Install and run in minutes, not hours
- 💪 **Apple Silicon Power** - Leverage M-series chips for peak performance
- 🌐 **Native macOS** - Run any macOS app alongside your services
- 🎨 **Beautiful UI** - Manage everything through a gorgeous web interface

---

## 🎯 What is MiniDock?

MiniDock is a **native macOS application** that turns your Mac mini into a comprehensive home server platform. Manage Docker containers, virtual machines, automation tasks, and system resources through an elegant web interface that follows Apple's Human Interface Guidelines.

### 🌟 Key Features

<table>
<tr>
<td width="50%">

#### 🐳 Docker Management
- Full container orchestration
- GitOps workflow with version control
- Real-time logs with ANSI color support
- Port mapping and service discovery
- One-click template deployment

</td>
<td width="50%">

#### 💻 Native Virtual Machines
- Headless QEMU/UTM integration
- No GUI overhead or Dock icons
- Apple Silicon & Intel support
- ISO management and storage control
- VNC console access

</td>
</tr>
<tr>
<td width="50%">

#### 🤖 Automation Engine
- Cron scheduling (minute precision)
- File system watchers (FSEvents)
- Webhook triggers
- Metric-based triggers (CPU/Memory)
- Shell, Python, and Swift scripts

</td>
<td width="50%">

#### 🖥️ Remote Desktop
- Browser-based VNC access
- Native fullscreen support
- Touch-friendly on mobile
- Connection history
- No third-party software needed

</td>
</tr>
<tr>
<td width="50%">

#### 📁 File Manager
- Secure web-based file browser
- Built-in code editor (Vim mode)
- File preview and editing
- Validation and security
- Responsive design

</td>
<td width="50%">

#### 🚀 Boot Orchestrator
- Smart service startup
- Dependency management
- Delay control (millisecond precision)
- Status checking
- Priority-based ordering

</td>
</tr>
</table>

---

## 📸 Screenshots

<div align="center">

### Dashboard Overview
![Dashboard](screenshots/dashboard.png)
*Real-time system monitoring with beautiful glassmorphism design*

### Docker Management
![Docker](screenshots/docker-management.png)
*Manage containers with GitOps workflow and real-time logs*

### Virtual Machine Console
![VM Console](screenshots/vm-console.png)
*Access virtual machines through browser-based VNC*

### Automation Tasks
![Automation](screenshots/automation.png)
*Create powerful automation workflows with multiple triggers*

</div>

---

## 🆚 Why Choose MiniDock?

<table>
<thead>
<tr>
<th width="25%">Feature</th>
<th width="25%">Traditional NAS</th>
<th width="25%">Docker Desktop</th>
<th width="25%">MiniDock</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>Hardware Cost</strong></td>
<td>❌ $500-2000+</td>
<td>✅ Use existing Mac</td>
<td>✅ Use existing Mac</td>
</tr>
<tr>
<td><strong>Setup Time</strong></td>
<td>❌ Hours/Days</td>
<td>⚠️ Manual config</td>
<td>✅ Minutes</td>
</tr>
<tr>
<td><strong>VM Support</strong></td>
<td>⚠️ Limited</td>
<td>❌ No native VMs</td>
<td>✅ Full QEMU/UTM</td>
</tr>
<tr>
<td><strong>Automation</strong></td>
<td>⚠️ Basic scripts</td>
<td>❌ None</td>
<td>✅ Advanced engine</td>
</tr>
<tr>
<td><strong>Web UI</strong></td>
<td>⚠️ Outdated</td>
<td>❌ Desktop only</td>
<td>✅ Modern & responsive</td>
</tr>
<tr>
<td><strong>GitOps</strong></td>
<td>❌ No</td>
<td>❌ No</td>
<td>✅ Built-in</td>
</tr>
<tr>
<td><strong>Remote Access</strong></td>
<td>⚠️ VPN required</td>
<td>❌ No</td>
<td>✅ Built-in VNC</td>
</tr>
<tr>
<td><strong>Performance</strong></td>
<td>❌ Weak CPU</td>
<td>✅ Native</td>
<td>✅ Apple Silicon</td>
</tr>
</tbody>
</table>

---

## 🚀 Quick Start

### Prerequisites

```
✅ macOS 14 (Sonoma) or later
✅ Apple Silicon or Intel Mac (Apple Silicon recommended)
✅ 8GB RAM minimum (16GB+ recommended)
✅ 50GB free disk space
✅ Docker Desktop, OrbStack, or Colima (for container features)
```

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/ironlab-dev/minidock.git
cd minidock

# 2. Install dependencies (one-time setup)
./setup.sh

# 3. Generate Xcode project
brew install xcodegen
xcodegen generate

# 4. Build and run the app
./dev-app.sh
```

**That's it!** 🎉 The app will appear in your menu bar. Click the icon to access the dashboard at `http://localhost:23000`.

### For Developers

```bash
# Debug mode: start frontend/backend separately (without full app bundle)
./scripts/dev.sh

# Check service status
./scripts/dev.sh status

# Stop all services
./stop.sh
```

---

## 🏗️ Architecture

<div align="center">

```
┌─────────────────────────────────────────────────────────┐
│                  MiniDock macOS App                     │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │         Web UI (Next.js + React)                  │ │
│  │  • Glassmorphism design (Apple HIG)               │ │
│  │  • Real-time WebSocket updates                    │ │
│  │  • Responsive (Desktop + Mobile)                  │ │
│  └───────────────────────────────────────────────────┘ │
│                          ↕                              │
│  ┌───────────────────────────────────────────────────┐ │
│  │      Backend API (Swift + Vapor)                  │ │
│  │  • Async/await concurrency                        │ │
│  │  • SQLite database (Fluent ORM)                   │ │
│  │  • WebSocket manager                              │ │
│  └───────────────────────────────────────────────────┘ │
│                          ↕                              │
│  ┌───────────────────┬─────────────┐          │
│  │   Docker    │    QEMU     │  Automation │          │
│  │   Service   │   Service   │   Service   │          │
│  └─────────────┴─────────────┴─────────────┘          │
└─────────────────────────────────────────────────────────┘
                          ↕
        ┌─────────────────┴─────────────────┐
        │                                   │
   ┌────▼────┐                         ┌───▼────┐
   │ Docker  │                         │  QEMU  │
   │ Engine  │                         │   VMs  │
   │         │                         │        │
   │ • OrbStack                        │ • UTM  │
   │ • Docker Desktop                  │ • ISO  │
   │ • Colima                          │ • Disk │
   └─────────┘                         └────────┘
```

</div>

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend** | Swift 6.0 + Vapor 4 | Native performance, type safety, async/await |
| **Frontend** | Next.js 14 + React 18 | Modern UI, SSR, hot reload |
| **Database** | SQLite + Fluent ORM | Lightweight, embedded, zero-config |
| **Shell** | Swift + Cocoa | Menu bar app, system integration |
| **Styling** | Tailwind CSS | Utility-first, Apple HIG compliant |
| **Real-time** | WebSocket | Live updates, system metrics |

---

## 🎨 Design Philosophy

MiniDock follows **Apple Human Interface Guidelines** for a native macOS experience:

- 🪟 **Glassmorphism** - Backdrop blur with semi-transparent backgrounds
- 🌙 **Dark Mode First** - Optimized for dark environments
- 🎯 **Direct Manipulation** - Click titles to edit, drag to reorder
- 🔄 **Silent Refresh** - Background updates without progress bars
- ⚡ **Micro-interactions** - Smooth animations and instant feedback
- 📱 **Responsive** - Works beautifully on desktop and mobile

---

## 📚 Documentation

- 📖 [Installation Guide](docs/installation.md) - Detailed setup instructions
- 👤 [User Manual](docs/user-guide.md) - Complete feature documentation
- 💻 [Developer Guide](docs/development.md) - Contributing and architecture
- 🔌 [API Reference](docs/api.md) - REST API documentation
- ❓ [FAQ](docs/faq.md) - Frequently asked questions

---

## 🤝 Contributing

We welcome contributions from the community! Whether you're fixing bugs, adding features, or improving documentation, your help is appreciated.

### How to Contribute

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'feat: add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Guidelines

- Follow Swift and TypeScript best practices
- Write clear commit messages (Conventional Commits)
- Manually verify behavior changes (no automated test framework currently)
- Update documentation as needed
- Follow Apple HIG for UI changes

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## 🐛 Bug Reports & Feature Requests

Found a bug or have an idea? We'd love to hear from you!

- 🐞 **Bug Reports**: [Create an issue](https://github.com/ironlab-dev/minidock/issues/new?template=bug_report.md)
- 💡 **Feature Requests**: [Create an issue](https://github.com/ironlab-dev/minidock/issues/new?template=feature_request.md)
- 💬 **Questions**: [Start a discussion](https://github.com/ironlab-dev/minidock/discussions)

---

## 📝 License & Business Model

### Open Source License

MiniDock is **100% open source** under the **Apache License 2.0**.
- ✅ Use freely (personal & commercial)
- ✅ Modify and distribute
- ✅ No restrictions
- ✅ Audit every line of code

See [LICENSE](LICENSE) for full terms.

### Business Model (Open Core)

MiniDock follows the **Open Core** model:

- **Community Edition** (Free): Full source code, build yourself, all features included
- **MiniDock Pro** ($19 one-time): Pre-built signed .app + Sparkle auto-updates
- **MiniDock Cloud** ($4.99/month): Hosted service + remote access + AI assistant (coming soon)

**You can always build and use MiniDock for free.** Pro/Cloud are convenience offerings that support development.

[Get MiniDock Pro →](https://minidock.net/pro)
---

## 🙏 Acknowledgments

MiniDock stands on the shoulders of giants. Special thanks to:

- [**Swift**](https://swift.org) - Modern, safe programming language by Apple
- [**Vapor**](https://vapor.codes) - Server-side Swift web framework
- [**Next.js**](https://nextjs.org) - The React framework for production
- [**QEMU**](https://www.qemu.org) - Generic machine emulator and virtualizer
- [**noVNC**](https://novnc.com) - VNC client using HTML5 (WebSockets, Canvas)
- [**Tailwind CSS**](https://tailwindcss.com) - Utility-first CSS framework

And all the amazing open-source contributors who make projects like this possible! 🎉

---

## 📞 Contact & Support

<div align="center">

### Get Help

| Channel | Link | Purpose |
|---------|------|---------|
| 🌐 **Website** | [minidock.net](https://minidock.net) | Official website and downloads |
| 📧 **Email** | minidock@ironlab.cc | General inquiries and support |
| 🐛 **Issues** | [GitHub Issues](https://github.com/ironlab-dev/minidock/issues) | Bug reports and feature requests |
| 💬 **Discussions** | [GitHub Discussions](https://github.com/ironlab-dev/minidock/discussions) | Community forum and Q&A |
| 📚 **Docs** | [Documentation](docs/) | Guides and API reference |

</div>

---

## 🌟 Star History

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=ironlab-dev/minidock&type=Date)](https://star-history.com/#ironlab-dev/minidock&Date)

</div>

---

<div align="center">

### Made with ❤️ by [IronLab](https://ironlab.cc)

**If you find MiniDock useful, please consider:**
- ⭐ **Starring** this repository
- 🐦 **Sharing** with your friends
- 💬 **Contributing** to the project
- ☕ **Supporting** our work

---

**Copyright © 2026 IronLab. All rights reserved.**

</div>
