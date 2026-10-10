#!/bin/zsh
# Builds the universal Tree-sitter parser dylib for Nova and copies it into the extension bundle.
# Usage: tools/build-parser.sh [path/to/Nova.app]
set -euo pipefail

ROOT="${0:A:h:h}"
NOVA_APP="${1:-/Applications/Nova.app}"
GRAMMAR="$ROOT/grammar/tree-sitter-powershell"
BUILD="$GRAMMAR/build"
OUT="$ROOT/PowerShell.novaextension/Syntaxes/libtree-sitter-powershell.dylib"

mkdir -p "$BUILD"

# Regenerate parser.c only if grammar.js is newer
if [[ "$GRAMMAR/grammar.js" -nt "$GRAMMAR/src/parser.c" ]]; then
    # ABI 14 keeps the parser loadable by older Nova releases.
    (cd "$GRAMMAR" && tree-sitter generate --abi 14)
fi

clang -O2 -dynamiclib -fPIC \
    -arch arm64 -arch x86_64 \
    -mmacosx-version-min=11.0 \
    -I"$GRAMMAR/src" \
    -F"$NOVA_APP/Contents/Frameworks" -framework SyntaxKit \
    -rpath @loader_path/../Frameworks \
    -install_name libtree-sitter-powershell.dylib \
    "$GRAMMAR/src/parser.c" "$GRAMMAR/src/scanner.c" \
    -o "$BUILD/libtree-sitter-powershell.dylib"

codesign --force --sign - "$BUILD/libtree-sitter-powershell.dylib"
# Replace (not overwrite) the dylib: overwriting a signed binary that Nova has
# loaded invalidates its code signature and macOS kills anything that maps it.
rm -f "$OUT"
cp "$BUILD/libtree-sitter-powershell.dylib" "$OUT"

echo "Built $OUT"
lipo -info "$OUT"
