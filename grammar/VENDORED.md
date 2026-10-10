# Vendored grammar

`tree-sitter-powershell/` is vendored from https://github.com/wharflab/tree-sitter-powershell
(MIT; a fork of airbus-cert/tree-sitter-powershell, © 2023 Airbus CERT) at commit
`21b365bdcf4609a431f4acfd3af9eeca9a348927`.

## Why wharflab

Parsing 2,447 real-world `.ps1`/`.psm1` files (Pester, PowerShellEditorServices,
PSScriptAnalyzer, dbatools, PowerShell-Docs) with zero ERROR/MISSING nodes:

| Grammar                        | Clean parses |
|--------------------------------|--------------|
| airbus-cert (upstream)         | 75.5%        |
| airbus-cert + our patches      | 75.8%        |
| wharflab (upstream)            | 95.6%        |
| wharflab + our patches (this)  | 96.1%        |

## Local changes (Kainor LLC)

- Null-conditional member access, method calls, and indexing: `${a}?.b`, `${a}?.M()`, `${a}?[0]`.
- Switch clauses may share one line (`'a' { 1 } default { 2 }`).
- `break label` / `continue label` with a bare label name (`label_name` node).
- `class`, `enum`, `hidden`, `static` keywords are exposed as anonymous nodes for highlighting.
- Tests for the above: `test/corpus/kainor.txt`.

These are good candidates to contribute upstream.

Rebuild the Nova parser with `tools/build-parser.sh`. Run grammar tests with `tree-sitter test` from the grammar folder.
