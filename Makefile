# ──────────────────────────────────────────────────────────────────────────────
# Variables
# ──────────────────────────────────────────────────────────────────────────────
# Same version convention as the chaincoord Makefile / the publish workflow: the
# image self-reports this via NEXT_PUBLIC_APP_VERSION (footer). Plain builds → git describe.
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")

.DEFAULT_GOAL := help

# ──────────────────────────────────────────────────────────────────────────────
# Help
# ──────────────────────────────────────────────────────────────────────────────
.PHONY: help
help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*##"}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

# ──────────────────────────────────────────────────────────────────────────────
# Dev
# ──────────────────────────────────────────────────────────────────────────────
.PHONY: install
install: ## Install dependencies (frozen lockfile)
	yarn install --frozen-lockfile

.PHONY: dev
dev: ## Run the Next.js dev server → http://localhost:3000
	yarn dev

.PHONY: build
build: ## Production build (next build)
	yarn build

# ──────────────────────────────────────────────────────────────────────────────
# Quality
# ──────────────────────────────────────────────────────────────────────────────
.PHONY: lint
lint: ## ESLint (next lint)
	yarn lint

.PHONY: typecheck
typecheck: ## TypeScript type check (tsc --noEmit)
	yarn tsc --noEmit

.PHONY: test
test: ## Jest unit tests
	yarn test

.PHONY: test-e2e
test-e2e: ## Playwright end-to-end tests (needs a running stack)
	yarn playwright

.PHONY: check
check: lint typecheck test ## Lint + typecheck + unit tests (CI entry point)

# ──────────────────────────────────────────────────────────────────────────────
# Generated inputs
# ──────────────────────────────────────────────────────────────────────────────
.PHONY: sync-spec
sync-spec: ## Vendor coordd's OpenAPI spec (override source with COORDD_SPEC=…)
	yarn sync:spec

.PHONY: gen-api
gen-api: ## Regenerate the orval/react-query client from the vendored spec
	yarn gen:api

.PHONY: sync-wasm
sync-wasm: ## Fetch the pinned gentxvalidate WASM into public/wasm/
	yarn sync:wasm

.PHONY: check-wasm-version
check-wasm-version: ## Verify the vendored WASM matches coordd's seedward-libs pin
	yarn check:wasm-version

# ──────────────────────────────────────────────────────────────────────────────
# Docker
# ──────────────────────────────────────────────────────────────────────────────
.PHONY: docker-build
docker-build: ## Build the web image locally (same Dockerfile the GHCR image publishes from)
	docker build --build-arg NEXT_PUBLIC_APP_VERSION=$(VERSION) -t seedward-chaincoord-web .

# ──────────────────────────────────────────────────────────────────────────────
# Clean
# ──────────────────────────────────────────────────────────────────────────────
.PHONY: clean
clean: ## Remove the Next.js build output
	rm -rf .next
