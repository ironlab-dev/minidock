# MiniDock Development Guide

This document provides essential guidelines for developers working on the MiniDock project.

## Test Credentials (Browser Testing)

For browser-based testing and automation, configure a test admin account:

- **URL**: http://localhost:23000
- **Username**: `testadmin` (or your preferred test username)
- **Password**: Configure in your local environment
- **Role**: admin

## Project Overview

**MiniDock** is a macOS-native NAS management application built with:
- **Backend**: Swift 6.0 + Vapor (async/await, Fluent ORM, SQLite)
- **Frontend**: Next.js 14 (App Router) + React 18 + TypeScript (strict mode)
- **Architecture**: Monorepo with separate `backend/` and `web/` directories
- **Platform**: macOS 14+ (Apple Silicon & Intel)

## Build, Lint, and Test Commands

### Development Workflow

**重要：功能测试必须通过 `.app` 应用进行**

MiniDock 是一个 macOS 原生应用，最终用户通过 menubar 图标与应用交互。因此：

- ❌ 不要直接用 `./scripts/dev.sh` 启动后单独测试前端/后端
- ✅ 必须使用 `./dev-app.sh` 构建并运行完整的 `.app` 应用

```bash
# ============================================
# 标准开发测试流程（推荐）
# ============================================

# 构建、签名并运行 MiniDock.app
./dev-app.sh

# 测试完成后，修改代码，重新运行即可（脚本会自动关闭旧进程）
./dev-app.sh

# 查看日志（如果启用了日志记录）
tail -f ~/Library/Logs/MiniDock/backend.log
tail -f ~/Library/Logs/MiniDock/frontend.log
```

**为什么必须走 App 测试流程？**

1. **端口配置不同**：App 使用固定端口（前端 23000，后端 28080），与 dev.sh 动态分配的端口不同
2. **WebSocket 代理**：App 使用 `server.mjs` 启动前端，支持 WebSocket 代理；直接 `npm run dev` 不支持
3. **生产环境模拟**：App 运行的是生产构建（`npm run build`），能发现仅在生产环境出现的问题
4. **权限与签名**：macOS 系统权限（Full Disk Access、Accessibility）与签名相关，只有通过 App 测试才能验证

```bash
# ============================================
# 其他命令（仅用于特定场景）
# ============================================

# 仅前后端开发调试（不推荐用于功能测试）
./scripts/dev.sh                # Smart port allocation based on directory name

# 检查服务状态
./scripts/dev.sh status         # Shows running services and ports

# 停止所有服务
./stop.sh                       # Current directory only
./stop.sh --all                 # All MiniDock instances system-wide

# 首次环境配置
./setup.sh                      # Install Homebrew, Node.js, Swift, QEMU, Docker
```

### Frontend Commands (web/)

```bash
# Development
npm run dev                  # Start Next.js dev server (default: :23000)

# Build
npm run build                # Production build

# Lint
npm run lint                 # Next.js ESLint (extends next/core-web-vitals)

# Production
npm run start                # Serve production build
```

### Backend Commands (backend/)

```bash
# Build
swift build                  # Debug build
swift build -c release       # Release build

# Run
swift run                    # Run debug build

# Clean
swift package clean          # Remove .build directory
swift package resolve        # Resolve dependencies
```

**Note**: No test framework is currently configured. Do not assume Jest, Vitest, or XCTest exist.

### ⚠️ 脚本职责边界（必读）

MiniDock 有两套完全不同目的的脚本，绝对不能混用：

| 脚本 | 用途 | 签名方式 | 可公开分发？ |
| ---- | ---- | -------- | ----------- |
| `./dev-app.sh` | **本地开发测试** | Ad-hoc 或 Apple Development | ❌ 否 |
| `./release.sh` | **正式公开发布** | Developer ID + Notarize + Staple | ✅ 是 |

- **AI 代理和开发者**：功能迭代时只用 `./dev-app.sh`，永远不要用 `./release.sh` 来测试功能。
- **发布时**：只用 `./release.sh`，输出 `dist/MiniDock-{VERSION}.dmg`，这才是可安全分发给用户的文件。

### Release / 发布流程

**发布条件**：代码合并到 main 且版本号已更新到 `VERSION` 文件。

#### 一次性凭据配置

```bash
# 1. 复制模板
cp scripts/notarize.env.example .notarize.env

# 2. 填入 App Store Connect API Key 信息（见下文说明）
# 打开 https://appstoreconnect.apple.com/access/integrations/api
# 按页面说明创建 API Key（Developer 角色），填写到 .notarize.env：
#   ASC_KEY_ID=XXXXXXXXXX            (10字符 Key ID)
#   ASC_ISSUER_ID=xxx-xxx-xxx        (页面顶部 Issuer ID)
#   ASC_KEY_PATH=/path/to/AuthKey_XXXXXXXXXX.p8
```

#### 构建并发布

```bash
# 完整发布（签名 → DMG → Apple公证 → Staple），约需5-8分钟
./release.sh

# 仅打包测试（跳过公证，适合验证DMG结构）
./release.sh --skip-notarize

# 输出文件
ls dist/MiniDock-*.dmg    # 这是可公开分发的 DMG
```

#### 发布后步骤

```bash
# 1. 测试 DMG（务必在干净 Mac 或 VM 上验证 Gatekeeper 不报错）
# 2. 上传到官网 https://minidock.net/releases/
# 3. 创建 GitHub Release 并附上 DMG
# 4. 更新 appcast.xml 触发 Sparkle 自动更新推送
```

#### 凭据说明（Developer ID + Notarization）

- **Developer ID Application 证书**：本机 Keychain 已有 `Jacks Gong (SE3B3RM5Y4)`，无需额外配置。
- **App Store Connect API Key**：notarytool 使用，凭据存放在 `.notarize.env`（gitignored，不可提交）。
- **Team ID**：`SE3B3RM5Y4`（已硬编码在 `release.sh` 中）。

## Code Style Guidelines

### TypeScript/React (Frontend)

#### Import Organization
```typescript
// 1. React/Next.js core
import { useCallback } from 'react';
import type { Metadata } from "next";

// 2. External libraries
import { motion } from 'framer-motion';

// 3. Internal: API/lib/hooks
import { client } from '@/api/client';
import { cacheManager } from '@/lib/cacheManager';
import { useCachedData } from '@/hooks/useCachedData';

// 4. Internal: components
import { Button } from '@/components/ui/Button';
import Sidebar from '@/components/Sidebar';

// 5. Types (prefer inline imports)
import type { DockerServiceItem } from '@/types/service';
```

#### Naming Conventions
- **Files**: PascalCase for components (`Button.tsx`), camelCase for utilities (`cacheManager.ts`)
- **Components**: PascalCase (`const Button: React.FC<...>`)
- **Functions/Variables**: camelCase (`fetchServices`, `isLoading`)
- **Types/Interfaces**: PascalCase (`interface ButtonProps`)
- **Constants**: SCREAMING_SNAKE_CASE (`const API_URL = ...`)

#### TypeScript Patterns
```typescript
// ✅ PREFER: interface for props
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary';
    isLoading?: boolean;
}

// ✅ PREFER: type for unions/composites
type ServiceStatus = 'running' | 'stopped' | 'error';

// ✅ Use type annotations in function signatures
async function fetchData(): Promise<DockerServiceItem[]> { ... }

// ❌ NEVER: any, as any, @ts-ignore, @ts-expect-error
// ❌ NEVER: suppress type errors
```

#### Async Patterns
```typescript
// ✅ ALWAYS: async/await (never raw Promises)
const fetchServices = useCallback(async () => {
    const data = await client.get<ServiceItem[]>('/services');
    return data;
}, []);

// ✅ Use try/catch for error handling in async functions
try {
    const result = await someAsyncOperation();
} catch (error) {
    console.error('[ComponentName] Error:', error);
    throw error; // Re-throw if caller needs to handle
}
```

#### Error Handling
```typescript
// ✅ Wrap API calls in try/catch
try {
    await client.post('/endpoint', data);
} catch (error) {
    console.error('[ContextName] Failed:', error);
    // Show user-friendly error (toast/banner)
}

// ✅ Use console.error for debugging, prefix with context
console.error('[ApiClient] Request failed:', error);
```

#### React Hooks & State
```typescript
// ✅ Use useCachedData for API data fetching
const { data, loading, isRefreshing, refresh } = useCachedData({
    cacheKey: 'uniqueKey',
    fetchFn: async () => await client.get('/endpoint'),
    initialValue: [],
});

// ✅ Wrap callbacks in useCallback
const handleClick = useCallback(async () => {
    await performAction();
}, [dependency]);

// ✅ Distinguish loading vs refreshing
// - loading: true on first load (show skeleton)
// - isRefreshing: true on background refresh (silent or subtle indicator)
```

#### UI/UX Standards (Apple HIG Compliance)
```typescript
// ✅ Glassmorphism: backdrop-blur-xl + bg-white/5
className="backdrop-blur-xl bg-white/5 border border-white/10"

// ✅ Rounded corners: rounded-xl (minimum), rounded-2xl (preferred)
className="rounded-2xl"

// ✅ Hover states: scale-1.02, brightness changes
className="hover:scale-1.02 transition-transform"

// ✅ Active states: scale-95
className="active:scale-95"

// ✅ Dark mode first: bg-[#0a0a0c], text-white
className="bg-[#0a0a0c] text-white"

// ❌ NEVER: Material Design patterns (shadows without blur, sharp corners)
```

### Swift (Backend)

#### Naming Conventions
- **Files**: PascalCase matching primary type (`DockerService.swift`)
- **Types**: PascalCase (`struct ServiceInfo`, `enum ServiceStatus`)
- **Functions/Variables**: camelCase (`func getStatus()`, `let baseUrl`)
- **Protocol**: PascalCase with descriptive suffix (`MiniDockService`, `ServiceProtocol`)

#### Code Structure
```swift
// ✅ Use protocols for service abstraction
public protocol MiniDockService: Sendable {
    var id: String { get }
    func getStatus() async throws -> ServiceStatus
}

// ✅ Async/await for all I/O operations
func fetchData(app: Application) async throws -> [ServiceItem] {
    let output = try await shellExec("docker ps")
    return parseOutput(output)
}

// ✅ Use Vapor's Content for DTOs
struct ServiceInfo: Content, Equatable {
    let id: String
    let name: String
}

// ✅ Error handling with specific error types
throw Abort(.badRequest, reason: "Invalid service name")
```

#### Concurrency & Safety
```swift
// ✅ Mark types as Sendable for strict concurrency
public protocol MiniDockService: Sendable { }

// ✅ Use async/await, avoid completion handlers
// ❌ NEVER: nested callbacks, DispatchQueue.async for I/O

// ✅ Enable strict concurrency (already in Package.swift)
// .enableUpcomingFeature("StrictConcurrency")
```

## File Organization

```
minidock2/
├── backend/
│   ├── Sources/App/
│   │   ├── Controllers/       # API route handlers
│   │   ├── Core/              # Protocols, utilities
│   │   ├── Migrations/        # Fluent database migrations
│   │   ├── Models/            # Fluent models (SQLite)
│   │   ├── Services/          # Business logic (Docker, VM, etc.)
│   │   ├── configure.swift    # Vapor app setup
│   │   └── entrypoint.swift   # Main entry point
│   ├── Package.swift          # Swift Package Manager manifest
│   └── backend_output.log     # Runtime logs (debug)
│
└── web/
    ├── src/
    │   ├── app/               # Next.js App Router pages
    │   ├── api/               # API client (client.ts)
    │   ├── components/        # React components
    │   │   ├── ui/           # Reusable UI primitives (Button, Card, etc.)
    │   │   └── *.tsx         # Feature components
    │   ├── contexts/          # React Context providers
    │   ├── hooks/             # Custom React hooks
    │   ├── lib/               # Utilities (cacheManager, formatters)
    │   └── types/             # TypeScript type definitions
    ├── package.json
    └── tsconfig.json
```

## Development Practices

### Port Management
- **Default Ports**: Backend `24000`, Frontend `23000` (Backend = Frontend + 1000)
- **Smart Port Allocation**: Ports are assigned based on directory name
  - Directory with number (e.g., `minidock2`): Frontend `23002`, Backend `24002`
  - Directory without number: Frontend `23000`, Backend `24000`
  - If default port is occupied (by other project): Start from `33000` and increment
- **Environment Variables**: Auto-generated in `web/.env.local`
  ```bash
  NEXT_PUBLIC_API_URL=http://localhost:24000
  ```

### Backend Modifications
```bash
# Swift is compiled. After code changes:
1. Press Ctrl+C in terminal to stop scripts/dev.sh
2. Run ./stop.sh to ensure clean shutdown
3. Run ./scripts/dev.sh to recompile and restart

# Check for compilation errors:
tail -f backend/backend_output.log
```

### Frontend Hot Reload
- Next.js supports HMR for most changes
- Restart required for: `next.config.mjs`, `.env.local`, `middleware.ts`

### API Client Usage
```typescript
import { client } from '@/api/client';

// ✅ GET request
const data = await client.get<ResponseType>('/endpoint');

// ✅ POST request
await client.post('/endpoint', { key: 'value' });

// ✅ DELETE request
await client.delete('/endpoint');

// Error handling is built-in (throws on non-2xx)
```

### API Routing Architecture

**架构设计**：反向代理只指向前端端口，Next.js rewrite 处理 API 转发。

```
浏览器请求           Next.js Rewrite              后端路由
/api/settings   →   去掉 /api 前缀   →         /settings
/api/disks      →   去掉 /api 前缀   →         /disks
```

**后端路由规范**：
- 所有路由**不带** `/api` 前缀
- 正确: `routes.grouped("disks")`、`routes.grouped("settings")`
- 错误: `routes.grouped("api", "disks")`

**前端调用规范**：
- 使用 `client` 时**不写** `/api` 前缀（client 的 baseUrl 已是 `/api`）
- 正确: `client.get('/disks')`、`client.post('/settings', data)`
- 错误: `client.get('/api/disks')`

**工作流程**：
1. 前端 `client.get('/disks')` → 实际请求 `/api/disks`
2. Next.js rewrite `/api/:path*` → `http://backend/:path*`
3. 后端收到 `/disks` 请求

### Cache Management
```typescript
import { cacheManager } from '@/lib/cacheManager';

// ✅ Set cache
cacheManager.set('key', data, 60000); // 60s TTL

// ✅ Get cache
const cached = cacheManager.get<Type>('key');

// ✅ Invalidate cache
cacheManager.invalidate('key');
```

## Verification & Quality Checks

### Pre-Commit Checklist
- [ ] No type errors (`npm run lint` in `web/`)
- [ ] No Swift warnings (`swift build` in `backend/`)
- [ ] Backend compiles successfully
- [ ] Frontend builds without errors (`npm run build`)
- [ ] No `console.log` statements left in production code
- [ ] No TODO/FIXME comments without GitHub issues
- [ ] Follows Apple HIG for UI components

### Debugging
```bash
# Backend logs
tail -f backend/backend_output.log

# Frontend logs
# Open browser console (Cmd+Option+I on macOS)

# Service status
./scripts/dev.sh status
```

### Common Issues
1. **"Offline" status in UI**: Backend not started or crashed. Check `backend_output.log`.
2. **Port conflicts**: Run `./stop.sh --all` then restart.
3. **Stale cache**: Clear browser localStorage or use `cacheManager.clear()`.
4. **Type errors**: Never suppress with `any` or `@ts-ignore`. Fix root cause.

## UI Component Standards

### Button Variants
```typescript
<Button variant="primary">Save</Button>        // Blue, primary action
<Button variant="secondary">Cancel</Button>     // Ghost, secondary
<Button variant="danger">Delete</Button>        // Red, destructive
<Button variant="success">Confirm</Button>      // Green, positive
<Button variant="ghost">View</Button>           // Transparent
```

### Loading States
```typescript
// ✅ Show skeleton on first load
{loading && <SkeletonCard />}

// ✅ Silent refresh in background (HIG compliant)
{isRefreshing && <SubtleSpinner />}

// ❌ NEVER: Block UI with modal spinner on refresh
```

## Git & Version Control

```bash
# Feature branches
git checkout -b feature/service-name

# Commit messages (concise, imperative)
git commit -m "Add Docker service status endpoint"
git commit -m "Fix VNC connection timeout issue"

# Never commit
- node_modules/, .build/
- .env, .env.local (use .env.example)
- IDE files (.vscode/, .idea/)
- Logs (*.log)
```

## Key Constraints

1. **Type Safety**: Never use `any`, `as any`, `@ts-ignore`, `@ts-expect-error`.
2. **Error Handling**: Always wrap async operations in try/catch.
3. **HIG Compliance**: All UI must follow Apple Human Interface Guidelines.
4. **No Tests**: Do not assume test frameworks exist. Manual verification required.
5. **Async Only**: Use async/await exclusively. No raw Promises or callbacks.
6. **Cache First**: Use `useCachedData` hook for all data fetching.
7. **Silent Refresh**: Background refreshes must not show progress bars (HIG).

## Additional Resources

- **Main README**: `README.md` (comprehensive project docs)
- **Package Files**: `web/package.json`, `backend/Package.swift`
- **Development Scripts**: `./scripts/dev.sh`, `./stop.sh`, `./setup.sh`

## Commercialization & Trial Strategy (IMPORTANT)

**⚠️ CRITICAL INSTRUCTION FOR ALL AGENTS**: 
MiniDock operates on a **Direct Distribution** model (No Mac App Store) and uses a **14-Day Nagware Trial + Lifetime License** strategy targeted at Mac power users and homelabbers.

Whenever you are implementing, modifying, or debugging licensing/trial features, you **MUST** adhere to the following principles:

1. **No Hard Lockouts (Nagware Model)**: 
   - NEVER implement aggressive paywalls or forced application exits after the trial expires.
   - Core read-only features MUST continue to work. 
   - Write operations (POST/PUT/DELETE) during an expired trial should trigger a **5-second dismissable Nagware modal**, NOT a hard block.
   - Trial state is stored locally without network dependency (`.trial_info` via Keychain concepts).

2. **Network Transparency (Zero Telemetry)**:
   - Do NOT add any analytics, tracking, or telemetry libraries (e.g., Google Analytics, Mixpanel).
   - Only 3 external network calls are allowed: 
     a. `api.lemonsqueezy.com` (License activation)
     b. `minidock.net/appcast.xml` (Sparkle updates)
     c. `api.github.com` (Community templates)

3. **Merchant of Record (MoR)**:
   - Lemon Squeezy is the single source of truth for payment and license validation. Do NOT implement custom Stripe/PayPal integrations.
   - Backend logic resides in `backend/Sources/App/Services/LicenseService.swift`.

The principles above are exhaustive — follow them strictly when working on licensing or trial features.
