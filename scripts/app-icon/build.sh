#!/usr/bin/env bash
# Rebuilds every app icon from Be Vietnam Pro Bold's lowercase "f" (the wordmark's first letter):
# orange #ff5500 on ink #1a1a1f. Writes src/app/{icon.svg,apple-icon.png,favicon.ico} and
# public/icons/app/*.png, and prints the path for src/components/logo.tsx. Needs python3, curl,
# and the project's Playwright (npm install). Run from anywhere: bash scripts/app-icon/build.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
here=scripts/app-icon
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/font" "$work/py" "$work/out"
# The font (SIL Open Font License) from Google Fonts' repository, into a folder of its own.
curl -fsSL -o "$work/font/BeVietnamPro-Bold.ttf" https://github.com/google/fonts/raw/main/ofl/bevietnampro/BeVietnamPro-Bold.ttf
python3 -m pip install -q --target "$work/py" fonttools
python3 -I "$here/make.py" "$work/py" "$work/font/BeVietnamPro-Bold.ttf" "$work/out"
node "$here/render.mjs" "$work/out"
python3 -I "$here/ico.py" src/app/favicon.ico "$work/out/png/icon-16.png" "$work/out/png/icon-32.png" "$work/out/png/icon-48.png"
cp "$work/out/icon.svg" src/app/icon.svg
cp "$work/out/png/apple-180.png" src/app/apple-icon.png
cp "$work/out/png/icon-192.png" public/icons/app/icon-192.png
cp "$work/out/png/icon-512.png" public/icons/app/icon-512.png
cp "$work/out/png/maskable-512.png" public/icons/app/maskable-512.png
python3 -c "import json,sys; print('Logo path (src/components/logo.tsx F_PATH):'); print(json.load(open(sys.argv[1]))['path'])" "$work/out/logo-path.json"
