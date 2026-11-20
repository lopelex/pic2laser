#!/usr/bin/env bash
# Ad-hoc-Signatur für die Mac-Builds, wenn unter Linux gebaut wird.
# Ohne Signatur meldet macOS auf Apple Silicon „App ist beschädigt“.
# Benötigt rcodesign (https://github.com/indygreg/apple-platform-rs) und zip im PATH.
set -euo pipefail
cd "$(dirname "$0")/../dist"
VERSION=$(node -p "require('../package.json').version")
for pair in "mac-arm64:arm64" "mac:x64"; do
  dir=${pair%%:*}; arch=${pair##*:}
  [ -d "$dir/Pic2Laser.app" ] || continue
  rcodesign sign "$dir/Pic2Laser.app"
  out="Pic2Laser-$VERSION-mac-$arch.zip"
  rm -f "$out" "$out.blockmap"
  (cd "$dir" && zip -qry -9 "../$out" Pic2Laser.app)
  echo "fertig: dist/$out"
done
