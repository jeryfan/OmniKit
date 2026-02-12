# Phase 1: Project Skeleton & Infrastructure — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Initialize the full Tauri v2 + React 19 project with SQLite, embedded Axum HTTP server, frontend layout with sidebar navigation and dark/light theme, and Tauri IPC communication layer.

**Architecture:** Tauri v2 desktop app with Rust backend (Axum HTTP server + SQLite via sqlx) and React 19 frontend (shadcn/ui + Tailwind CSS). Axum runs as a background service on a configurable port, managed by the Tauri app lifecycle. Frontend communicates with the Rust layer via Tauri IPC for configuration, and external clients hit the Axum HTTP server for API proxying.

**Tech Stack:** Tauri v2, Rust (Axum, Tokio, reqwest, sqlx, serde, thiserror), React 19, TypeScript, Vite, shadcn/ui, Tailwind CSS v4, React Router, Recharts, Lucide React

**Pre-requisites:** Node.js v24+, pnpm v9+, Rust 1.93+, installed on the system. Current project has README.md, LICENSE, CLAUDE.md, docs/, .gitignore already committed.

**Important Notes:**
- Existing empty directories under `src/` and `src-tauri/src/` (codec/, models/) are stale scaffolding from before the modality-based redesign. They will be cleaned up.
- There is a stale `src-tauri/target/` (2.5GB) with no Cargo.toml — it will be removed.
- All new code follows CLAUDE.md conventions: `Result<T>` + `thiserror` for errors, no `unwrap()` in non-test code.

---

### Task 1: Clean up stale directories

**Files:**
- Remove: `src-tauri/src/codec/` (stale, replaced by `modality/` structure)
- Remove: `src-tauri/src/models/` (stale, replaced by `db/` structure)
- Remove: `src-tauri/target/` (stale build artifacts, no Cargo.toml exists)

**Step 1: Remove stale directories**

```bash
rm -rf src-tauri/src/codec src-tauri/src/models src-tauri/target
```

**Step 2: Verify clean state**

```bash
ls src-tauri/src/
# Expected: empty or only directories we want to keep
ls src-tauri/
# Expected: no target/ directory
```

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: clean up stale scaffolding directories"
```

---

### Task 2: Initialize frontend project (React 19 + TypeScript + Vite)

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/vite-env.d.ts`

**Step 1: Create package.json**

```json
{
  "name": "anyllm",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "~5.7.0",
    "vite": "^6.0.0"
  }
}
```

**Step 2: Create vite.config.ts**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
```

**Step 3: Create tsconfig.json**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

**Step 4: Create tsconfig.app.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

**Step 5: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["vite.config.ts"]
}
```

**Step 6: Create index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AnyLLM</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 7: Create src/vite-env.d.ts**

```typescript
/// <reference types="vite/client" />
```

**Step 8: Create src/main.tsx**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

**Step 9: Create src/App.tsx**

```tsx
function App() {
  return <div>AnyLLM</div>;
}

export default App;
```

**Step 10: Install dependencies**

```bash
pnpm install
```

**Step 11: Verify frontend dev server works**

```bash
pnpm dev
# Expected: Vite dev server starts on http://localhost:1420
# Visit the URL — should show "AnyLLM" text
# Stop with Ctrl+C
```

**Step 12: Commit**

```bash
git add package.json pnpm-lock.yaml vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json index.html src/main.tsx src/App.tsx src/vite-env.d.ts
git commit -m "feat(frontend): initialize React 19 + TypeScript + Vite project"
```

---

### Task 3: Initialize Tauri v2 backend

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/main.rs`
- Modify: `package.json` (add `@tauri-apps/cli` and `@tauri-apps/api`)

**Step 1: Add Tauri dependencies to package.json**

Add to `devDependencies`:
```json
"@tauri-apps/cli": "^2"
```

Add to `dependencies`:
```json
"@tauri-apps/api": "^2"
```

Then run:
```bash
pnpm install
```

**Step 2: Create src-tauri/Cargo.toml**

```toml
[package]
name = "anyllm"
version = "0.1.0"
description = "LLM API Gateway Desktop App"
authors = [""]
edition = "2021"

[lib]
name = "anyllm_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
tokio = { version = "1", features = ["full"] }
```

**Step 3: Create src-tauri/build.rs**

```rust
fn main() {
    tauri_build::build()
}
```

**Step 4: Create src-tauri/tauri.conf.json**

```json
{
  "productName": "AnyLLM",
  "version": "0.1.0",
  "identifier": "com.anyllm.app",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "AnyLLM",
        "width": 1200,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  },
  "plugins": {
    "opener": {
      "openUrl": {
        "urls": ["https://*"]
      }
    }
  }
}
```

**Step 5: Create src-tauri/capabilities/default.json**

```json
{
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default"
  ]
}
```

**Step 6: Create src-tauri/src/lib.rs**

```rust
mod config;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 7: Create src-tauri/src/main.rs**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    anyllm_lib::run()
}
```

**Step 8: Create src-tauri/src/config.rs (placeholder)**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub server_port: u16,
    pub log_retention_days: u32,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            server_port: 9000,
            log_retention_days: 30,
        }
    }
}
```

**Step 9: Verify Tauri app launches**

```bash
pnpm tauri dev
# Expected: Desktop window opens showing "AnyLLM" text
# Rust backend compiles successfully
# Close the window to stop
```

**Step 10: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/build.rs src-tauri/tauri.conf.json src-tauri/capabilities/default.json src-tauri/src/lib.rs src-tauri/src/main.rs src-tauri/src/config.rs package.json pnpm-lock.yaml
git commit -m "feat(tauri): initialize Tauri v2 backend with basic app shell"
```

---

### Task 4: Setup Tailwind CSS v4 + shadcn/ui

**Files:**
- Create: `src/styles/globals.css`
- Create: `components.json`
- Modify: `package.json` (add Tailwind + shadcn deps)
- Modify: `src/main.tsx` (import globals.css)
- Modify: `vite.config.ts` (add Tailwind plugin)

**Step 1: Install Tailwind CSS v4 and shadcn/ui dependencies**

```bash
pnpm add tailwindcss @tailwindcss/vite
pnpm add class-variance-authority clsx tailwind-merge lucide-react
```

**Step 2: Add Tailwind plugin to vite.config.ts**

Update `vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
```

**Step 3: Create src/styles/globals.css**

```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

@theme {
  --color-background: hsl(0 0% 100%);
  --color-foreground: hsl(240 10% 3.9%);
  --color-card: hsl(0 0% 100%);
  --color-card-foreground: hsl(240 10% 3.9%);
  --color-popover: hsl(0 0% 100%);
  --color-popover-foreground: hsl(240 10% 3.9%);
  --color-primary: hsl(240 5.9% 10%);
  --color-primary-foreground: hsl(0 0% 98%);
  --color-secondary: hsl(240 4.8% 95.9%);
  --color-secondary-foreground: hsl(240 5.9% 10%);
  --color-muted: hsl(240 4.8% 95.9%);
  --color-muted-foreground: hsl(240 3.8% 46.1%);
  --color-accent: hsl(240 4.8% 95.9%);
  --color-accent-foreground: hsl(240 5.9% 10%);
  --color-destructive: hsl(0 84.2% 60.2%);
  --color-destructive-foreground: hsl(0 0% 98%);
  --color-border: hsl(240 5.9% 90%);
  --color-input: hsl(240 5.9% 90%);
  --color-ring: hsl(240 5.9% 10%);
  --color-sidebar-background: hsl(0 0% 98%);
  --color-sidebar-foreground: hsl(240 5.3% 26.1%);
  --color-sidebar-primary: hsl(240 5.9% 10%);
  --color-sidebar-primary-foreground: hsl(0 0% 98%);
  --color-sidebar-accent: hsl(240 4.8% 95.9%);
  --color-sidebar-accent-foreground: hsl(240 5.9% 10%);
  --color-sidebar-border: hsl(220 13% 91%);
  --color-sidebar-ring: hsl(217.2 91.2% 59.8%);
  --radius: 0.625rem;
}

@layer base {
  .dark {
    --color-background: hsl(240 10% 3.9%);
    --color-foreground: hsl(0 0% 98%);
    --color-card: hsl(240 10% 3.9%);
    --color-card-foreground: hsl(0 0% 98%);
    --color-popover: hsl(240 10% 3.9%);
    --color-popover-foreground: hsl(0 0% 98%);
    --color-primary: hsl(0 0% 98%);
    --color-primary-foreground: hsl(240 5.9% 10%);
    --color-secondary: hsl(240 3.7% 15.9%);
    --color-secondary-foreground: hsl(0 0% 98%);
    --color-muted: hsl(240 3.7% 15.9%);
    --color-muted-foreground: hsl(240 5% 64.9%);
    --color-accent: hsl(240 3.7% 15.9%);
    --color-accent-foreground: hsl(0 0% 98%);
    --color-destructive: hsl(0 62.8% 30.6%);
    --color-destructive-foreground: hsl(0 0% 98%);
    --color-border: hsl(240 3.7% 15.9%);
    --color-input: hsl(240 3.7% 15.9%);
    --color-ring: hsl(240 4.9% 83.9%);
    --color-sidebar-background: hsl(240 5.9% 10%);
    --color-sidebar-foreground: hsl(240 4.8% 95.9%);
    --color-sidebar-primary: hsl(224.3 76.3% 48%);
    --color-sidebar-primary-foreground: hsl(0 0% 100%);
    --color-sidebar-accent: hsl(240 3.7% 15.9%);
    --color-sidebar-accent-foreground: hsl(240 4.8% 95.9%);
    --color-sidebar-border: hsl(240 3.7% 15.9%);
    --color-sidebar-ring: hsl(217.2 91.2% 59.8%);
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

**Step 4: Update src/main.tsx to import styles**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

**Step 5: Create src/lib/utils.ts** (shadcn/ui utility)

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Step 6: Create components.json** (shadcn/ui config)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "tailwind": {
    "config": "",
    "css": "src/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  }
}
```

**Step 7: Add shadcn/ui components needed for layout**

```bash
pnpm dlx shadcn@latest add button separator tooltip scroll-area
```

**Step 8: Update src/App.tsx to verify Tailwind works**

```tsx
import { Button } from "@/components/ui/button";

function App() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Button>AnyLLM</Button>
    </div>
  );
}

export default App;
```

**Step 9: Verify styles work**

```bash
pnpm tauri dev
# Expected: Window shows a styled shadcn/ui button centered on screen
```

**Step 10: Commit**

```bash
git add -A
git commit -m "feat(ui): setup Tailwind CSS v4 and shadcn/ui with theme variables"
```

---

### Task 5: SQLite database layer

**Files:**
- Modify: `src-tauri/Cargo.toml` (add sqlx dependency)
- Create: `src-tauri/migrations/001_init.sql`
- Create: `src-tauri/src/db/mod.rs`
- Create: `src-tauri/src/db/models.rs`
- Modify: `src-tauri/src/lib.rs` (add db module, init database on startup)

**Step 1: Add sqlx dependency to Cargo.toml**

Add to `[dependencies]` in `src-tauri/Cargo.toml`:
```toml
sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite", "migrate"] }
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
```

**Step 2: Create migration file src-tauri/migrations/001_init.sql**

```sql
-- Channels table
CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    base_url TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    weight INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1,
    key_rotation INTEGER NOT NULL DEFAULT 0,
    rate_limit TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Channel API keys table
CREATE TABLE IF NOT EXISTS channel_api_keys (
    id TEXT PRIMARY KEY NOT NULL,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    key_value TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_used TEXT
);

-- Model mappings table
CREATE TABLE IF NOT EXISTS model_mappings (
    id TEXT PRIMARY KEY NOT NULL,
    public_name TEXT NOT NULL,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    actual_name TEXT NOT NULL,
    modality TEXT NOT NULL DEFAULT 'chat'
);

-- Tokens table (external API keys)
CREATE TABLE IF NOT EXISTS tokens (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT,
    key_value TEXT NOT NULL UNIQUE,
    quota_limit INTEGER,
    quota_used INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    allowed_models TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Request logs table
CREATE TABLE IF NOT EXISTS request_logs (
    id TEXT PRIMARY KEY NOT NULL,
    token_id TEXT,
    channel_id TEXT,
    model TEXT,
    modality TEXT,
    input_format TEXT,
    output_format TEXT,
    status INTEGER,
    latency_ms INTEGER,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    request_body TEXT,
    response_body TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_request_logs_model ON request_logs(model);
CREATE INDEX IF NOT EXISTS idx_request_logs_channel_id ON request_logs(channel_id);
CREATE INDEX IF NOT EXISTS idx_model_mappings_public_name ON model_mappings(public_name);
CREATE INDEX IF NOT EXISTS idx_tokens_key_value ON tokens(key_value);
```

**Step 3: Create src-tauri/src/db/mod.rs**

```rust
pub mod models;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::Path;
use std::str::FromStr;

pub async fn init_pool(db_path: &Path) -> Result<SqlitePool, sqlx::Error> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());
    let options = SqliteConnectOptions::from_str(&db_url)?
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .busy_timeout(std::time::Duration::from_secs(5));

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    Ok(pool)
}
```

**Step 4: Create src-tauri/src/db/models.rs**

```rust
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Channel {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub base_url: String,
    pub priority: i32,
    pub weight: i32,
    pub enabled: bool,
    pub key_rotation: bool,
    pub rate_limit: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ChannelApiKey {
    pub id: String,
    pub channel_id: String,
    pub key_value: String,
    pub enabled: bool,
    pub last_used: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ModelMapping {
    pub id: String,
    pub public_name: String,
    pub channel_id: String,
    pub actual_name: String,
    pub modality: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Token {
    pub id: String,
    pub name: Option<String>,
    pub key_value: String,
    pub quota_limit: Option<i64>,
    pub quota_used: i64,
    pub expires_at: Option<String>,
    pub allowed_models: Option<String>,
    pub enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RequestLog {
    pub id: String,
    pub token_id: Option<String>,
    pub channel_id: Option<String>,
    pub model: Option<String>,
    pub modality: Option<String>,
    pub input_format: Option<String>,
    pub output_format: Option<String>,
    pub status: Option<i32>,
    pub latency_ms: Option<i64>,
    pub prompt_tokens: Option<i64>,
    pub completion_tokens: Option<i64>,
    pub request_body: Option<String>,
    pub response_body: Option<String>,
    pub created_at: String,
}
```

**Step 5: Update src-tauri/src/lib.rs to initialize database**

```rust
mod config;
mod db;

use sqlx::SqlitePool;
use std::sync::Arc;
use tauri::Manager;

pub struct AppState {
    pub db: SqlitePool,
    pub config: config::AppConfig,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let app_dir = app_handle
                    .path()
                    .app_data_dir()
                    .expect("failed to resolve app data dir");
                let db_path = app_dir.join("anyllm.db");

                let pool = db::init_pool(&db_path)
                    .await
                    .expect("failed to initialize database");

                let state = AppState {
                    db: pool,
                    config: config::AppConfig::default(),
                };
                app_handle.manage(state);
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 6: Verify database initializes on launch**

```bash
pnpm tauri dev
# Expected: App launches without errors
# Check that database file was created:
ls ~/Library/Application\ Support/com.anyllm.app/anyllm.db
# Expected: file exists
```

**Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/migrations/ src-tauri/src/db/ src-tauri/src/lib.rs
git commit -m "feat(db): setup SQLite with sqlx migrations and data models"
```

---

### Task 6: Embed Axum HTTP server in Tauri

**Files:**
- Modify: `src-tauri/Cargo.toml` (add axum, tower, reqwest)
- Create: `src-tauri/src/server/mod.rs`
- Create: `src-tauri/src/server/router.rs`
- Modify: `src-tauri/src/lib.rs` (start Axum server in setup)
- Modify: `src-tauri/src/config.rs` (add server config)

**Step 1: Add Axum and HTTP dependencies to Cargo.toml**

Add to `[dependencies]` in `src-tauri/Cargo.toml`:
```toml
axum = { version = "0.8", features = ["json"] }
tower = "0.5"
tower-http = { version = "0.6", features = ["cors"] }
reqwest = { version = "0.12", features = ["stream", "json"] }
```

**Step 2: Create src-tauri/src/server/mod.rs**

```rust
pub mod router;

use crate::AppState;
use sqlx::SqlitePool;
use std::net::SocketAddr;
use std::sync::Arc;

pub async fn start(pool: SqlitePool, port: u16) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let app = router::create_router(pool);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));

    let listener = tokio::net::TcpListener::bind(addr).await?;
    log::info!("Axum server listening on {}", addr);

    axum::serve(listener, app).await?;
    Ok(())
}
```

**Step 3: Create src-tauri/src/server/router.rs**

```rust
use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::get,
    Router,
};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use tower_http::cors::CorsLayer;

pub fn create_router(pool: SqlitePool) -> Router {
    Router::new()
        .route("/health", get(health_check))
        .layer(CorsLayer::permissive())
        .with_state(pool)
}

async fn health_check(State(_pool): State<SqlitePool>) -> Json<Value> {
    Json(json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}
```

**Step 4: Add log dependency to Cargo.toml**

Add to `[dependencies]`:
```toml
log = "0.4"
```

**Step 5: Update src-tauri/src/lib.rs to start Axum server**

```rust
mod config;
mod db;
mod server;

use sqlx::SqlitePool;
use tauri::Manager;

pub struct AppState {
    pub db: SqlitePool,
    pub config: config::AppConfig,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let app_dir = app_handle
                    .path()
                    .app_data_dir()
                    .expect("failed to resolve app data dir");
                let db_path = app_dir.join("anyllm.db");

                let pool = db::init_pool(&db_path)
                    .await
                    .expect("failed to initialize database");

                let config = config::AppConfig::default();
                let server_port = config.server_port;

                let state = AppState {
                    db: pool.clone(),
                    config,
                };
                app_handle.manage(state);

                // Start Axum HTTP server in background
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = server::start(pool, server_port).await {
                        log::error!("Axum server error: {}", e);
                    }
                });
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 6: Verify Axum server responds**

```bash
pnpm tauri dev
# In another terminal:
curl http://localhost:9000/health
# Expected: {"status":"ok","version":"0.1.0"}
```

**Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/server/ src-tauri/src/lib.rs
git commit -m "feat(server): embed Axum HTTP server with health check endpoint"
```

---

### Task 7: Frontend layout (sidebar + routing + dark/light theme)

**Files:**
- Modify: `package.json` (add react-router, recharts)
- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/components/layout/Layout.tsx`
- Create: `src/components/layout/ThemeProvider.tsx`
- Create: `src/pages/Dashboard.tsx`
- Create: `src/pages/Channels.tsx`
- Create: `src/pages/ModelMappings.tsx`
- Create: `src/pages/Tokens.tsx`
- Create: `src/pages/RequestLogs.tsx`
- Create: `src/pages/UsageStats.tsx`
- Create: `src/pages/Settings.tsx`
- Modify: `src/App.tsx` (add router + layout)
- Modify: `src/main.tsx` (add ThemeProvider)

**Step 1: Install frontend routing and chart dependencies**

```bash
pnpm add react-router recharts
```

**Step 2: Create src/components/layout/ThemeProvider.tsx**

```tsx
import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("anyllm-theme") as Theme) || "system",
  );

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }

    localStorage.setItem("anyllm-theme", theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

**Step 3: Create src/components/layout/Sidebar.tsx**

```tsx
import { NavLink } from "react-router";
import {
  LayoutDashboard,
  Network,
  ArrowRightLeft,
  KeyRound,
  ScrollText,
  BarChart3,
  Settings,
  Sun,
  Moon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTheme } from "./ThemeProvider";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/channels", icon: Network, label: "Channels" },
  { to: "/model-mappings", icon: ArrowRightLeft, label: "Model Mappings" },
  { to: "/tokens", icon: KeyRound, label: "Tokens" },
  { to: "/request-logs", icon: ScrollText, label: "Request Logs" },
  { to: "/usage-stats", icon: BarChart3, label: "Usage Stats" },
];

export function Sidebar() {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-screen w-56 flex-col border-r bg-sidebar-background text-sidebar-foreground">
        <div className="flex h-14 items-center px-4 font-semibold tracking-tight">
          AnyLLM
        </div>
        <Separator />
        <ScrollArea className="flex-1 px-2 py-2">
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </ScrollArea>
        <Separator />
        <div className="flex items-center justify-between px-3 py-2">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )
            }
          >
            <Settings className="h-4 w-4" />
            Settings
          </NavLink>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8">
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Toggle theme</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
```

**Step 4: Create src/components/layout/Layout.tsx**

```tsx
import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
```

**Step 5: Create page stubs — each page gets a placeholder**

Create `src/pages/Dashboard.tsx`:
```tsx
export default function Dashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">Overview of your API gateway.</p>
    </div>
  );
}
```

Create `src/pages/Channels.tsx`:
```tsx
export default function Channels() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Channels</h1>
      <p className="mt-2 text-muted-foreground">Manage your API provider channels.</p>
    </div>
  );
}
```

Create `src/pages/ModelMappings.tsx`:
```tsx
export default function ModelMappings() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Model Mappings</h1>
      <p className="mt-2 text-muted-foreground">Configure public model name to upstream model mappings.</p>
    </div>
  );
}
```

Create `src/pages/Tokens.tsx`:
```tsx
export default function Tokens() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Tokens</h1>
      <p className="mt-2 text-muted-foreground">Manage external API keys and quotas.</p>
    </div>
  );
}
```

Create `src/pages/RequestLogs.tsx`:
```tsx
export default function RequestLogs() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Request Logs</h1>
      <p className="mt-2 text-muted-foreground">View and inspect request history.</p>
    </div>
  );
}
```

Create `src/pages/UsageStats.tsx`:
```tsx
export default function UsageStats() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Usage Statistics</h1>
      <p className="mt-2 text-muted-foreground">Token usage, request counts, and cost estimation.</p>
    </div>
  );
}
```

Create `src/pages/Settings.tsx`:
```tsx
export default function Settings() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="mt-2 text-muted-foreground">Configure server port, log retention, and more.</p>
    </div>
  );
}
```

**Step 6: Update src/App.tsx with routing**

```tsx
import { BrowserRouter, Routes, Route } from "react-router";
import { Layout } from "@/components/layout/Layout";
import Dashboard from "@/pages/Dashboard";
import Channels from "@/pages/Channels";
import ModelMappings from "@/pages/ModelMappings";
import Tokens from "@/pages/Tokens";
import RequestLogs from "@/pages/RequestLogs";
import UsageStats from "@/pages/UsageStats";
import Settings from "@/pages/Settings";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="channels" element={<Channels />} />
          <Route path="model-mappings" element={<ModelMappings />} />
          <Route path="tokens" element={<Tokens />} />
          <Route path="request-logs" element={<RequestLogs />} />
          <Route path="usage-stats" element={<UsageStats />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

**Step 7: Update src/main.tsx with ThemeProvider**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
```

**Step 8: Verify layout, navigation, and theme switching**

```bash
pnpm tauri dev
# Expected:
# - Left sidebar with navigation items
# - Clicking items navigates between pages
# - Theme toggle button switches between light/dark
# - Each page shows its title and description
```

**Step 9: Commit**

```bash
git add -A
git commit -m "feat(ui): add sidebar layout, page routing, and dark/light theme"
```

---

### Task 8: Tauri IPC communication layer

**Files:**
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/config.rs`
- Create: `src/lib/tauri.ts`
- Modify: `src-tauri/src/lib.rs` (register commands)

**Step 1: Create src-tauri/src/commands/mod.rs**

```rust
pub mod config;
```

**Step 2: Create src-tauri/src/commands/config.rs**

```rust
use crate::AppState;
use crate::config::AppConfig;
use tauri::State;

#[tauri::command]
pub async fn get_config(state: State<'_, AppState>) -> Result<AppConfig, String> {
    Ok(state.config.clone())
}

#[tauri::command]
pub async fn get_server_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let config = &state.config;
    let url = format!("http://127.0.0.1:{}/health", config.server_port);

    match reqwest::get(&url).await {
        Ok(resp) => {
            let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
            Ok(body)
        }
        Err(e) => Ok(serde_json::json!({
            "status": "error",
            "message": e.to_string(),
        })),
    }
}
```

**Step 3: Update src-tauri/src/lib.rs to register commands**

```rust
mod commands;
mod config;
mod db;
mod server;

use sqlx::SqlitePool;
use tauri::Manager;

pub struct AppState {
    pub db: SqlitePool,
    pub config: config::AppConfig,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::config::get_config,
            commands::config::get_server_status,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let app_dir = app_handle
                    .path()
                    .app_data_dir()
                    .expect("failed to resolve app data dir");
                let db_path = app_dir.join("anyllm.db");

                let pool = db::init_pool(&db_path)
                    .await
                    .expect("failed to initialize database");

                let config = config::AppConfig::default();
                let server_port = config.server_port;

                let state = AppState {
                    db: pool.clone(),
                    config,
                };
                app_handle.manage(state);

                // Start Axum HTTP server in background
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = server::start(pool, server_port).await {
                        log::error!("Axum server error: {}", e);
                    }
                });
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 4: Create src/lib/tauri.ts**

```typescript
import { invoke } from "@tauri-apps/api/core";

export interface AppConfig {
  server_port: number;
  log_retention_days: number;
}

export interface ServerStatus {
  status: string;
  version?: string;
  message?: string;
}

export async function getConfig(): Promise<AppConfig> {
  return invoke<AppConfig>("get_config");
}

export async function getServerStatus(): Promise<ServerStatus> {
  return invoke<ServerStatus>("get_server_status");
}
```

**Step 5: Update Dashboard page to verify IPC works**

Update `src/pages/Dashboard.tsx`:

```tsx
import { useEffect, useState } from "react";
import { getConfig, getServerStatus } from "@/lib/tauri";
import type { AppConfig, ServerStatus } from "@/lib/tauri";

export default function Dashboard() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);

  useEffect(() => {
    getConfig().then(setConfig);
    getServerStatus().then(setServerStatus);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">Overview of your API gateway.</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h3 className="text-sm font-medium text-muted-foreground">Server Port</h3>
          <p className="mt-1 text-2xl font-bold">{config?.server_port ?? "..."}</p>
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="text-sm font-medium text-muted-foreground">Server Status</h3>
          <p className="mt-1 text-2xl font-bold">{serverStatus?.status ?? "..."}</p>
        </div>
      </div>
    </div>
  );
}
```

**Step 6: Verify IPC round trip**

```bash
pnpm tauri dev
# Expected: Dashboard page shows:
# - Server Port: 9000
# - Server Status: ok
```

**Step 7: Commit**

```bash
git add -A
git commit -m "feat(ipc): add Tauri IPC commands and frontend communication layer"
```

---

## Summary

After completing all 8 tasks, the project has:

| Component | Status |
|-----------|--------|
| Tauri v2 desktop shell | Running |
| React 19 + TypeScript + Vite | Configured |
| Tailwind CSS v4 + shadcn/ui | Themed (light/dark) |
| SQLite + sqlx + migrations | All 5 tables created |
| Axum HTTP server | Listening on port 9000 |
| Frontend layout | Sidebar + 7 page routes |
| Tauri IPC | Config & status commands working |

**Next:** Phase 2 — Core conversion engine (chat modality IR, 5 codecs, streaming pipeline, channel routing).
