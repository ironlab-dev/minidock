# MiniDock Roadmap

This document outlines the planned features and improvements for MiniDock. Timelines are approximate and subject to change based on community feedback and priorities.

---

## 🎯 Current Version: 0.1.0 (Beta)

**Status**: Early development, core features functional

---

## 📅 Q1 2026 (Current Quarter)

### ✅ Completed
- [x] Docker container management (start/stop/logs)
- [x] QEMU/UTM virtual machine integration
- [x] Web-based VNC console
- [x] Automation engine (cron, file watchers, webhooks)
- [x] Boot orchestrator with dependency management
- [x] Native macOS menu bar app
- [x] Glassmorphism UI following Apple HIG

### 🚧 In Progress
- [ ] **Testing Infrastructure**
  - Frontend: Vitest + React Testing Library
  - Backend: XCTest unit tests
  - Target: 60% code coverage for core features
- [ ] **CI/CD Pipeline**
  - GitHub Actions for automated builds
  - Automated lint and type checking
  - Pre-release validation

### 🎯 Planned
- [ ] **License Management**
  - Lemon Squeezy integration
  - 14-day trial with nagware modal
  - License activation and validation
- [ ] **Documentation**
  - API reference documentation
  - Video tutorials for common tasks
  - Troubleshooting guide

---

## 📅 Q2 2026

### Core Features
- [ ] **File Manager Enhancements**
  - Drag-and-drop file upload
  - Batch operations (copy/move/delete)
  - File search and filtering
  - Archive extraction (zip/tar/gz)

- [ ] **Docker Improvements**
  - Docker Compose support
  - Container resource limits (CPU/memory)
  - Network management
  - Volume management UI

- [ ] **VM Enhancements**
  - Snapshot management
  - Clone virtual machines
  - USB device passthrough
  - Shared folders between host and guest

### Developer Experience
- [ ] **Plugin System**
  - Plugin API for third-party extensions
  - Community plugin marketplace
  - Example plugins (Plex, Jellyfin, Home Assistant)

- [ ] **CLI Tool**
  - Command-line interface for automation
  - Scriptable operations
  - Integration with shell scripts

---

## 📅 Q3 2026

### Advanced Features
- [ ] **MiniDock Cloud** (Paid Feature)
  - Remote access via secure tunnel
  - Mobile app (iOS/iPadOS)
  - AI assistant for troubleshooting
  - Cloud backup for configurations

- [ ] **Monitoring & Alerts**
  - System health dashboard
  - Email/Slack/Discord notifications
  - Custom alert rules
  - Historical metrics and graphs

- [ ] **Backup & Restore**
  - Automated backup scheduling
  - Incremental backups
  - One-click restore
  - Cloud storage integration (S3, Backblaze)

### Security
- [ ] **Multi-user Support**
  - Role-based access control (RBAC)
  - User management UI
  - Audit logs
  - 2FA authentication

- [ ] **Security Hardening**
  - HTTPS by default with Let's Encrypt
  - Firewall rule management
  - Security audit reports
  - Vulnerability scanning

---

## 📅 Q4 2026

### Ecosystem
- [ ] **Template Marketplace**
  - Community-contributed templates
  - One-click deployment for popular apps
  - Template versioning and updates
  - Rating and review system

- [ ] **Integration Hub**
  - Home Assistant integration
  - Homebridge support
  - Plex/Jellyfin media server management
  - Tailscale/WireGuard VPN setup

### Performance
- [ ] **Optimization**
  - Reduce memory footprint
  - Faster startup time
  - Database query optimization
  - WebSocket connection pooling

---

## 🔮 Future (2027+)

### Experimental Features
- [ ] **Kubernetes Support**
  - K3s integration for advanced users
  - Helm chart deployment
  - Multi-node cluster management

- [ ] **AI-Powered Features**
  - Natural language commands ("Start my media server")
  - Intelligent resource allocation
  - Predictive maintenance alerts
  - Automated troubleshooting

- [ ] **Cross-Platform**
  - Linux support (Ubuntu, Debian)
  - Windows support (WSL2)
  - Raspberry Pi support

---

## 🤝 Community Requests

Vote on features you'd like to see! Visit [GitHub Discussions](https://github.com/ironlab-dev/minidock/discussions) to:
- Propose new features
- Vote on existing proposals
- Share your use cases

---

## 📊 Metrics & Goals

### 2026 Targets
- **Users**: 10,000+ active installations
- **Contributors**: 50+ community contributors
- **GitHub Stars**: 5,000+
- **Test Coverage**: 80%+ for core features
- **Documentation**: 100% API coverage

---

## 💡 How to Contribute

Want to help shape MiniDock's future?

1. **Vote on features**: Comment on [GitHub Discussions](https://github.com/ironlab-dev/minidock/discussions)
2. **Submit PRs**: Check [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines
3. **Report bugs**: Use [issue templates](.github/ISSUE_TEMPLATE/)
4. **Spread the word**: Star the repo and share with friends

---

## 📝 Notes

- This roadmap is a living document and will be updated quarterly
- Features may be added, removed, or rescheduled based on feedback
- Paid features (MiniDock Cloud) help fund open-source development
- Community contributions can accelerate any item on this roadmap

**Last Updated**: February 27, 2026
