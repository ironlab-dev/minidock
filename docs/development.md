# Developer Guide

> **Note**: For detailed contribution guidelines, see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Architecture Overview

MiniDock is a monorepo with three main components:

```
minidock/
├── backend/          # Swift 6.0 + Vapor backend API
├── web/              # Next.js 14 frontend
└── macos/            # Native macOS menu bar app
```

### Backend (Swift + Vapor)

- **Language**: Swift 6.0 with strict concurrency
- **Framework**: Vapor 4 (async/await)
- **Database**: SQLite with Fluent ORM
- **Real-time**: WebSocket support

### Frontend (Next.js + React)

- **Framework**: Next.js 14 (App Router)
- **UI Library**: React 18
- **Styling**: Tailwind CSS (Apple HIG compliant)
- **Type Safety**: TypeScript (strict mode)

### macOS App (Swift + Cocoa)

- **Menu Bar**: Native macOS menu bar integration
- **Process Management**: Launches and monitors backend/frontend
- **System Integration**: macOS-specific features

## Development Setup

### Prerequisites

- macOS 14 (Sonoma) or later
- Xcode 16+ (for Swift backend)
- Node.js 20+ (for frontend)
- Homebrew (for dependencies)

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/ironlab-dev/minidock.git
cd minidock

# Install dependencies
./setup.sh

# Generate Xcode project
brew install xcodegen
xcodegen generate

# Build and run
./dev-app.sh
```

## Development Workflow

### Running in Development Mode

```bash
# Full app (recommended for testing)
./dev-app.sh

# Frontend only (hot reload)
cd web && npm run dev

# Backend only
cd backend && swift run

# Check service status
./scripts/dev.sh status

# Stop all services
./stop.sh
```

### Making Changes

#### Backend Changes

Swift is compiled, so after modifying backend code:

1. Stop the running process (`Ctrl+C` or `./stop.sh`)
2. Rebuild: `cd backend && swift build`
3. Restart: `./dev-app.sh`

Check for errors: `tail -f backend/backend_output.log`

#### Frontend Changes

Next.js supports hot module replacement (HMR). Most changes will reflect immediately. Restart required for:

- `next.config.mjs`
- `.env.local`
- `middleware.ts`

## Code Style

### TypeScript / React

- **No `any` types** — use proper TypeScript types
- **No `@ts-ignore`** — fix the underlying issue
- **Async/await** — no raw Promises or callbacks
- **`useCallback`** for event handlers passed as props
- **`useCachedData`** hook for all API data fetching

### Swift

- **No force unwraps** (`!`) — use `guard let` or `if let`
- **No force casts** (`as!`) — use conditional casts
- **Async/await** for all I/O operations
- Mark types as `Sendable` for strict concurrency
- Use Vapor's `app.logger` instead of `print()`

### UI / UX (Apple HIG)

- Dark mode first: `bg-[#0a0a0c]`, `text-white`
- Glassmorphism: `backdrop-blur-xl bg-white/5 border border-white/10`
- Rounded corners: minimum `rounded-xl`, prefer `rounded-2xl`
- Hover states: `hover:scale-[1.02]` with `transition-transform`

## Testing

> **Note**: Test framework is currently being set up. For now, manual testing is required.

### Manual Testing Checklist

- [ ] Backend compiles: `cd backend && swift build -c release`
- [ ] Frontend builds: `cd web && npm run build`
- [ ] No lint errors: `cd web && npm run lint`
- [ ] App launches successfully: `./dev-app.sh`
- [ ] Dashboard loads at `http://localhost:23000`

## Debugging

### Backend Logs

```bash
tail -f backend/backend_output.log
```

### Frontend Logs

Open browser console (Cmd+Option+I on macOS)

### Service Status

```bash
./scripts/dev.sh status
```

## Common Issues

### Port Conflicts

```bash
./stop.sh --all
./dev-app.sh
```

### Stale Cache

Clear browser localStorage or use `cacheManager.clear()` in the console.

### Type Errors

Never suppress with `any` or `@ts-ignore`. Fix the root cause.

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for:

- Pull request process
- Commit message conventions
- Code review guidelines

## Need Help?

- 💬 [GitHub Discussions](https://github.com/ironlab-dev/minidock/discussions)
- 🐛 [Report an Issue](https://github.com/ironlab-dev/minidock/issues)
- 📧 Email: minidock@ironlab.cc
