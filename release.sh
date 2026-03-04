#!/bin/bash
# =============================================================================
# MiniDock Release Script
# =============================================================================
#
# Produces a signed, notarized, stapled DMG ready for public distribution.
# This is the DISTRIBUTION script — for local development use dev-app.sh.
#
# Prerequisites:
#   brew install create-dmg
#   A valid "Developer ID Application" certificate in your Keychain
#   App Store Connect API Key credentials (see setup below)
#
# Credentials Setup (one-time):
#   Copy scripts/notarize.env.example to .notarize.env and fill in values:
#     ASC_KEY_ID=XXXXXXXXXX
#     ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
#     ASC_KEY_PATH=/path/to/AuthKey_XXXXXXXXXX.p8
#   .notarize.env is git-ignored and never committed.
#
# Usage:
#   ./release.sh               # Build + sign + DMG + notarize + staple
#   ./release.sh --skip-notarize  # Build + sign + DMG only (for testing packaging)
#
# Output:
#   dist/MiniDock-{VERSION}.dmg  — ready to upload to website / GitHub Releases
#
# =============================================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="MiniDock"
BUNDLE_ID="cc.ironlab.minidock"
TEAM_ID="SE3B3RM5Y4"
VERSION=$(cat "$PROJECT_DIR/VERSION" 2>/dev/null || echo "0.1.0")
APP_BUNDLE="$PROJECT_DIR/$APP_NAME.app"
ENTITLEMENTS="$PROJECT_DIR/macos/MiniDock.entitlements"
DIST_DIR="$PROJECT_DIR/dist"
DMG_NAME="$APP_NAME-$VERSION.dmg"
DMG_PATH="$DIST_DIR/$DMG_NAME"

# Parse arguments
SKIP_NOTARIZE=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-notarize)
            SKIP_NOTARIZE=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# =============================================================================
# Helpers
# =============================================================================

log()  { echo "  $*"; }
step() { echo ""; echo "▶ $*"; }
ok()   { echo "  ✓ $*"; }
fail() { echo ""; echo "  ❌ $*" >&2; exit 1; }

# =============================================================================
# Step 0: Load credentials and verify prerequisites
# =============================================================================

step "Checking prerequisites..."

# Load local credentials file if present (gitignored)
if [[ -f "$PROJECT_DIR/.notarize.env" ]]; then
    # shellcheck source=/dev/null
    source "$PROJECT_DIR/.notarize.env"
    ok "Loaded credentials from .notarize.env"
fi

# Check create-dmg
if ! command -v create-dmg &>/dev/null; then
    fail "create-dmg not found. Install with: brew install create-dmg"
fi
ok "create-dmg found: $(which create-dmg)"

# Check Developer ID certificate
IDENTITY=$(security find-identity -v -p codesigning | grep "Developer ID Application" | head -1 | sed 's/.*"\(.*\)".*/\1/' || true)
if [[ -z "$IDENTITY" ]]; then
    fail "No 'Developer ID Application' certificate found in Keychain.\n   Install via Xcode → Settings → Accounts → Manage Certificates"
fi
ok "Certificate: $IDENTITY"

# Check notarization credentials (unless skipped)
if [[ "$SKIP_NOTARIZE" == false ]]; then
    [[ -z "${ASC_KEY_ID:-}" ]]    && fail "ASC_KEY_ID not set. See .notarize.env setup in script header."
    [[ -z "${ASC_ISSUER_ID:-}" ]] && fail "ASC_ISSUER_ID not set. See .notarize.env setup in script header."
    [[ -z "${ASC_KEY_PATH:-}" ]]  && fail "ASC_KEY_PATH not set. See .notarize.env setup in script header."
    [[ ! -f "$ASC_KEY_PATH" ]]    && fail "API key file not found: $ASC_KEY_PATH"
    ok "Notarization credentials ready (Key ID: $ASC_KEY_ID)"
else
    log "⚠️  Skipping notarization (--skip-notarize)"
fi

echo ""
echo "  App:     $APP_NAME $VERSION"
echo "  Bundle:  $BUNDLE_ID"
echo "  Team:    $TEAM_ID"
echo "  Output:  $DMG_PATH"

# =============================================================================
# Step 1: Clean previous dist
# =============================================================================

step "Cleaning dist/..."
rm -f "$DMG_PATH"
mkdir -p "$DIST_DIR"
ok "dist/ ready"

# =============================================================================
# Step 2: Build app bundle (Swift + Next.js + assembly)
# =============================================================================

step "Building app bundle..."
"$PROJECT_DIR/scripts/bundle_app.sh"
ok "App bundle assembled"

# =============================================================================
# Step 3: Code sign with Developer ID (hardened runtime required for notarize)
# =============================================================================

step "Signing with Developer ID Application..."

CODESIGN_OPTS=(
    --force
    --options runtime          # Hardened runtime — mandatory for notarization
    --entitlements "$ENTITLEMENTS"
    --sign "$IDENTITY"
    --timestamp                # Secure timestamp — mandatory for notarization
)

# Sign embedded binaries first (inside-out order is critical)
log "Signing backend binary..."
codesign "${CODESIGN_OPTS[@]}" \
    "$APP_BUNDLE/Contents/Resources/backend/App"

log "Signing Node native modules and executables..."
# Sign .node native modules
while IFS= read -r -d '' file; do
    codesign "${CODESIGN_OPTS[@]}" "$file" 2>/dev/null || true
done < <(find "$APP_BUNDLE/Contents/Resources/web/node_modules" \
    -type f -name "*.node" -print0 2>/dev/null)

# Sign .dylib libraries
while IFS= read -r -d '' file; do
    codesign "${CODESIGN_OPTS[@]}" "$file" 2>/dev/null || true
done < <(find "$APP_BUNDLE/Contents/Resources/web/node_modules" \
    -type f -name "*.dylib" -print0 2>/dev/null)

# Sign Mach-O executables (like esbuild)
while IFS= read -r -d '' file; do
    # Check if it's a Mach-O executable
    if file "$file" | grep -q "Mach-O.*executable"; then
        log "  Signing: $(basename "$file")"
        codesign "${CODESIGN_OPTS[@]}" "$file" 2>/dev/null || true
    fi
done < <(find "$APP_BUNDLE/Contents/Resources/web/node_modules" \
    -type f -perm +111 -print0 2>/dev/null)

log "Signing main app bundle..."
codesign "${CODESIGN_OPTS[@]}" --deep "$APP_BUNDLE"

ok "App signed"

# Verify signature
log "Verifying signature..."
codesign --verify --deep --strict "$APP_BUNDLE" \
    && ok "Signature valid" \
    || fail "Signature verification failed"

# Gatekeeper check (will fail before notarization, that's expected)
if [[ "$SKIP_NOTARIZE" == false ]]; then
    log "Pre-notarization Gatekeeper check (expected to fail)..."
    spctl --assess --type exec "$APP_BUNDLE" 2>&1 | grep -q "rejected" && log "⚠️  Rejected (will pass after notarization)" || ok "Gatekeeper check passed"
else
    log "⚠️  Skipping Gatekeeper check (--skip-notarize mode)"
fi

# =============================================================================
# Step 4: Create DMG
# =============================================================================

step "Creating DMG..."

# Temporary DMG path (unsigned, pre-notarization)
UNSIGNED_DMG="$DIST_DIR/${APP_NAME}-${VERSION}-unsigned.dmg"
rm -f "$UNSIGNED_DMG"

CREATE_DMG_OPTS=(
    --volname "$APP_NAME $VERSION"
    --window-pos 200 120
    --window-size 660 400
    --icon-size 128
    --icon "$APP_NAME.app" 180 200
    --hide-extension "$APP_NAME.app"
    --app-drop-link 480 200
    --no-internet-enable
)

# Use app icon as volume icon if icns exists
APP_ICON="$APP_BUNDLE/Contents/Resources/AppIcon.icns"
if [[ -f "$APP_ICON" ]]; then
    CREATE_DMG_OPTS+=(--volicon "$APP_ICON")
    ok "Using app icon for DMG volume"
fi

# Use DMG background if present
DMG_BACKGROUND="$PROJECT_DIR/assets/dmg-background.png"
if [[ -f "$DMG_BACKGROUND" ]]; then
    CREATE_DMG_OPTS+=(--background "$DMG_BACKGROUND")
    ok "Using custom DMG background"
fi

create-dmg \
    "${CREATE_DMG_OPTS[@]}" \
    "$UNSIGNED_DMG" \
    "$APP_BUNDLE"

ok "DMG created: $(du -sh "$UNSIGNED_DMG" | cut -f1)"

# Sign the DMG itself
log "Signing DMG..."
codesign \
    --force \
    --sign "$IDENTITY" \
    --timestamp \
    "$UNSIGNED_DMG"
ok "DMG signed"

# Move to final path
mv "$UNSIGNED_DMG" "$DMG_PATH"

# =============================================================================
# Step 5: Notarize + Staple (skipped if --skip-notarize)
# =============================================================================

if [[ "$SKIP_NOTARIZE" == true ]]; then
    echo ""
    echo "=============================================="
    echo "  ⚠️  PACKAGING COMPLETE (not notarized)"
    echo "=============================================="
    echo "  DMG: $DMG_PATH"
    echo ""
    echo "  This DMG is signed but NOT notarized."
    echo "  macOS Gatekeeper will warn users on first open."
    echo "  Run without --skip-notarize for a production build."
    echo ""
    exit 0
fi

step "Submitting to Apple Notary Service..."
log "This typically takes 2-5 minutes..."

NOTARIZE_LOG="$DIST_DIR/notarize.log"

xcrun notarytool submit "$DMG_PATH" \
    --key "$ASC_KEY_PATH" \
    --key-id "$ASC_KEY_ID" \
    --issuer "$ASC_ISSUER_ID" \
    --wait \
    --output-format json \
    2>&1 | tee "$NOTARIZE_LOG"

# Check notarization result
NOTARIZE_STATUS=$(python3 -c "
import sys, json
try:
    data = json.load(open('$NOTARIZE_LOG'))
    print(data.get('status', 'unknown'))
except:
    # Try to extract from mixed output
    import re
    text = open('$NOTARIZE_LOG').read()
    m = re.search(r'\"status\"\\s*:\\s*\"(\\w+)\"', text)
    print(m.group(1) if m else 'unknown')
" 2>/dev/null || echo "unknown")

if [[ "$NOTARIZE_STATUS" != "Accepted" ]]; then
    echo ""
    log "Notarization log saved to: $NOTARIZE_LOG"
    fail "Notarization failed (status: $NOTARIZE_STATUS). Check $NOTARIZE_LOG for details."
fi
ok "Notarization accepted"

# =============================================================================
# Step 6: Staple notarization ticket to DMG
# =============================================================================

step "Stapling notarization ticket..."
xcrun stapler staple "$DMG_PATH" \
    && ok "Ticket stapled" \
    || fail "Stapling failed"

# Verify staple
xcrun stapler validate "$DMG_PATH" \
    && ok "Staple validated" \
    || fail "Staple validation failed"

# =============================================================================
# Done
# =============================================================================

echo ""
echo "=============================================="
echo "  ✅ RELEASE BUILD COMPLETE"
echo "=============================================="
echo "  Version:    $VERSION"
echo "  DMG:        $DMG_PATH"
echo "  Size:       $(du -sh "$DMG_PATH" | cut -f1)"
echo "  Signed:     Developer ID Application: Jacks Gong ($TEAM_ID)"
echo "  Notarized:  ✓ (ticket stapled — works offline)"
echo ""
echo "  Next steps:"
echo "  1. Test the DMG on a clean Mac (or VM)"
echo "  2. Upload to https://minidock.net/releases/"
echo "  3. Create GitHub Release and attach the DMG"
echo "  4. Update appcast.xml for Sparkle auto-updates"
echo "=============================================="
echo ""
