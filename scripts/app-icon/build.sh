#!/usr/bin/env bash
# Rebuilds every app icon from scripts/app-icon/draw.mjs: src/app/{icon.svg,apple-icon.png,favicon.ico}
# and public/icons/app/*.png (used by src/app/manifest.ts). src/components/logo.tsx draws the same
# shapes inline; change it with draw.mjs. Needs python3 and the project's Playwright (npm install).
# Run from anywhere: bash scripts/app-icon/build.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
here=scripts/app-icon
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
node "$here/draw.mjs" "$work"
node "$here/render.mjs" "$work"
python3 -I "$here/ico.py" src/app/favicon.ico "$work/png/icon-16.png" "$work/png/icon-32.png" "$work/png/icon-48.png"
cp "$work/icon.svg" src/app/icon.svg
cp "$work/png/apple-180.png" src/app/apple-icon.png
cp "$work/png/icon-192.png" public/icons/app/icon-192.png
cp "$work/png/icon-512.png" public/icons/app/icon-512.png
cp "$work/png/maskable-512.png" public/icons/app/maskable-512.png
# PREVIEW=/path/to/sheet.png keeps a sheet of every size on light, dark and phone backgrounds.
if [ -n "${PREVIEW:-}" ]; then cp "$work/preview.png" "$PREVIEW"; fi
echo "icons written"
