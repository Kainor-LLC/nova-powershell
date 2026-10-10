#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Sample script exercising PowerShell syntax.
.PARAMETER Name
    The name to greet.
#>
#Requires -Version 7.0
using namespace System.Collections.Generic

#region Setup
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory, ValueFromPipeline)]
    [ValidateNotNullOrEmpty()]
    [string]$Name = 'World',

    [int[]]$Numbers = @(1, 2, 0x1F, 1.5e3, 10KB),
    [switch]$Force
)
#endregion

$ErrorActionPreference = 'Stop'
$script:count = 0
$env:PATH += ":/usr/local/bin"
${weird name} = $null
$isReady = $true -and -not $false

function Get-Greeting {
    [OutputType([string])]
    param([string]$Who)
    begin { $list = [List[string]]::new() }
    process {
        $msg = "Hello, $Who! Count: $($script:count + 1) at $(Get-Date -Format 'HH:mm')"
        $list.Add($msg)
    }
    end { return $list -join "`n" }
}

filter Select-Even { if ($_ % 2 -eq 0) { $_ } }

class Person : IComparable {
    [string] $Name
    hidden [int] $Age = 0
    static [int] $Total

    Person([string]$name) { $this.Name = $name }

    [string] ToString() { return "$($this.Name) ($($this.Age))" }
    [int] CompareTo([object]$other) { return $this.Age.CompareTo($other.Age) }
}

enum Color { Red = 1; Green; Blue }

$here = @"
Expandable here-string for $Name
"@
$literal = @'
Literal here-string $notExpanded
'@

$hash = @{ Key = 'value'; 'Other Key' = 42; Nested = @{ A = 1 } }
$hash.Nested.A
$items = Get-ChildItem -Path . -Recurse -Filter *.ps1 | Where-Object { $_.Length -gt 1KB } | Sort-Object Name
$items | ForEach-Object -Parallel { $_.FullName } -ThrottleLimit 4

if ($Name -like 'W*') {
    Write-Host "Starts with W" -ForegroundColor Green
} elseif ($Name -match '^\d+$') {
    Write-Warning 'Numeric'
} else {
    Write-Output $Name
}

switch -Regex ($Name) {
    '^A' { 'A name'; break }
    default { 'Other' }
}

try {
    [System.IO.File]::ReadAllText('/nope') | Out-Null
} catch [System.IO.FileNotFoundException] {
    Write-Error $_.Exception.Message
} finally {
    Remove-Variable -Name here -ErrorAction SilentlyContinue
}

foreach ($n in $Numbers) { $n * 2 }
for ($i = 0; $i -lt 3; $i++) { continue }
while ($false) { break }
do { $i-- } until ($i -le 0)

& { param($x) $x } 5
. ./other.ps1
$sb = { Get-Greeting -Who $Name }
Invoke-Command -ScriptBlock $sb 2>&1 > $null
Get-Process @splat
[void](Test-Path $PSScriptRoot)
$result = $null -eq $x ? 'null' : 'not null'
$value = $maybe ?? 'default'
