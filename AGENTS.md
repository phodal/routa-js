# Routa.js Architecture Guide

## Project Overview

**Routa.js** is a multi-agent coordination platform with a **dual-backend architecture**:
- **Next.js Backend** (TypeScript) — Web deployment on Vercel with Postgres/SQLite
- **Rust Backend** (Axum) — Desktop application with embedded server and SQLite

Both backends implement **identical REST APIs** for seamless frontend compatibility.
