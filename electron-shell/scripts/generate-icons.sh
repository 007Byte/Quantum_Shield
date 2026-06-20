#!/bin/bash
# Generate placeholder app icons from a source PNG
# Usage: ./scripts/generate-icons.sh [source.png]
# If no source provided, generates a purple shield placeholder

set -e
ASSETS_DIR="$(cd "$(dirname "$0")/.." && pwd)/assets"
mkdir -p "$ASSETS_DIR/icons"

SOURCE="${1:-}"

if [ -z "$SOURCE" ]; then
  echo "No source image provided. Creating placeholder icons."
  echo "For production, run: ./scripts/generate-icons.sh /path/to/logo-1024x1024.png"

  # Generate a simple SVG placeholder
  cat > "$ASSETS_DIR/icon-placeholder.svg" << 'SVG'
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a0a3e"/>
      <stop offset="100%" style="stop-color:#0f0620"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="200" fill="url(#bg)"/>
  <path d="M512 180 L780 340 V680 L512 844 L244 680 V340 Z" fill="none" stroke="#8B5CF6" stroke-width="24"/>
  <path d="M512 280 L720 400 V640 L512 760 L304 640 V400 Z" fill="rgba(139,92,246,0.15)"/>
  <text x="512" y="560" text-anchor="middle" font-family="system-ui" font-size="200" font-weight="800" fill="#A855F7">UV</text>
</svg>
SVG
  echo "Placeholder SVG created at $ASSETS_DIR/icon-placeholder.svg"
  echo ""
  echo "To convert to native formats, install ImageMagick and run:"
  echo "  magick $ASSETS_DIR/icon-placeholder.svg -resize 1024x1024 $ASSETS_DIR/icon.png"
  echo "  magick $ASSETS_DIR/icon.png $ASSETS_DIR/icon.icns"
  echo "  magick $ASSETS_DIR/icon.png -resize 256x256 $ASSETS_DIR/icon.ico"
  echo "  for size in 16 32 48 64 128 256 512 1024; do"
  echo '    magick $ASSETS_DIR/icon.png -resize ${size}x${size} $ASSETS_DIR/icons/${size}x${size}.png'
  echo "  done"
  exit 0
fi

# Convert source PNG to all required formats
echo "Generating icons from $SOURCE..."

if ! command -v magick &> /dev/null && ! command -v convert &> /dev/null; then
  echo "Error: ImageMagick not found. Install with: brew install imagemagick"
  exit 1
fi

CONVERT="magick"
command -v magick &> /dev/null || CONVERT="convert"

# macOS .icns (requires iconutil on macOS)
if [ "$(uname)" = "Darwin" ]; then
  ICONSET="$ASSETS_DIR/icon.iconset"
  mkdir -p "$ICONSET"
  for size in 16 32 64 128 256 512; do
    $CONVERT "$SOURCE" -resize ${size}x${size} "$ICONSET/icon_${size}x${size}.png"
    double=$((size * 2))
    $CONVERT "$SOURCE" -resize ${double}x${double} "$ICONSET/icon_${size}x${size}@2x.png"
  done
  iconutil -c icns -o "$ASSETS_DIR/icon.icns" "$ICONSET"
  rm -rf "$ICONSET"
  echo "  macOS: $ASSETS_DIR/icon.icns"
fi

# Windows .ico
$CONVERT "$SOURCE" -resize 256x256 "$ASSETS_DIR/icon.ico"
echo "  Windows: $ASSETS_DIR/icon.ico"

# Linux PNG set
for size in 16 32 48 64 128 256 512 1024; do
  $CONVERT "$SOURCE" -resize ${size}x${size} "$ASSETS_DIR/icons/${size}x${size}.png"
done
echo "  Linux: $ASSETS_DIR/icons/ (8 sizes)"

# Tray icon (16x16 template)
$CONVERT "$SOURCE" -resize 16x16 "$ASSETS_DIR/tray-icon.png"
echo "  Tray: $ASSETS_DIR/tray-icon.png"

echo "Done! All icons generated."
