// Conversions between Nova editor offsets and LSP positions, and applying LSP text edits.
// LSP positions count UTF-16 code units, which matches JavaScript string indexing.

function documentText(editor) {
    return editor.getTextInRange(new Range(0, editor.document.length));
}

function lineStartOffsets(text) {
    const offsets = [0];
    for (let i = 0; i < text.length; i++) {
        if (text[i] === "\n") {
            offsets.push(i + 1);
        }
    }
    return offsets;
}

function toOffset(offsets, textLength, position) {
    if (position.line >= offsets.length) {
        return textLength;
    }
    return Math.min(offsets[position.line] + position.character, textLength);
}

function toPosition(text, offset) {
    let line = 0;
    let lineStart = 0;
    for (let i = 0; i < offset && i < text.length; i++) {
        if (text[i] === "\n") {
            line++;
            lineStart = i + 1;
        }
    }
    return { line, character: offset - lineStart };
}

async function applyTextEdits(editor, edits) {
    if (!edits || edits.length === 0) {
        return;
    }
    const text = documentText(editor);
    const offsets = lineStartOffsets(text);
    const ranges = edits
        .map((edit) => ({
            start: toOffset(offsets, text.length, edit.range.start),
            end: toOffset(offsets, text.length, edit.range.end),
            newText: edit.newText,
        }))
        // Apply from the end so earlier offsets stay valid.
        .sort((a, b) => b.start - a.start);

    await editor.edit((edit) => {
        for (const r of ranges) {
            edit.replace(new Range(r.start, r.end), r.newText);
        }
    });
}

// Extracts the edits for one document from an LSP WorkspaceEdit.
function editsForUri(workspaceEdit, uri) {
    if (!workspaceEdit) {
        return [];
    }
    const sameUri = (other) => decodeURIComponent(other) === decodeURIComponent(uri);
    if (workspaceEdit.changes) {
        const key = Object.keys(workspaceEdit.changes).find(sameUri);
        if (key) {
            return workspaceEdit.changes[key];
        }
    }
    if (workspaceEdit.documentChanges) {
        return workspaceEdit.documentChanges
            .filter((change) => change.textDocument && sameUri(change.textDocument.uri))
            .flatMap((change) => change.edits);
    }
    return [];
}

exports.documentText = documentText;
exports.toPosition = toPosition;
exports.applyTextEdits = applyTextEdits;
exports.editsForUri = editsForUri;
