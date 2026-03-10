#!/bin/bash
# ─────────────────────────────────────────────────────────────
# QAV — Push to GitHub
# Run this once from Terminal to push your code to:
#   https://github.com/007Byte/Quantum_Shield
# ─────────────────────────────────────────────────────────────

set -e

cd "$(dirname "$0")"

echo ""
echo "⬡  Quantum Armor Vault — GitHub Push"
echo "────────────────────────────────────"
echo ""

# Make sure we're on main
git checkout main 2>/dev/null || true

echo "📦  Repo:   $(git remote get-url origin)"
echo "🌿  Branch: $(git branch --show-current)"
echo "📝  Commit: $(git log --oneline -1)"
echo ""

echo "👤  Enter your GitHub username:"
read -r GH_USER

echo ""
echo "🔑  Enter your GitHub Personal Access Token"
echo "    (Get one at: GitHub → Settings → Developer settings → Personal access tokens → Tokens classic → New token → check 'repo')"
echo ""
read -rs GH_TOKEN

echo ""
echo "🚀  Pushing to GitHub..."
echo ""

# Set the authenticated remote temporarily
git remote set-url origin "https://${GH_USER}:${GH_TOKEN}@github.com/007Byte/Quantum_Shield.git"

# Push
git push -u origin main

# Reset remote URL (don't leave token in config)
git remote set-url origin "https://github.com/007Byte/Quantum_Shield.git"

echo ""
echo "✅  Done! Your code is now live at:"
echo "    https://github.com/007Byte/Quantum_Shield"
echo ""
