// Entry point for the PowerShell extension.

const { PowerShellLanguageServer } = require("./language-server.js");
const { formatEditor } = require("./formatting.js");
const { renameSymbol } = require("./rename.js");
const { showHelp } = require("./help.js");
const { runSelection } = require("./run-selection.js");
const settings = require("./settings.js");
const tasks = require("./tasks.js");
const snippets = require("./snippets.js");

let server = null;

function isPowerShell(editor) {
    return editor && editor.document && editor.document.syntax === "powershell";
}

function reportError(err) {
    console.error(err.message || String(err));
    nova.workspace.showErrorMessage(err.message || String(err));
}

exports.activate = function () {
    server = new PowerShellLanguageServer();
    server.start();

    nova.subscriptions.add(tasks.register(server));
    nova.subscriptions.add(snippets.register());

    nova.commands.register("powershell.restartLanguageServer", () => server.restart());

    nova.commands.register("powershell.renameSymbol", (editor) => {
        if (isPowerShell(editor)) {
            renameSymbol(server, editor).catch(reportError);
        }
    });

    nova.commands.register("powershell.showHelp", (editor) => {
        if (isPowerShell(editor)) {
            showHelp(editor).catch(reportError);
        }
    });

    nova.commands.register("powershell.runSelection", (editor) => {
        if (isPowerShell(editor)) {
            runSelection(editor).catch(reportError);
        }
    });

    nova.commands.register("powershell.showLogs", () => {
        nova.workspace.openFile(nova.path.join(nova.extension.globalStoragePath, "logs"));
    });

    // Keep the language server in sync when PowerShell files change on disk (see resyncDocument).
    const isPowerShellPath = (path) => /\.ps[dm]?1$/i.test(path || "");
    const resyncCleanEditors = (path) => {
        for (const editor of nova.workspace.textEditors) {
            if (isPowerShell(editor) && !editor.document.isDirty &&
                (!path || editor.document.path === path)) {
                server.resyncDocument(editor);
            }
        }
    };
    try {
        nova.subscriptions.add(nova.fs.watch(null, (path) => {
            if (typeof path !== "string") {
                resyncCleanEditors(null);
            } else if (isPowerShellPath(path)) {
                const fullPath = nova.path.isAbsolute(path) || !nova.workspace.path
                    ? path
                    : nova.path.join(nova.workspace.path, path);
                // Give Nova a moment to reload the editor first.
                setTimeout(() => resyncCleanEditors(fullPath), 500);
            }
        }));
    } catch (err) {
        console.error(`Could not watch for file changes: ${err.message}`);
    }

    nova.workspace.onDidAddTextEditor((editor) => {
        // A change that leaves the document clean is a reload from disk (or an undo back
        // to the saved text); either way, resend the text.
        editor.onDidStopChanging((editor) => {
            if (isPowerShell(editor) && !editor.document.isDirty) {
                server.resyncDocument(editor);
            }
        });

        editor.onWillSave((editor) => {
            if (isPowerShell(editor) && settings.get("powershell.formatOnSave", "boolean")) {
                return formatEditor(server, editor).catch((err) => console.error(err.message));
            }
        });
    });

    const restartKeys = [
        "powershell.pwshPath",
        "powershell.languageServer.enabled",
        "powershell.languageServer.logLevel",
        "powershell.languageServer.debug",
        "powershell.enableProfileLoading",
    ];
    for (const key of restartKeys) {
        nova.config.onDidChange(key, () => server.restart());
    }

    const settingKeys = [
        "powershell.scriptAnalysis.enable",
        "powershell.scriptAnalysis.settingsPath",
        "powershell.codeFormatting.preset",
        "powershell.codeFormatting.openBraceOnSameLine",
        "powershell.codeFormatting.newLineAfterCloseBrace",
        "powershell.codeFormatting.pipelineIndentationStyle",
        "powershell.codeFormatting.useCorrectCasing",
        "powershell.codeFormatting.autoCorrectAliases",
    ];
    for (const key of settingKeys) {
        nova.config.onDidChange(key, () => server.pushSettings());
        nova.workspace.config.onDidChange(key, () => server.pushSettings());
    }
};

exports.deactivate = function () {
    if (server) {
        server.stop();
        server = null;
    }
};
