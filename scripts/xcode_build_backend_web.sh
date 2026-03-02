#!/usr/bin/env bash
# Build backend and web for the app bundle. Called from Xcode Run Script phase (before compile).
# Expects: PROJECT_DIR

set -e
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

cd "$PROJECT_DIR/backend"
swift build -c release

cd "$PROJECT_DIR/web"
BACKEND_PORT=28080 npm run build
