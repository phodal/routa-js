# Routa.js Architecture Guide

Building an agent is not trivial. During API calls or web interactions, unexpected issues often occur. It’s recommended
to keep a simple Markdown (issues/**.md) file in local fs to document errors, observations, and troubleshooting notes. 

## Project Overview

**Routa.js** is a multi-agent coordination platform with a **dual-backend architecture**:
- **Next.js Backend** (TypeScript) — Web deployment on Vercel with Postgres/SQLite
- **Rust Backend** (Axum) — Desktop application with embedded server and SQLite
- `crates/routa-server` — the same logic of Next.js backend, but implemented in Rust

Both backends implement **identical REST APIs** for seamless frontend compatibility.

## Commit

- Follow the Baby-Step Commit principle — keep commits small, but not excessively granular.
- Always include the related GitHub issue ID when applicable.
- Make sure tests pass before pushing.
- Append a co-author line in the following format: (YourName, like Copilot,Augment,Claude, etc.) <YourEmail, like, <claude@anthropic.com>, <augmentcode@augment.com>)
  for example:
  ```
  Co-authored-by: GitHub Copilot Agent <198982749+copilot@users.noreply.github.com>
  ```
