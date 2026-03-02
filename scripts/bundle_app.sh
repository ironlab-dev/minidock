#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="MiniDock"
APP_BUNDLE="$PROJECT_DIR/$APP_NAME.app"

echo "📦 Building backend (Swift release)..."
cd "$PROJECT_DIR/backend"
swift build -c release

echo "🌐 Building frontend (Next.js)..."
cd "$PROJECT_DIR/web"
BACKEND_PORT=28080 npm run build

echo "🗂  Assembling app bundle..."
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources/backend"
mkdir -p "$APP_BUNDLE/Contents/Resources/web"

# Info.plist (replace build variables)
cp "$PROJECT_DIR/macos/Info.plist" "$APP_BUNDLE/Contents/Info.plist.tmp" || {
    echo "   ❌ Failed to copy Info.plist"
    exit 1
}

if ! sed -e 's/$(EXECUTABLE_NAME)/MiniDock/g' \
    -e 's/$(PRODUCT_BUNDLE_IDENTIFIER)/cc.ironlab.minidock/g' \
    -e 's/$(PRODUCT_NAME)/MiniDock/g' \
    -e 's/$(MARKETING_VERSION)/0.1.0/g' \
    -e 's/$(CURRENT_PROJECT_VERSION)/1/g' \
    "$APP_BUNDLE/Contents/Info.plist.tmp" > "$APP_BUNDLE/Contents/Info.plist"; then
    echo "   ❌ Failed to process Info.plist"
    rm -f "$APP_BUNDLE/Contents/Info.plist.tmp"
    exit 1
fi

rm "$APP_BUNDLE/Contents/Info.plist.tmp"

# macOS stub launcher (use existing if present)
if [[ -f "$APP_BUNDLE/Contents/MacOS/$APP_NAME" ]]; then
    echo "   ✓ Keeping existing launcher binary"
else
    echo "   ⚠️  No launcher binary found — build via Xcode for full app"
fi

# Backend
cp "$PROJECT_DIR/backend/.build/release/App" "$APP_BUNDLE/Contents/Resources/backend/App"
echo "   ✓ Backend binary copied"

# Backend scripts
if [[ -d "$PROJECT_DIR/backend/scripts" ]]; then
    mkdir -p "$APP_BUNDLE/Contents/Resources/backend/scripts"
    cp -R "$PROJECT_DIR/backend/scripts/"* "$APP_BUNDLE/Contents/Resources/backend/scripts/"
    chmod +x "$APP_BUNDLE/Contents/Resources/backend/scripts/"*.sh
    echo "   ✓ Backend scripts copied"
fi

# Frontend standalone
rm -rf "$APP_BUNDLE/Contents/Resources/web"
mkdir -p "$APP_BUNDLE/Contents/Resources/web"
cp -R "$PROJECT_DIR/web/.next/standalone/." "$APP_BUNDLE/Contents/Resources/web/"
cp -R "$PROJECT_DIR/web/public" "$APP_BUNDLE/Contents/Resources/web/"
cp -R "$PROJECT_DIR/web/.next/static" "$APP_BUNDLE/Contents/Resources/web/.next/"
cp "$PROJECT_DIR/web/server.mjs" "$APP_BUNDLE/Contents/Resources/web/"
mkdir -p "$APP_BUNDLE/Contents/Resources/web/node_modules/ws"
cp -R "$PROJECT_DIR/web/node_modules/ws/." "$APP_BUNDLE/Contents/Resources/web/node_modules/ws/"
cp -R "$PROJECT_DIR/web/node_modules/next/dist/compiled/." "$APP_BUNDLE/Contents/Resources/web/node_modules/next/dist/compiled/"
echo "   ✓ Frontend assets copied"

# Version
VERSION=$(cat "$PROJECT_DIR/VERSION" 2>/dev/null || echo "0.1.0")
cat > "$APP_BUNDLE/Contents/Resources/version.json" <<EOF
{"version":"$VERSION","buildDate":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
EOF

echo "   ✓ Bundle assembled"
