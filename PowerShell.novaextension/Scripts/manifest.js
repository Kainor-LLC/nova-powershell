// Module manifest (.psd1) support: checks on save, key and value completions, and
// the New Module Manifest… command.

const { findPwsh } = require("./pwsh.js");
const settings = require("./settings.js");
const { documentText } = require("./edits.js");
const { MANIFEST_KEYS, PRIVATEDATA_KEYS, PSDATA_KEYS } = require("./manifest-keys.js");

const ALL_KEYS = [...MANIFEST_KEYS, ...PRIVATEDATA_KEYS, ...PSDATA_KEYS];

function isManifestPath(path) {
    return /\.psd1$/i.test(path || "");
}

// A .psd1 counts as a module manifest when it has manifest keys, or is still mostly empty.
function looksLikeManifest(text) {
    return /^[ \t]*(ModuleVersion|RootModule|GUID)[ \t]*=/im.test(text) || text.trim().length < 200;
}

// Line number (1-based) of a manifest key, or 1 when the key isn't in the file.
function keyLine(text, key) {
    if (!key) {
        return 1;
    }
    const match = new RegExp("^[ \\t]*" + key + "[ \\t]*=", "im").exec(text);
    if (!match) {
        return 1;
    }
    return text.slice(0, match.index).split("\n").length;
}

// Hashtable keys enclosing the end of `text`: [] outside any hashtable, [null] at the
// manifest's top level, [null, "PrivateData"], [null, "PrivateData", "PSData"], and so on.
function hashtableStack(text) {
    const stack = [];
    const n = text.length;
    let i = 0;
    while (i < n) {
        const c = text[i];
        if (c === "<" && text[i + 1] === "#") {
            const end = text.indexOf("#>", i + 2);
            i = end < 0 ? n : end + 2;
        } else if (c === "#") {
            const end = text.indexOf("\n", i);
            i = end < 0 ? n : end;
        } else if (c === "'") {
            i++;
            while (i < n && !(text[i] === "'" && text[i + 1] !== "'")) {
                i += text[i] === "'" ? 2 : 1;
            }
            i++;
        } else if (c === '"') {
            i++;
            while (i < n && !(text[i] === '"' && text[i + 1] !== '"')) {
                i += text[i] === "`" || text[i] === '"' ? 2 : 1;
            }
            i++;
        } else if (c === "{") {
            const lineStart = text.lastIndexOf("\n", i - 1) + 1;
            const match = /(\w+)\s*=\s*@?$/.exec(text.slice(lineStart, i));
            stack.push(match ? match[1] : null);
            i++;
        } else if (c === "}") {
            stack.pop();
            i++;
        } else {
            i++;
        }
    }
    return stack;
}

// Keys already assigned anywhere in the file (lowercased).
function presentKeys(text) {
    const keys = new Set();
    for (const match of text.matchAll(/^[ \t]*(\w+)[ \t]*=/gm)) {
        keys.add(match[1].toLowerCase());
    }
    return keys;
}

// --- Completions ---

function completionKind(name) {
    if (typeof CompletionItemKind === "undefined") {
        return undefined;
    }
    return CompletionItemKind[name] ?? CompletionItemKind.Keyword;
}

function newGuid() {
    return nova.crypto.randomUUID().toLowerCase();
}

function insertTextFor(key) {
    switch (key.type) {
        case "version":
            return `${key.name} = '\${1:${key.placeholder || "1.0.0"}}'`;
        case "guid":
            return `${key.name} = '${newGuid()}'`;
        case "array":
            return `${key.name} = @($1)`;
        case "hashtable":
            if (key.name === "PrivateData") {
                return "PrivateData = @{\n\tPSData = @{\n\t\t$1\n\t}\n}";
            }
            return `${key.name} = @{\n\t$1\n}`;
        case "bool":
            return `${key.name} = $false`;
        default:
            return key.placeholder ? `${key.name} = '\${1:${key.placeholder}}'` : `${key.name} = '$1'`;
    }
}

function keyItem(key) {
    const item = new CompletionItem(key.name, completionKind("Property"));
    item.detail = key.type === "guid" ? "guid (generated)" : key.type;
    item.documentation = key.description;
    item.insertText = insertTextFor(key);
    item.insertTextFormat = key.type === "bool" ? InsertTextFormat.PlainText : InsertTextFormat.Snippet;
    return item;
}

function valueItems(keyName, rest) {
    const key = ALL_KEYS.find((k) => k.name.toLowerCase() === keyName.toLowerCase());
    if (!key || !key.values) {
        return [];
    }
    // Inside an open quote, insert the bare value; otherwise insert it quoted.
    const inQuote = /['"][\w.]*$/.test(rest);
    return key.values.map((value) => {
        const item = new CompletionItem(value, completionKind("Value"));
        item.detail = key.name;
        item.documentation = key.description;
        item.filterText = value;
        item.insertText = inQuote ? value : `'${value}'`;
        return item;
    });
}

function skeletonItem() {
    const item = new CompletionItem("manifest", completionKind("Snippet"));
    item.detail = "Module manifest skeleton";
    item.documentation = "A complete module manifest with a generated GUID and explicit exports.";
    item.insertText = [
        "@{",
        "\tRootModule = '${1:Module}.psm1'",
        "\tModuleVersion = '${2:1.0.0}'",
        `\tGUID = '${newGuid()}'`,
        "\tAuthor = '${3:Author}'",
        "\tCompanyName = '${4:Unknown}'",
        "\tCopyright = '(c) ${3:Author}. All rights reserved.'",
        "\tDescription = '${5:What this module does}'",
        "\tPowerShellVersion = '${6:7.0}'",
        "\tCompatiblePSEditions = @('Core')",
        "\tFunctionsToExport = @($7)",
        "\tCmdletsToExport = @()",
        "\tVariablesToExport = @()",
        "\tAliasesToExport = @()",
        "\tPrivateData = @{",
        "\t\tPSData = @{",
        "\t\t\tTags = @($8)",
        "\t\t\tLicenseUri = ''",
        "\t\t\tProjectUri = ''",
        "\t\t}",
        "\t}",
        "}",
    ].join("\n");
    item.insertTextFormat = InsertTextFormat.Snippet;
    return item;
}

class ManifestCompletionAssistant {
    provideCompletionItems(editor, context) {
        if (!isManifestPath(editor.document.path)) {
            return [];
        }
        const text = documentText(editor);
        if (!looksLikeManifest(text)) {
            return [];
        }

        const line = context.line || "";
        const valueMatch = /^(\w+)\s*=\s*(.*)$/.exec(line);
        if (valueMatch) {
            return valueItems(valueMatch[1], valueMatch[2]);
        }
        // Only at the start of a line (possibly mid-word).
        if (!/^[A-Za-z]*$/.test(line)) {
            return [];
        }

        const stack = hashtableStack(text.slice(0, context.position));
        if (stack.length === 0) {
            return [skeletonItem()];
        }
        let keys;
        if (stack.length === 1) {
            keys = MANIFEST_KEYS;
        } else if (stack[stack.length - 1] === "PSData") {
            keys = PSDATA_KEYS;
        } else if (stack[stack.length - 1] === "PrivateData") {
            keys = PRIVATEDATA_KEYS;
        } else {
            return [];
        }

        const typed = (context.text || "").toLowerCase();
        const present = presentKeys(text);
        return keys
            .filter((key) => key.name.toLowerCase().startsWith(typed) && !present.has(key.name.toLowerCase()))
            .map(keyItem);
    }
}

// --- Checks on save ---

const SEVERITY = {
    error: () => IssueSeverity.Error,
    warning: () => IssueSeverity.Warning,
    info: () => IssueSeverity.Info,
};

function runChecker(pwsh, manifestPath) {
    return new Promise((resolve, reject) => {
        const script = nova.path.join(nova.extension.path, "Support", "Test-NovaManifest.ps1");
        const process = new Process(pwsh, {
            args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", script],
            env: { NOVA_PS_MANIFEST: manifestPath, NO_COLOR: "1" },
            cwd: nova.path.dirname(manifestPath),
        });
        const out = [];
        const err = [];
        process.onStdout((line) => out.push(line));
        process.onStderr((line) => err.push(line));
        process.onDidExit(() => {
            const text = out.join("").trim();
            try {
                resolve(text ? JSON.parse(text) : []);
            } catch (parseErr) {
                reject(new Error(`Could not read the manifest check results: ${parseErr.message}\n${err.join("")}`));
            }
        });
        try {
            process.start();
        } catch (startErr) {
            reject(startErr);
        }
    });
}

class ManifestIssueAssistant {
    async provideIssues(editor) {
        const path = editor.document.path;
        if (!isManifestPath(path) || settings.get("powershell.manifest.validate", "boolean") === false) {
            return [];
        }
        const text = documentText(editor);
        // Only module manifests; other .psd1 files (settings, localized strings) are data.
        if (!/^[ \t]*ModuleVersion[ \t]*=/im.test(text)) {
            return [];
        }
        const pwsh = await findPwsh();
        if (!pwsh) {
            return [];
        }

        const results = await runChecker(pwsh, path);
        return results.map((result) => {
            const issue = new Issue();
            issue.message = result.message;
            issue.severity = (SEVERITY[result.severity] || SEVERITY.warning)();
            issue.line = keyLine(text, result.key);
            issue.source = "Module Manifest";
            return issue;
        });
    }
}

// --- New Module Manifest… ---

function ask(message, options) {
    return new Promise((resolve) => nova.workspace.showInputPanel(message, options, resolve));
}

function chooseFolder(message) {
    return new Promise((resolve) => {
        nova.workspace.showFileChooser(message, {
            prompt: "Create Here",
            allowFiles: false,
            allowFolders: true,
            allowMultiple: false,
        }, resolve);
    });
}

function runNewModuleManifest(pwsh, env) {
    return new Promise((resolve, reject) => {
        // Values arrive through the environment so nothing is parsed as script text.
        const script = [
            "$params = @{",
            "  Path = $env:NOVA_PS_MANIFEST_PATH; RootModule = $env:NOVA_PS_ROOT; ModuleVersion = '1.0.0'",
            "  FunctionsToExport = @(); CmdletsToExport = @(); VariablesToExport = @(); AliasesToExport = @()",
            "}",
            "if ($env:NOVA_PS_AUTHOR) { $params.Author = $env:NOVA_PS_AUTHOR }",
            "if ($env:NOVA_PS_DESCRIPTION) { $params.Description = $env:NOVA_PS_DESCRIPTION }",
            "New-ModuleManifest @params",
        ].join("\n");
        const process = new Process(pwsh, {
            args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
            env: Object.assign({ NO_COLOR: "1" }, env),
        });
        const err = [];
        process.onStderr((line) => err.push(line));
        process.onDidExit((status) => {
            if (status === 0) {
                resolve();
            } else {
                reject(new Error(err.join("").trim() || `New-ModuleManifest exited with status ${status}`));
            }
        });
        process.start();
    });
}

async function newModuleManifest() {
    const pwsh = await findPwsh();
    if (!pwsh) {
        nova.workspace.showErrorMessage("PowerShell 7 (pwsh) was not found. Install it with: brew install powershell");
        return;
    }

    const name = await ask("Module name:", { label: "Name", placeholder: "MyModule", prompt: "Next" });
    if (!name) {
        return;
    }
    if (!/^[A-Za-z][\w.-]*$/.test(name)) {
        nova.workspace.showErrorMessage("Module names can contain letters, numbers, dots, hyphens, and underscores, and must start with a letter.");
        return;
    }
    const author = await ask("Author:", { label: "Author", placeholder: "Your name", prompt: "Next" });
    if (author === null) {
        return;
    }
    const description = await ask("Description (optional):", { label: "Description", prompt: "Next" });
    if (description === null) {
        return;
    }
    const folders = await chooseFolder(`Choose where to create the "${name}" module folder.`);
    if (!folders || folders.length === 0) {
        return;
    }

    // PowerShell finds modules by a folder named after the module.
    let dir = folders[0];
    if (nova.path.basename(dir) !== name) {
        dir = nova.path.join(dir, name);
    }
    const manifestPath = nova.path.join(dir, `${name}.psd1`);
    const modulePath = nova.path.join(dir, `${name}.psm1`);
    if (nova.fs.access(manifestPath, nova.fs.F_OK)) {
        nova.workspace.showErrorMessage(`${manifestPath} already exists.`);
        return;
    }
    try {
        nova.fs.mkdir(dir);
    } catch (err) {
        // Already exists.
    }

    await runNewModuleManifest(pwsh, {
        NOVA_PS_MANIFEST_PATH: manifestPath,
        NOVA_PS_ROOT: `${name}.psm1`,
        NOVA_PS_AUTHOR: author.trim(),
        NOVA_PS_DESCRIPTION: description.trim(),
    });

    if (!nova.fs.access(modulePath, nova.fs.F_OK)) {
        const file = nova.fs.open(modulePath, "w");
        file.write(`# ${name} module\n#\n# Define your functions here, then list the public ones in FunctionsToExport in ${name}.psd1.\n`);
        file.close();
    }

    await nova.workspace.openFile(manifestPath);
}

exports.keyLine = keyLine;
exports.hashtableStack = hashtableStack;
exports.ManifestCompletionAssistant = ManifestCompletionAssistant;
exports.ManifestIssueAssistant = ManifestIssueAssistant;
exports.newModuleManifest = newModuleManifest;

exports.register = function () {
    return [
        nova.assistants.registerIssueAssistant("powershell", new ManifestIssueAssistant(), { event: "onSave" }),
        nova.assistants.registerCompletionAssistant("powershell", new ManifestCompletionAssistant()),
        nova.commands.register("powershell.newModuleManifest", () => {
            newModuleManifest().catch((err) => {
                console.error(err.message || String(err));
                nova.workspace.showErrorMessage(err.message || String(err));
            });
        }),
    ];
};
