// Maps Nova preferences to PowerShell Editor Services settings.

function get(key, type) {
    const workspaceValue = nova.workspace.config.get(key, type);
    if (workspaceValue !== null && workspaceValue !== undefined) {
        return workspaceValue;
    }
    return nova.config.get(key, type);
}

exports.get = get;

exports.languageServerSettings = function () {
    const settingsPath = get("powershell.scriptAnalysis.settingsPath", "string");

    return {
        powershell: {
            enableProfileLoading: get("powershell.enableProfileLoading", "boolean") ?? false,
            scriptAnalysis: {
                enable: get("powershell.scriptAnalysis.enable", "boolean") ?? true,
                settingsPath: settingsPath ? nova.path.expanduser(settingsPath) : "",
            },
            codeFormatting: {
                preset: get("powershell.codeFormatting.preset", "string") ?? "Custom",
                openBraceOnSameLine: get("powershell.codeFormatting.openBraceOnSameLine", "boolean") ?? true,
                newLineAfterOpenBrace: true,
                newLineAfterCloseBrace: get("powershell.codeFormatting.newLineAfterCloseBrace", "boolean") ?? true,
                pipelineIndentationStyle: get("powershell.codeFormatting.pipelineIndentationStyle", "string") ?? "NoIndentation",
                whitespaceBeforeOpenBrace: true,
                whitespaceBeforeOpenParen: true,
                whitespaceAroundOperator: true,
                whitespaceAfterSeparator: true,
                whitespaceInsideBrace: true,
                whitespaceBetweenParameters: false,
                whitespaceAroundPipe: true,
                addWhitespaceAroundPipe: true,
                trimWhitespaceAroundPipe: false,
                ignoreOneLineBlock: true,
                alignPropertyValuePairs: true,
                useConstantStrings: false,
                useCorrectCasing: get("powershell.codeFormatting.useCorrectCasing", "boolean") ?? false,
                autoCorrectAliases: get("powershell.codeFormatting.autoCorrectAliases", "boolean") ?? false,
                avoidSemicolonsAsLineTerminators: false,
            },
            codeFolding: { enable: true, showLastLine: true },
        },
    };
};
