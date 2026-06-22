#!/bin/bash
# Health check script for USBVault development environment
# This script verifies all services are running and healthy

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "================================"
echo "USBVault Health Check"
echo "================================"
echo ""

# Check if docker-compose is running
if ! docker-compose ps > /dev/null 2>&1; then
    echo -e "${RED}✗ Docker Compose is not running${NC}"
    exit 1
fi

# Counter for results
checks_passed=0
checks_total=0

# Function to check service
check_service() {
    local service=$1
    local port=$2
    local description=$3

    checks_total=$((checks_total + 1))

    if docker-compose ps "$service" | grep -q "Up"; then
        if [ -z "$port" ]; then
            echo -e "${GREEN}✓${NC} $description (running)"
            checks_passed=$((checks_passed + 1))
        else
            if timeout 2 bash -c "echo >/dev/tcp/localhost/$port" 2>/dev/null; then
                echo -e "${GREEN}✓${NC} $description (http://localhost:$port)"
                checks_passed=$((checks_passed + 1))
            else
                echo -e "${YELLOW}⚠${NC} $description (running but port not responding)"
            fi
        fi
    else
        echo -e "${RED}✗${NC} $description (not running)"
    fi
}

# Check services
echo "Checking Services:"
echo "===================="
check_service "postgres" "5432" "PostgreSQL 16"
check_service "redis" "6379" "Redis 7"
check_service "minio" "9000" "MinIO API"
check_service "minio" "9001" "MinIO Console"
check_service "api" "8080" "API Server"
echo ""

# Test API health endpoint
echo "API Health Endpoint:"
echo "===================="
if curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} API health check passed"
    checks_passed=$((checks_passed + 1))
else
    echo -e "${RED}✗${NC} API health check failed (endpoint not responding)"
fi
checks_total=$((checks_total + 1))
echo ""

# Test Database connection
echo "Database Connection:"
echo "===================="
if docker-compose exec -T postgres psql -U usbvault -d usbvault_dev -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} PostgreSQL connection successful"
    checks_passed=$((checks_passed + 1))
else
    echo -e "${RED}✗${NC} PostgreSQL connection failed"
fi
checks_total=$((checks_total + 1))
echo ""

# Test Redis connection
echo "Redis Connection:"
echo "================="
if docker-compose exec -T redis redis-cli -a dev_redis_pass ping > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Redis connection successful"
    checks_passed=$((checks_passed + 1))
else
    echo -e "${RED}✗${NC} Redis connection failed"
fi
checks_total=$((checks_total + 1))
echo ""

# Test MinIO connection
echo "MinIO Connection:"
echo "================="
if docker-compose exec -T minio curl -s http://localhost:9000/minio/health/live > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} MinIO connection successful"
    checks_passed=$((checks_passed + 1))
else
    echo -e "${RED}✗${NC} MinIO connection failed"
fi
checks_total=$((checks_total + 1))
echo ""

# Summary
echo "================================"
echo "Summary: $checks_passed/$checks_total checks passed"
echo "================================"

if [ "$checks_passed" -eq "$checks_total" ]; then
    echo -e "${GREEN}All systems healthy!${NC}"
    exit 0
elif [ "$checks_passed" -gt $((checks_total / 2)) ]; then
    echo -e "${YELLOW}Most systems operational${NC}"
    exit 0
else
    echo -e "${RED}Critical systems not responding${NC}"
    exit 1
fi
