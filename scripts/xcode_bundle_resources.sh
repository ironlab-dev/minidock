#!/usr/bin/env bash
# Copy backend and web into the built app bundle. Called from Xcode Run Script phase.
# Expects: BUILT_PRODUCTS_DIR, FULL_PRODUCT_NAME, PROJECT_DIR

set -e
APP_BUNDLE="$BUILT_PRODUCTS_DIR/$FULL_PRODUCT_NAME"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
VERSION=$(cat "$PROJECT_DIR/VERSION" 2>/dev/null || echo "0.1.0")

mkdir -p "$APP_BUNDLE/Contents/Resources/backend"
mkdir -p "$APP_BUNDLE/Contents/Resources/web"

# Backend binary (must be built before this script runs)
if [[ -f "$PROJECT_DIR/backend/.build/release/App" ]]; then
  cp "$PROJECT_DIR/backend/.build/release/App" "$APP_BUNDLE/Contents/Resources/backend/App"
fi

# Backend scripts (for component installation)
if [[ -d "$PROJECT_DIR/backend/scripts" ]]; then
  mkdir -p "$APP_BUNDLE/Contents/Resources/backend/scripts"
  cp -R "$PROJECT_DIR/backend/scripts/"* "$APP_BUNDLE/Contents/Resources/backend/scripts/"
  chmod +x "$APP_BUNDLE/Contents/Resources/backend/scripts/"*.sh
fi

# Web assets (standalone mode)
if [[ -d "$PROJECT_DIR/web/.next/standalone" ]]; then
  cp -R "$PROJECT_DIR/web/.next/standalone/." "$APP_BUNDLE/Contents/Resources/web/"
  cp -R "$PROJECT_DIR/web/public" "$APP_BUNDLE/Contents/Resources/web/"
  cp -R "$PROJECT_DIR/web/.next/static" "$APP_BUNDLE/Contents/Resources/web/.next/"
  cp "$PROJECT_DIR/web/server.mjs" "$APP_BUNDLE/Contents/Resources/web/"
  # Add ws package for WebSocket proxy
  mkdir -p "$APP_BUNDLE/Contents/Resources/web/node_modules/ws"
  cp -R "$PROJECT_DIR/web/node_modules/ws/." "$APP_BUNDLE/Contents/Resources/web/node_modules/ws/"
  # Fix: standalone mode doesn't include all Next.js compiled dependencies
  # Copy the complete compiled directory to ensure all dependencies are available
  cp -R "$PROJECT_DIR/web/node_modules/next/dist/compiled/." "$APP_BUNDLE/Contents/Resources/web/node_modules/next/dist/compiled/"
fi

# Version metadata
cat > "$APP_BUNDLE/Contents/Resources/version.json" <<EOF
{"version":"$VERSION","buildDate":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
EOF
