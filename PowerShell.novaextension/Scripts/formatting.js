// Document formatting through PSES (textDocument/formatting).

const { applyTextEdits } = require("./edits.js");

async function formatEditor(server, editor) {
    const edits = await server.sendRequest("textDocument/formatting", {
        textDocument: { uri: editor.document.uri },
        options: { tabSize: editor.tabLength, insertSpaces: editor.softTabs },
    });
    await applyTextEdits(editor, edits);
}

exports.formatEditor = formatEditor;
