#!/usr/bin/env bash
# Veröffentlicht die GitHub-Release vX.Y.Z – immer mit allen Plattformen:
# Windows (Installer + portabel), macOS (Apple Silicon + Intel) und Linux (AppImage).
# Vorher bauen: npm run dist:all. Fehlt eine Datei, bricht das Skript ab.
# Gibt es die Release schon, werden fehlende/neue Dateien nur hochgeladen.
# Benötigt gh (angemeldet) im PATH.
set -euo pipefail
cd "$(dirname "$0")/.."
V=$(node -p "require('./package.json').version")
TAG="v$V"

FILES=(
  "dist/Pic2Laser-Setup-$V.exe"
  "dist/Pic2Laser-Setup-$V.exe.blockmap"
  "dist/Pic2Laser-Portable-$V.exe"
  "dist/latest.yml"
  "dist/Pic2Laser-$V-mac-arm64.zip"
  "dist/Pic2Laser-$V-mac-x64.zip"
  "dist/Pic2Laser-$V-linux-x64.AppImage"
)

missing=0
for f in "${FILES[@]}"; do
  if [ ! -s "$f" ]; then echo "fehlt: $f" >&2; missing=1; fi
done
grep -q "^version: $V$" dist/latest.yml 2>/dev/null || { echo "dist/latest.yml gehört nicht zu $V" >&2; missing=1; }
# Mac-ZIPs müssen nach dem Signieren neu gepackt sein (build/sign-mac-adhoc.sh)
for arch in arm64 x64; do
  dir=dist/mac; [ "$arch" = arm64 ] && dir=dist/mac-arm64
  zip="dist/Pic2Laser-$V-mac-$arch.zip"
  if [ -s "$zip" ] && [ -d "$dir/Pic2Laser.app" ] && [ "$dir/Pic2Laser.app/Contents/_CodeSignature" -nt "$zip" ]; then
    echo "$zip ist älter als die Signatur – build/sign-mac-adhoc.sh ausführen" >&2; missing=1
  fi
done
if [ "$missing" = 1 ]; then
  echo "Abbruch: Release $TAG braucht Windows, macOS und Linux. Erst 'npm run dist:all' ausführen." >&2
  exit 1
fi

if gh release view "$TAG" >/dev/null 2>&1; then
  echo "Release $TAG gibt es schon – lade die Dateien hoch (vorhandene werden ersetzt)."
  gh release upload "$TAG" "${FILES[@]}" --clobber
  exit 0
fi

# Release-Notizen: Abschnitt „## X.Y.Z …“ aus RELEASENOTES.md
NOTES=$(awk -v v="$V" '$0 ~ "^## "v" " {f=1; next} /^## / {if (f) exit} f' RELEASENOTES.md | sed '/./,$!d')
[ -n "$NOTES" ] || { echo "Kein Abschnitt '## $V' in RELEASENOTES.md" >&2; exit 1; }

# Release nur vom veröffentlichten Stand
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "HEAD ist nicht origin/main – erst mergen/pushen" >&2; exit 1; }

BODY="$NOTES

---
**Downloads**
- **Windows:** \`Pic2Laser-Setup-$V.exe\` (Installer) oder \`Pic2Laser-Portable-$V.exe\` (ohne Installation).
  Nicht signiert – SmartScreen warnt beim ersten Start („Weitere Informationen“ → „Trotzdem ausführen“).
- **macOS:** \`Pic2Laser-$V-mac-arm64.zip\` (Apple Silicon) oder \`Pic2Laser-$V-mac-x64.zip\` (Intel).
  Entpacken und in „Programme“ ziehen. Beim ersten Start: Systemeinstellungen → Datenschutz & Sicherheit → „Dennoch öffnen“.
- **Linux:** \`Pic2Laser-$V-linux-x64.AppImage\` – ausführbar machen (\`chmod +x\`) und starten.

Pic2Laser aktualisiert sich ab 1.9.0 selbst (Hinweis in der App → „Aktualisieren“)."

gh release create "$TAG" --target main --title "Pic2Laser $V" --notes "$BODY" --latest "${FILES[@]}"
