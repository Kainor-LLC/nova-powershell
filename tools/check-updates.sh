#!/bin/sh
# Reports newer releases of the components this extension bundles or vendors.
# Usage: tools/check-updates.sh        (prints a report; exits 2 when an update is available)
# Needs the GitHub CLI (gh), signed in or with GH_TOKEN set.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
updates=0

# PowerShell Editor Services (bundles PSScriptAnalyzer and PSReadLine)
pinned=$(sed -n 's/^VERSION="\(.*\)"$/\1/p' "$ROOT/tools/fetch-pses.sh")
latest=$(gh api repos/PowerShell/PowerShellEditorServices/releases/latest --jq .tag_name)
if [ "$pinned" = "$latest" ]; then
    echo "PowerShell Editor Services: $pinned (current)"
else
    echo "PowerShell Editor Services: $pinned pinned, $latest available"
    echo "  UPDATE AVAILABLE: run tools/bump-pses.sh $latest, test in Nova, then release"
    updates=1
fi

# Tree-sitter grammar (vendored from wharflab)
pinned_commit=$(sed -n 's/^`\([0-9a-f]\{40\}\)`\.$/\1/p' "$ROOT/grammar/VENDORED.md" | head -1)
latest_commit=$(gh api repos/wharflab/tree-sitter-powershell/commits/main --jq .sha)
if [ "$pinned_commit" = "$latest_commit" ]; then
    echo "tree-sitter-powershell: ${pinned_commit%${pinned_commit#???????}} (current)"
else
    count=$(gh api "repos/wharflab/tree-sitter-powershell/compare/$pinned_commit...$latest_commit" --jq .ahead_by 2>/dev/null || echo "?")
    echo "tree-sitter-powershell: $count new upstream commit(s) since ${pinned_commit%${pinned_commit#???????}}"
    echo "  See grammar/VENDORED.md for how to re-vendor"
    updates=1
fi

# Our upstream pull request
pr_state=$(gh pr view 112 -R wharflab/tree-sitter-powershell --json state,mergedAt --jq '.state')
echo "Upstream PR wharflab/tree-sitter-powershell#112: $pr_state"
if [ "$pr_state" = "MERGED" ]; then
    echo "  MERGED: re-vendor the grammar and drop the local patches (grammar/VENDORED.md)"
    updates=1
fi

[ "$updates" -eq 0 ] || exit 2
