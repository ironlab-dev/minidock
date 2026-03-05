#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APPS_ICON_DIR="$PROJECT_DIR/web/public/icons/apps"
VMS_ICON_DIR="$PROJECT_DIR/web/public/icons/vms"

echo "📥 Downloading community icons..."

# Create directories
mkdir -p "$APPS_ICON_DIR"
mkdir -p "$VMS_ICON_DIR"

# Function to download with retry
download_icon() {
    local url="$1"
    local output="$2"
    local max_retries=3
    local retry=0

    while [ $retry -lt $max_retries ]; do
        if curl -L -f -s -o "$output" "$url" 2>/dev/null; then
            echo "   ✓ Downloaded: $(basename "$output")"
            return 0
        fi
        retry=$((retry + 1))
        [ $retry -lt $max_retries ] && sleep 1
    done

    echo "   ✗ Failed: $(basename "$output")"
    return 1
}

# Docker Apps Icons (from homarr-labs/dashboard-icons)
echo ""
echo "🐳 Downloading Docker app icons..."

download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/jellyfin.png" "$APPS_ICON_DIR/jellyfin.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/adguard-home.png" "$APPS_ICON_DIR/adguard-home.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/nextcloud.png" "$APPS_ICON_DIR/nextcloud.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/home-assistant.png" "$APPS_ICON_DIR/home-assistant.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/plex.png" "$APPS_ICON_DIR/plex.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/portainer.png" "$APPS_ICON_DIR/portainer.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/nginx-proxy-manager.png" "$APPS_ICON_DIR/nginx-proxy-manager.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/vaultwarden.png" "$APPS_ICON_DIR/vaultwarden.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/photoprism.png" "$APPS_ICON_DIR/photoprism.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/transmission.png" "$APPS_ICON_DIR/transmission.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/qbittorrent.png" "$APPS_ICON_DIR/qbittorrent.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/sonarr.png" "$APPS_ICON_DIR/sonarr.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/radarr.png" "$APPS_ICON_DIR/radarr.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/prowlarr.png" "$APPS_ICON_DIR/prowlarr.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/overseerr.png" "$APPS_ICON_DIR/overseerr.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/tautulli.png" "$APPS_ICON_DIR/tautulli.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/grafana.png" "$APPS_ICON_DIR/grafana.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/prometheus.png" "$APPS_ICON_DIR/prometheus.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/uptime-kuma.png" "$APPS_ICON_DIR/uptime-kuma.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/traefik.png" "$APPS_ICON_DIR/traefik.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/wireguard.png" "$APPS_ICON_DIR/wireguard.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/pihole.png" "$APPS_ICON_DIR/pihole.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/code-server.png" "$APPS_ICON_DIR/code-server.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/duplicati.png" "$APPS_ICON_DIR/duplicati.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/syncthing.png" "$APPS_ICON_DIR/syncthing.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/filebrowser.png" "$APPS_ICON_DIR/filebrowser.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/gitea.png" "$APPS_ICON_DIR/gitea.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/gitlab.png" "$APPS_ICON_DIR/gitlab.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/jenkins.png" "$APPS_ICON_DIR/jenkins.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/drone.png" "$APPS_ICON_DIR/drone.png"

# VM OS Icons
echo ""
echo "💿 Downloading VM OS icons..."

download_icon "https://assets.ubuntu.com/v1/29985a98-ubuntu-logo32.png" "$VMS_ICON_DIR/ubuntu.png"
download_icon "https://www.debian.org/logos/openlogo-nd-100.png" "$VMS_ICON_DIR/debian.png"
download_icon "https://fedoraproject.org/w/uploads/2/2d/Logo_fedoralogo.png" "$VMS_ICON_DIR/fedora.png"
download_icon "https://www.centos.org/assets/img/logo-centos.png" "$VMS_ICON_DIR/centos.png"
download_icon "https://www.openbsd.org/images/puffy54.gif" "$VMS_ICON_DIR/openbsd.png"

# Windows icon (use a generic one or create SVG)
cat > "$VMS_ICON_DIR/windows.svg" << 'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88">
  <path fill="#00adef" d="M0 12.402l35.687-4.86.016 34.423-35.67.203zm35.67 33.529l.028 34.453L.028 75.48.026 45.7zm4.326-39.025L87.314 0v41.527l-47.318.376zm47.329 39.349l-.011 41.34-47.318-6.678-.066-34.739z"/>
</svg>
EOF

# Additional VM icons
download_icon "https://raw.githubusercontent.com/walkxcode/dashboard-icons/master/svg/alpine-linux.svg" "$VMS_ICON_DIR/alpine-linux.svg"
download_icon "https://raw.githubusercontent.com/walkxcode/dashboard-icons/master/svg/arch-linux.svg" "$VMS_ICON_DIR/arch-linux.svg"
download_icon "https://raw.githubusercontent.com/walkxcode/dashboard-icons/master/svg/nixos.svg" "$VMS_ICON_DIR/nixos.svg"
download_icon "https://raw.githubusercontent.com/walkxcode/dashboard-icons/master/svg/openwrt.svg" "$VMS_ICON_DIR/openwrt.svg"
download_icon "https://raw.githubusercontent.com/walkxcode/dashboard-icons/master/png/tux.png" "$VMS_ICON_DIR/tux.png"
download_icon "https://upload.wikimedia.org/wikipedia/commons/e/e6/Windows_11_logo.svg" "$VMS_ICON_DIR/windows11.svg"

# Additional app icons from different sources
download_icon "https://raw.githubusercontent.com/selfhst/icons/main/png/aria2.png" "$APPS_ICON_DIR/aria2.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/homebridge.png" "$APPS_ICON_DIR/homebridge.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/node-red.png" "$APPS_ICON_DIR/node-red.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/wikijs.png" "$APPS_ICON_DIR/wikijs.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/redis.png" "$APPS_ICON_DIR/redis.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/dozzle.png" "$APPS_ICON_DIR/dozzle.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/glances.png" "$APPS_ICON_DIR/glances.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/pi-hole.png" "$APPS_ICON_DIR/pi-hole.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/immich.png" "$APPS_ICON_DIR/immich.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/trilium.png" "$APPS_ICON_DIR/trilium.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/stirling-pdf.png" "$APPS_ICON_DIR/stirling-pdf.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/ghost.png" "$APPS_ICON_DIR/ghost.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/wordpress.png" "$APPS_ICON_DIR/wordpress.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/audiobookshelf.png" "$APPS_ICON_DIR/audiobookshelf.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/mealie.png" "$APPS_ICON_DIR/mealie.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/kavita.png" "$APPS_ICON_DIR/kavita.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/alist.png" "$APPS_ICON_DIR/alist.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/caddy.png" "$APPS_ICON_DIR/caddy.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/freshrss.png" "$APPS_ICON_DIR/freshrss.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/homarr.png" "$APPS_ICON_DIR/homarr.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/homebox.png" "$APPS_ICON_DIR/homebox.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/homer.png" "$APPS_ICON_DIR/homer.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/it-tools.png" "$APPS_ICON_DIR/it-tools.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/memos.png" "$APPS_ICON_DIR/memos.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/sun-panel.png" "$APPS_ICON_DIR/sun-panel.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/umami.png" "$APPS_ICON_DIR/umami.png"
download_icon "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/wallabag.png" "$APPS_ICON_DIR/wallabag.png"

echo ""
echo "✅ Icon download complete!"
echo "   Apps icons: $APPS_ICON_DIR"
echo "   VMs icons: $VMS_ICON_DIR"
