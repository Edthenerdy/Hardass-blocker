#!/usr/bin/env bash
# Render every listing page to an exact-size PNG with headless Chrome.
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
OUT="$(cd "$SRC/.." && pwd)"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"

node "$SRC/build-pages.js"

# name|WIDTHxHEIGHT|extraFlags
shots=(
  "shot-1-cooldown|1280x800|"
  "shot-2-mirror|1280x800|"
  "shot-3-popup|1280x800|"
  "shot-4-nice-try|1280x800|"
  "shot-5-reason|1280x800|"
  "promo-440x280|440x280|"
  "marquee-1400x560|1400x560|"
  "store-icon-128|128x128|--default-background-color=00000000"
)

for row in "${shots[@]}"; do
  IFS='|' read -r name size extra <<< "$row"
  win="${size/x/,}"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size="$win" $extra \
    --screenshot="$(cygpath -w "$OUT/$name.png")" \
    "$(cygpath -w "$SRC/$name.html")" >/dev/null 2>&1 || true
  echo "rendered $name.png ($size)"
done
