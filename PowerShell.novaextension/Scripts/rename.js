// Rename Symbol through PSES (textDocument/rename). PSES renames within the current file.

const { documentText, toPosition, applyTextEdits, editsForUri } = require("./edits.js");

const IDENTIFIER = /[\w\-:]/;

function wordAt(text, offset) {
    let start = offset;
    let end = offset;
    while (start > 0 && IDENTIFIER.test(text[start - 1])) {
        start--;
    }
    while (end < text.length && IDENTIFIER.test(text[end])) {
        end++;
    }
    return text.slice(start, end);
}

function askForName(current) {
    return new Promise((resolve) => {
        nova.workspace.showInputPanel(
            "Rename symbol to:",
            { label: "New Name", placeholder: current, value: current, prompt: "Rename" },
            (value) => resolve(value),
        );
    });
}

async function renameSymbol(server, editor) {
    const text = documentText(editor);
    const offset = editor.selectedRange.start;
    const current = wordAt(text, offset).replace(/^\$/, "");
    if (!current) {
        nova.workspace.showInformativeMessage("Place the cursor on a function or variable to rename it.");
        return;
    }

    const newName = await askForName(current);
    if (!newName || newName === current) {
        return;
    }

    const uri = editor.document.uri;
    const workspaceEdit = await server.sendRequest("textDocument/rename", {
        textDocument: { uri },
        position: toPosition(text, offset),
        newName: newName.replace(/^\$/, ""),
    });

    const edits = editsForUri(workspaceEdit, uri);
    if (edits.length === 0) {
        nova.workspace.showInformativeMessage(`"${current}" can't be renamed. PowerShell rename supports functions and variables in the current file.`);
        return;
    }
    await applyTextEdits(editor, edits);
}

exports.renameSymbol = renameSymbol;
