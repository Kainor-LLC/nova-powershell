// Shows Get-Help output for the command under the cursor.

const { findPwsh } = require("./pwsh.js");
const { documentText } = require("./edits.js");

const COMMAND_CHAR = /[\w\-]/;
const COMMAND_NAME = /^[A-Za-z_][\w\-]*$/;

function commandAt(editor) {
    if (!editor.selectedRange.empty) {
        return editor.selectedText.trim();
    }
    const text = documentText(editor);
    let start = editor.selectedRange.start;
    let end = start;
    while (start > 0 && COMMAND_CHAR.test(text[start - 1])) {
        start--;
    }
    while (end < text.length && COMMAND_CHAR.test(text[end])) {
        end++;
    }
    return text.slice(start, end);
}

function runGetHelp(pwsh, name) {
    return new Promise((resolve, reject) => {
        // The name goes through the environment so it is never parsed as script text.
        const script = "Get-Help -Name $env:NOVA_PS_HELP_NAME -Full -ErrorAction Stop | Out-String -Width 120";
        const process = new Process(pwsh, {
            args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
            env: { NOVA_PS_HELP_NAME: name },
        });
        const out = [];
        const err = [];
        const strip = (line) => line.replace(/\r?\n$/, "");
        process.onStdout((line) => out.push(strip(line)));
        process.onStderr((line) => err.push(strip(line)));
        process.onDidExit((status) => {
            if (status === 0) {
                resolve(out.join("\n"));
            } else {
                reject(new Error(err.join("\n").trim() || `Get-Help exited with status ${status}`));
            }
        });
        process.start();
    });
}

async function showHelp(editor) {
    const name = commandAt(editor);
    if (!COMMAND_NAME.test(name)) {
        nova.workspace.showInformativeMessage("Place the cursor on a command name to show its help.");
        return;
    }

    const pwsh = await findPwsh();
    if (!pwsh) {
        nova.workspace.showErrorMessage("PowerShell 7 (pwsh) was not found.");
        return;
    }

    try {
        const help = await runGetHelp(pwsh, name);
        nova.workspace.openNewTextDocument({ content: help.trim() + "\n", syntax: "plaintext" });
    } catch (err) {
        nova.workspace.showErrorMessage(`No help found for ${name}.\n\n${err.message}`);
    }
}

exports.showHelp = showHelp;
