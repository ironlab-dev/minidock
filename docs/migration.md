# Migration Guide

This document covers breaking changes and migration steps between MiniDock versions.

## Upcoming Migrations

Migration guides will be added here as breaking changes are introduced in future releases.

## v0.1.x → v0.2.x

> No breaking changes yet. This section will be updated before v0.2.0 is released.

---

## General Migration Principles

1. **Back up your data** before upgrading: `backend/Data/` contains your database and configuration.
2. **Stop MiniDock** cleanly before upgrading to avoid database corruption.
3. **Check the [CHANGELOG](../CHANGELOG.md)** for your target version for any migration notes.
4. **Re-run `./dev-app.sh`** after upgrading to rebuild and sign the updated app bundle.

If you encounter issues during migration, please [open an issue](https://github.com/ironlab-dev/minidock/issues).
