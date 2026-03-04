# Security Hardening Guide

This document explains the security measures implemented in MiniDock to protect against credential leaks and sensitive data exposure.

## Pre-commit Hooks

MiniDock uses [pre-commit](https://pre-commit.com/) to automatically check for security issues before commits.

### Installation

```bash
# Install pre-commit (if not already installed)
brew install pre-commit

# Install hooks (run once per clone)
cd /path/to/minidock
pre-commit install
```

### What Gets Checked

1. **Private Key Detection** - Blocks commits containing SSH keys, API keys, or certificates
2. **Large File Prevention** - Prevents committing files >500KB (likely binaries)
3. **Sensitive File Blocking** - Blocks AI config files (AGENTS.md, CLAUDE.md, etc.)
4. **Secret Scanning** - Uses [gitleaks](https://github.com/gitleaks/gitleaks) to detect hardcoded secrets

### Manual Check

```bash
# Run all hooks manually (without committing)
pre-commit run --all-files
```

## CI Security Checks

### Frontend CI

The frontend CI pipeline includes:
- `npm audit` - Scans for known vulnerabilities in dependencies
- Runs on every push/PR to `web/` directory

### Recommended Actions

```bash
# Fix vulnerabilities automatically (when possible)
cd web && npm audit fix

# Review vulnerabilities that require manual intervention
npm audit
```

## Sensitive Files Protection

### Files Excluded from Git

The following files are in `.gitignore` and should **never** be committed:

```
.notarize.env          # Apple notarization credentials
.env, .env.local       # Environment variables
*.sqlite*              # Database files
AGENTS.md              # AI agent configurations
CLAUDE.md              # AI prompt templates
SECURITY_AUDIT.md      # Internal security notes
PRIVATE_REPO.md        # Private repository documentation
.claude/, .kiro/       # AI tool directories
```

### If You Accidentally Commit Secrets

1. **Immediately rotate the compromised credentials**
2. **Remove from Git history**:
   ```bash
   # Install git-filter-repo
   brew install git-filter-repo
   
   # Remove file from all history
   git-filter-repo --invert-paths --path path/to/secret-file --force
   
   # Re-add remote (filter-repo removes it)
   git remote add origin git@github.com:ironlab-dev/minidock.git
   
   # Force push (⚠️ requires coordination with team)
   git push origin --force --all
   ```

## Best Practices

### For Developers

1. **Never hardcode credentials** - Use environment variables or Keychain
2. **Review diffs before committing** - Check `git diff --cached`
3. **Use placeholder values** - For examples, use `CHANGE_ME_BEFORE_DEPLOY`
4. **Keep dependencies updated** - Run `npm audit fix` regularly

### For Users

1. **Change default passwords** - Community templates may contain placeholders
2. **Secure JWT secret** - Auto-generated in `backend/Data/database/.jwt_secret`
3. **Use HTTPS** - When exposing to internet (via Caddy/Nginx/Cloudflare)
4. **Limit network exposure** - Default binds to `localhost` only

## Incident Response

If you discover a security issue:

1. **Do NOT open a public GitHub issue**
2. **Use [Private Vulnerability Reporting](https://github.com/ironlab-dev/minidock/security/advisories/new)**
3. **Or email**: minidock@ironlab.cc with subject `[SECURITY]`

See [SECURITY.md](../SECURITY.md) for full reporting guidelines.

## Audit History

| Date | Action | Details |
|------|--------|---------|
| 2026-03-04 | Initial hardening | Added pre-commit hooks, npm audit CI, removed AI configs from Git history |

---

**Last Updated**: 2026-03-04
