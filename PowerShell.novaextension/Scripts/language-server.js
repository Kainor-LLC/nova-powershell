// Runs PowerShell Editor Services (PSES) as a language server over stdio.

const { findPwsh } = require("./pwsh.js");
const settings = require("./settings.js");

const DAY_MS = 24 * 60 * 60 * 1000;

// Deletes files older than maxAgeMs (e.g. left behind if Nova quit unexpectedly), and
// empty ones right away: PSES creates a log on every start and usually writes nothing.
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
            if (stats && stats.isFile() && (stats.mtime.getTime() < cutoff || stats.size <= 3)) {
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
        removeStaleFiles(sessionDir, 10 * 60 * 1000);
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
            nova.path.join(nova.extension.globalStoragePath, "cache"),
        ];

        // A unique identifier per start: Nova keeps a stopped client's identifier reserved
        // until its process has exited, which would otherwise block the next start.
        const client = new LanguageClient(
            `kainorllc.PowerShell.pses.${id}`,
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

        // PSES drops notifications that arrive before it has initialized, so wait for the
        // relay's ready marker (written when Nova's "initialized" goes through) first.
        const sessionFile = this.sessionFile;
        this.waitForServer(client, sessionFile).then((ready) => {
            if (this.client !== client) {
                return;
            }
            if (ready) {
                console.log(`PowerShell Editor Services ready (PowerShell ${this.serverVersion(sessionFile) || "unknown version"})`);
            } else {
                console.error("PowerShell Editor Services did not initialize within 60 s; sending settings anyway");
            }
            this.pushSettings();
            // Once more a little later, in case the first landed in the last moments of startup.
            setTimeout(() => {
                if (this.client === client) {
                    this.pushSettings();
                }
            }, 3000);
        });
    }

    stop() {
        if (this.stopListener) {
            this.stopListener.dispose();
            this.stopListener = null;
        }
        if (this.client) {
            const client = this.client;
            this.client = null;
            // Nova doesn't send shutdown/exit when an extension deactivates; it kills the
            // server ~15 s later, and it tears down this JavaScript context as soon as
            // deactivate() returns, so nothing asynchronous would run. Terminate PSES now;
            // its socket closing ends the relay and the bridge.
            this.terminateServer(this.sessionFile);
            client.stop();
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

    // Stops PSES from deactivate(), where only synchronous work runs. A marker file is
    // the reliable signal: the bridge's watchdog kills PSES when it appears. The direct
    // kill below is a faster path when Nova does let the process spawn.
    terminateServer(sessionFile) {
        if (!sessionFile) {
            return;
        }
        try {
            const marker = nova.fs.open(`${sessionFile}.stop`, "w");
            marker.write("stop\n");
            marker.close();
        } catch (err) {
            console.error(`Could not write the stop marker: ${err.message}`);
        }
        let pid = "";
        try {
            const file = nova.fs.open(`${sessionFile}.pid`, "r");
            pid = (file.read() || "").trim();
            file.close();
        } catch (err) {
            return; // Already exited and cleaned up.
        }
        if (!/^\d+$/.test(pid)) {
            return;
        }
        try {
            new Process("/bin/kill", { args: ["-TERM", pid] }).start();
        } catch (err) {
            console.error(`Could not stop PowerShell Editor Services: ${err.message}`);
        }
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

    // Resolves true once the relay has written the session's ready marker (no LSP traffic:
    // a request sent before initialization is answered with an id-less error that Nova
    // can't match, and it shows up as noise in the console).
    async waitForServer(client, sessionFile) {
        const readyFile = `${sessionFile}.ready`;
        const deadline = Date.now() + 60000;
        while (this.client === client && Date.now() < deadline) {
            if (nova.fs.access(readyFile, nova.fs.F_OK)) {
                // Give the server a moment to finish flipping to initialized.
                await new Promise((resolve) => setTimeout(resolve, 300));
                return true;
            }
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
        return false;
    }

    // The PowerShell version PSES reported in its session file.
    serverVersion(sessionFile) {
        try {
            const file = nova.fs.open(sessionFile, "r");
            const session = JSON.parse(file.read() || "{}");
            file.close();
            return session.powerShellVersion || null;
        } catch (err) {
            return null;
        }
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
