.PHONY: dev down reset logs migrate test lint build clean help

# Default target
help:
	@echo "USBVault Server Development Commands"
	@echo "===================================="
	@echo ""
	@echo "  make dev              - Start Docker containers and run migrations"
	@echo "  make down             - Stop and remove Docker containers"
	@echo "  make reset            - Reset everything (down + remove volumes + up)"
	@echo "  make logs             - Follow API server logs"
	@echo "  make migrate          - Run database migrations"
	@echo "  make test             - Run tests with coverage and race detection"
	@echo "  make lint             - Run linters (golangci-lint and gosec)"
	@echo "  make build            - Build the API binary"
	@echo "  make clean            - Remove build artifacts"
	@echo ""

# Start development environment
dev:
	@echo "Starting USBVault development environment..."
	docker-compose up -d
	@echo "Waiting for services to be ready..."
	@sleep 15
	@echo "Running database migrations..."
	@$(MAKE) migrate
	@echo ""
	@echo "Development environment is ready!"
	@echo "API available at http://localhost:8080"
	@echo "MinIO console at http://localhost:9001 (minioadmin/minioadmin_secret)"
	@echo ""

# Stop development environment
down:
	@echo "Stopping USBVault development environment..."
	docker-compose down
	@echo "Done."

# Reset development environment (removes all data)
reset: down
	@echo "Removing all volumes..."
	docker-compose down -v
	@echo "Starting fresh environment..."
	docker-compose up -d
	@echo "Waiting for services to be ready..."
	@sleep 15
	@echo "Running database migrations..."
	@$(MAKE) migrate
	@echo ""
	@echo "Development environment reset complete!"

# View logs
logs:
	docker-compose logs -f api

# Run database migrations
migrate:
	@echo "Running database migrations..."
	PGPASSWORD=dev_password_change_me psql \
		-h localhost \
		-U usbvault \
		-d usbvault_dev \
		-f ./migrations/001_initial.sql
	@echo "Migrations completed."

# Run tests
test:
	@echo "Running tests with race detection and coverage..."
	go test -race -cover -v ./...

# Run linters
lint:
	@echo "Running golangci-lint..."
	golangci-lint run ./...
	@echo ""
	@echo "Running gosec security scanner..."
	gosec ./...

# Build binary
build:
	@echo "Building API binary..."
	mkdir -p bin
	CGO_ENABLED=1 go build \
		-ldflags="-w -s" \
		-o bin/api \
		./cmd/api
	@echo "Binary built: bin/api"

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf bin/
	go clean

# Health check
health:
	@echo "Checking service health..."
	@curl -s http://localhost:8080/health | jq . || echo "API not responding"
	@echo ""
	@docker-compose ps

# Install development tools
install-tools:
	@echo "Installing development tools..."
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	go install github.com/securego/gosec/v2/cmd/gosec@latest
	@echo "Tools installed."
