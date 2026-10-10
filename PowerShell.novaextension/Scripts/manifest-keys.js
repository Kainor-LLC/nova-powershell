// Module manifest (.psd1) keys, for completions.
// type: string | version | guid | array | hashtable | bool

exports.MANIFEST_KEYS = [
    { name: "RootModule", type: "string", description: "Script (.psm1) or binary (.dll) module file that this manifest loads.", placeholder: "Module.psm1" },
    { name: "ModuleVersion", type: "version", description: "Version of this module, e.g. 1.0.0.", placeholder: "1.0.0" },
    { name: "CompatiblePSEditions", type: "array", description: "PowerShell editions this module supports: Desktop (Windows PowerShell), Core (PowerShell 7).", values: ["Desktop", "Core"] },
    { name: "GUID", type: "guid", description: "Unique identifier for this module. Generated for you." },
    { name: "Author", type: "string", description: "Author of this module." },
    { name: "CompanyName", type: "string", description: "Company or vendor of this module." },
    { name: "Copyright", type: "string", description: "Copyright statement for this module." },
    { name: "Description", type: "string", description: "What this module does. Shown in the PowerShell Gallery." },
    { name: "PowerShellVersion", type: "version", description: "Minimum PowerShell version required.", placeholder: "7.0", values: ["5.1", "7.0", "7.2", "7.4", "7.5"] },
    { name: "PowerShellHostName", type: "string", description: "Name of the PowerShell host required, e.g. ConsoleHost." },
    { name: "PowerShellHostVersion", type: "version", description: "Minimum version of the PowerShell host required." },
    { name: "DotNetFrameworkVersion", type: "version", description: "Minimum .NET Framework version required (Windows PowerShell only)." },
    { name: "ClrVersion", type: "version", description: "Minimum CLR version required (Windows PowerShell only)." },
    { name: "ProcessorArchitecture", type: "string", description: "Processor architecture required.", values: ["None", "MSIL", "X86", "IA64", "Amd64", "Arm"] },
    { name: "RequiredModules", type: "array", description: "Modules that must be imported before this one. Names or @{ ModuleName = ''; ModuleVersion = '' } entries." },
    { name: "RequiredAssemblies", type: "array", description: "Assemblies (.dll) to load before this module." },
    { name: "ScriptsToProcess", type: "array", description: "Scripts (.ps1) run in the caller's session when the module is imported." },
    { name: "TypesToProcess", type: "array", description: "Type files (.ps1xml) to load." },
    { name: "FormatsToProcess", type: "array", description: "Format files (.ps1xml) to load." },
    { name: "NestedModules", type: "array", description: "Modules imported into this module's session as nested modules." },
    { name: "FunctionsToExport", type: "array", description: "Functions to export. List them explicitly; wildcards slow down module discovery." },
    { name: "CmdletsToExport", type: "array", description: "Cmdlets to export (binary modules). Use @() for none." },
    { name: "VariablesToExport", type: "array", description: "Variables to export. Use @() for none." },
    { name: "AliasesToExport", type: "array", description: "Aliases to export. Use @() for none." },
    { name: "DscResourcesToExport", type: "array", description: "DSC resources to export." },
    { name: "ModuleList", type: "array", description: "Modules packaged with this module (informational)." },
    { name: "FileList", type: "array", description: "Files packaged with this module (informational)." },
    { name: "PrivateData", type: "hashtable", description: "Private data for the module. The PSData entry holds PowerShell Gallery metadata." },
    { name: "HelpInfoURI", type: "string", description: "URI of the HelpInfo XML for updatable help.", placeholder: "https://" },
    { name: "DefaultCommandPrefix", type: "string", description: "Prefix added to this module's command nouns on import." },
];

exports.PRIVATEDATA_KEYS = [
    { name: "PSData", type: "hashtable", description: "PowerShell Gallery metadata: Tags, LicenseUri, ProjectUri, and more." },
];

exports.PSDATA_KEYS = [
    { name: "Tags", type: "array", description: "Tags for PowerShell Gallery search. No spaces in tags." },
    { name: "LicenseUri", type: "string", description: "URL of this module's license.", placeholder: "https://" },
    { name: "ProjectUri", type: "string", description: "URL of this module's project or source repository.", placeholder: "https://" },
    { name: "IconUri", type: "string", description: "URL of an icon for this module.", placeholder: "https://" },
    { name: "ReleaseNotes", type: "string", description: "Release notes for this version." },
    { name: "Prerelease", type: "string", description: "Prerelease label, e.g. beta1. Makes this a prerelease version in the Gallery.", placeholder: "beta1" },
    { name: "RequireLicenseAcceptance", type: "bool", description: "Whether users must accept the license before installing." },
    { name: "ExternalModuleDependencies", type: "array", description: "Required modules that are not in the PowerShell Gallery." },
];
