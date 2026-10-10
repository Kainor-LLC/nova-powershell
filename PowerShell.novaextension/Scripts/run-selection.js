// Runs the selected PowerShell code (or the current line) and shows the output in a new tab.

const { findPwsh } = require("./pwsh.js");

function selectedCode(editor) {
    if (!editor.selectedRange.empty) {
        return editor.selectedText;
    }
    // No selection: use the line the cursor is on.
    const range = editor.getLineRangeForRange(editor.selectedRange);
    return editor.getTextInRange(range);
}

function run(pwsh, code, cwd) {
    return new Promise((resolve, reject) => {
        // The code goes through the environment so it is never re-quoted or split as arguments.
        const script = "$ErrorActionPreference = 'Continue'; . ([scriptblock]::Create($env:NOVA_PS_SELECTION)) *>&1 | Out-String -Width 160";
        const process = new Process(pwsh, {
            args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
            env: { NOVA_PS_SELECTION: code, NO_COLOR: "1" },
            cwd,
        });
        const out = [];
        const strip = (line) => line.replace(/\r?\n$/, "");
        process.onStdout((line) => out.push(strip(line)));
        process.onStderr((line) => out.push(strip(line)));
        process.onDidExit((status) => resolve({ status, output: out.join("\n").trim() }));
        try {
            process.start();
        } catch (err) {
            reject(err);
        }
    });
}

async function runSelection(editor) {
    const code = selectedCode(editor);
    if (!code.trim()) {
        nova.workspace.showInformativeMessage("Select some PowerShell code to run.");
        return;
    }

    const pwsh = await findPwsh();
    if (!pwsh) {
        nova.workspace.showErrorMessage("PowerShell 7 (pwsh) was not found. Install it with: brew install powershell");
        return;
    }

    const cwd = editor.document.path ? nova.path.dirname(editor.document.path) : nova.workspace.path;
    const { status, output } = await run(pwsh, code, cwd || undefined);
    const header = `# Ran ${code.trim().split("\n").length} line(s) from ${editor.document.path ? nova.path.basename(editor.document.path) : "untitled"}` +
        (status === 0 ? "" : ` (exit code ${status})`);
    nova.workspace.openNewTextDocument({
        content: `${header}\n\n${output || "(no output)"}\n`,
        syntax: "plaintext",
    });
}

exports.runSelection = runSelection;
