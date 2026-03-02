#!/bin/bash
set -e

# =============================================================================
# MiniDock Development App Script
# =============================================================================
# Builds, signs (ad-hoc or Developer ID), and runs MiniDock.app for development
#
# Usage:
#   ./dev-app.sh              # Ad-hoc signing (local development)
#   ./dev-app.sh --release    # Developer ID signing (for distribution testing)
# =============================================================================

APP_NAME="MiniDock"
APP_BUNDLE="$APP_NAME.app"
ENTITLEMENTS="macos/MiniDock.entitlements"

# Parse arguments
RELEASE_MODE=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --release)
            RELEASE_MODE=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

echo "🔧 MiniDock Development Build"
echo "=============================================="

# =============================================================================
# Step 1: Kill existing MiniDock processes
# =============================================================================
echo "🛑 Stopping existing MiniDock..."

# Kill the app if running
pkill -f "$APP_BUNDLE/Contents/MacOS/$APP_NAME" 2>/dev/null || true

# Kill backend process if running separately
pkill -f "Resources/backend/App" 2>/dev/null || true

# Give processes time to terminate
sleep 1

# Force kill if still running
pkill -9 -f "$APP_BUNDLE/Contents/MacOS/$APP_NAME" 2>/dev/null || true
pkill -9 -f "Resources/backend/App" 2>/dev/null || true

echo "   ✓ Existing processes stopped"

# =============================================================================
# Step 2: Build the app bundle
# =============================================================================
echo ""
echo "📦 Building $APP_NAME.app..."
"$(dirname "$0")/scripts/bundle_app.sh"

# =============================================================================
# Step 3: Sign the app
# =============================================================================
echo ""
if [ "$RELEASE_MODE" = true ]; then
    # Release mode: Use Developer ID Application (for distribution)
    echo "🔐 Signing with Developer ID (release mode)..."
    
    IDENTITY=$(security find-identity -v -p codesigning | grep "Developer ID Application" | head -1 | sed 's/.*"\(.*\)".*/\1/')
    
    if [ -z "$IDENTITY" ]; then
        echo "❌ Error: No Developer ID Application certificate found."
        echo "   Please install your certificate via Xcode > Settings > Accounts > Manage Certificates"
        echo ""
        echo "   For local development, run without --release flag."
        exit 1
    fi
    
    echo "   Identity: $IDENTITY"
else
    # Development mode: Use Apple Development certificate (preferred) or ad-hoc
    echo "🔐 Signing for development..."
    
    # Try to find Apple Development certificate first
    IDENTITY=$(security find-identity -v -p codesigning | grep "Apple Development" | head -1 | sed 's/.*"\(.*\)".*/\1/')
    
    if [ -z "$IDENTITY" ]; then
        # Fallback to ad-hoc signing
        echo "   No development certificate found, using ad-hoc signing"
        IDENTITY="-"
    else
        echo "   Identity: $IDENTITY"
    fi
fi

# Sign embedded binaries first
if [ -f "$APP_BUNDLE/Contents/Resources/backend/App" ]; then
    codesign --force --options runtime \
        --entitlements "$ENTITLEMENTS" \
        --sign "$IDENTITY" \
        "$APP_BUNDLE/Contents/Resources/backend/App"
fi

# Sign node native modules
find "$APP_BUNDLE/Contents/Resources/web/node_modules" -type f \( -name "*.node" -o -name "*.dylib" \) 2>/dev/null | while read -r file; do
    codesign --force --options runtime \
        --sign "$IDENTITY" \
        "$file" 2>/dev/null || true
done

# Sign the main app bundle
codesign --force --deep --options runtime \
    --entitlements "$ENTITLEMENTS" \
    --sign "$IDENTITY" \
    "$APP_BUNDLE"

echo "   ✓ App signed"

# =============================================================================
# Step 4: Launch the app
# =============================================================================
echo ""
echo "🚀 Launching $APP_NAME.app..."
open "$APP_BUNDLE"

echo ""
echo "=============================================="
echo "✅ $APP_NAME is now running!"
echo "=============================================="
echo ""
echo "Tips:"
echo "  • Click the menu bar icon to access the dashboard"
echo "  • Right-click for options (Open in Browser, Quit)"
echo "  • Logs: ~/Library/Logs/MiniDock/"
echo ""
if [ "$RELEASE_MODE" = false ]; then
    echo "Note: Using development signing for local testing."
    echo "      Use --release flag for Developer ID distribution signing."
fi
