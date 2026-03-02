# Changelog

All notable changes to MiniDock will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-02-27

### Added
- Initial open source release
- Docker container management with GitOps workflow
- Native virtual machine support (QEMU/UTM)
- Automation engine with multiple trigger types (cron, file watcher, webhook, metrics)
- Browser-based VNC remote desktop access
- Web-based file manager with code editor
- Boot orchestrator for service startup management
- Real-time system monitoring dashboard
- Multi-user authentication and authorization
- Bilingual support (English and Chinese)

### Changed
- **License**: Released under Apache 2.0 license (previously AGPL-3.0 during private development)
  - Apache 2.0 is more permissive and business-friendly
  - All code was authored by IronLab team, no external contributors during AGPL period
  - This change enables broader adoption and commercial use
- Replaced XCode project with XcodeGen for better maintainability
- Improved code quality with comprehensive review
  - Replaced all `print` statements with Vapor logger
  - Fixed type safety issues (removed `any` types in core APIs)
  - Enhanced error handling (no empty catch blocks)
  - Removed hardcoded URLs and configuration values

### Fixed
- Type safety issues in Swift backend (unsafe force casts and unwraps)
- Empty catch blocks in frontend error handling
- Hardcoded backend URLs in WebSocket and API calls
- Debug console.log statements in production code

### Security
- Implemented JWT-based authentication
- Added secure token storage and validation
- Protected API endpoints with authentication middleware

## Release Notes

### Version Numbering

MiniDock follows [Semantic Versioning](https://semver.org/):
- **MAJOR** version for incompatible API changes
- **MINOR** version for new functionality in a backwards compatible manner
- **PATCH** version for backwards compatible bug fixes

### Upgrade Guide

For upgrade instructions between versions, see [GitHub Releases](https://github.com/ironlab-dev/minidock/releases).

### Support

- **Bug Reports**: [GitHub Issues](https://github.com/ironlab-dev/minidock/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/ironlab-dev/minidock/discussions)
- **Documentation**: [docs/](docs/)
- **Email**: minidock@ironlab.cc

---

**Note**: This is the initial open source release. Previous development history has been cleared for security and privacy reasons.

[Unreleased]: https://github.com/ironlab-dev/minidock/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ironlab-dev/minidock/releases/tag/v0.1.0
