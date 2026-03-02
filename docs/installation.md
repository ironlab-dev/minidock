# Installation Guide

> **Note**: This documentation is currently under development. For now, please refer to the [Quick Start](../README.md#-quick-start) section in the main README.

## Prerequisites

- macOS 14 (Sonoma) or later
- Apple Silicon or Intel Mac (Apple Silicon recommended)
- 8GB RAM minimum (16GB+ recommended)
- 50GB free disk space

## Quick Installation

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

The app will appear in your menu bar. Access the dashboard at `http://localhost:23000`.

## Troubleshooting

### Port Conflicts

If you see "port already in use" errors:

```bash
# Stop all MiniDock services
./stop.sh --all

# Restart
./dev-app.sh
```

### Build Errors

Check the backend logs:

```bash
tail -f backend/backend_output.log
```

## Next Steps

- [User Manual](user-guide.md) - Learn how to use MiniDock
- [Developer Guide](development.md) - Contributing to the project
- [FAQ](faq.md) - Common questions

## Need Help?

- 💬 [GitHub Discussions](https://github.com/ironlab-dev/minidock/discussions)
- 🐛 [Report an Issue](https://github.com/ironlab-dev/minidock/issues)
- 📧 Email: minidock@ironlab.cc
