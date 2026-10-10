// Run Script and Pester tasks.
//
// Tasks run Support/Invoke-NovaTask.ps1, which prints output to the task console and, when
// the run finishes, writes the errors it saw (with file and line) to a JSON file. Nova's
// task issue matchers did not populate the Issues sidebar, so this extension reads that
// file and reports the issues itself.

const { findPwsh } = require("./pwsh.js");
const settings = require("./settings.js");

const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 60 * 60 * 1000;

const issueCollection = new IssueCollection("PowerShell Tasks");
let currentRun = 0;

function resolvePath(path) {
    if (!path) {
        return null;
    }
    path = nova.path.expanduser(path);
    if (!nova.path.isAbsolute(path) && nova.workspace.path) {
        path = nova.path.join(nova.workspace.path, path);
    }
    return path;
}

function configValue(config, key, type) {
    return config ? config.get(key, type) : null;
}

async function activeScriptPath() {
    const editor = nova.workspace.activeTextEditor;
    if (!editor || editor.document.syntax !== "powershell" || !editor.document.path) {
        return null;
    }
    if (editor.document.isDirty) {
        await editor.save();
    }
    return editor.document.path;
}

// Splits an argument string like: -Name "Jane Doe" -Count 3
function splitArgs(text) {
    const args = [];
    const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
        args.push(match[1] ?? match[2] ?? match[3]);
    }
    return args;
}

function askForArgs(script, previous) {
    return new Promise((resolve) => {
        nova.workspace.showInputPanel(
            `Arguments for ${nova.path.basename(script)}:`,
            { label: "Arguments", placeholder: "-Name World", value: previous || "", prompt: "Run" },
            (value) => resolve(value),
        );
    });
}

function fileURI(path) {
    return "file://" + encodeURI(path);
}

function readResults(path) {
    const file = nova.fs.open(path, "r");
    try {
        return JSON.parse(file.read() || "[]");
    } finally {
        file.close();
    }
}

function publishIssues(results) {
    const byFile = new Map();
    for (const result of results) {
        if (!result || !result.file) {
            continue;
        }
        const issue = new Issue();
        issue.message = result.message || "Error";
        if (result.code) {
            issue.code = result.code;
        }
        issue.severity = IssueSeverity.Error;
        issue.line = Math.max(1, result.line || 1);
        if (result.column) {
            issue.column = result.column;
        }
        issue.source = "PowerShell";
        const uri = fileURI(result.file);
        if (!byFile.has(uri)) {
            byFile.set(uri, []);
        }
        byFile.get(uri).push(issue);
    }
    for (const [uri, issues] of byFile) {
        issueCollection.set(uri, issues);
    }
}

// Starts a new run: clears old task issues and watches for this run's result file.
function beginRun() {
    const runId = ++currentRun;
    issueCollection.clear();

    const dir = nova.path.join(nova.extension.globalStoragePath, "runs");
    try {
        nova.fs.mkdir(dir);
    } catch (err) {
        // Already exists.
    }
    const resultPath = nova.path.join(dir, `${nova.crypto.randomUUID()}.json`);

    const started = Date.now();
    const timer = setInterval(() => {
        if (runId !== currentRun || Date.now() - started > POLL_TIMEOUT_MS) {
            clearInterval(timer);
            return;
        }
        if (!nova.fs.access(resultPath, nova.fs.F_OK)) {
            return;
        }
        clearInterval(timer);
        try {
            publishIssues(readResults(resultPath));
        } catch (err) {
            console.error(`Could not read task results: ${err.message}`);
        } finally {
            try {
                nova.fs.remove(resultPath);
            } catch (err) {
                // Ignore.
            }
        }
    }, POLL_INTERVAL_MS);

    return resultPath;
}

function wrapperAction(pwsh, env, cwd) {
    const wrapper = nova.path.join(nova.extension.path, "Support", "Invoke-NovaTask.ps1");
    return new TaskProcessAction(pwsh, {
        // -NonInteractive: tasks have no input, so missing mandatory parameters fail fast instead of prompting.
        args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", wrapper],
        env: Object.assign({ NO_COLOR: "1", NOVA_PS_RESULT_PATH: beginRun() }, env),
        cwd,
    });
}

// PSES joins launch arguments into a command line, so quote values that need it.
function quoteDebugArg(arg) {
    if (/^-[A-Za-z_][\w-]*(:\S*)?$/.test(arg) || /^[\w.\/:+@%,=-]+$/.test(arg)) {
        return arg;
    }
    return `'${arg.replace(/'/g, "''")}'`;
}

function debugAction(server, pwsh, script, args, cwd) {
    const session = server.debugSession();
    if (!session) {
        nova.workspace.showErrorMessage("Debugging needs the PowerShell language server. Turn on \"Enable Language Server\" in the extension preferences, or run Extensions → Restart Language Server.");
        return null;
    }

    const action = new TaskDebugAdapterAction("powershell");
    action.command = pwsh;
    action.args = [
        "-NoLogo", "-NoProfile", "-NonInteractive",
        "-File", nova.path.join(nova.extension.path, "Support", "DebugAdapter.ps1"),
    ];
    action.env = {
        NOVA_PS_SESSION_FILE: session.sessionFile,
        NOVA_PS_OUTPUT_FILE: session.outputFile,
        NOVA_PS_CACHE_DIR: nova.path.join(nova.extension.globalStoragePath, "cache"),
    };
    if (settings.get("powershell.languageServer.debug", "boolean")) {
        // The last session's DAP traffic, for troubleshooting.
        action.env.NOVA_PS_DAP_LOG = nova.path.join(nova.extension.globalStoragePath, "logs", "debug-adapter.log");
    }
    action.transport = "stdio";
    action.debugRequest = "launch";
    action.debugArgs = {
        script,
        args: args.map(quoteDebugArg),
        cwd,
        createTemporaryIntegratedConsole: false,
    };
    return action;
}

class PowerShellTaskAssistant {
    constructor(server) {
        this.server = server;
        // Last arguments entered per script, for "Run Current Script with Arguments…".
        this.lastArgs = new Map();
    }

    provideTasks() {
        const run = new Task("Run Current Script");
        run.setAction(Task.Run, new TaskResolvableAction({ data: { type: "script" } }));

        const runWithArgs = new Task("Run Current Script with Arguments…");
        runWithArgs.setAction(Task.Run, new TaskResolvableAction({ data: { type: "script", askArgs: true } }));

        const pester = new Task("Run Pester Tests");
        pester.setAction(Task.Run, new TaskResolvableAction({ data: { type: "pester" } }));

        const pesterAtCursor = new Task("Run Pester Test at Cursor");
        pesterAtCursor.setAction(Task.Run, new TaskResolvableAction({ data: { type: "pester", atCursor: true } }));

        const debug = new Task("Debug Current Script");
        debug.setAction(Task.Run, new TaskResolvableAction({ data: { type: "script", debug: true } }));

        const debugWithArgs = new Task("Debug Current Script with Arguments…");
        debugWithArgs.setAction(Task.Run, new TaskResolvableAction({ data: { type: "script", debug: true, askArgs: true } }));

        return [run, runWithArgs, debug, debugWithArgs, pester, pesterAtCursor];
    }

    async resolveTaskAction(context) {
        const data = context.data || {};
        const config = context.config;

        const pwsh = await findPwsh();
        if (!pwsh) {
            nova.workspace.showErrorMessage("PowerShell 7 (pwsh) was not found. Install it with: brew install powershell");
            return null;
        }

        if (data.type === "script") {
            const script = resolvePath(configValue(config, "powershell.task.script", "string")) || await activeScriptPath();
            if (!script) {
                nova.workspace.showErrorMessage("Open a saved PowerShell script, or choose a script in the task's settings.");
                return null;
            }

            let args = configValue(config, "powershell.task.args", "array") || [];
            if (data.askArgs) {
                const entered = await askForArgs(script, this.lastArgs.get(script));
                if (entered === undefined || entered === null) {
                    return null;
                }
                this.lastArgs.set(script, entered);
                args = splitArgs(entered);
            }

            const cwd = resolvePath(configValue(config, "powershell.task.cwd", "string"))
                || nova.workspace.path
                || nova.path.dirname(script);

            if (data.debug) {
                return debugAction(this.server, pwsh, script, args, cwd);
            }

            return wrapperAction(pwsh, {
                NOVA_PS_MODE: "Script",
                NOVA_PS_SCRIPT: script,
                NOVA_PS_ARGS: JSON.stringify(args),
            }, cwd);
        }

        if (data.type === "pester") {
            const output = configValue(config, "powershell.pester.output", "string") || "Detailed";
            const env = { NOVA_PS_MODE: "Pester", NOVA_PS_PESTER_OUTPUT: output };

            if (data.atCursor) {
                // The test file open in the editor, and the line the cursor is on.
                const editor = nova.workspace.activeTextEditor;
                const script = await activeScriptPath();
                if (!editor || !script) {
                    nova.workspace.showErrorMessage("Open a saved Pester test file and place the cursor inside a test.");
                    return null;
                }
                const before = editor.getTextInRange(new Range(0, editor.selectedRange.start));
                env.NOVA_PS_PESTER_PATH = script;
                env.NOVA_PS_PESTER_LINE = String(before.split("\n").length);
                return wrapperAction(pwsh, env, nova.workspace.path || nova.path.dirname(script));
            }

            const testPath = resolvePath(configValue(config, "powershell.pester.path", "string"))
                || nova.workspace.path
                || nova.path.dirname(await activeScriptPath() || "");
            env.NOVA_PS_PESTER_PATH = testPath;
            return wrapperAction(pwsh, env, nova.workspace.path || testPath);
        }

        return null;
    }
}

exports.splitArgs = splitArgs;
exports.quoteDebugArg = quoteDebugArg;

exports.register = function (server) {
    return nova.assistants.registerTaskAssistant(new PowerShellTaskAssistant(server), {
        identifier: "powershell",
        name: "PowerShell",
    });
};
