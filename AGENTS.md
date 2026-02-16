# Routa.js Architecture Guide

## Project Overview

**Routa.js** is a multi-agent coordination platform with a **dual-backend architecture**:
- **Next.js Backend** (TypeScript) — Web deployment on Vercel with Postgres/SQLite
- **Rust Backend** (Axum) — Desktop application with embedded server and SQLite
- `crates/routa-server` — the same logic of Next.js backend, but implemented in Rust

Both backends implement **identical REST APIs** for seamless frontend compatibility.
