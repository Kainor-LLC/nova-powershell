// Runs PowerShell Editor Services (PSES) as a language server over stdio.

const { findPwsh } = require("./pwsh.js");
const settings = require("./settings.js");

const DAY_MS = 24 * 60 * 60 * 1000;

// Deletes files older than maxAgeMs, e.g. left behind if Nova quit unexpectedly.
function removeStaleFiles(dir, maxAgeMs) {
    let names = [];
    try {
        names = nova.fs.listdir(dir);
    } catch (err) {
        return;
    }
    const cutoff = Date.now() - maxAgeMs;
    for (const name of names) {
        const path = nova.path.join(dir, name);
        try {
            const stats = nova.fs.stat(path);
            if (stats && stats.isFile() && stats.mtime.getTime() < cutoff) {
                nova.fs.remove(path);
            }
        } catch (err) {
            // Ignore files that vanish or can't be read.
        }
    }
}

const INSTALL_URL = "https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-macos";

class PowerShellLanguageServer {
    constructor() {
        this.client = null;
        this.stopListener = null;
        this.restarting = false;
        // Files shared with the debug adapter relay for the current server instance.
        this.sessionFile = null;
        this.outputFile = null;
        // Version numbers for resyncs; kept above Nova's own so they read as newer.
        this.resyncVersion = 1000000;
        this.resyncTimers = new Map();
        this.startRetries = 0;
    }

    // Starts are serialized: findPwsh() is async, so overlapping calls could otherwise each
    // see no client and create two LanguageClients with the same identifier.
    start() {
        this.startQueue = (this.startQueue || Promise.resolve())
            .then(() => this.startNow())
            .catch((err) => this.handleStartError(err));
        return this.startQueue;
    }

    handleStartError(err) {
        // Nova keeps a stopped client's identifier reserved until its process has exited.
        // Right after a restart or a reactivation that can take a few seconds, so retry.
        if (/already running/i.test(err.message || "") && this.startRetries < 10) {
            this.startRetries++;
            console.log(`PowerShell Editor Services is still stopping; retrying (${this.startRetries}/10)`);
            setTimeout(() => this.start(), 1500);
            return;
        }
        this.startRetries = 0;
        console.error(`Could not start PowerShell Editor Services: ${err.message}`);
    }

    async startNow() {
        if (this.client) {
            return;
        }
        if (!settings.get("powershell.languageServer.enabled", "boolean")) {
            return;
        }

        const pwsh = await findPwsh();
        if (!pwsh) {
            this.notifyMissingPwsh();
            return;
        }

        const serverDir = nova.path.join(nova.extension.path, "Server");
        const startScript = nova.path.join(serverDir, "PowerShellEditorServices", "Start-EditorServices.ps1");
        if (!nova.fs.access(startScript, nova.fs.F_OK)) {
            console.error(`PowerShell Editor Services not found at ${startScript}`);
            return;
        }

        const logDir = nova.path.join(nova.extension.globalStoragePath, "logs");
        try {
            nova.fs.mkdir(logDir);
        } catch (err) {
            // Already exists.
        }

        const sessionDir = nova.path.join(nova.extension.globalStoragePath, "sessions");
        try {
            nova.fs.mkdir(sessionDir);
        } catch (err) {
            // Already exists.
        }
        removeStaleFiles(sessionDir, DAY_MS);
        removeStaleFiles(logDir, 7 * DAY_MS);
        removeStaleFiles(nova.path.join(nova.extension.globalStoragePath, "runs"), DAY_MS);
        // Unique per server instance, since several Nova windows may each run one.
        const id = nova.crypto.randomUUID();
        this.sessionFile = nova.path.join(sessionDir, `${id}-session.json`);
        this.outputFile = nova.path.join(sessionDir, `${id}-output.log`);

        // pses-bridge.sh starts PSES with Unix sockets (needed for debugging) and connects
        // this stdio client to the language service socket.
        const bridge = nova.path.join(nova.extension.path, "Support", "pses-bridge.sh");
        const args = [
            bridge,
            pwsh,
            serverDir,
            this.sessionFile,
            this.outputFile,
            logDir,
            settings.get("powershell.languageServer.logLevel", "string") || "Warning",
            nova.extension.version,
        ];

        const client = new LanguageClient(
            "kainorllc.PowerShell.pses",
            "PowerShell Editor Services",
            { type: "stdio", path: "/bin/sh", args },
            {
                syntaxes: ["powershell"],
                debug: settings.get("powershell.languageServer.debug", "boolean") || false,
            },
        );

        this.stopListener = client.onDidStop((err) => {
            this.client = null;
            if (err && !this.restarting) {
                console.error(`PowerShell Editor Services stopped: ${err.message}`);
                const request = new NotificationRequest("pses-stopped");
                request.title = "PowerShell language server stopped";
                request.body = err.message;
                request.actions = ["Restart", "Dismiss"];
                nova.notifications.add(request).then((reply) => {
                    if (reply.actionIdx === 0) {
                        this.start();
                    }
                });
            }
        });

        client.start();
        this.client = client;
        this.startRetries = 0;
        console.log(`Started PowerShell Editor Services with ${pwsh}`);

        this.pushSettings();
    }

    stop() {
        if (this.stopListener) {
            this.stopListener.dispose();
            this.stopListener = null;
        }
        if (this.client) {
            this.client.stop();
            this.client = null;
        }
        if (this.outputFile) {
            const outputFile = this.outputFile;
            // Let the bridge exit first; it holds the file open.
            setTimeout(() => {
                try {
                    nova.fs.remove(outputFile);
                } catch (err) {
                    // Already gone.
                }
            }, 2000);
        }
        this.sessionFile = null;
        this.outputFile = null;
    }

    // Nova reloads a document when its file changes on disk but doesn't send the language
    // server a didChange, leaving PSES analyzing stale text (wrong diagnostic lines,
    // completions, and hover). Resend the editor's full text as a whole-document change.
    resyncDocument(editor) {
        const uri = editor.document.uri;
        clearTimeout(this.resyncTimers.get(uri));
        this.resyncTimers.set(uri, setTimeout(() => {
            this.resyncTimers.delete(uri);
            if (!this.client || !this.client.running || editor.document.isClosed) {
                return;
            }
            const text = editor.getTextInRange(new Range(0, editor.document.length));
            try {
                this.client.sendNotification("textDocument/didChange", {
                    textDocument: { uri, version: ++this.resyncVersion },
                    contentChanges: [{ text }],
                });
            } catch (err) {
                console.error(`Could not resync ${uri}: ${err.message}`);
            }
        }, 300));
    }

    // Paths the debug adapter relay needs, or null when the language server isn't running.
    debugSession() {
        if (!this.client || !this.sessionFile) {
            return null;
        }
        return { sessionFile: this.sessionFile, outputFile: this.outputFile };
    }

    // Debounced: preference fields report every keystroke, and each change calls restart().
    restart() {
        clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(async () => {
            this.restarting = true;
            const previous = this.client;
            this.stop();
            // Wait for the old client to finish stopping (up to 10 s) before starting a new one.
            for (let i = 0; i < 20 && previous && previous.running; i++) {
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            this.restarting = false;
            await this.start();
        }, 1000);
    }

    // PSES reads its settings from workspace/didChangeConfiguration.
    pushSettings() {
        if (!this.client) {
            return;
        }
        const payload = { settings: settings.languageServerSettings() };
        // The client may still be initializing right after start(); retry briefly.
        const send = (attempt) => {
            if (!this.client) {
                return;
            }
            try {
                this.client.sendNotification("workspace/didChangeConfiguration", payload);
            } catch (err) {
                if (attempt < 10) {
                    setTimeout(() => send(attempt + 1), 500);
                }
            }
        };
        send(0);
    }

    sendRequest(method, params) {
        if (!this.client || !this.client.running) {
            return Promise.reject(new Error("PowerShell language server is not running."));
        }
        return this.client.sendRequest(method, params);
    }

    notifyMissingPwsh() {
        const request = new NotificationRequest("pwsh-missing");
        request.title = "PowerShell 7 not found";
        request.body = "Install PowerShell 7 (brew install powershell) for completions, diagnostics, and formatting, or set its path in the extension preferences.";
        request.actions = ["Install Instructions", "Dismiss"];
        nova.notifications.add(request).then((reply) => {
            if (reply.actionIdx === 0) {
                nova.openURL(INSTALL_URL);
            }
        });
    }
}

exports.PowerShellLanguageServer = PowerShellLanguageServer;
