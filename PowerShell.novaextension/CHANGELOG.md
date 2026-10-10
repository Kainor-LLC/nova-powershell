## Version 1.0.2

- New: Run Selection in PowerShell (Editor menu) runs the selected lines or the current line and shows the output
- Fixed: highlighting error for backtick escapes inside unquoted arguments, like ``Write-Host foo`nbar``
- Fixed: license page formatting in the Extension Library

## Version 1.0.1

- License changed to MIT with the Commons Clause: still free to use, modify, and contribute to, but not to resell.

## Version 1.0.0

Initial release.

- Tree-sitter syntax highlighting, code folding, and symbols, including PowerShell 7 syntax
- Completions, hover help, parameter hints, Jump to Definition, and Jump to References through PowerShell Editor Services
- PSScriptAnalyzer diagnostics
- Format Document, Format Selection, and format on save
- Rename Symbol and Show Help for Command
- Snippets for functions, help, control flow, classes, splatting, and Pester
- Run Current Script, Run with Arguments, and Run Pester Tests tasks, with errors in the Issues sidebar
- Debugging with breakpoints, stepping, variables, call stack, and a debug console
