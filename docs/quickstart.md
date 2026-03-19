---
slug: /
---

# Routa Quickstart

## 1) Install dependencies

```bash
npm install --legacy-peer-deps
```

## 2) Start the web demo (development mode)

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 3) Start desktop mode (optional)

```bash
npm --prefix apps/desktop install
npm run tauri:dev
```

## 4) Start the Rust backend API (if needed)

```bash
cargo run -p routa-server
```

If you are running against a custom backend endpoint, set:

```bash
ROUTA_RUST_BACKEND_URL="http://127.0.0.1:3210"
npm run dev
```

## 5) Run validation basics

```bash
npm run lint
npm run test:run
```

## 6) Core usage examples

### Web

Use the UI from Home page and create a new workspace/task to let Routa agents decompose work.

### CLI

The desktop package provides a Rust CLI binary in distribution:

```bash
routa --help
routa -p "Build user auth system"
```

## 7) Docs and API references

- Architecture: [ARCHITECTURE](./ARCHITECTURE)
- Fitness checks: [Fitness checklist](https://github.com/phodal/routa/blob/main/docs/fitness/README.md)
- Product spec: [Feature tree](./product-specs/FEATURE_TREE)
- Release notes: [v0.2.5 notes](./releases/v0.2.5-release-notes)

## 8) FAQ

- If a provider command is missing, install provider CLI first (`opencode`, `claude`, etc.).
- If Tauri dependencies are missing, install desktop dependencies with `npm --prefix apps/desktop install`.
- If static build fails, check Node version and run from repo root.
