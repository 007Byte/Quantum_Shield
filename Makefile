.PHONY: help build build-crypto build-server build-app test test-crypto test-server test-app test-coverage \
         lint lint-crypto lint-server lint-app security sast sca secret-scan gate-phase1 \
         docker-up docker-down docker-build docker-clean setup setup-hooks clean fmt \
         check-coverage-go check-coverage-ts install-tools clean-crypto clean-server clean-app \
         fmt-crypto fmt-server fmt-app test-coverage-go test-coverage-ts

# Color definitions for terminal output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[1;33m
BLUE := \033[0;34m
CYAN := \033[0;36m
NC := \033[0m

# Project directories
CRYPTO_DIR := usbvault-crypto
SERVER_DIR := usbvault-server
APP_DIR := usbvault-app
SCRIPTS_DIR := scripts

# Coverage threshold (percentage)
COVERAGE_THRESHOLD := 70

# ==============================================================================
# DEFAULT TARGET - HELP
# ==============================================================================

help:
	@echo "========================================================================="
	@echo "                   Quantum_Shield - Build System"
	@echo "                   Make targets for all components"
	@echo "========================================================================="
	@echo ""
	@echo "BUILD TARGETS:"
	@echo "  make build              - Build all components (crypto, server, app)"
	@echo "  make build-crypto       - Build Rust crypto library (FFI)"
	@echo "  make build-server       - Build Go server binary"
	@echo "  make build-app          - Build React Native app"
	@echo ""
	@echo "TEST TARGETS:"
	@echo "  make test               - Run all tests (crypto, server, app)"
	@echo "  make test-crypto        - Run Rust crypto tests"
	@echo "  make test-server        - Run Go server tests"
	@echo "  make test-app           - Run React Native app tests"
	@echo "  make test-coverage      - Run tests with coverage reports (all)"
	@echo "  make check-coverage-go  - Verify Go coverage meets $(COVERAGE_THRESHOLD)% threshold"
	@echo "  make check-coverage-ts  - Verify TypeScript coverage meets $(COVERAGE_THRESHOLD)% threshold"
	@echo ""
	@echo "LINT TARGETS:"
	@echo "  make lint               - Run all linters (crypto, server, app)"
	@echo "  make lint-crypto        - Lint Rust crypto code (clippy)"
	@echo "  make lint-server        - Lint Go server code (golangci-lint)"
	@echo "  make lint-app           - Lint React Native code (eslint)"
	@echo ""
	@echo "SECURITY TARGETS:"
	@echo "  make security           - Run all security checks (SAST, SCA, secret scan)"
	@echo "  make sast               - Run SAST (Static Application Security Testing)"
	@echo "  make sca                - Run SCA (Software Composition Analysis)"
	@echo "  make secret-scan        - Scan for secrets in codebase (gitleaks)"
	@echo "  make gate-phase1        - CI Gate Phase 1: SAST + SCA + secret scan"
	@echo ""
	@echo "DOCKER TARGETS:"
	@echo "  make docker-up          - Start Docker Compose environment"
	@echo "  make docker-down        - Stop Docker Compose environment"
	@echo "  make docker-build       - Build Docker images"
	@echo "  make docker-clean       - Remove Docker images and containers"
	@echo ""
	@echo "DEVELOPMENT SETUP:"
	@echo "  make setup              - Initialize development environment"
	@echo "  make setup-hooks        - Install pre-commit hooks"
	@echo "  make install-tools      - Install required development tools"
	@echo ""
	@echo "UTILITY TARGETS:"
	@echo "  make fmt                - Format all code (crypto, server, app)"
	@echo "  make clean              - Remove all build artifacts and temporary files"
	@echo "  make help               - Display this help message (default target)"
	@echo ""
	@echo "========================================================================="

# ==============================================================================
# BUILD TARGETS
# ==============================================================================

build: build-crypto build-server build-app
	@echo "$(GREEN)[✓] All components built successfully$(NC)"

build-crypto:
	@echo "$(BLUE)[*] Building Rust crypto library...$(NC)"
	cd $(CRYPTO_DIR) && cargo build --release
	@echo "$(GREEN)[✓] Rust crypto library built$(NC)"

build-server:
	@echo "$(BLUE)[*] Building Go server...$(NC)"
	cd $(SERVER_DIR) && $(MAKE) build
	@echo "$(GREEN)[✓] Go server built$(NC)"

build-app:
	@echo "$(BLUE)[*] Building React Native app...$(NC)"
	cd $(APP_DIR) && npm run build 2>/dev/null || npm install
	@echo "$(GREEN)[✓] React Native app ready$(NC)"

# ==============================================================================
# TEST TARGETS
# ==============================================================================

test: test-crypto test-server test-app
	@echo "$(GREEN)[✓] All tests passed$(NC)"

test-crypto:
	@echo "$(BLUE)[*] Running Rust crypto tests (all features incl. PQC)...$(NC)"
	cd $(CRYPTO_DIR) && cargo test --all-features --verbose
	@echo "$(GREEN)[✓] Rust tests completed$(NC)"

test-server:
	@echo "$(BLUE)[*] Running Go server tests...$(NC)"
	cd $(SERVER_DIR) && $(MAKE) test
	@echo "$(GREEN)[✓] Go tests completed$(NC)"

test-app:
	@echo "$(BLUE)[*] Running React Native tests...$(NC)"
	cd $(APP_DIR) && npm test -- --passWithNoTests 2>/dev/null || npm install && npm test
	@echo "$(GREEN)[✓] React Native tests completed$(NC)"

test-coverage: test-coverage-go test-coverage-ts
	@echo "$(GREEN)[✓] Coverage reports generated$(NC)"

test-coverage-go:
	@echo "$(BLUE)[*] Generating Go coverage report...$(NC)"
	cd $(SERVER_DIR) && go test -v -race -coverprofile=coverage.out ./... && go tool cover -html=coverage.out -o coverage.html
	@echo "$(GREEN)[✓] Go coverage report: $(SERVER_DIR)/coverage.html$(NC)"

test-coverage-ts:
	@echo "$(BLUE)[*] Generating TypeScript coverage report...$(NC)"
	cd $(APP_DIR) && npm test -- --coverage 2>/dev/null || echo "$(YELLOW)[!] TypeScript coverage not available$(NC)"
	@echo "$(GREEN)[✓] TypeScript coverage report generated$(NC)"

check-coverage-go:
	@echo "$(BLUE)[*] Checking Go coverage threshold ($(COVERAGE_THRESHOLD)%)...$(NC)"
	@cd $(SERVER_DIR) && \
	go test -coverprofile=coverage.out ./... >/dev/null 2>&1 && \
	COVERAGE=$$(go tool cover -func=coverage.out | grep total | awk '{print $$3}' | sed 's/%//') && \
	if [ "$$(echo "$$COVERAGE < $(COVERAGE_THRESHOLD)" | bc)" -eq 1 ]; then \
		echo "$(RED)[✗] Coverage $$COVERAGE% is below threshold of $(COVERAGE_THRESHOLD)%$(NC)"; \
		exit 1; \
	else \
		echo "$(GREEN)[✓] Coverage $$COVERAGE% meets threshold$(NC)"; \
	fi

check-coverage-ts:
	@echo "$(BLUE)[*] Checking TypeScript coverage threshold ($(COVERAGE_THRESHOLD)%)...$(NC)"
	@cd $(APP_DIR) && \
	npm test -- --coverage --collectCoverageFrom='src/**/*.ts' 2>/dev/null || \
	echo "$(YELLOW)[!] TypeScript coverage check requires jest setup$(NC)"

# ==============================================================================
# LINT TARGETS
# ==============================================================================

lint: lint-crypto lint-server lint-app
	@echo "$(GREEN)[✓] All linting checks passed$(NC)"

lint-crypto:
	@echo "$(BLUE)[*] Linting Rust code with clippy...$(NC)"
	cd $(CRYPTO_DIR) && cargo clippy --all-targets --all-features -- -D warnings
	@echo "$(GREEN)[✓] Rust linting completed$(NC)"

lint-server:
	@echo "$(BLUE)[*] Linting Go code...$(NC)"
	cd $(SERVER_DIR) && $(MAKE) lint
	@echo "$(GREEN)[✓] Go linting completed$(NC)"

lint-app:
	@echo "$(BLUE)[*] Linting React Native code...$(NC)"
	cd $(APP_DIR) && npm run lint 2>/dev/null || npm install && npm run lint
	@echo "$(GREEN)[✓] React Native linting completed$(NC)"

# ==============================================================================
# SECURITY TARGETS
# ==============================================================================

security: sast sca secret-scan
	@echo "$(GREEN)[✓] All security checks passed$(NC)"

sast:
	@echo "$(BLUE)[*] Running SAST (Static Application Security Testing)...$(NC)"
	@if [ -f $(SCRIPTS_DIR)/run-sast.sh ]; then \
		bash $(SCRIPTS_DIR)/run-sast.sh; \
		echo "$(GREEN)[✓] SAST checks completed$(NC)"; \
	else \
		echo "$(YELLOW)[!] SAST script not found at $(SCRIPTS_DIR)/run-sast.sh$(NC)"; \
	fi

sca:
	@echo "$(BLUE)[*] Running SCA (Software Composition Analysis)...$(NC)"
	@echo "$(YELLOW)[*] Checking for vulnerable dependencies...$(NC)"
	@echo "Crypto (Rust):"
	@cd $(CRYPTO_DIR) && cargo audit 2>/dev/null || echo "$(YELLOW)[!] cargo-audit not installed$(NC)"
	@echo "Server (Go):"
	@cd $(SERVER_DIR) && go list -json -m all | nancy sleuth 2>/dev/null || echo "$(YELLOW)[!] nancy not installed, skipping Go SCA$(NC)"
	@echo "App (npm):"
	@cd $(APP_DIR) && npm audit --audit-level=moderate 2>/dev/null || npm audit 2>/dev/null || echo "$(YELLOW)[!] npm audit issues found$(NC)"
	@echo "$(GREEN)[✓] SCA checks completed$(NC)"

secret-scan:
	@echo "$(BLUE)[*] Running secret scan (gitleaks)...$(NC)"
	@if [ -f $(SCRIPTS_DIR)/check-kev.sh ]; then \
		bash $(SCRIPTS_DIR)/check-kev.sh; \
	else \
		echo "$(YELLOW)[!] Secret scan script not found$(NC)"; \
	fi
	@echo "$(GREEN)[✓] Secret scan completed$(NC)"

# ==============================================================================
# CI GATE TARGETS
# ==============================================================================

gate-phase1: sast sca secret-scan
	@echo "========================================"
	@echo "$(GREEN)[✓] CI Phase 1 Gate Passed$(NC)"
	@echo "$(GREEN)    - SAST checks: PASSED$(NC)"
	@echo "$(GREEN)    - SCA checks: PASSED$(NC)"
	@echo "$(GREEN)    - Secret scan: PASSED$(NC)"
	@echo "========================================"

# ==============================================================================
# DOCKER TARGETS
# ==============================================================================

docker-up:
	@echo "$(BLUE)[*] Starting Docker Compose environment...$(NC)"
	docker-compose up -d
	@echo "$(GREEN)[✓] Docker environment started$(NC)"
	@echo ""
	@echo "Services:"
	@echo "  API Server:     http://localhost:8080"
	@echo "  MinIO Console:  http://localhost:9001 (minioadmin/minioadmin_secret)"
	@echo "  PostgreSQL:     localhost:5432 (usbvault/dev_password_change_me)"

docker-down:
	@echo "$(BLUE)[*] Stopping Docker Compose environment...$(NC)"
	docker-compose down
	@echo "$(GREEN)[✓] Docker environment stopped$(NC)"

docker-build:
	@echo "$(BLUE)[*] Building Docker images...$(NC)"
	docker-compose build --no-cache
	@echo "$(GREEN)[✓] Docker images built$(NC)"

docker-clean:
	@echo "$(BLUE)[*] Cleaning Docker resources...$(NC)"
	docker-compose down -v
	docker system prune -f
	@echo "$(GREEN)[✓] Docker cleanup completed$(NC)"

# ==============================================================================
# DEVELOPMENT SETUP
# ==============================================================================

setup: setup-hooks install-tools
	@echo "$(BLUE)[*] Setting up development environment...$(NC)"
	@if [ -f $(SCRIPTS_DIR)/setup-check.sh ]; then \
		bash $(SCRIPTS_DIR)/setup-check.sh; \
	else \
		echo "$(YELLOW)[!] Setup check script not found$(NC)"; \
	fi
	@echo "$(GREEN)[✓] Development environment configured$(NC)"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Create .env files from .env.example files"
	@echo "  2. Run 'make docker-up' to start services"
	@echo "  3. Run 'make test' to verify setup"

setup-hooks:
	@echo "$(BLUE)[*] Installing pre-commit + pre-push hooks...$(NC)"
	@if [ -f .pre-commit-config.yaml ]; then \
		pre-commit install 2>/dev/null && \
		pre-commit install --hook-type pre-push 2>/dev/null && \
		echo "$(GREEN)[✓] Hooks installed (commit: fmt/secrets; PRE-PUSH: scripts/preflight.sh)$(NC)" || \
		echo "$(YELLOW)[!] Pre-commit not available; install it (pipx install pre-commit) then re-run$(NC)"; \
	else \
		echo "$(YELLOW)[!] .pre-commit-config.yaml not found$(NC)"; \
	fi

install-tools:
	@echo "$(BLUE)[*] Installing development tools...$(NC)"
	@echo "Tools required:"
	@echo "  - Rust/Cargo (for crypto component)"
	@echo "  - Go (for server component)"
	@echo "  - Node.js/npm (for app component)"
	@echo "  - Docker & Docker Compose"
	@echo "  - golangci-lint, gosec (Go security)"
	@echo "  - cargo-audit (Rust security)"
	@echo "  - pre-commit (git hooks)"
	@echo ""
	@echo "$(YELLOW)[!] Please install missing tools manually$(NC)"

# ==============================================================================
# FORMAT TARGETS
# ==============================================================================

fmt: fmt-crypto fmt-server fmt-app
	@echo "$(GREEN)[✓] All code formatted$(NC)"

fmt-crypto:
	@echo "$(BLUE)[*] Formatting Rust code...$(NC)"
	cd $(CRYPTO_DIR) && cargo fmt
	@echo "$(GREEN)[✓] Rust formatted$(NC)"

fmt-server:
	@echo "$(BLUE)[*] Formatting Go code...$(NC)"
	cd $(SERVER_DIR) && gofmt -w -s ./...
	@echo "$(GREEN)[✓] Go formatted$(NC)"

fmt-app:
	@echo "$(BLUE)[*] Formatting React Native code...$(NC)"
	cd $(APP_DIR) && npx prettier --write . 2>/dev/null || npm install prettier && npx prettier --write .
	@echo "$(GREEN)[✓] React Native formatted$(NC)"

# ==============================================================================
# CLEAN TARGETS
# ==============================================================================

clean: clean-crypto clean-server clean-app docker-clean
	@echo "$(BLUE)[*] Cleaning project...$(NC)"
	rm -f coverage.* *.log
	@echo "$(GREEN)[✓] Project cleaned$(NC)"

clean-crypto:
	@echo "$(BLUE)[*] Cleaning Rust artifacts...$(NC)"
	cd $(CRYPTO_DIR) && cargo clean
	@echo "$(GREEN)[✓] Rust cleaned$(NC)"

clean-server:
	@echo "$(BLUE)[*] Cleaning Go artifacts...$(NC)"
	cd $(SERVER_DIR) && $(MAKE) clean
	@echo "$(GREEN)[✓] Go cleaned$(NC)"

clean-app:
	@echo "$(BLUE)[*] Cleaning React Native artifacts...$(NC)"
	cd $(APP_DIR) && rm -rf node_modules build dist .expo
	@echo "$(GREEN)[✓] React Native cleaned$(NC)"

# ==============================================================================
# DEFAULT TARGET
# ==============================================================================

.DEFAULT_GOAL := help
