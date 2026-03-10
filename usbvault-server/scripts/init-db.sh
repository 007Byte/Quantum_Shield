#!/bin/bash

# Database initialization script for Quantum Armor Vault (QAV)
# This script runs database migrations to set up the schema

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check required environment variables
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}Error: DATABASE_URL environment variable is not set${NC}"
    exit 1
fi

echo -e "${YELLOW}Starting database initialization...${NC}"

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Check if we have a Go binary or need to use go run
if command -v usbvault-migrate &> /dev/null; then
    echo -e "${YELLOW}Running migrations...${NC}"
    usbvault-migrate
else
    echo -e "${YELLOW}Running migrations with 'go run'...${NC}"
    cd "$PROJECT_ROOT"
    go run ./cmd/migrate/main.go
fi

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Database initialization completed successfully${NC}"
    exit 0
else
    echo -e "${RED}Database initialization failed${NC}"
    exit 1
fi
