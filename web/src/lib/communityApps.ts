export interface CommunityApp {
  id: string;
  name: string;
  category: 'media' | 'tools' | 'network' | 'productivity' | 'smart_home' | 'other';
  description: string;
  icon: string;
  website: string;
  compose: string;
  architectures: ('arm64' | 'amd64')[];
  primaryImage: string;
  currentVersion?: string;
  lastVerified?: string;
}

export const communityApps: CommunityApp[] = [
  {
    id: 'jellyfin',
    name: 'Jellyfin',
    category: 'media',
    description: 'Jellyfin 是一款自由软件媒体系统，可让您控制媒体的管理和流式传输。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/jellyfin.png',
    website: 'https://jellyfin.org/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'jellyfin/jellyfin:latest',
    currentVersion: '10.9.11',
    lastVerified: '2025-01-14',
    compose: `version: "3.8"
services:
  jellyfin:
    image: jellyfin/jellyfin:latest
    container_name: jellyfin
    network_mode: 'bridge'
    ports:
      - '8096:8096'
    volumes:
      - ./config:/config
      - ./cache:/cache
      - ./media:/media
    restart: 'unless-stopped'`
  },
  {
    id: 'adguard-home',
    name: 'AdGuard Home',
    category: 'network',
    description: 'AdGuard Home 是一款全网范围内的广告和跟踪器拦截软件。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/adguard-home.png',
    website: 'https://adguard.com/adguard-home.html',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'adguard/adguardhome',
    currentVersion: 'v0.107.52',
    lastVerified: '2025-01-14',
    compose: `version: "3.8"
services:
  adguardhome:
    image: adguard/adguardhome
    container_name: adguardhome
    ports:
      - '53:53/tcp'
      - '53:53/udp'
      - '80:80/tcp'
      - '443:443/tcp'
      - '443:443/udp'
      - '3000:3000/tcp'
    volumes:
      - ./work:/opt/adguardhome/work
      - ./conf:/opt/adguardhome/conf
    restart: unless-stopped`
  },
  {
    id: 'vaultwarden',
    name: 'Vaultwarden',
    category: 'network',
    description: 'Vaultwarden 是一个使用 Rust 编写的 Bitwarden 服务器 API 实现，轻量且安全。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/vaultwarden.png',
    website: 'https://github.com/dani-garcia/vaultwarden',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'vaultwarden/server:latest',
    compose: `version: "3.8"
services:
  vaultwarden:
    image: vaultwarden/server:latest
    container_name: vaultwarden
    restart: always
    environment:
      - SIGNUPS_ALLOWED=true
    volumes:
      - ./data:/data
    ports:
      - "8080:80"`
  },
  {
    id: 'nextcloud',
    name: 'Nextcloud',
    category: 'productivity',
    description: 'Nextcloud 是一款开源的自托管内容协作平台。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/nextcloud.png',
    website: 'https://nextcloud.com/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'nextcloud:latest',
    compose: `version: "3.8"
services:
  nextcloud:
    image: nextcloud:latest
    container_name: nextcloud
    ports:
      - '8081:80'
    volumes:
      - ./data:/var/www/html
    restart: unless-stopped`
  },
  {
    id: 'qbittorrent',
    name: 'qBittorrent',
    category: 'tools',
    description: 'qBittorrent 是一个跨平台的开源 BitTorrent 客户端。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/qbittorrent.png',
    website: 'https://www.qbittorrent.org/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'linuxserver/qbittorrent:latest',
    compose: `version: "3.8"
services:
  qbittorrent:
    image: linuxserver/qbittorrent:latest
    container_name: qbittorrent
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Asia/Shanghai
    volumes:
      - ./config:/config
      - ./downloads:/downloads
    ports:
      - '8082:8080'
      - '6881:6881'
      - '6881:6881/udp'
    restart: unless-stopped`
  },
  {
    id: 'transmission',
    name: 'Transmission',
    category: 'tools',
    description: 'Transmission 是一款快速、简便且免费的 BitTorrent 客户端。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/transmission.png',
    website: 'https://transmissionbt.com/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'linuxserver/transmission:latest',
    compose: `version: "3.8"
services:
  transmission:
    image: linuxserver/transmission:latest
    container_name: transmission
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Asia/Shanghai
    volumes:
      - ./config:/config
      - ./downloads:/downloads
      - ./watch:/watch
    ports:
      - '9091:9091'
      - '51413:51413'
      - '51413:51413/udp'
    restart: unless-stopped`
  },
  {
    id: 'home-assistant',
    name: 'Home Assistant',
    category: 'smart_home',
    description: 'Home Assistant 是一款开源的家庭自动化协作平台，支持数千种设备。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/home-assistant.png',
    website: 'https://www.home-assistant.io/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'ghcr.io/home-assistant/home-assistant:stable',
    compose: `version: "3.8"
services:
  homeassistant:
    image: ghcr.io/home-assistant/home-assistant:stable
    container_name: homeassistant
    volumes:
      - ./config:/config
      - /etc/localtime:/etc/localtime:ro
    network_mode: host
    restart: unless-stopped`
  },
  {
    id: 'homebridge',
    name: 'Homebridge',
    category: 'smart_home',
    description: 'Homebridge 让您可以将不支持 HomeKit 的智能家居设备桥接到 Apple HomeKit。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/homebridge.png',
    website: 'https://homebridge.io/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'homebridge/homebridge:latest',
    compose: `version: "3.8"
services:
  homebridge:
    image: homebridge/homebridge:latest
    container_name: homebridge
    network_mode: host
    volumes:
      - ./config:/homebridge
    restart: always`
  },
  {
    id: 'uptime-kuma',
    name: 'Uptime Kuma',
    category: 'tools',
    description: 'Uptime Kuma 是一个易于使用的自托管监控工具，界面精美。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/uptime-kuma.png',
    website: 'https://github.com/louislam/uptime-kuma',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'louislam/uptime-kuma:1',
    compose: `version: "3.8"
services:
  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: uptime-kuma
    volumes:
      - ./data:/app/data
    ports:
      - '3001:3001'
    restart: unless-stopped`
  },
  {
    id: 'aria2-pro',
    name: 'Aria2 Pro',
    category: 'tools',
    description: 'Aria2 Pro 是一个功能强大的离线下载利器，支持多种协议。',
    icon: 'https://raw.githubusercontent.com/selfhst/icons/main/png/aria2.png',
    website: 'https://github.com/P3TERX/aria2-pro-docker',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'p3terx/aria2-pro',
    compose: `version: "3.8"
services:
  aria2-pro:
    image: p3terx/aria2-pro
    container_name: aria2-pro
    environment:
      - RPC_SECRET=mypassword
      - RPC_PORT=6800
      - LISTEN_PORT=6888
    volumes:
      - ./config:/config
      - ./downloads:/downloads
    ports:
      - "6800:6800"
      - "6888:6888"
      - "6888:6888/udp"
    restart: unless-stopped`
  },
  {
    id: 'plex',
    name: 'Plex',
    category: 'media',
    description: 'Plex 整理您的所有视频、音乐和照片集，并让您在所有设备上流式传输它们。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/plex.png',
    website: 'https://www.plex.tv/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'linuxserver/plex:latest',
    compose: `version: "3.8"
services:
  plex:
    image: linuxserver/plex:latest
    container_name: plex
    network_mode: host
    environment:
      - PUID=1000
      - PGID=1000
      - VERSION=docker
    volumes:
      - ./config:/config
      - ./tv:/data/tvshows
      - ./movies:/data/movies
    restart: unless-stopped`
  },
  {
    id: 'node-red',
    name: 'Node-RED',
    category: 'smart_home',
    description: '基于流的低代码编程工具，用于事件驱动型应用程序。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/node-red.png',
    website: 'https://nodered.org/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'nodered/node-red:latest',
    compose: `version: "3.8"
services:
  nodered:
    image: nodered/node-red:latest
    container_name: nodered
    environment:
      - TZ=Asia/Shanghai
    ports:
      - "1880:1880"
    volumes:
      - ./data:/data
    restart: unless-stopped`
  },
  {
    id: 'wiki-js',
    name: 'Wiki.js',
    category: 'productivity',
    description: '极其强大且可高度自定义的开源 Wiki 平台。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/wikijs.png',
    website: 'https://js.wiki/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'requarks/wiki:2',
    compose: `version: "3.8"
services:
  wikijs:
    image: requarks/wiki:2
    container_name: wikijs
    environment:
      - DB_TYPE=sqlite
    ports:
      - "3002:3000"
    volumes:
      - ./data:/wiki/data
      - ./config:/wiki/config
    restart: unless-stopped`
  },
  {
    id: 'redis',
    name: 'Redis',
    category: 'other',
    description: '高性能的内存数据库，可用作数据库、缓存和消息中间件。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/redis.png',
    website: 'https://redis.io/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'redis:alpine',
    compose: `version: "3.8"
services:
  redis:
    image: redis:alpine
    container_name: redis
    ports:
      - "6379:6379"
    volumes:
      - ./data:/data
    restart: unless-stopped`
  },
  {
    id: 'dozzle',
    name: 'Dozzle',
    category: 'tools',
    description: 'Dozzle 是一个简单的 Web 界面，用于实时监控 Docker 容器日志。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/dozzle.png',
    website: 'https://dozzle.dev/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'amir20/dozzle:latest',
    compose: `version: "3.8"
services:
  dozzle:
    image: amir20/dozzle:latest
    container_name: dozzle
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    ports:
      - "8888:8080"
    restart: unless-stopped`
  },
  {
    id: 'glances',
    name: 'Glances',
    category: 'tools',
    description: 'Glances 是一个跨平台的系统监控工具，支持多种监控模式。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/glances.png',
    website: 'https://nicolargo.github.io/glances/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'nicolargo/glances:latest',
    compose: `version: "3.8"
services:
  glances:
    image: nicolargo/glances:latest
    container_name: glances
    environment:
      - GLANCES_OPT=-w
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    ports:
      - "61208:61208"
    restart: unless-stopped`
  },
  {
    id: 'nginx-proxy-manager',
    name: 'Nginx Proxy Manager',
    category: 'network',
    description: '轻松管理 Nginx 代理主机，支持 SSL (Let\'s Encrypt) 的精美 UI。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/nginx-proxy-manager.png',
    website: 'https://nginxproxymanager.com/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'jc21/nginx-proxy-manager:latest',
    compose: `version: "3.8"
services:
  app:
    image: 'jc21/nginx-proxy-manager:latest'
    container_name: npm-app
    restart: unless-stopped
    ports:
      - '80:80'
      - '81:81'
      - '443:443'
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt`
  },
  {
    id: 'pi-hole',
    name: 'Pi-hole',
    category: 'network',
    description: '全网范围内的广告拦截器，通过 DNS 层面保护您的设备。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/pi-hole.png',
    website: 'https://pi-hole.net/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'pihole/pihole:latest',
    compose: `version: "3"
services:
  pihole:
    container_name: pihole
    image: pihole/pihole:latest
    ports:
      - "53:53/tcp"
      - "53:53/udp"
      - "67:67/udp"
      - "8085:80"
    environment:
      TZ: 'Asia/Shanghai'
      WEBPASSWORD: '<CHANGE_ME>'
    volumes:
      - './etc-pihole:/etc/pihole'
      - './etc-dnsmasq.d:/etc/dnsmasq.d'
    restart: unless-stopped`
  },
  {
    id: 'photoprism',
    name: 'PhotoPrism',
    category: 'media',
    description: '由 AI 驱动的人脸识别和照片管理平台。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/photoprism.png',
    website: 'https://photoprism.app/',
    architectures: ['amd64', 'arm64'],
    primaryImage: 'photoprism/photoprism:latest',
    compose: `version: '3.5'
services:
  photoprism:
    image: photoprism/photoprism:latest
    container_name: photoprism
    restart: unless-stopped
    ports:
      - "2342:2342"
    environment:
      PHOTOPRISM_AUTH_MODE: "password"
      PHOTOPRISM_ADMIN_PASSWORD: "<YOUR_STRONG_PASSWORD>"  # SECURITY: Set a strong password before deployment
    volumes:
      - "./photos:/photoprism/originals"
      - "./storage:/photoprism/storage"`
  },
  {
    id: 'immich',
    name: 'Immich',
    category: 'media',
    description: '高性能自托管照片和视频备份解决方案。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/immich.png',
    website: 'https://immich.app/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'ghcr.io/immich-app/immich-server:release',
    compose: `version: "3.8"
services:
  immich-server:
    container_name: immich_server
    image: ghcr.io/immich-app/immich-server:release
    volumes:
      - ./upload:/usr/src/app/upload
    environment:
      - DB_HOSTNAME=immich_postgres
      - DB_USERNAME=postgres
      - DB_PASSWORD=postgres
      - DB_DATABASE_NAME=immich
    ports:
      - 2283:3001
    restart: always`
  },
  {
    id: 'trilium',
    name: 'Trilium Notes',
    category: 'productivity',
    description: '分层级结构的个人知识库，支持深度自建和脚本。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/trilium.png',
    website: 'https://github.com/zadam/trilium',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'zadam/trilium:latest',
    compose: `version: "3.8"
services:
  trilium:
    image: zadam/trilium:latest
    container_name: trilium
    restart: unless-stopped
    ports:
      - "8086:8080"
    volumes:
      - ./data:/home/node/trilium-data`
  },
  {
    id: 'stirling-pdf',
    name: 'Stirling-PDF',
    category: 'tools',
    description: '强大的本地托管 Web 应用程序，允许您对 PDF 文件执行各种操作。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/stirling-pdf.png',
    website: 'https://github.com/Stirling-Tools/Stirling-PDF',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'stirlingtools/stirling-pdf:latest',
    compose: `version: "3.8"
services:
  stirling-pdf:
    image: stirlingtools/stirling-pdf:latest
    container_name: stirling-pdf
    ports:
      - '8080:8080'
    environment:
      - DOCKER_ENABLE_SECURITY=false
    volumes:
      - ./trainingData:/usr/share/tessdata
      - ./extraConfigs:/configs
      - ./logs:/logs
    restart: unless-stopped`
  },
  {
    id: 'ghost',
    name: 'Ghost',
    category: 'productivity',
    description: '专业的开源内容发布平台，适用于现代出版商。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/ghost.png',
    website: 'https://ghost.org/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'ghost:latest',
    compose: `version: "3.8"
services:
  ghost:
    image: ghost:latest
    container_name: ghost
    restart: always
    ports:
      - "2368:2368"
    environment:
      - url=http://localhost:2368
      - NODE_ENV=development
    volumes:
      - ./content:/var/lib/ghost/content`
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    category: 'productivity',
    description: 'WordPress 是一个开源的内容管理系统，可用于创建精美的网站、博客或应用。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/wordpress.png',
    website: 'https://wordpress.org/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'wordpress:latest',
    compose: `version: "3.8"
services:
  db:
    image: mariadb:10.6
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: examplepassword
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: wordpresspassword
  wordpress:
    depends_on:
      - db
    image: wordpress:latest
    restart: always
    ports:
      - "8087:80"
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: wordpresspassword
      WORDPRESS_DB_NAME: wordpress
    volumes:
      - ./html:/var/www/html`
  },
  {
    id: 'audiobookshelf',
    name: 'Audiobookshelf',
    category: 'media',
    description: '自托管的有声读物和播客服务器。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/audiobookshelf.png',
    website: 'https://www.audiobookshelf.org/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'advplyr/audiobookshelf:latest',
    compose: `version: "3.8"
services:
  audiobookshelf:
    image: advplyr/audiobookshelf:latest
    container_name: audiobookshelf
    ports:
      - '13378:80'
    volumes:
      - ./audiobooks:/audiobooks
      - ./podcasts:/podcasts
      - ./config:/config
      - ./metadata:/metadata
    restart: unless-stopped`
  },
  {
    id: 'mealie',
    name: 'Mealie',
    category: 'productivity',
    description: '自托管的食谱管理和膳食计划工具。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/mealie.png',
    website: 'https://mealie.io/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'hkotel/mealie:latest',
    compose: `version: "3.8"
services:
  mealie:
    image: hkotel/mealie:latest
    container_name: mealie
    ports:
      - "9925:80"
    volumes:
      - ./data:/app/data
    restart: always`
  },
  {
    id: 'kavita',
    name: 'Kavita',
    category: 'media',
    description: '功能强大、反应迅速且跨平台的阅读服务器。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/kavita.png',
    website: 'https://www.kavitareader.com/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'kavitareader/kavita:latest',
    compose: `version: "3.8"
services:
  kavita:
    image: kavitareader/kavita:latest
    container_name: kavita
    volumes:
      - ./manga:/manga
      - ./comics:/comics
      - ./books:/books
      - ./config:/kavita/config
    ports:
      - "5000:5000"
    restart: unless-stopped`
  },
  {
    id: 'grafana',
    name: 'Grafana',
    category: 'tools',
    description: '全球领先的开源查询、可视化与监控平台。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/grafana.png',
    website: 'https://grafana.com/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'grafana/grafana:latest',
    compose: `version: "3.8"
services:
  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - "3003:3000"
    volumes:
      - ./data:/var/lib/grafana
    restart: unless-stopped`
  },
  {
    id: 'prometheus',
    name: 'Prometheus',
    category: 'tools',
    description: '开源系统监控和报警工具包。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/prometheus.png',
    website: 'https://prometheus.io/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'prom/prometheus:latest',
    compose: `version: "3.8"
services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./config:/etc/prometheus
      - ./data:/prometheus
    restart: unless-stopped`
  },
  {
    id: 'homer',
    name: 'Homer',
    category: 'other',
    description: '一个简单的静态首页，用于托管您的服务导航。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/homer.png',
    website: 'https://github.com/b4bz/homer',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'b4bz/homer:latest',
    compose: `version: "3.8"
services:
  homer:
    image: b4bz/homer:latest
    container_name: homer
    volumes:
      - ./assets:/www/assets
    ports:
      - "8089:8080"
    restart: unless-stopped`
  },
  {
    id: 'freshrss',
    name: 'FreshRSS',
    category: 'productivity',
    description: '一个自托管的 RSS 订阅源聚合器。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/freshrss.png',
    website: 'https://freshrss.org/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'freshrss/freshrss:latest',
    compose: `version: "3.8"
services:
  freshrss:
    image: freshrss/freshrss:latest
    container_name: freshrss
    restart: unless-stopped
    ports:
      - "8088:80"
    environment:
      - TZ=Asia/Shanghai
    volumes:
      - ./data:/var/www/FreshRSS/data`
  },
  {
    id: 'wallabag',
    name: 'Wallabag',
    category: 'productivity',
    description: 'Wallabag 是一款开源的“稍后阅读”应用程序。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/wallabag.png',
    website: 'https://wallabag.org/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'wallabag/wallabag:latest',
    compose: `version: "3.8"
services:
  wallabag:
    image: wallabag/wallabag:latest
    container_name: wallabag
    ports:
      - "8090:80"
    environment:
      - SYMFONY__ENV__DATABASE_DRIVER=pdo_sqlite
    volumes:
      - ./images:/var/www/wallabag/web/assets/images
    restart: unless-stopped`
  },
  {
    id: 'homebox',
    name: 'Homebox',
    category: 'other',
    description: '专为现代家庭设计的库存管理系统。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/homebox.png',
    website: 'https://github.com/sysadminsmedia/homebox',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'ghcr.io/sysadminsmedia/homebox:latest',
    compose: `version: "3.8"
services:
  homebox:
    image: ghcr.io/sysadminsmedia/homebox:latest
    container_name: homebox
    restart: always
    environment:
      - HBOX_MODE=production
    ports:
      - "7745:7745"
    volumes:
      - ./data:/data`
  },
  {
    id: 'memos',
    name: 'Memos',
    category: 'productivity',
    description: '一个开源、自托管的备忘录中心，具有隐私优先的特点。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/memos.png',
    website: 'https://usememos.com/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'neosmemo/memos:latest',
    compose: `version: "3.8"
services:
  memos:
    image: neosmemo/memos:latest
    container_name: memos
    ports:
      - "5230:5230"
    volumes:
      - ./data:/var/opt/memos
    restart: always`
  },
  {
    id: 'umami',
    name: 'Umami',
    category: 'tools',
    description: 'Umami 是一个开源、注重隐私且可自托管的 Google Analytics 替代方案。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/umami.png',
    website: 'https://umami.is/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'ghcr.io/umami-software/umami:postgresql-latest',
    compose: `version: "3.8"
services:
  umami:
    image: ghcr.io/umami-software/umami:postgresql-latest
    container_name: umami
    ports:
      - "3004:3000"
    environment:
      - DATABASE_URL=postgresql://username:password@localhost:5432/databasename
      - APP_SECRET=replace-me-with-a-random-string
    restart: always`
  },
  {
    id: 'filebrowser',
    name: 'FileBrowser',
    category: 'tools',
    description: '一个轻量级的 Web 文件管理器。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/filebrowser.png',
    website: 'https://filebrowser.org/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'filebrowser/filebrowser:latest',
    compose: `version: "3.8"
services:
  filebrowser:
    image: filebrowser/filebrowser:latest
    container_name: filebrowser
    ports:
      - "8091:80"
    volumes:
      - ./data:/srv
      - ./config:/config
    restart: always`
  },
  {
    id: 'sun-panel',
    name: 'Sun-Panel',
    category: 'other',
    description: 'Sun-Panel 是一款精美的自托管静态首页、导航页，支持多种布局和自定义设置。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/sun-panel.png',
    website: 'https://github.com/hslr-s/sun-panel',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'hslr/sun-panel:latest',
    compose: `version: "3.8"
services:
  sun-panel:
    image: hslr/sun-panel:latest
    container_name: sun-panel
    ports:
      - "3008:3002"
    volumes:
      - ./conf:/app/conf
      - ./uploads:/app/uploads
      - ./database:/app/database
    restart: unless-stopped`
  },
  {
    id: 'sui2',
    name: 'SUI2',
    category: 'other',
    description: 'SUI2 是一个由 reorx 开发的极简且功能强大的服务器首页/新标签页。',
    icon: 'https://raw.githubusercontent.com/reorx/sui2/master/public/icon-512.png',
    website: 'https://github.com/reorx/sui2',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'reorx/sui2:latest',
    compose: `version: "3.8"
services:
  sui2:
    image: reorx/sui2:latest
    container_name: sui2
    ports:
      - "3007:3000"
    volumes:
      - ./data:/data
    restart: unless-stopped`
  },
  {
    id: 'alist',
    name: 'AList',
    category: 'tools',
    description: 'AList 是一款支持多种存储的文件列表程序，具有精美的 UI 和强大的功能。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/alist.png',
    website: 'https://alist.nn.ci/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'xhofe/alist:latest',
    compose: `version: "3.8"
services:
  alist:
    image: xhofe/alist:latest
    container_name: alist
    volumes:
      - ./data:/opt/alist/data
    ports:
      - "5244:5244"
    environment:
      - PUID=0
      - PGID=0
      - UMASK=022
    restart: unless-stopped`
  },
  {
    id: 'it-tools',
    name: 'IT-Tools',
    category: 'tools',
    description: '为开发人员提供的在线工具集合，具有简洁直观的界面。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/it-tools.png',
    website: 'https://it-tools.tech/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'corentinth/it-tools:latest',
    compose: `version: "3.8"
services:
  it-tools:
    image: corentinth/it-tools:latest
    container_name: it-tools
    restart: unless-stopped
    ports:
      - "8083:80"`
  },
  {
    id: 'homarr',
    name: 'Homarr',
    category: 'other',
    description: '一个现代、时尚的仪表板，可帮助您管理和访问所有内网服务。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/homarr.png',
    website: 'https://homarr.dev/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'ghcr.io/homarr-labs/homarr:latest',
    compose: `version: "3"
services:
  homarr:
    container_name: homarr
    image: ghcr.io/homarr-labs/homarr:latest
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./configs:/app/data/configs
      - ./icons:/app/public/icons
      - ./data:/data
    ports:
      - "7575:7575"`
  },
  {
    id: 'caddy',
    name: 'Caddy',
    category: 'network',
    description: 'Caddy 是一款功能强大的 Web 服务器，支持自动 HTTPS，配置极其简单。',
    icon: 'https://raw.githubusercontent.com/homarr-labs/dashboard-icons/master/png/caddy.png',
    website: 'https://caddyserver.com/',
    architectures: ['arm64', 'amd64'],
    primaryImage: 'caddy:latest',
    compose: `version: "3.8"
services:
  caddy:
    image: caddy:latest
    container_name: caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - ./data:/data
      - ./config:/config`
  }
];
