#!/bin/bash

# Database initialization script for USBVault Enterprise
# This script is mounted into the PostgreSQL container as an initdb script
# OR can be run standalone to initialize a development database.

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}USBVault database initialization starting...${NC}"

# When run as a PostgreSQL docker-entrypoint-initdb.d script,
# the database and user are already created by POSTGRES_USER/POSTGRES_DB env vars.
# We just need to install extensions.
if [ -n "$POSTGRES_USER" ]; then
    echo -e "${YELLOW}Running as PostgreSQL initdb script — installing extensions...${NC}"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "${POSTGRES_DB:-usbvault_dev}" <<-EOSQL
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EOSQL
    echo -e "${GREEN}Extensions installed successfully${NC}"
    exit 0
fi

# Standalone mode: requires DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}Error: DATABASE_URL environment variable is not set${NC}"
    echo "Usage: DATABASE_URL=postgres://user:pass@host:5432/db $0"
    exit 1
fi

echo -e "${YELLOW}Running database migrations...${NC}"

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Check if the migrate binary exists, otherwise use go run
if command -v usbvault-migrate &> /dev/null; then
    echo -e "${YELLOW}Using usbvault-migrate binary...${NC}"
    usbvault-migrate up
elif command -v go &> /dev/null; then
    echo -e "${YELLOW}Running migrations with 'go run'...${NC}"
    cd "$PROJECT_ROOT"
    go run ./cmd/migrate/main.go up
else
    echo -e "${RED}Error: Neither usbvault-migrate nor go found in PATH${NC}"
    echo "Install Go or build the migrate binary: go build -o usbvault-migrate ./cmd/migrate/"
    exit 1
fi

echo -e "${GREEN}Database initialization completed successfully${NC}"
