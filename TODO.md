# Nova PowerShell Extension — TODO

Extension ID: `kainorllc.PowerShell` (must start with the Extension Library organization ID `kainorllc`) · Repo: https://github.com/Kainor-LLC/nova-powershell

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Phase 0 — Project setup
- [x] Create local git repo
- [x] Scaffold `PowerShell.novaextension` bundle (manifest, folders)
- [x] Add MIT LICENSE, README, CHANGELOG, .gitignore
- [x] Create `Kainor-LLC/nova-powershell` repo on GitHub and push
- [x] Load the bundle in Nova (Extensions → Activate Project as Extension)
- [x] Panic developer account signed in (Nova → Settings → General → Account)

## Phase 1 — Syntax highlighting (Tree-sitter)
- [x] Vendor the PowerShell Tree-sitter grammar into `grammar/` (switched from airbus-cert to wharflab: 96% vs 76% clean parses on 2,447 real scripts — see `grammar/VENDORED.md`)
- [x] Install Tree-sitter CLI and generate parser
- [x] Build universal (arm64 + x86_64) `libtree-sitter-powershell.dylib` against Nova's SyntaxKit
- [x] Ad-hoc codesign the dylib
- [x] `Syntaxes/PowerShell.xml`: file detection (.ps1, .psm1, .psd1, .ps1xml?, `#!/usr/bin/env pwsh` shebang)
- [x] Comment rules (`#`, `<# #>`), bracket pairs, auto-closing, indentation rules
- [x] `Queries/highlights.scm` (colors verified in Nova): keywords, cmdlets, variables, `$env:`, operators (`-eq`, `-like`…), strings, here-strings, string interpolation, types `[string]`, attributes, numbers, comments
- [x] `Queries/folds.scm`: script blocks, functions, classes, `#region`/`#endregion`, here-strings
- [x] `Queries/symbols.scm`: functions, classes, methods, enums, params (Symbols sidebar + jump-to-symbol)
- [x] Test file covering edge cases (`tools/samples/`)
- [x] Build script so the dylib can be rebuilt with one command (`tools/build-parser.sh`)

- [x] Grammar fixes: `?.`/`?[`, one-line switch, `break label` — see `grammar/VENDORED.md`
- [x] Grammar: escape char in bareword argument (``Write-Host foo`nbar``) — fixed, tests in `kainor.txt`
- [~] Contribute our grammar fixes upstream to wharflab: PR https://github.com/wharflab/tree-sitter-powershell/pull/112 (awaiting maintainer review; fork kainorllc/tree-sitter-powershell)
- [x] Test highlighting/folding/symbols live in Nova (works; no console errors)
- [x] Re-check colors in Nova after grammar switch

## Phase 2 — Language server (PowerShell Editor Services)
- [x] Decide: bundle PSES (v4.7.0, ~18 MB after trimming Windows-only files and compatibility profiles) — `tools/fetch-pses.sh`
- [x] `Scripts/main.js`: start PSES via `LanguageClient` over stdio using `pwsh`
- [x] Detect `pwsh` (Homebrew paths, `/usr/local/bin`, user setting, login-shell PATH); friendly notice if missing
- [x] Preferences: pwsh path, enable/disable LSP, log level
- [x] Verified in Nova: completions, diagnostics, formatting, go to definition
- [x] Verified in Nova: hover, signature help (signatureHelp "Content Modified" console errors are benign request cancellations)
- [x] Find references: Nova's native "Jump to References"
- [x] Rename Symbol command (PSES renames functions/variables within the current file; one-time disclaimer per session)
- [x] Diagnostics via PSScriptAnalyzer (+ settings file preference)
- [x] Formatting: Nova's native Editor → Format Document/Format Selection use PSES; format-on-save and "New Line After Close Brace" preference are ours; `tools/samples/messy.ps1` for testing
- [x] Code formatting preferences (brace style, indentation, whitespace) passed to PSES
- [x] Command: "Restart PowerShell Language Server"
- [x] Command: "Show Help for Command" (Get-Help -Full in a new document)

## Phase 3 — Debugging (Debug Adapter Protocol)
- [x] Register PSES debug adapter in manifest (`debugAdapters`, `breakpoints`)
- [x] Language server runs PSES in named-pipe mode via `Support/pses-bridge.sh` (stdio debug-only mode crashes on pwsh 7.6: DI assembly conflict)
- [x] `Support/DebugAdapter.ps1` relays DAP to the PSES debug socket and forwards script console output as DAP output events
- [x] Debug Current Script / with Arguments… tasks + "PowerShell Debug" template (verified in Nova)
- [x] Breakpoints, variables, call stack, debug console evaluation, continue (verified in Nova; relay rewrites PSES "label" stack frames so Nova can select them)
- [x] Stepping (in/over/out) — verified via DAP test client and in Nova

## Phase 4 — Extras
- [x] Snippets (31) via JS completion assistant (`Scripts/snippets.js`; XML completions didn't show in Nova): function/func, param, parameter, help, if/ifelse/elseif, switch, loops (foreach/for/while/dountil/dowhile), try/trycatch, class, enum, region, splat, pscustomobject, shouldprocess, Pester blocks
- [x] Tasks: "Run Current Script", "Run Current Script with Arguments…" (prompts, remembers per file), "PowerShell Script" template (script, args, cwd); scripts run -NonInteractive (verified in Nova)
- [x] Pester: "Run Pester Tests" (auto) + "Pester Tests" template (path, output); install hint if Pester 5+ missing; failures reported to Issues (verified in Nova)
- [x] Task errors → Issues sidebar: Nova's task issue matchers never populated Issues (matchers verified working via IssueParser), so `Support/Invoke-NovaTask.ps1` records errors as JSON and the extension publishes them via IssueCollection (verified in Nova)
- [x] Command: "Run Selection in PowerShell" (output in a new tab; verified in Nova)

## Phase 5 — Polish & publish
- [x] Extension icon (`extension.png` 128px + `extension@2x.png` 256px) and `Images/powershell` template glyph for debugger/task templates — generated by `tools/make-icons.swift`
- [x] README: features, requirements (PowerShell 7, Pester), preferences, limitations, troubleshooting, note to disable `io.jah.PowerShell`
- [x] README screenshots: editing, diagnostics, debugging (docs/screenshots)
- [x] Stale language server text after a file changes on disk: Nova reloads the editor but doesn't send didChange, so PSES kept the old text (wrong diagnostic lines, completions). Extension now resends the full text (file watcher + clean-after-change check) (verified in Nova)
- [x] Third-party notices (bundle LICENSE covers the grammar and points to PSES/PSScriptAnalyzer/PSReadLine licenses in Server/)
- [x] CHANGELOG and version 1.0.0; min_runtime 11.0 (parser built as Tree-sitter ABI 14 for older Nova; only tested on Nova 14.1)
- [x] Debug adapter log is opt-in (Log Language Server and Debugger Traffic preference); stale session/log/run files cleaned up at startup
- [x] Tested on Apple Silicon; Intel untested (universal binary, noted in README)
- [~] Test without pwsh installed — verify in Nova (point PowerShell Path at a missing file)
- [x] Submitted to the Extension Library (live 2026-10-09: https://extensions.panic.com/extensions/kainorllc/kainorllc.PowerShell/)
- [x] Tagged and released `v1.0.1` on GitHub (public history squashed to a single commit; full history in the private Kainor-LLC/nova-powershell-history repo)
- [x] 1.0.1: license changed to MIT with the Commons Clause; submitted and tagged `v1.0.1`
- [x] GitHub: public repo, issues on, bug report form, CODEOWNERS, main protected (only maintainer can push/merge)
- [x] CI: grammar tests, ABI check, query compile, sample parsing, JS/manifest checks (`.github/workflows/ci.yml`)

---

## Future ideas
- `Queries/injections.scm`: comment-based help keywords (`.SYNOPSIS`, `.PARAMETER`…)
- Read-Host/console input is not supported while debugging (no console attached)
- Attach to a running PowerShell process (stretch)
- Module manifest (.psd1) helpers (stretch)

## Notes / decisions
- Display name: "PowerShell" (fallback "Kainor PowerShell" if the library rejects a duplicate name).
- Old extension `io.jah.PowerShell` (v0.0.1, Oct 2021) is highlighting-only.
- Requires PowerShell 7+ (`brew install powershell`) for LSP/debugging; highlighting works without it.
