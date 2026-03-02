# Contributing to MiniDock

Thank you for your interest in contributing to MiniDock! This guide covers everything you need to get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Code Style](#code-style)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Requesting Features](#requesting-features)

---

## Code of Conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold these standards.

---

## Getting Started

### Prerequisites

- macOS 14 (Sonoma) or later
- Xcode 16+ (for Swift backend and macOS app)
- Node.js 20+ (for frontend)
- [Homebrew](https://brew.sh) (for toolchain installation)

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/ironlab-dev/minidock.git
cd minidock

# Install all dependencies (Homebrew, Node.js, Swift toolchain, QEMU)
./setup.sh

# Generate Xcode project (required for macOS app)
brew install xcodegen
xcodegen generate

# Build and run the full application
./dev-app.sh
```

The app will appear in your menu bar. The web UI is available at `http://localhost:23000`.

---

## Development Setup

### Project Structure

```
minidock/
├── backend/          # Swift 6.0 + Vapor backend API
│   └── Sources/App/
│       ├── Controllers/   # Route handlers
│       ├── Core/          # Protocols, utilities
│       ├── Models/        # Fluent ORM models
│       └── Services/      # Business logic
├── web/              # Next.js 14 frontend
│   └── src/
│       ├── app/           # App Router pages
│       ├── api/           # API client
│       ├── components/    # React components
│       ├── contexts/      # React Context providers
│       ├── hooks/         # Custom hooks
│       └── lib/           # Utilities
└── macos/            # Native macOS menu bar app
    └── Sources/MiniDockApp/
```

### Running in Development

```bash
# Full app (recommended for testing)
./dev-app.sh

# Frontend only (hot reload)
cd web && npm run dev

# Backend only (after Swift build)
cd backend && swift run

# Check service status
./scripts/dev.sh status

# Stop all services
./stop.sh
```

### Backend Changes

Swift is a compiled language. After modifying backend code:

1. Stop the running process (`Ctrl+C` or `./stop.sh`)
2. Rebuild: `cd backend && swift build`
3. Restart: `./dev-app.sh`

Check for errors: `tail -f backend/backend_output.log`

---

## How to Contribute

### 1. Find an Issue

- Browse [open issues](https://github.com/ironlab-dev/minidock/issues)
- Look for issues tagged `good first issue` or `help wanted`
- Comment on an issue to indicate you're working on it

### 2. Fork and Branch

```bash
# Fork on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/minidock.git

# Create a feature branch
git checkout -b feature/your-feature-name
# or for bug fixes
git checkout -b fix/issue-description
```

### 3. Make Changes

- Follow the [code style guidelines](#code-style)
- Keep changes focused — one PR per feature/fix
- Update documentation if needed

### 4. Test Your Changes

> **Note**: Test framework is currently being set up. For now, manual testing is required.

```bash
# Frontend: check for lint errors
cd web && npm run lint

# Frontend: ensure production build passes
cd web && npm run build

# Backend: ensure it compiles
cd backend && swift build -c release

# Manual testing: run the full app
./dev-app.sh
# Verify your changes work as expected in the dashboard
```

### 5. Submit a Pull Request

Push your branch and open a PR against `master`. Fill out the PR template completely.

---

## Code Style

### TypeScript / React

- **No `any` types** — use proper TypeScript types
- **No `@ts-ignore`** — fix the underlying issue
- **Async/await** — no raw Promises or callbacks
- **`useCallback`** for event handlers that are passed as props
- **`useCachedData`** hook for all API data fetching
- Prefer `interface` for object shapes, `type` for unions

```typescript
// ✅ Correct
const handleSubmit = useCallback(async (data: FormData) => {
    const result = await client.post<ResponseType>('/endpoint', data);
    return result;
}, [dependency]);

// ❌ Wrong
const handleSubmit = async (data: any) => {
    return client.post('/endpoint', data).then(r => r);
};
```

### Swift

- **No force unwraps** (`!`) — use `guard let` or `if let`
- **No force casts** (`as!`) — use conditional casts
- **Async/await** for all I/O operations
- Mark types as `Sendable` for strict concurrency
- Use Vapor's `app.logger` instead of `print()`

```swift
// ✅ Correct
guard let value = optionalValue else {
    app.logger.warning("Value was nil")
    return
}

// ❌ Wrong
let value = optionalValue!
```

### UI / UX (Apple HIG)

- Dark mode first: `bg-[#0a0a0c]`, `text-white`
- Glassmorphism: `backdrop-blur-xl bg-white/5 border border-white/10`
- Rounded corners: minimum `rounded-xl`, prefer `rounded-2xl`
- Hover states: `hover:scale-[1.02]` with `transition-transform`

---

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <short description>

[optional body]
```

**Types:**
- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `style:` — formatting, no logic change
- `refactor:` — code change without feature/fix
- `perf:` — performance improvement
- `chore:` — build process, tooling

**Examples:**
```
feat: add disk usage chart to dashboard
fix: resolve WebSocket reconnection after sleep
docs: update API reference for /auth/refresh
chore: upgrade Next.js to 14.2.x
```

**Recommended scopes**: `backend`, `frontend`, `docker`, `vm`, `auth`, `ui`, `ci`, `docs`

**Examples with scope:**
```
feat(docker): add GitOps diff preview before save
fix(auth): reset isLoading in finally block after login failure
docs(contributing): clarify test framework status
```

---

## Pull Request Process

1. **Fill out** the PR template completely
2. **Link** the related issue (e.g., `Closes #123`)
3. **Ensure** all checks pass (CI build + lint)
4. **Request** a review from a maintainer
5. **Respond** to review feedback promptly

PRs are merged using **squash merge** to keep history clean.

### PR Checklist

- [ ] `npm run lint` passes (frontend)
- [ ] `npm run build` passes (frontend)
- [ ] `swift build -c release` passes (backend)
- [ ] No `console.log` in production code
- [ ] No TODO/FIXME without linked issue
- [ ] Documentation updated if needed
- [ ] No sensitive data (keys, passwords, tokens)

---

## Reporting Bugs

Use the [bug report template](https://github.com/ironlab-dev/minidock/issues/new?template=bug_report.md).

Include:
- macOS version and hardware (Apple Silicon / Intel)
- MiniDock version
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs (`~/Library/Logs/MiniDock/`)

---

## Requesting Features

Use the [feature request template](https://github.com/ironlab-dev/minidock/issues/new?template=feature_request.md).

Before submitting:
- Search existing issues to avoid duplicates
- Describe the problem you're solving, not just the solution
- Consider if it fits MiniDock's scope (macOS-native home server management)

---

## Questions?

- 💬 [GitHub Discussions](https://github.com/ironlab-dev/minidock/discussions) — general questions and ideas
- 🐛 [GitHub Issues](https://github.com/ironlab-dev/minidock/issues) — bugs and feature requests
- 📧 minidock@ironlab.cc — security issues and private inquiries

Thank you for contributing! 🎉
