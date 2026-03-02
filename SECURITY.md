# Security Policy

## Reporting a Vulnerability

**Preferred method**: Use [GitHub Private Vulnerability Reporting](https://github.com/ironlab-dev/minidock/security/advisories/new) to report security issues confidentially. This keeps the report private until a fix is ready.

**Alternative**: Email minidock@ironlab.cc with the subject `[SECURITY] <brief description>`.

Please include:
- Detailed steps to reproduce the issue
- Affected versions
- Potential impact assessment

**Do NOT** open a public GitHub issue for security vulnerabilities.

### Response Timeline

| Milestone | Target |
| --------- | ------ |
| Acknowledgement | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix or mitigation | Within 90 days (critical: 14 days) |
| Public disclosure | After fix is released |
## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Security Best Practices

### For Users

1. **Change Default Passwords**: Community templates may contain placeholder passwords like `CHANGE_ME_BEFORE_DEPLOY`. Always replace these with strong passwords before deployment.

2. **Keep Dependencies Updated**: Run `npm audit fix` in the `web/` directory to update frontend dependencies with known vulnerabilities.

3. **Secure Your JWT Secret**: The JWT secret in `backend/Data/database/.jwt_secret` is auto-generated. Never commit this file to version control.

4. **Use HTTPS**: When exposing MiniDock to the internet, always use HTTPS with valid certificates (e.g., via Caddy, Nginx, or Cloudflare Tunnel).

5. **Limit Network Exposure**: By default, MiniDock binds to `localhost`. Only expose it to your local network if necessary.

### For Developers

1. **Never Commit Secrets**: Ensure `.env.local`, `.jwt_secret`, and database files are in `.gitignore`.

2. **Review Community Templates**: Before adding new templates to `web/src/lib/communityApps.ts`, ensure default passwords are set to `CHANGE_ME_BEFORE_DEPLOY`.

3. **Audit Dependencies**: Run `npm audit` and `swift package show-dependencies` regularly.

4. **Code Review**: All pull requests undergo security review before merging.

## Known Security Considerations

### JWT Secret Generation

MiniDock auto-generates a JWT secret on first run. If you suspect your secret has been compromised:

```bash
# Regenerate JWT secret (will invalidate all existing sessions)
openssl rand -hex 32 > backend/Data/database/.jwt_secret
```

### Docker Socket Access

MiniDock requires access to the Docker socket (`/var/run/docker.sock`). This grants root-equivalent privileges. Only run MiniDock on trusted systems.

### VNC Connections

VNC connections are proxied through the backend. Ensure your VMs have strong VNC passwords configured.

## Security Updates

Security updates are released as patch versions (e.g., 0.1.1 → 0.1.2). Subscribe to GitHub releases to stay informed:

- **Watch** this repository → **Custom** → **Releases**
- Or use the built-in auto-update feature (MiniDock Pro)

## Acknowledgments

We appreciate responsible disclosure from security researchers. Contributors who report valid vulnerabilities will be acknowledged in release notes (unless they prefer to remain anonymous).

---

**Last Updated**: 2026-02-27
