<#
.SYNOPSIS
    Checks a module manifest (.psd1) for the Nova Issues sidebar.
.DESCRIPTION
    Runs Test-ModuleManifest, then compares FunctionsToExport with the functions actually
    defined in the module's files. Module files are parsed, never executed.

    Input:  $env:NOVA_PS_MANIFEST  path to the manifest
    Output: a JSON array of { severity, message, key } where key is the manifest key the
            issue belongs to (the extension places the issue on that key's line).
#>

$ErrorActionPreference = 'Continue'
$path = $env:NOVA_PS_MANIFEST
$issues = [System.Collections.Generic.List[object]]::new()

function Add-Issue([string]$Severity, [string]$Message, [string]$Key) {
    $issues.Add([pscustomobject]@{ severity = $Severity; message = $Message; key = $Key })
}

# Read the manifest as data (no code execution).
$data = $null
try {
    $data = Import-PowerShellDataFile -LiteralPath $path -ErrorAction Stop
}
catch {
    Add-Issue 'error' $_.Exception.Message $null
}

if ($data) {
    # Test-ModuleManifest: one non-terminating error per problem.
    $errs = @()
    $warns = @()
    try {
        $null = Test-ModuleManifest -Path $path -ErrorAction SilentlyContinue -ErrorVariable errs `
            -WarningAction SilentlyContinue -WarningVariable warns 2>$null
    }
    catch {
        # Test-ModuleManifest throws after some type errors; the errors collected so far are still useful.
    }

    foreach ($e in $errs) {
        $message = $e.Exception.Message
        if (-not $message) { continue }   # Test-ModuleManifest can crash after type errors
        $id = "$($e.FullyQualifiedErrorId)"
        $entry = if ($message -match "entry '([^']+)'") { $Matches[1] } else { $null }

        $key = $null
        switch -Regex ($id) {
            'InvalidRootModule' {
                $key = 'RootModule'
                $message = "RootModule '$($data.RootModule)' was not found next to the manifest or could not be loaded."
            }
            'InvalidNestedModule' {
                $key = 'NestedModules'
                if ($entry) { $message = "NestedModules entry '$entry' was not found." }
            }
            'InvalidRequiredModules' {
                $key = 'RequiredModules'
                if ($entry) { $message = "RequiredModules entry '$entry' is not installed on this Mac, so the module can't be imported here." }
            }
            'InvalidFilePath' {
                $key = 'FileList'
                if ($entry) { $message = "FileList entry '$entry' was not found." }
            }
            default {
                if ($message -match "'(\w+)' member") { $key = $Matches[1] }
                elseif ($message -match 'specified (\w+) entry') { $key = $Matches[1] }
            }
        }
        Add-Issue 'error' $message $key
    }
    foreach ($w in $warns) {
        Add-Issue 'warning' "$w" $null
    }

    # Export check: compare FunctionsToExport with functions defined in the module files.
    $exports = $data.FunctionsToExport
    if ($null -ne $exports) {
        $patterns = @(@($exports) | Where-Object { $_ -is [string] })
        $dir = Split-Path -LiteralPath $path

        $files = [System.Collections.Generic.List[string]]::new()
        foreach ($m in @($data.RootModule) + @($data.NestedModules) + @($data.ScriptsToProcess)) {
            if ($m -is [string] -and $m -match '\.(psm1|ps1)$') {
                $full = Join-Path $dir $m
                if (Test-Path -LiteralPath $full) { $files.Add((Resolve-Path -LiteralPath $full).Path) }
            }
        }
        # Dot-sourced layouts (Public/, Private/) keep functions in separate .ps1 files.
        # Subfolders with their own manifest belong to other modules and are skipped.
        $otherModuleDirs = @(Get-ChildItem -LiteralPath $dir -Recurse -File -Filter *.psd1 -ErrorAction SilentlyContinue |
            Where-Object { $_.DirectoryName -ne $dir } | ForEach-Object { $_.DirectoryName + [IO.Path]::DirectorySeparatorChar })
        Get-ChildItem -LiteralPath $dir -Recurse -File -Include *.ps1, *.psm1 -ErrorAction SilentlyContinue |
            Where-Object {
                $full = $_.FullName
                $_.Name -notmatch '\.Tests\.ps1$' -and $full -notmatch '[\\/]\.' -and
                -not ($otherModuleDirs | Where-Object { $full.StartsWith($_) })
            } |
            ForEach-Object { if (-not $files.Contains($_.FullName)) { $files.Add($_.FullName) } }

        $defined = [ordered]@{}
        foreach ($f in $files) {
            $tokens = $null
            $parseErrors = $null
            $ast = [System.Management.Automation.Language.Parser]::ParseFile($f, [ref]$tokens, [ref]$parseErrors)
            if ($null -eq $ast) { continue }
            # Top-level functions only: nested functions can't be exported.
            $functions = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false)
            foreach ($fn in $functions) {
                if (-not $defined.Contains($fn.Name)) { $defined[$fn.Name] = [IO.Path]::GetFileName($f) }
            }
        }

        if ($files.Count -gt 0) {
            foreach ($name in $patterns) {
                if ($name -match '[\*\?]') { continue }
                if (-not $defined.Contains($name)) {
                    Add-Issue 'warning' "FunctionsToExport lists '$name', but no function with that name is defined in the module's files." 'FunctionsToExport'
                }
            }

            $notExported = @($defined.Keys | Where-Object {
                $n = $_
                -not ($patterns | Where-Object { $n -like $_ })
            } | Sort-Object)
            if ($notExported.Count -gt 0) {
                $shown = $notExported | Select-Object -First 8
                $suffix = if ($notExported.Count -gt 8) { ", and $($notExported.Count - 8) more" } else { '' }
                Add-Issue 'info' "Defined but not exported: $($shown -join ', ')$suffix. Add public functions to FunctionsToExport." 'FunctionsToExport'
            }
        }
    }
}

ConvertTo-Json -InputObject @($issues) -Depth 3 -Compress
