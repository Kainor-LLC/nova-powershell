#!/bin/zsh
# Updates the pinned PowerShell Editor Services release: downloads it, records the new
# version and checksum in tools/fetch-pses.sh, and installs it into the bundle.
# Usage: tools/bump-pses.sh v4.8.0
set -euo pipefail

VERSION="${1:?usage: tools/bump-pses.sh vX.Y.Z}"
ROOT="${0:A:h:h}"
FETCH="$ROOT/tools/fetch-pses.sh"
URL="https://github.com/PowerShell/PowerShellEditorServices/releases/download/$VERSION/PowerShellEditorServices.zip"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading $URL..."
curl -fsSL -o "$TMP/pses.zip" "$URL"
SHA256="$(shasum -a 256 "$TMP/pses.zip" | awk '{print $1}')"

sed -i '' "s/^VERSION=\".*\"$/VERSION=\"$VERSION\"/; s/^SHA256=\".*\"$/SHA256=\"$SHA256\"/" "$FETCH"
echo "Pinned $VERSION ($SHA256) in tools/fetch-pses.sh"

"$FETCH"
echo
echo "Next: reactivate the extension and test completions, diagnostics, and debugging,"
echo "then bump the version in extension.json, add a CHANGELOG entry, and submit."
