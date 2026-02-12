.PHONY: dev build check clean fmt lint test install run-frontend run-backend help

# Default target
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# === Development ===

dev: ## Start Tauri dev mode (frontend + backend hot-reload)
	pnpm tauri dev

run-frontend: ## Start frontend dev server only (Vite)
	pnpm dev

run-backend: ## Run Rust backend only (cargo run)
	cd src-tauri && cargo run

# === Build ===

build: ## Build production release
	pnpm tauri build

build-frontend: ## Build frontend only
	pnpm build

build-backend: ## Build Rust backend only (release)
	cd src-tauri && cargo build --release

build-debug: ## Build Rust backend (debug)
	cd src-tauri && cargo build

# === Code Quality ===

check: ## Check both TypeScript and Rust compilation
	@echo "==> Checking TypeScript..."
	npx tsc --noEmit
	@echo "==> Checking Rust..."
	cd src-tauri && cargo check
	@echo "==> All checks passed."

check-ts: ## Check TypeScript compilation only
	npx tsc --noEmit

check-rs: ## Check Rust compilation only
	cd src-tauri && cargo check

fmt: ## Format Rust code
	cd src-tauri && cargo fmt

fmt-check: ## Check Rust formatting without modifying
	cd src-tauri && cargo fmt --check

lint: ## Run Rust clippy linter
	cd src-tauri && cargo clippy -- -D warnings

# === Testing ===

test: ## Run Rust tests
	cd src-tauri && cargo test

test-verbose: ## Run Rust tests with verbose output
	cd src-tauri && cargo test -- --nocapture

# === Dependencies ===

install: ## Install all dependencies (pnpm + cargo)
	pnpm install
	cd src-tauri && cargo fetch

add-component: ## Add a shadcn/ui component (usage: make add-component NAME=button)
	npx shadcn@latest add $(NAME) --yes

# === Cleanup ===

clean: ## Clean all build artifacts
	rm -rf dist
	cd src-tauri && cargo clean

clean-rs: ## Clean Rust build artifacts only
	cd src-tauri && cargo clean

# === Database ===

db-path: ## Show the database file path (macOS)
	@echo "$$HOME/Library/Application Support/com.anyllm.app/anyllm.db"

# === Info ===

info: ## Show project info
	@echo "AnyLLM - LLM API Gateway Desktop App"
	@echo ""
	@echo "Frontend:  React 19 + TypeScript + Vite"
	@echo "Backend:   Rust + Axum + SQLite"
	@echo "Desktop:   Tauri v2"
	@echo "UI:        shadcn/ui + Tailwind CSS v4"
	@echo ""
	@echo "Server:    http://localhost:9000"
	@echo "Endpoints:"
	@echo "  GET  /health              Health check"
	@echo "  GET  /v1/models           List models"
	@echo "  POST /v1/chat/completions OpenAI Chat format"
	@echo "  POST /v1/responses        OpenAI Responses format"
	@echo "  POST /v1/messages         Anthropic Messages format"

loc: ## Count lines of code
	@echo "==> Rust:"
	@find src-tauri/src -name '*.rs' | xargs wc -l | tail -1
	@echo "==> TypeScript/React:"
	@find src -name '*.ts' -o -name '*.tsx' | xargs wc -l | tail -1
	@echo "==> Total:"
	@find src-tauri/src -name '*.rs' -o -name '*.ts' -o -name '*.tsx' | xargs wc -l 2>/dev/null; find src -name '*.ts' -o -name '*.tsx' | xargs wc -l 2>/dev/null | tail -1
