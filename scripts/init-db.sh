#!/bin/sh
# Database initialization script for Quantum_Shield
# This script runs automatically when the PostgreSQL container starts

set -e

echo "==================================="
echo "USBVault Database Initialization"
echo "==================================="

# The following SQL will run as the postgres superuser
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create required extensions
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    -- Create schemas
    CREATE SCHEMA IF NOT EXISTS public;

    -- Log initialization
    SELECT 'Extensions created successfully' as status;
EOSQL

echo "Database initialization completed successfully."
echo ""
echo "Created extensions:"
echo "  - uuid-ossp (for UUID generation)"
echo "  - pgcrypto (for cryptographic functions)"
echo ""
echo "Database is ready for migrations."
