# Frequently Asked Questions

## General

### What is MiniDock?

MiniDock is a native macOS application that transforms your Mac mini into a comprehensive home server platform. It provides a beautiful web interface for managing Docker containers, virtual machines, automation tasks, and system resources.

### Is MiniDock free?

Yes, MiniDock is 100% open source under the Apache License 2.0. You can use it freely for personal or commercial purposes. We also offer optional paid products (MiniDock Pro and MiniDock Cloud) for convenience.

### What's the difference between the open source version and MiniDock Pro?

- **Open Source (Free)**: Full source code, build yourself, all features included
- **MiniDock Pro ($19)**: Pre-built signed .app with Sparkle auto-updates
- **MiniDock Cloud ($4.99/mo)**: Hosted service with remote access and AI features (coming soon)

You can always build and use MiniDock for free. Pro/Cloud are convenience offerings.

### Which Macs are supported?

- macOS 14 (Sonoma) or later
- Apple Silicon (M1/M2/M3) or Intel Macs
- 8GB RAM minimum (16GB+ recommended)
- 50GB free disk space

Apple Silicon is recommended for best performance.

## Installation

### How do I install MiniDock?

See the [Installation Guide](installation.md) for detailed instructions. Quick version:

```bash
git clone https://github.com/ironlab-dev/minidock.git
cd minidock
./setup.sh
brew install xcodegen && xcodegen generate
./dev-app.sh
```

### Do I need Docker installed?

Yes, MiniDock requires Docker to manage containers. Supported Docker engines:

- Docker Desktop
- OrbStack (recommended for Apple Silicon)
- Colima

### Can I use MiniDock without a Mac mini?

Yes! MiniDock works on any Mac (MacBook, iMac, Mac Studio, etc.). It's optimized for Mac mini as a home server, but not limited to it.

## Usage

### How do I access the dashboard?

After starting MiniDock, click the menu bar icon and select "Open Dashboard" or navigate to `http://localhost:23000` in your browser.

### Can I access MiniDock from other devices?

By default, MiniDock binds to `localhost` for security. To access from other devices on your network:

1. Configure the bind address in settings
2. Access via your Mac's IP address (e.g., `http://192.168.1.100:23000`)

For remote access over the internet, consider MiniDock Cloud or set up a VPN/reverse proxy.

### How do I change the default password?

On first run, MiniDock creates a default admin account. Change the password immediately:

1. Log in to the dashboard
2. Go to Settings → Users
3. Click "Change Password"

### Can I run multiple instances of MiniDock?

Yes, but they must use different ports. The `./scripts/dev.sh` script automatically assigns ports based on the directory name.

## Docker

### Why aren't my containers showing up?

Ensure Docker is running:

```bash
docker ps
```

If Docker is not running, start it and refresh the MiniDock dashboard.

### Can I import existing Docker Compose files?

Yes! MiniDock supports GitOps workflow. You can:

1. Add your `docker-compose.yml` to the MiniDock repository
2. Use the built-in editor to create/edit compose files
3. Deploy directly from the dashboard

### Does MiniDock support Docker Swarm or Kubernetes?

Currently, MiniDock focuses on single-node Docker deployments. Swarm/Kubernetes support may be added in future versions.

## Virtual Machines

### What VM formats are supported?

MiniDock uses QEMU/UTM for virtualization. Supported formats:

- ISO images (for installation)
- QCOW2 disk images
- Raw disk images

### Can I run Windows VMs?

Yes, but performance may vary:

- **Apple Silicon**: Windows ARM via QEMU (experimental)
- **Intel Macs**: Windows x86/x64 with good performance

### How do I access the VM console?

Click the VM in the dashboard to open the browser-based VNC console. No additional software required.

## Automation

### What scripting languages are supported?

- Shell scripts (bash, zsh)
- Python
- Swift
- Any executable on your system

### Can I trigger automation from external services?

Yes! MiniDock supports webhook triggers. Create a webhook URL in the automation settings and call it from external services.

### How precise is the cron scheduling?

MiniDock supports minute-level precision (e.g., `*/5 * * * *` for every 5 minutes).

## Troubleshooting

### The dashboard shows "Offline"

This means the backend is not running. Check:

1. Backend logs: `tail -f backend/backend_output.log`
2. Service status: `./scripts/dev.sh status`
3. Restart: `./stop.sh && ./dev-app.sh`

### Port conflicts on startup

If you see "port already in use" errors:

```bash
./stop.sh --all
./dev-app.sh
```

### Build errors

Check the backend logs for compilation errors:

```bash
tail -f backend/backend_output.log
```

Ensure you have the latest Xcode and Swift toolchain installed.

## Security

### Is MiniDock secure?

MiniDock follows security best practices:

- JWT authentication
- Auto-generated secrets
- No telemetry or tracking
- Open source (audit the code yourself)

However, **do not expose MiniDock directly to the internet** without proper security measures (HTTPS, firewall, VPN).

### How do I report a security vulnerability?

Email minidock@ironlab.cc with details. **Do not** open a public GitHub issue for security vulnerabilities.

### Does MiniDock collect any data?

No. MiniDock has zero telemetry. The only external network calls are:

1. `api.lemonsqueezy.com` (license activation for Pro users)
2. `minidock.net/appcast.xml` (Sparkle auto-updates for Pro users)
3. `api.github.com` (community templates)

## Contributing

### How can I contribute?

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines. Contributions are welcome!

### I found a bug. What should I do?

[Open an issue](https://github.com/ironlab-dev/minidock/issues/new?template=bug_report.md) with:

- macOS version and hardware
- MiniDock version
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs

### I have a feature request

[Open an issue](https://github.com/ironlab-dev/minidock/issues/new?template=feature_request.md) describing:

- The problem you're trying to solve
- Your proposed solution
- Why it fits MiniDock's scope

## Still Have Questions?

- 💬 [GitHub Discussions](https://github.com/ironlab-dev/minidock/discussions)
- 🐛 [Report an Issue](https://github.com/ironlab-dev/minidock/issues)
- 📧 Email: minidock@ironlab.cc
