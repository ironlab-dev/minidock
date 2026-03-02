#!/bin/bash
# Generate self-signed certificate for HTTPS development
# This allows Web Crypto API to work on LAN access

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Get local IP address
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "192.168.1.2")

echo "🔐 Generating self-signed certificate for MiniDock..."
echo "   Local IP: $LOCAL_IP"

# Generate certificate with SAN (Subject Alternative Name) for IP address
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout server.key \
  -out server.crt \
  -subj "/CN=MiniDock Development" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$LOCAL_IP" \
  2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ Certificate generated successfully!"
    echo "   - Certificate: $SCRIPT_DIR/server.crt"
    echo "   - Private Key: $SCRIPT_DIR/server.key"
    echo ""
    echo "⚠️  To avoid browser warnings, you need to trust this certificate:"
    echo "   macOS: Double-click server.crt, add to Keychain, then mark as 'Always Trust'"
    echo "   Or run: sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain server.crt"
else
    echo "❌ Failed to generate certificate"
    exit 1
fi
