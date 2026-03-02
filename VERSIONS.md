# MiniDock Technology Stack & Versions

This document defines the specific versions of all core technologies and dependencies used in the MiniDock project to ensure development consistency and prevent compatibility issues.

## Runtime Environments

| Technology | Version | Command |
| :--- | :--- | :--- |
| **Python** | 3.14 | `python3` |
| **Node.js** | 18.20.5 | `node` |
| **npm** | 10.8.2 | `npm` |
| **Swift** | 6.2.1 | `swift` |
| **macOS** | Sonoma/Sequoia (v14+) | - |

## Backend (Swift/Vapor)

| Dependency | Version / Requirement | Source |
| :--- | :--- | :--- |
| **Vapor** | 4.106.0+ | [vapor/vapor](https://github.com/vapor/vapor) |
| **Fluent** | 4.12.0+ | [vapor/fluent](https://github.com/vapor/fluent) |
| **Fluent SQLite Driver** | 4.8.0+ | [vapor/fluent-sqlite-driver](https://github.com/vapor/fluent-sqlite-driver) |
| **Platform** | macOS 14.0+ | - |

## Frontend (Next.js)

| Dependency | Version / Requirement | Source |
| :--- | :--- | :--- |
| **Next.js** | 14.x (App Router) | `next` |
| **React** | 18.x | `react` |
| **TailwindCSS** | 3.x | `tailwindcss` |
| **Supabase SSR** | Latest | `@supabase/ssr` |
| **Supabase JS** | Latest | `@supabase/supabase-js` |

## Infrastructure & Tools

| Tool | Usage | Type |
| :--- | :--- | :--- |
| **OrbStack** | Docker Orchestration | Native macOS App |
| **UTM** | VM Management | Native macOS App |
| **SQLite** | Local Persistence | Database |
| **Supabase** | Auth & Remote Access | Backend-as-a-Service |

---

> [!NOTE]
> Always verify these versions when setting up a new development environment using the `swift --version`, `node -v`, and `npm -v` commands.
