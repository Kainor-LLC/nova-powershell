#!/bin/zsh
# Downloads a pinned PowerShell Editor Services release into the extension bundle.
# Usage: tools/fetch-pses.sh
set -euo pipefail

VERSION="v4.7.0"
SHA256="5084f0326cc88539e9d880b08f6c52ce5be4672bb8ecee8921e35f8895a6b9d7"
URL="https://github.com/PowerShell/PowerShellEditorServices/releases/download/$VERSION/PowerShellEditorServices.zip"

ROOT="${0:A:h:h}"
DEST="$ROOT/PowerShell.novaextension/Server"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading PowerShell Editor Services $VERSION..."
curl -fsSL -o "$TMP/pses.zip" "$URL"

ACTUAL="$(shasum -a 256 "$TMP/pses.zip" | awk '{print $1}')"
if [[ "$ACTUAL" != "$SHA256" ]]; then
    echo "Checksum mismatch: expected $SHA256, got $ACTUAL" >&2
    exit 1
fi

unzip -q "$TMP/pses.zip" -d "$TMP/x"

# Windows PowerShell 5.1 binaries are never used on macOS.
rm -rf "$TMP/x/PowerShellEditorServices/bin/Desktop"
# ~280 MB of profiles used only by the opt-in PSUseCompatible* analyzer rules.
rm -rf "$TMP"/x/PSScriptAnalyzer/*/compatibility_profiles
rm -rf "$TMP/x/docs"
# PowerShell Gallery package signatures (hidden files) aren't used at runtime and
# hidden files can be rejected by the Extension Library upload.
find "$TMP/x" -name ".*" -type f -delete

rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$TMP"/x/{PowerShellEditorServices,PSScriptAnalyzer,PSReadLine,LICENSE,NOTICE.txt} "$DEST/"
echo "$VERSION" > "$DEST/VERSION"

echo "Installed to $DEST ($(du -sh "$DEST" | awk '{print $1}'))"
