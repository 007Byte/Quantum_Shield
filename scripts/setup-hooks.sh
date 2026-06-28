#!/bin/bash
# Quantum_Shield - Local Git Hooks Setup
# Run this once after cloning the repository

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Quantum_Shield - Dev Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

MISSING_TOOLS=()

# Check required tools
check_tool() {
    if command -v "$1" &> /dev/null; then
        VERSION=$($1 --version 2>&1 | head -1)
        echo -e "${GREEN}[✓]${NC} $1: $VERSION"
    else
        echo -e "${RED}[✗]${NC} $1: NOT FOUND"
        MISSING_TOOLS+=("$1")
    fi
}

echo "Checking required tools..."
echo ""
check_tool "go"
check_tool "cargo"
check_tool "node"
check_tool "npm"
check_tool "docker"
check_tool "git"
echo ""

# Install pre-commit
echo "Setting up pre-commit hooks..."
if command -v pre-commit &> /dev/null; then
    echo -e "${GREEN}[✓]${NC} pre-commit already installed"
else
    echo -e "${YELLOW}[*]${NC} Installing pre-commit..."
    pip install pre-commit --break-system-packages 2>/dev/null || pip install pre-commit
fi

cd "$PROJECT_ROOT"
pre-commit install
echo -e "${GREEN}[✓]${NC} Git hooks installed"

# Check gitleaks
if command -v gitleaks &> /dev/null; then
    echo -e "${GREEN}[✓]${NC} gitleaks already installed"
else
    echo -e "${YELLOW}[!]${NC} gitleaks not installed. Install from: https://github.com/gitleaks/gitleaks#installing"
    echo -e "${YELLOW}    ${NC} On macOS: brew install gitleaks"
    echo -e "${YELLOW}    ${NC} On Linux: see releases page"
fi

# Verify Docker Compose
if docker compose version &> /dev/null; then
    echo -e "${GREEN}[✓]${NC} Docker Compose available"
elif docker-compose version &> /dev/null; then
    echo -e "${GREEN}[✓]${NC} docker-compose available (legacy)"
else
    echo -e "${RED}[✗]${NC} Docker Compose not found"
    MISSING_TOOLS+=("docker-compose")
fi

echo ""

# Summary
if [[ ${#MISSING_TOOLS[@]} -gt 0 ]]; then
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}Missing tools: ${MISSING_TOOLS[*]}${NC}"
    echo -e "${YELLOW}Install missing tools before development${NC}"
    echo -e "${YELLOW}========================================${NC}"
    exit 1
else
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Dev environment setup COMPLETE${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Available make targets:"
    echo "  make help      - Show all targets"
    echo "  make setup     - Full dev environment setup"
    echo "  make test      - Run all tests"
    echo "  make security  - Run all security scans"
    echo "  make docker-up - Start development stack"
fi
