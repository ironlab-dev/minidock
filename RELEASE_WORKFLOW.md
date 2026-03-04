# MiniDock Release Workflow

完整的发布流程文档，涵盖 DMG 构建、GitHub Release、Homebrew、Sparkle 自动更新和 Landing 站点更新。

---

## 📋 发布前检查清单

- [ ] 所有功能已合并到 `master` 分支
- [ ] 所有测试通过（手动验证）
- [ ] `CHANGELOG.md` 已更新
- [ ] `VERSION` 文件已更新到新版本号（如 `0.9.2-beta`）
- [ ] 确认 `.notarize.env` 凭据有效

---

## 🚀 发布流程（完整版）

### Step 1: 构建并发布 DMG

```bash
# 1. 更新版本号
echo "0.9.2-beta" > VERSION

# 2. 提交版本变更
git add VERSION CHANGELOG.md
git commit -m "chore: bump version to 0.9.2-beta"
git push origin master

# 3. 创建 git tag
git tag -a v0.9.2-beta -m "Release v0.9.2-beta"
git push origin v0.9.2-beta

# 4. 构建、签名、公证 DMG（约 5-8 分钟）
./release.sh

# 输出: dist/MiniDock-0.9.2-beta.dmg (已签名+已公证)
```

**验证 DMG**：
```bash
# 检查签名
codesign -dvvv dist/MiniDock-0.9.2-beta.dmg

# 检查公证状态
spctl -a -t open --context context:primary-signature -v dist/MiniDock-0.9.2-beta.dmg
```

---

### Step 2: 创建 GitHub Release

```bash
# 自动创建 Release 并上传 DMG
gh release create v0.9.2-beta \
  dist/MiniDock-0.9.2-beta.dmg \
  --title "v0.9.2-beta - [Release Title]" \
  --notes-file CHANGELOG.md \
  --prerelease  # 如果是 beta 版本
```

**Release Notes 模板**：
```markdown
## MiniDock v0.9.2-beta

### 🎉 What's New
- Feature 1
- Feature 2

### 🐛 Bug Fixes
- Fix 1
- Fix 2

### 📦 Installation
1. Download `MiniDock-0.9.2-beta.dmg`
2. Open the DMG and drag MiniDock to Applications
3. Launch MiniDock from Applications or menu bar
4. Access dashboard at http://localhost:23000

### 📋 Requirements
- macOS 14 (Sonoma) or later
- Apple Silicon or Intel Mac
- 8GB RAM minimum (16GB+ recommended)

### 🔗 Links
- [Documentation](https://github.com/ironlab-dev/minidock#readme)
- [Report Issues](https://github.com/ironlab-dev/minidock/issues)
```

---

### Step 3: 更新 Sparkle Appcast（自动更新）

**创建 `appcast.xml`**（首次）：
```bash
mkdir -p public
cat > public/appcast.xml << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>MiniDock Updates</title>
    <link>https://minidock.net/appcast.xml</link>
    <description>Most recent updates to MiniDock</description>
    <language>en</language>
    <item>
      <title>Version 0.9.2-beta</title>
      <sparkle:releaseNotesLink>https://github.com/ironlab-dev/minidock/releases/tag/v0.9.2-beta</sparkle:releaseNotesLink>
      <pubDate>Tue, 04 Mar 2026 01:30:00 +0000</pubDate>
      <enclosure 
        url="https://github.com/ironlab-dev/minidock/releases/download/v0.9.2-beta/MiniDock-0.9.2-beta.dmg" 
        sparkle:version="0.9.2-beta" 
        sparkle:shortVersionString="0.9.2-beta" 
        length="71234567" 
        type="application/octet-stream" 
        sparkle:edSignature="SIGNATURE_HERE" />
    </item>
  </channel>
</rss>
EOF
```

**更新 appcast.xml**（后续版本）：
```bash
# 1. 获取 DMG 文件大小（bytes）
ls -l dist/MiniDock-0.9.2-beta.dmg | awk '{print $5}'

# 2. 生成 EdDSA 签名（需要 Sparkle 的 generate_keys 工具）
# 首次需要生成密钥对：
# ./Sparkle/bin/generate_keys
# 保存 sparkle_private_key 到安全位置（gitignored）

# 生成签名
./Sparkle/bin/sign_update dist/MiniDock-0.9.2-beta.dmg sparkle_private_key

# 3. 手动编辑 public/appcast.xml，添加新版本到 <channel> 顶部
```

**部署 appcast.xml**：
```bash
# 上传到 minidock.net
rsync -avz public/appcast.xml root@149.28.200.202:/var/www/minidock/
```

---

### Step 4: 更新 Homebrew Cask

**创建 Homebrew Tap**（首次）：
```bash
# 1. 创建 tap repo
gh repo create ironlab-dev/homebrew-minidock --public

# 2. Clone 并创建 Cask 文件
git clone git@github.com-ironlab:ironlab-dev/homebrew-minidock.git
cd homebrew-minidock
mkdir -p Casks
```

**Cask 文件模板** (`Casks/minidock.rb`)：
```ruby
cask "minidock" do
  version "0.9.2-beta"
  sha256 "SHA256_HASH_HERE"

  url "https://github.com/ironlab-dev/minidock/releases/download/v#{version}/MiniDock-#{version}.dmg"
  name "MiniDock"
  desc "Transform your Mac mini into the ultimate home NAS"
  homepage "https://minidock.net"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "MiniDock.app"

  zap trash: [
    "~/Library/Application Support/MiniDock",
    "~/Library/Caches/cc.ironlab.minidock",
    "~/Library/Logs/MiniDock",
    "~/Library/Preferences/cc.ironlab.minidock.plist",
  ]
end
```

**更新 Cask**（后续版本）：
```bash
# 1. 计算 DMG SHA256
shasum -a 256 dist/MiniDock-0.9.2-beta.dmg

# 2. 更新 Casks/minidock.rb
#    - version "0.9.2-beta"
#    - sha256 "新的 SHA256 值"

# 3. 提交并推送
cd homebrew-minidock
git add Casks/minidock.rb
git commit -m "Update minidock to 0.9.2-beta"
git push origin main
```

**用户安装命令**：
```bash
brew install --cask ironlab-dev/minidock/minidock
```

---

### Step 5: 更新 Landing 站点

```bash
# 1. 更新版本号和下载链接
cd private/landing

# 编辑 src/i18n/en.json
# - "versionBadge": "v0.9.2-beta Available for macOS 14+"

# 编辑 src/components/Hero.astro 和 GetStarted.astro
# - href="https://github.com/ironlab-dev/minidock/releases/download/v0.9.2-beta/MiniDock-0.9.2-beta.dmg"

# 2. 构建并部署
npm run build
rsync -avz --delete dist/ root@149.28.200.202:/var/www/minidock/

# 3. 提交到 private repo
git add src
git commit -m "Update landing page for v0.9.2-beta release"
git push
```

---

## 🤖 自动化脚本（推荐）

创建 `scripts/release_all.sh` 一键发布：

```bash
#!/bin/bash
set -euo pipefail

VERSION="$1"
if [[ -z "$VERSION" ]]; then
    echo "Usage: ./scripts/release_all.sh 0.9.2-beta"
    exit 1
fi

echo "🚀 Starting release process for v$VERSION"

# Step 1: Update version
echo "$VERSION" > VERSION
git add VERSION
git commit -m "chore: bump version to $VERSION"
git push origin master

# Step 2: Create tag
git tag -a "v$VERSION" -m "Release v$VERSION"
git push origin "v$VERSION"

# Step 3: Build DMG
./release.sh

# Step 4: Create GitHub Release
gh release create "v$VERSION" \
  "dist/MiniDock-$VERSION.dmg" \
  --title "v$VERSION" \
  --notes "See CHANGELOG.md for details" \
  --prerelease

# Step 5: Update Homebrew Cask
DMG_SHA256=$(shasum -a 256 "dist/MiniDock-$VERSION.dmg" | awk '{print $1}')
echo "📦 Homebrew SHA256: $DMG_SHA256"
echo "   Update homebrew-minidock/Casks/minidock.rb manually"

# Step 6: Update Landing
echo "🌐 Update landing site manually:"
echo "   1. Edit private/landing/src/i18n/en.json"
echo "   2. Edit private/landing/src/components/*.astro"
echo "   3. npm run build && rsync"

echo "✅ Release v$VERSION complete!"
echo "   DMG: https://github.com/ironlab-dev/minidock/releases/tag/v$VERSION"
```

**使用方法**：
```bash
chmod +x scripts/release_all.sh
./scripts/release_all.sh 0.9.2-beta
```

---

## 📝 发布后检查清单

- [ ] GitHub Release 页面正常显示
- [ ] DMG 下载链接有效
- [ ] Landing 站点显示新版本号
- [ ] Landing 站点下载按钮指向正确的 DMG
- [ ] Homebrew Cask 已更新（如果适用）
- [ ] Sparkle appcast.xml 已更新（如果适用）
- [ ] 在干净的 Mac 上测试下载和安装
- [ ] 验证 Gatekeeper 不报错

---

## 🔧 故障排查

### 公证失败

**常见原因**：
1. 未启用 Hardened Runtime
2. 嵌入的二进制文件未签名（如 esbuild）
3. 签名时未使用 `--timestamp`

**解决方案**：
```bash
# 查看公证日志
xcrun notarytool log <submission-id> \
  --key ~/.ssh/AuthKey_XXX.p8 \
  --key-id XXX \
  --issuer XXX

# 重新签名所有二进制
find MiniDock.app -type f -perm +111 -exec codesign --force --options runtime --sign "Developer ID Application" --timestamp {} \;
```

### Staple 失败

**原因**：票据还在 Apple CDN 传播（通常需要 5-30 分钟）

**解决方案**：
```bash
# 等待 30 分钟后重试
sleep 1800
xcrun stapler staple dist/MiniDock-0.9.2-beta.dmg
```

**注意**：Staple 失败不影响使用，用户首次打开时会在线验证。

### Homebrew Cask 审核失败

**常见问题**：
- SHA256 不匹配
- DMG 下载链接 404
- 版本号格式不符合规范

**解决方案**：
```bash
# 本地测试 Cask
brew install --cask --debug Casks/minidock.rb

# 验证 SHA256
brew fetch --cask minidock
```

---

## 📚 相关文档

- [AGENTS.md](AGENTS.md) — 开发脚本 vs 发布脚本
- [release.sh](release.sh) — DMG 构建脚本
- [scripts/notarize.env.example](scripts/notarize.env.example) — 公证凭据模板
- [Sparkle Framework](https://sparkle-project.org/) — 自动更新框架
- [Homebrew Cask](https://docs.brew.sh/Cask-Cookbook) — Cask 编写指南

---

## 🎯 快速参考

| 任务 | 命令 |
|------|------|
| 构建 DMG | `./release.sh` |
| 跳过公证（测试） | `./release.sh --skip-notarize` |
| 创建 Release | `gh release create v0.9.2-beta dist/MiniDock-0.9.2-beta.dmg` |
| 部署 Landing | `cd private/landing && npm run build && rsync -avz --delete dist/ root@149.28.200.202:/var/www/minidock/` |
| 计算 SHA256 | `shasum -a 256 dist/MiniDock-0.9.2-beta.dmg` |
| 查看公证日志 | `xcrun notarytool log <id> --key ... --key-id ... --issuer ...` |

---

**最后更新**: 2026-03-04  
**维护者**: IronLab Team
