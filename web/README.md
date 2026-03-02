# MiniDock Web Frontend

The web interface for MiniDock, built with **Next.js 14** (App Router) + **React 18** + **TypeScript** (strict mode).

## Getting Started

```bash
# Install dependencies
npm install

# Start development server (port 23000)
npm run dev

# Production build
npm run build

# Lint
npm run lint
```

> **Note**: For full-feature testing, use `./dev-app.sh` from the project root to build and run the complete macOS app bundle. See the [main README](../README.md) for details.

## Project Structure

```
src/
├── app/             # Next.js App Router pages
├── api/             # API client (client.ts)
├── components/      # React components
│   └── ui/          # Reusable UI primitives (Button, Card, etc.)
├── contexts/        # React Context providers
├── hooks/           # Custom hooks (useCachedData, useWebSocket, etc.)
├── lib/             # Utilities (cacheManager, formatters)
├── locales/         # i18n translation files
├── types/           # TypeScript type definitions
└── demo/            # Demo mode (mock data, no backend needed)
```

## Key Patterns

- **API Client**: Use `client.get('/endpoint')` — the `/api` prefix is handled by Next.js rewrites
- **Data Fetching**: Use `useCachedData` hook for all API data
- **Styling**: Tailwind CSS, dark-mode-first, Apple HIG compliant (glassmorphism, rounded corners)
- **State**: React Context for auth, toast, loading states

## Demo Mode

```bash
npm run dev:demo    # Local demo with mock data
npm run build:demo  # Static export to web/out/
```

See `src/demo/` for mock data structure and integration points.

## Contributing

Please read [CONTRIBUTING.md](../CONTRIBUTING.md) for code style guidelines, commit conventions, and the pull request process.
