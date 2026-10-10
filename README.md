# Nova PowerShell

A PowerShell extension for [Nova](https://nova.app) by Kainor LLC. See the [extension README](PowerShell.novaextension/README.md) for features and usage.

## Layout

- `PowerShell.novaextension/` — the extension bundle (what ships to the Extension Library)
  - `Syntaxes/`, `Queries/` — Tree-sitter syntax, highlighting, folding, and symbols
  - `Scripts/` — extension JavaScript (language client, tasks, snippets, commands)
  - `Support/` — helper scripts run by the extension (see below)
  - `Server/` — PowerShell Editor Services, downloaded by `tools/fetch-pses.sh` (not in git)
- `grammar/` — vendored Tree-sitter grammar with local changes ([VENDORED.md](grammar/VENDORED.md))
- `tools/` — build scripts and test samples
- `TODO.md` — roadmap and progress

## How it fits together

- **Language server:** Nova's `LanguageClient` runs `Support/pses-bridge.sh`, which starts PowerShell Editor Services (PSES) with Unix sockets and bridges stdio to its language service socket with `nc -U`. Socket mode is what enables the PSES debug service; PSES's stdio debug-only mode crashes on PowerShell 7.6.
- **Debugging:** Debug tasks launch `Support/DebugAdapter.ps1`, a stdio debug adapter that relays DAP to the PSES debug socket. It forwards the script's console output (captured by the bridge) as DAP output events, and rewrites PSES's `label` stack frames so Nova can select them.
- **Tasks:** Run and Pester tasks run `Support/Invoke-NovaTask.ps1`, which writes errors with file and line to a JSON file that the extension publishes to the Issues sidebar.

## Developing

1. Run `tools/fetch-pses.sh` to download PowerShell Editor Services into the bundle.
2. Open this folder in Nova.
3. Extensions → Activate Project as Extension (enable "Show extension development items" in Nova Settings → General first).

After changing the grammar, run `tools/build-parser.sh` (needs `brew install tree-sitter-cli`) and reactivate the extension. Run `tree-sitter test` in `grammar/tree-sitter-powershell` for grammar tests.

To regenerate the icons, run `swift tools/make-icons.swift PowerShell.novaextension`.

## License

MIT with the [Commons Clause](https://commonsclause.com): free to use, modify, share, and contribute to, including at work, but not to sell, or to sell products or services based substantially on it. See [LICENSE](LICENSE).

Bundled third-party components keep their own MIT licenses, listed in [PowerShell.novaextension/LICENSE](PowerShell.novaextension/LICENSE).

Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
