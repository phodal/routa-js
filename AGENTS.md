# Routa.js Architecture Guide

## Project Overview

**Routa.js** is a multi-agent coordination platform with a **dual-backend architecture**:
- **Next.js Backend** (TypeScript) — Web deployment on Vercel with Postgres/SQLite
- **Rust Backend** (Axum) — Desktop application with embedded server and SQLite
- `crates/routa-server` — the same logic of Next.js backend, but implemented in Rust

Both backends implement **identical REST APIs** for seamless frontend compatibility.

## Commit

- Keep Key Principles of Baby-Step Commits (not too small)
- Always include the related GitHub issue ID when applicable.
- Append a co-author line in the following format: (YourName, like Copilot,Augment,Claude, etc.) <YourEmail, like, <claude@anthropic.com>, <augmentcode@augment.com>)
