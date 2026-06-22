#!/bin/bash
# Setup verification script for QAV development environment
# Checks system requirements and project configuration

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

checks_passed=0
checks_total=0
warnings=0

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}QAV Setup Verification${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Helper functions
check_command() {
    local cmd=$1
    local description=$2

    checks_total=$((checks_total + 1))

    if command -v "$cmd" &> /dev/null; then
        version=$(eval "$cmd --version 2>&1 | head -1")
        echo -e "${GREEN}✓${NC} $description"
        echo "  $version"
        checks_passed=$((checks_passed + 1))
    else
        echo -e "${RED}✗${NC} $description - NOT FOUND"
        echo "  Install: $cmd"
    fi
}

check_file() {
    local file=$1
    local description=$2

    checks_total=$((checks_total + 1))

    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $description"
        checks_passed=$((checks_passed + 1))
    else
        echo -e "${RED}✗${NC} $description - NOT FOUND at $file"
    fi
}

check_directory() {
    local dir=$1
    local description=$2

    checks_total=$((checks_total + 1))

    if [ -d "$dir" ]; then
        echo -e "${GREEN}✓${NC} $description"
        checks_passed=$((checks_passed + 1))
    else
        echo -e "${RED}✗${NC} $description - NOT FOUND at $dir"
    fi
}

warn() {
    local message=$1
    echo -e "${YELLOW}⚠${NC} WARNING: $message"
    warnings=$((warnings + 1))
}

# System Requirements Check
echo -e "${BLUE}System Requirements${NC}"
echo "===================="
check_command "docker" "Docker Engine"
check_command "docker-compose" "Docker Compose"
check_command "git" "Git Version Control"
echo ""

# Development Tools (Optional but Recommended)
echo -e "${BLUE}Development Tools${NC}"
echo "=================="
check_command "go" "Go Programming Language" || warn "Go not found - needed to build server locally"
check_command "rustc" "Rust Compiler" || warn "Rust not found - needed to build crypto module"
check_command "psql" "PostgreSQL Client" || warn "psql not found - needed for database management"
check_command "redis-cli" "Redis CLI" || warn "redis-cli not found - needed for Redis management"
echo ""

# Project Structure Check
echo -e "${BLUE}Project Structure${NC}"
echo "=================="
check_directory "usbvault-server" "API Server Directory"
check_directory "usbvault-crypto" "Crypto Module Directory"
check_directory "usbvault-app" "Mobile App Directory"
check_directory "scripts" "Scripts Directory"
echo ""

# Configuration Files Check
echo -e "${BLUE}Configuration Files${NC}"
echo "===================="
check_file "docker-compose.yml" "Docker Compose Configuration"
check_file "usbvault-server/Dockerfile" "API Server Dockerfile"
check_file "usbvault-server/Makefile" "API Server Makefile"
check_file "scripts/init-db.sh" "Database Init Script"
check_file ".env.example" "Environment Template"
check_file ".gitignore" "Git Ignore Configuration"
check_file "DOCKER_COMPOSE_SETUP.md" "Docker Compose Documentation"
check_file "DEVELOPMENT_GUIDE.md" "Development Guide"
echo ""

# Environment Configuration Check
echo -e "${BLUE}Environment Configuration${NC}"
echo "=========================="
if [ -f ".env.development" ]; then
    echo -e "${GREEN}✓${NC} .env.development exists"
    checks_passed=$((checks_passed + 1))
    # Check for critical variables
    if grep -q "DATABASE_URL" .env.development; then
        echo -e "  ${GREEN}✓${NC} DATABASE_URL configured"
    else
        warn "DATABASE_URL not found in .env.development"
    fi
else
    echo -e "${YELLOW}⚠${NC} .env.development not found"
    echo "  Copy from .env.example: cp .env.example .env.development"
    warnings=$((warnings + 1))
fi
checks_total=$((checks_total + 1))
echo ""

# Docker Configuration Check
echo -e "${BLUE}Docker Configuration${NC}"
echo "===================="
if docker --version &> /dev/null; then
    echo -e "${GREEN}✓${NC} Docker is available"
    checks_passed=$((checks_passed + 1))

    # Check docker daemon
    if docker ps &> /dev/null; then
        echo -e "${GREEN}✓${NC} Docker daemon is running"
        checks_passed=$((checks_passed + 1))
    else
        echo -e "${RED}✗${NC} Docker daemon is not running"
        echo "  Start Docker Desktop or Docker service"
    fi
else
    echo -e "${RED}✗${NC} Docker not found"
fi
checks_total=$((checks_total + 2))
echo ""

# Resource Check
echo -e "${BLUE}System Resources${NC}"
echo "================="
if [ "$(uname)" == "Darwin" ]; then
    # macOS
    total_mem=$(sysctl -n hw.memsize)
    total_mem_gb=$((total_mem / 1024 / 1024 / 1024))
    echo "Available Memory: ${total_mem_gb}GB"
    if [ "$total_mem_gb" -ge 8 ]; then
        echo -e "${GREEN}✓${NC} Sufficient memory (8GB+ recommended)"
        checks_passed=$((checks_passed + 1))
    elif [ "$total_mem_gb" -ge 4 ]; then
        echo -e "${YELLOW}⚠${NC} Minimum memory (8GB recommended)"
        warnings=$((warnings + 1))
    else
        echo -e "${RED}✗${NC} Insufficient memory (4GB minimum)"
    fi
elif [ "$(uname)" == "Linux" ]; then
    # Linux
    total_mem=$(free -b | awk 'NR==2 {print $2}')
    total_mem_gb=$((total_mem / 1024 / 1024 / 1024))
    echo "Available Memory: ${total_mem_gb}GB"
    if [ "$total_mem_gb" -ge 8 ]; then
        echo -e "${GREEN}✓${NC} Sufficient memory (8GB+ recommended)"
        checks_passed=$((checks_passed + 1))
    elif [ "$total_mem_gb" -ge 4 ]; then
        echo -e "${YELLOW}⚠${NC} Minimum memory (8GB recommended)"
        warnings=$((warnings + 1))
    else
        echo -e "${RED}✗${NC} Insufficient memory (4GB minimum)"
    fi
fi
checks_total=$((checks_total + 1))
echo ""

# Disk Space Check
echo -e "${BLUE}Disk Space${NC}"
echo "==========="
if [ "$(uname)" == "Darwin" ] || [ "$(uname)" == "Linux" ]; then
    available_space=$(df . | awk 'NR==2 {print $4}')
    available_space_gb=$((available_space / 1024 / 1024))
    echo "Available Disk Space: ${available_space_gb}GB"
    if [ "$available_space_gb" -ge 20 ]; then
        echo -e "${GREEN}✓${NC} Sufficient disk space (10GB minimum)"
        checks_passed=$((checks_passed + 1))
    elif [ "$available_space_gb" -ge 10 ]; then
        echo -e "${YELLOW}⚠${NC} Disk space tight (20GB recommended)"
        warnings=$((warnings + 1))
    else
        echo -e "${RED}✗${NC} Insufficient disk space (10GB minimum)"
    fi
    checks_total=$((checks_total + 1))
fi
echo ""

# Summary
echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}================================${NC}"
echo "Checks Passed: $checks_passed/$checks_total"
if [ "$warnings" -gt 0 ]; then
    echo "Warnings: $warnings"
fi
echo ""

# Recommendations
if [ "$checks_passed" -eq "$checks_total" ] && [ "$warnings" -eq 0 ]; then
    echo -e "${GREEN}Ready to start development!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. cd usbvault-server"
    echo "  2. make dev"
    echo "  3. make test"
    exit 0
elif [ "$checks_passed" -ge $((checks_total * 3 / 4)) ]; then
    echo -e "${YELLOW}Most requirements met, but there are issues${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Install missing tools listed above"
    echo "  2. Fix any configuration issues"
    echo "  3. Re-run this script to verify"
    exit 0
else
    echo -e "${RED}Critical requirements not met${NC}"
    echo ""
    echo "Please install missing tools and re-run this script"
    exit 1
fi
