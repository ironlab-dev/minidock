# User Manual

> **Note**: This documentation is currently under development. Comprehensive guides are coming soon.

## Getting Started

After installing MiniDock, you'll see the app icon in your macOS menu bar. Click it to access the web dashboard at `http://localhost:23000`.

## Core Features

### 🐳 Docker Management

Manage Docker containers with a beautiful web interface:

- **View Containers**: See all running and stopped containers
- **Start/Stop/Restart**: Control container lifecycle
- **View Logs**: Real-time logs with ANSI color support
- **GitOps Workflow**: Version control your Docker configurations

### 💻 Virtual Machines

Run headless QEMU/UTM virtual machines:

- **Create VMs**: Set up new virtual machines
- **VNC Console**: Browser-based remote desktop access
- **ISO Management**: Upload and manage installation media
- **Resource Control**: Configure CPU, RAM, and disk

### 🤖 Automation

Create powerful automation workflows:

- **Cron Scheduling**: Run tasks on a schedule
- **File Watchers**: Trigger actions on file changes
- **Webhooks**: HTTP-triggered automation
- **Metric Triggers**: React to system metrics (CPU/Memory)

### 📁 File Manager

Secure web-based file browser:

- **Browse Files**: Navigate your file system
- **Code Editor**: Built-in editor with Vim mode
- **File Preview**: View files directly in the browser
- **Upload/Download**: Transfer files easily

### 🚀 Boot Orchestrator

Control service startup order:

- **Dependency Management**: Define service dependencies
- **Startup Delays**: Configure precise timing
- **Status Monitoring**: Track service health
- **Priority Ordering**: Control startup sequence

## Configuration

### System Settings

Access settings through the web dashboard:

1. Click the ⚙️ icon in the sidebar
2. Configure your preferences
3. Changes are saved automatically

### User Management

MiniDock supports multiple users with role-based access:

- **Admin**: Full system access
- **User**: Limited access to specific features

## Security

### Default Credentials

On first run, MiniDock creates a default admin account. **Change the password immediately** after installation.

### JWT Authentication

MiniDock uses JWT tokens for authentication. Tokens are stored securely in your browser.

### Network Access

By default, MiniDock binds to `localhost` only. To expose it to your local network, configure the bind address in settings.

## Troubleshooting

### Dashboard Not Loading

1. Check if the backend is running: `./scripts/dev.sh status`
2. Check backend logs: `tail -f backend/backend_output.log`
3. Restart services: `./stop.sh && ./dev-app.sh`

### Docker Containers Not Showing

Ensure Docker is running:

```bash
docker ps
```

If Docker is not installed, MiniDock will show an error message.

## Need Help?

- 💬 [GitHub Discussions](https://github.com/ironlab-dev/minidock/discussions)
- 🐛 [Report an Issue](https://github.com/ironlab-dev/minidock/issues)
- 📧 Email: minidock@ironlab.cc
