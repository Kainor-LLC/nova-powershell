#!/bin/zsh
# Builds the universal Tree-sitter parser dylibs for Nova and copies them into the extension bundle.
# Usage: tools/build-parser.sh [path/to/Nova.app]
set -euo pipefail

ROOT="${0:A:h:h}"
NOVA_APP="${1:-/Applications/Nova.app}"
SYNTAXES="$ROOT/PowerShell.novaextension/Syntaxes"

# build <grammar folder> <parser name>
build() {
    local grammar="$ROOT/grammar/$1"
    local name="$2"
    local build="$grammar/build"
    local out="$SYNTAXES/libtree-sitter-$name.dylib"
    mkdir -p "$build"

    # Regenerate parser.c only if grammar.js is newer. ABI 14 keeps the parser loadable by older Nova releases.
    if [[ "$grammar/grammar.js" -nt "$grammar/src/parser.c" ]]; then
        (cd "$grammar" && tree-sitter generate --abi 14)
    fi

    local sources=("$grammar/src/parser.c")
    [[ -f "$grammar/src/scanner.c" ]] && sources+=("$grammar/src/scanner.c")

    clang -O2 -dynamiclib -fPIC \
        -arch arm64 -arch x86_64 \
        -mmacosx-version-min=11.0 \
        -I"$grammar/src" \
        -F"$NOVA_APP/Contents/Frameworks" -framework SyntaxKit \
        -rpath @loader_path/../Frameworks \
        -install_name "libtree-sitter-$name.dylib" \
        "${sources[@]}" \
        -o "$build/libtree-sitter-$name.dylib" 2> >(grep -v "ld: warning: building for macOS" >&2)

    codesign --force --sign - "$build/libtree-sitter-$name.dylib"
    # Replace (not overwrite) the dylib: overwriting a signed binary that Nova has
    # loaded invalidates its code signature and macOS kills anything that maps it.
    rm -f "$out"
    cp "$build/libtree-sitter-$name.dylib" "$out"
    echo "Built $out"
    lipo -info "$out"
}

build tree-sitter-powershell powershell
build tree-sitter-powershell-help powershell_help
