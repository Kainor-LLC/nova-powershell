<#
.SYNOPSIS
    Runs a script or Pester tests for a Nova task and records errors for the Issues sidebar.
.DESCRIPTION
    Output goes to the task console as usual. When the run finishes, errors that have a
    source location are written as JSON to $env:NOVA_PS_RESULT_PATH, which the extension
    reads to populate the Issues sidebar.
    Inputs come from environment variables so nothing is parsed as script text:
      NOVA_PS_MODE           Script or Pester
      NOVA_PS_SCRIPT         Script path (Script mode)
      NOVA_PS_ARGS           JSON array of script arguments (Script mode)
      NOVA_PS_PESTER_PATH    Test file or folder (Pester mode)
      NOVA_PS_PESTER_OUTPUT  Pester output verbosity (Pester mode)
      NOVA_PS_RESULT_PATH    Where to write the JSON issue list
#>

function ConvertTo-Invocation {
    # Turns ["-Name","World","-Force","pos"] into named and positional arguments,
    # using the script's parameter metadata to tell switches from valued parameters.
    param([string]$ScriptPath, [string[]]$Arguments)

    $parameters = @{}
    try {
        $parameters = (Get-Command -Name $ScriptPath -ErrorAction Stop).Parameters
    }
    catch {
        # Script failed to parse; fall back to guessing.
    }

    $named = [ordered]@{}
    $positional = [System.Collections.Generic.List[object]]::new()
    for ($i = 0; $i -lt $Arguments.Count; $i++) {
        $arg = $Arguments[$i]
        if ($arg -match '^-([A-Za-z_][\w-]*)(?::(.*))?$') {
            $name = $Matches[1]
            $explicitValue = $Matches[2]
            $isSwitch = $parameters.ContainsKey($name) -and $parameters[$name].SwitchParameter
            if ($null -ne $explicitValue) {
                $named[$name] = if ($isSwitch) { [bool]::Parse($explicitValue.TrimStart('$')) } else { $explicitValue }
            }
            elseif (-not $isSwitch -and $i + 1 -lt $Arguments.Count -and $Arguments[$i + 1] -notmatch '^-[A-Za-z_]') {
                $named[$name] = $Arguments[++$i]
            }
            else {
                $named[$name] = $true
            }
        }
        else {
            $positional.Add($arg)
        }
    }
    return @{ Named = $named; Positional = $positional.ToArray() }
}

# Errors stopped by $ErrorActionPreference = 'Stop' wrap the original record.
function Get-InnerRecord {
    param([System.Management.Automation.ErrorRecord]$Record)

    $exception = $Record.Exception
    if ($exception -is [System.Management.Automation.IContainsErrorRecord] -and $exception.ErrorRecord -and
        $exception.ErrorRecord -ne $Record -and $exception.ErrorRecord.InvocationInfo.ScriptName) {
        return $exception.ErrorRecord
    }
    return $Record
}

function Get-ErrorIssue {
    # Locates the error in user code (never in this wrapper); falls back to the script's first line.
    param([System.Management.Automation.ErrorRecord]$Record, [string]$FallbackFile)

    $record = Get-InnerRecord $Record
    $file = $null; $line = 0; $column = 0

    $info = $record.InvocationInfo
    if ($info -and $info.ScriptName -and $info.ScriptName -ne $PSCommandPath) {
        $file = $info.ScriptName; $line = $info.ScriptLineNumber; $column = $info.OffsetInLine
    }
    else {
        foreach ($frame in ($record.ScriptStackTrace -split "`n")) {
            if ($frame -match ', (.+): line (\d+)\s*$' -and $Matches[1] -ne $PSCommandPath) {
                $file = $Matches[1]; $line = [int]$Matches[2]
                break
            }
        }
    }
    if (-not $file) {
        if (-not $FallbackFile) { return }
        $file = $FallbackFile; $line = 1
    }

    [pscustomobject]@{
        file    = $file
        line    = $line
        column  = $column
        message = $record.Exception.Message
        code    = $record.CategoryInfo.Activity
    }
}

function Write-TaskError {
    # Prints an error as "Category: file:line" plus the message, and records it as an issue.
    param($Record, $Issues, [string]$Script)

    $issue = Get-ErrorIssue $Record -FallbackFile $Script
    $name = if ($issue -and $issue.code) { $issue.code } else { $Record.Exception.GetType().Name }
    $location = if ($issue) { " $($issue.file):$($issue.line)" } else { '' }
    $message = (Get-InnerRecord $Record).Exception.Message
    [Console]::Error.WriteLine("${name}:$location")
    foreach ($line in ($message -split "`r?`n")) {
        [Console]::Error.WriteLine("    $line")
    }
    if ($issue) { $Issues.Add($issue) }
}

function Write-TaskOutput {
    param($Issues, [string]$Script)
    process {
        if ($_ -is [System.Management.Automation.ErrorRecord]) {
            Write-TaskError -Record $_ -Issues $Issues -Script $Script
        }
        else {
            $_
        }
    }
}

$issues = [System.Collections.Generic.List[object]]::new()
$exitCode = 0

if ($env:NOVA_PS_MODE -eq 'Pester') {
    $pester = Get-Module -ListAvailable -Name Pester | Where-Object Version -ge '5.0.0' | Sort-Object Version -Descending | Select-Object -First 1
    if (-not $pester) {
        Write-Host 'Pester 5 or later is not installed. Install it with:'
        Write-Host '    Install-Module Pester -Scope CurrentUser'
        exit 1
    }
    Import-Module $pester
    $config = New-PesterConfiguration
    $config.Run.Path = $env:NOVA_PS_PESTER_PATH
    $config.Run.PassThru = $true
    $config.Output.Verbosity = $env:NOVA_PS_PESTER_OUTPUT
    $result = Invoke-Pester -Configuration $config

    foreach ($test in $result.Failed) {
        $record = $test.ErrorRecord | Select-Object -First 1
        $target = $record.TargetObject
        $file = if ($target.File) { $target.File } else { $test.ScriptBlock.File }
        $line = if ($target.Line) { $target.Line } else { $test.StartLine }
        $issues.Add([pscustomobject]@{
            file    = $file
            line    = [int]$line
            column  = 0
            message = "$($test.ExpandedPath): $($record.Exception.Message)"
            code    = 'Pester'
        })
    }
    foreach ($container in $result.Containers | Where-Object Result -eq 'Failed') {
        foreach ($record in $container.ErrorRecord) {
            $issue = Get-ErrorIssue $record -FallbackFile $env:NOVA_PS_PESTER_PATH
            if ($issue) { $issues.Add($issue) }
        }
    }
    $exitCode = [int]$result.FailedCount + [int]$result.FailedContainersCount
}
else {
    $script = $env:NOVA_PS_SCRIPT
    $arguments = @()
    if ($env:NOVA_PS_ARGS) {
        $arguments = @(ConvertFrom-Json -InputObject $env:NOVA_PS_ARGS)
    }
    $invocation = ConvertTo-Invocation -ScriptPath $script -Arguments $arguments

    # Run the script as a nested pipeline rather than inside try/catch: a surrounding try
    # would turn statement-terminating errors into script-terminating ones and change behavior.
    $ps = [powershell]::Create([System.Management.Automation.RunspaceMode]::CurrentRunspace)
    $null = $ps.AddCommand($script)
    foreach ($entry in $invocation.Named.GetEnumerator()) {
        $null = $ps.AddParameter($entry.Key, $entry.Value)
    }
    foreach ($value in $invocation.Positional) {
        $null = $ps.AddArgument($value)
    }
    # Route errors through Write-TaskOutput so they print in order and are recorded.
    $ps.Commands.Commands[0].MergeMyResults('Error', 'Output')
    $null = $ps.AddCommand('Write-TaskOutput').AddParameter('Issues', $issues).AddParameter('Script', $script)
    $null = $ps.AddCommand('Out-Default')

    $global:LASTEXITCODE = 0
    try {
        $null = $ps.Invoke()
        if ($LASTEXITCODE) { $exitCode = $LASTEXITCODE }
    }
    catch {
        # A terminating error ended the script.
        $exception = $_.Exception
        while ($exception -is [System.Management.Automation.MethodInvocationException] -and $exception.InnerException) {
            $exception = $exception.InnerException
        }
        $record = if ($exception -is [System.Management.Automation.IContainsErrorRecord]) { $exception.ErrorRecord } else { $_ }
        Write-TaskError -Record $record -Issues $issues -Script $script
        $exitCode = 1
    }
    finally {
        $ps.Dispose()
    }

    if ($issues.Count -gt 0 -and $exitCode -eq 0) {
        $exitCode = 1
    }
}

if ($env:NOVA_PS_RESULT_PATH) {
    ConvertTo-Json -InputObject @($issues) -Depth 3 | Set-Content -LiteralPath $env:NOVA_PS_RESULT_PATH -Encoding utf8
}
exit $exitCode
