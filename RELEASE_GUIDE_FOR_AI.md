# 🚀 MiniDock 发布指南（AI 专用）

**目标读者**: 未来的 AI Agent  
**用途**: 快速理解并执行 MiniDock 的完整发布流程  
**前置条件**: 用户已确认要发布新版本

---

## 📍 当前状态快照（2026-03-04）

### 已完成的基础设施
- ✅ **DMG 构建脚本**: `./release.sh` — 自动签名+公证+Staple
- ✅ **公证凭据**: `.notarize.env` — App Store Connect API Key（gitignored）
- ✅ **GitHub Release**: v0.9.1-beta 已发布
- ✅ **Landing 站点**: https://minidock.net — 已部署，指向 v0.9.1-beta DMG
- ✅ **SSH 配置**: `~/.ssh/config` 已配置 `github.com-ironlab` host（使用 `id_ironlab` 密钥）
- ✅ **Git Remote**: 主仓库使用 `git@github.com-ironlab:ironlab-dev/minidock.git`

### 待完成的功能（可选）
- ⏳ **Homebrew Cask**: 未创建 tap，文档已提供模板
- ⏳ **Sparkle 自动更新**: 未集成，文档已提供流程

---

## 🎯 发布流程（标准版）

用户说"发布新版本"或"release 0.9.2-beta"时，按以下步骤执行：

### Step 0: 确认发布意图

**必须问用户**：
1. 新版本号是什么？（如 `0.9.2-beta`）
2. 是否需要更新 CHANGELOG.md？
3. 是否需要同步更新 Homebrew Cask？（如果已创建）
4. 是否需要更新 Sparkle appcast.xml？（如果已集成）

---

### Step 1: 更新版本号并提交

```bash
# 1. 更新 VERSION 文件
echo "0.9.2-beta" > /Users/jacks/code/minidock/VERSION

# 2. 提交版本变更
cd /Users/jacks/code/minidock
git add VERSION
# 如果用户要求更新 CHANGELOG，也一起 add
git commit -m "chore: bump version to 0.9.2-beta"
git push origin master

# 3. 创建并推送 tag
git tag -a v0.9.2-beta -m "Release v0.9.2-beta"
git push origin v0.9.2-beta
```

**关键点**：
- VERSION 文件只包含版本号，无其他内容
- Tag 格式必须是 `v{VERSION}`（如 `v0.9.2-beta`）
- 必须先推送 master，再推送 tag

---

### Step 2: 构建并公证 DMG

```bash
cd /Users/jacks/code/minidock
./release.sh
```

**预期输出**：
- `dist/MiniDock-0.9.2-beta.dmg` — 已签名+已公证
- 耗时约 5-8 分钟（公证需要等待 Apple 服务器）

**如果失败**：
1. 查看错误日志：`cat dist/notarize.log`
2. 常见问题：
   - 公证失败 → 检查 `.notarize.env` 凭据是否有效
   - 签名失败 → 检查 Developer ID 证书是否过期
   - Staple 失败 → 不影响使用，可忽略（票据在 CDN 传播中）

---

### Step 3: 创建 GitHub Release

```bash
cd /Users/jacks/code/minidock

# 自动创建 Release 并上传 DMG
gh release create v0.9.2-beta \
  dist/MiniDock-0.9.2-beta.dmg \
  --title "v0.9.2-beta - [用户提供的标题]" \
  --notes "[用户提供的 Release Notes 或从 CHANGELOG.md 提取]" \
  --prerelease  # 如果是 beta/alpha 版本
```

**Release Notes 模板**（如果用户未提供）：
```markdown
## MiniDock v0.9.2-beta

### 🎉 What's New
- [从 CHANGELOG.md 提取或询问用户]

### 📦 Installation
1. Download `MiniDock-0.9.2-beta.dmg`
2. Open the DMG and drag MiniDock to Applications
3. Launch MiniDock from menu bar
4. Access dashboard at http://localhost:23000

### 📋 Requirements
- macOS 14 (Sonoma) or later
- Apple Silicon or Intel Mac (Apple Silicon recommended)
- 8GB RAM minimum (16GB+ recommended)
```

**验证**：
- 访问 `https://github.com/ironlab-dev/minidock/releases/tag/v0.9.2-beta`
- 确认 DMG 下载链接有效

---

### Step 4: 更新 Landing 站点

```bash
# 1. 更新版本号和下载链接
cd /Users/jacks/code/minidock/private/landing

# 编辑 3 个文件（使用 edit 工具）：
# - src/i18n/en.json: "versionBadge": "v0.9.2-beta Available for macOS 14+"
# - src/components/Hero.astro: href="https://github.com/ironlab-dev/minidock/releases/download/v0.9.2-beta/MiniDock-0.9.2-beta.dmg"
# - src/components/GetStarted.astro: href="https://github.com/ironlab-dev/minidock/releases/download/v0.9.2-beta/MiniDock-0.9.2-beta.dmg"

# 2. 构建
npm run build

# 3. 部署到生产服务器
rsync -avz --delete dist/ root@149.28.200.202:/var/www/minidock/

# 4. 提交到 private repo（本地提交即可，remote 推送可选）
git add src
git commit -m "Update landing page for v0.9.2-beta release"
# git push 可能失败（权限问题），不影响部署
```

**验证**：
- 访问 `https://minidock.net`
- 确认版本号显示为 `v0.9.2-beta`
- 点击下载按钮，确认跳转到正确的 GitHub Release DMG

---

### Step 5: 更新 Homebrew Cask（如果已创建）

**检查是否已创建 Homebrew Tap**：
```bash
gh repo view ironlab-dev/homebrew-minidock 2>/dev/null && echo "Tap exists" || echo "Tap not created"
```

**如果 Tap 存在**：
```bash
# 1. Clone tap repo
git clone git@github.com-ironlab:ironlab-dev/homebrew-minidock.git /tmp/homebrew-minidock
cd /tmp/homebrew-minidock

# 2. 计算 DMG SHA256
DMG_SHA256=$(shasum -a 256 /Users/jacks/code/minidock/dist/MiniDock-0.9.2-beta.dmg | awk '{print $1}')

# 3. 更新 Casks/minidock.rb（使用 edit 工具）
# - version "0.9.2-beta"
# - sha256 "$DMG_SHA256"

# 4. 提交并推送
git add Casks/minidock.rb
git commit -m "Update minidock to 0.9.2-beta"
git push origin main
```

**如果 Tap 不存在**：
- 告诉用户："Homebrew Cask 尚未创建，是否需要现在创建？"
- 如果用户同意，按照 `RELEASE_WORKFLOW.md` 的 Step 4 创建

---

### Step 6: 更新 Sparkle Appcast（如果已集成）

**检查是否已集成 Sparkle**：
```bash
ls /Users/jacks/code/minidock/public/appcast.xml 2>/dev/null && echo "Appcast exists" || echo "Appcast not created"
```

**如果 appcast.xml 存在**：
```bash
# 1. 获取 DMG 文件大小（bytes）
DMG_SIZE=$(ls -l /Users/jacks/code/minidock/dist/MiniDock-0.9.2-beta.dmg | awk '{print $5}')

# 2. 生成 EdDSA 签名（需要 Sparkle 工具）
# 如果 sparkle_private_key 不存在，告诉用户需要先生成密钥对
SIGNATURE=$(./Sparkle/bin/sign_update /Users/jacks/code/minidock/dist/MiniDock-0.9.2-beta.dmg sparkle_private_key)

# 3. 更新 public/appcast.xml（在 <channel> 顶部添加新 <item>）
# 使用 edit 工具插入新版本条目

# 4. 部署到生产服务器
rsync -avz /Users/jacks/code/minidock/public/appcast.xml root@149.28.200.202:/var/www/minidock/
```

**如果 appcast.xml 不存在**：
- 告诉用户："Sparkle 自动更新尚未集成，是否需要现在配置？"
- 如果用户同意，按照 `RELEASE_WORKFLOW.md` 的 Step 3 配置

---

## ✅ 发布完成检查清单

执行完上述步骤后，向用户报告：

```
✅ MiniDock v0.9.2-beta 发布完成！

📦 GitHub Release: https://github.com/ironlab-dev/minidock/releases/tag/v0.9.2-beta
🌐 Landing 站点: https://minidock.net (已更新)
🍺 Homebrew: [已更新 / 未创建]
⚡ Sparkle: [已更新 / 未集成]

下一步：
1. 在干净的 Mac 上测试下载和安装
2. 验证 Gatekeeper 不报错
3. 如需回滚，运行：gh release delete v0.9.2-beta
```

---

## 🚨 常见问题处理

### 问题 1: 公证失败（Invalid status）

**症状**：`xcrun notarytool submit` 返回 `status: Invalid`

**排查**：
```bash
# 查看详细日志
xcrun notarytool log <submission-id> \
  --key /Users/jacks/Downloads/AuthKey_4J65M5V964.p8 \
  --key-id 4J65M5V964 \
  --issuer 54e41e8b-e197-4c92-86ba-73f675a36a59
```

**常见原因**：
1. 嵌入的二进制文件未签名（如 `node_modules/@esbuild/darwin-arm64/bin/esbuild`）
2. 未启用 Hardened Runtime
3. 签名时未使用 `--timestamp`

**解决方案**：
- `release.sh` 已处理这些问题，如果仍失败，检查是否有新的可执行文件未被签名
- 手动查找并签名：
  ```bash
  find MiniDock.app -type f -perm +111 -exec file {} \; | grep "Mach-O.*executable"
  # 对每个文件执行：
  codesign --force --options runtime --sign "Developer ID Application: Jacks Gong (SE3B3RM5Y4)" --timestamp <file>
  ```

---

### 问题 2: Staple 失败（Error 65）

**症状**：`xcrun stapler staple` 返回 `Error 65: Record not found`

**原因**：公证票据还在 Apple CDN 传播（通常需要 5-30 分钟）

**解决方案**：
1. **不影响使用** — 用户首次打开时会在线验证，无需 staple
2. 如果需要 staple（离线安装场景），等待 30 分钟后重试：
   ```bash
   sleep 1800
   xcrun stapler staple dist/MiniDock-0.9.2-beta.dmg
   # 成功后重新上传到 GitHub Release（替换现有 DMG）
   ```

---

### 问题 3: GitHub Release 创建失败（Repository is empty）

**原因**：仓库为空或 tag 未推送

**解决方案**：
```bash
# 确认 tag 已推送
git ls-remote --tags origin | grep v0.9.2-beta

# 如果未推送，重新推送
git push origin v0.9.2-beta
```

---

### 问题 4: Landing 站点部署失败（rsync 权限错误）

**原因**：SSH 密钥未配置或服务器权限问题

**解决方案**：
```bash
# 测试 SSH 连接
ssh root@149.28.200.202 "ls /var/www/minidock"

# 如果失败，检查 SSH 密钥
ssh-add -l

# 手动添加密钥
ssh-add ~/.ssh/id_ironlab
```

---

## 📚 关键文件位置

| 文件 | 路径 | 用途 |
|------|------|------|
| 版本号 | `/Users/jacks/code/minidock/VERSION` | 单行文本，如 `0.9.2-beta` |
| 发布脚本 | `/Users/jacks/code/minidock/release.sh` | DMG 构建+签名+公证 |
| 公证凭据 | `/Users/jacks/code/minidock/.notarize.env` | App Store Connect API Key（gitignored） |
| Landing 站点 | `/Users/jacks/code/minidock/private/landing/` | Astro 项目 |
| 生产服务器 | `root@149.28.200.202:/var/www/minidock/` | Nginx 静态站点 |
| Homebrew Tap | `ironlab-dev/homebrew-minidock` | GitHub repo（可能未创建） |
| Sparkle Appcast | `/Users/jacks/code/minidock/public/appcast.xml` | 自动更新配置（可能未创建） |

---

## 🤖 自动化脚本（可选）

如果用户要求"一键发布"，可以创建并运行：

```bash
cat > /Users/jacks/code/minidock/scripts/release_all.sh << 'EOF'
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

echo "✅ Release v$VERSION complete!"
echo "   Next: Update landing site and Homebrew Cask manually"
EOF

chmod +x /Users/jacks/code/minidock/scripts/release_all.sh
./scripts/release_all.sh 0.9.2-beta
```

---

## 🎓 学习资源

- **完整文档**: `/Users/jacks/code/minidock/RELEASE_WORKFLOW.md`
- **开发 vs 发布**: `/Users/jacks/code/minidock/AGENTS.md`
- **Apple 公证指南**: https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution

---

**最后更新**: 2026-03-04  
**下次发布版本**: 0.9.2-beta（预计）  
**维护者**: IronLab Team
