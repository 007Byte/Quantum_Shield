#!/bin/bash
# Capture App Store screenshots at all required device sizes.
# Usage: ./scripts/capture-screenshots.sh
#
# Prerequisites: npx expo start --web must be running on port 8081
# Output: screenshots/ directory with subdirectories per device size

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== USBVault App Store Screenshot Capture ==="
echo ""

# Run screenshot tests for each device size
for project in screenshots-iphone-6.7 screenshots-iphone-6.5 screenshots-ipad-12.9; do
  echo "📱 Capturing: $project"
  npx playwright test \
    --project="$project" \
    e2e/screenshots.spec.ts \
    --reporter=list \
    2>&1 | grep -E "✓|✗|passed|failed"
  echo ""
done

# Count results
TOTAL=$(find "$APP_DIR/screenshots" -name "*.png" 2>/dev/null | wc -l | tr -d ' ')
echo "=== Done: $TOTAL screenshots captured ==="
echo "Location: $APP_DIR/screenshots/"
ls -la "$APP_DIR/screenshots/" 2>/dev/null
