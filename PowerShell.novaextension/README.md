**PowerShell** brings full PowerShell 7 support to Nova: accurate syntax highlighting, completions, live diagnostics, formatting, tasks, and a debugger.

## Features

![Syntax highlighting and completions](https://raw.githubusercontent.com/Kainor-LLC/nova-powershell/main/docs/screenshots/editing.png)

### Editing

- **Syntax highlighting** built on Tree-sitter, including PowerShell 7 syntax (`? :`, `??`, `??=`, `?.`), classes, enums, here-strings, and string interpolation
- **Code folding** for blocks, comment-based help, here-strings, and `#region` / `#endregion`
- **Symbols sidebar** with functions, classes, methods, properties, enums, and regions
- **Snippets** for advanced functions, comment-based help, control flow, classes, splatting, and Pester (type `function`, `help`, `foreach`, `try`, `Describe`, …)

### Language features

Powered by [PowerShell Editor Services](https://github.com/PowerShell/PowerShellEditorServices), the engine behind the official VS Code extension (bundled, no setup needed):

- **Completions** for commands, parameters, variables, and .NET types
- **Hover help** and **parameter hints**
- **Jump to Definition** and **Jump to References**
- **Live diagnostics** from PSScriptAnalyzer
- **Format Document** and **Format Selection** (Editor menu), with optional format on save
- **Rename Symbol** for functions and variables in the current file (Editor menu)
- **Show Help for Command**: full `Get-Help` output for the command under the cursor (Editor menu)
- **Run Selection in PowerShell**: runs the selected lines (or the current line) and shows the output in a new tab (Editor menu)

### Module manifests

- **Completions** for manifest keys (with descriptions) and known values such as `CompatiblePSEditions` and `ProcessorArchitecture`; `GUID` is generated for you. In an empty `.psd1`, type `manifest` for a complete skeleton.
- **Checks on save**: `Test-ModuleManifest` problems appear in the Issues sidebar on the key they concern, plus warnings for `FunctionsToExport` entries that aren't defined and a hint for functions that are defined but not exported. Module files are parsed, never run.
- **New Module Manifest…** (Extensions menu) creates a module folder with a manifest and an empty `.psm1`.

![PSScriptAnalyzer warnings in the editor and Issues sidebar](https://raw.githubusercontent.com/Kainor-LLC/nova-powershell/main/docs/screenshots/diagnostics.png)

### Tasks

Available from the task menu in the toolbar:

- **Run Current Script** and **Run Current Script with Arguments…**
- **Debug Current Script** and **Debug Current Script with Arguments…**
- **Run Pester Tests**

Errors and failed tests appear in the Issues sidebar with their file and line. For a reusable setup, add a **PowerShell Script**, **PowerShell Debug**, or **Pester Tests** task in Project Settings → Tasks.

### Debugging

![Debugging a script stopped at a breakpoint](https://raw.githubusercontent.com/Kainor-LLC/nova-powershell/main/docs/screenshots/debugging.png)

Click the line-number gutter to set a breakpoint, then choose **Debug Current Script**. You get the call stack, variables, stepping, and a debug console where you can evaluate expressions. Script output appears in the debug console.

## Requirements

Syntax highlighting, folding, symbols, and snippets work out of the box. Language features, tasks, and debugging need **PowerShell 7 or later**:

```sh
brew install powershell
```

The extension finds `pwsh` automatically. If it's installed somewhere unusual, set its path in the extension preferences.

To run Pester tests, install Pester 5 or later:

```powershell
Install-Module Pester -Scope CurrentUser
```

If you have the older `io.jah.PowerShell` extension installed, disable it to avoid two PowerShell syntaxes competing.

Works on Apple Silicon and should work on Intel Macs (the syntax parser is built for both), though it has only been tested on Apple Silicon.

## Preferences

In Extensions → Extension Library → PowerShell → Settings:

- **PowerShell Path**: leave empty to detect automatically
- **Enable PSScriptAnalyzer** and a custom **PSScriptAnalyzerSettings.psd1** file (also settable per project)
- **Formatting**: format on save, brace style, `} else {` placement, pipeline indentation, cmdlet casing, and alias expansion

## Known limitations

- `Read-Host` and other console input don't work while running or debugging scripts from a task, since tasks have no console input.
- Rename Symbol only changes the current file.
- Debugging needs the language server to be running (it is, unless you turn it off in preferences).

## Troubleshooting

- **Extensions → Restart Language Server** restarts PowerShell Editor Services.
- **Extensions → Show Language Server Logs** opens the log folder.
- Turn on **Log Language Server and Debugger Traffic** in the preferences to record detailed logs when reporting a bug.

Please report issues at [github.com/Kainor-LLC/nova-powershell](https://github.com/Kainor-LLC/nova-powershell/issues).

## License

Free for anyone to use, including at work. Source is on [GitHub](https://github.com/Kainor-LLC/nova-powershell) under the MIT License with the [Commons Clause](https://commonsclause.com), which doesn't allow selling it or products and services based substantially on it. Bundled components from Microsoft and the Tree-sitter grammar keep their own MIT licenses.
