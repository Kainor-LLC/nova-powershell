// Locates the PowerShell 7 (pwsh) executable.

const CANDIDATES = [
    "/opt/homebrew/bin/pwsh",
    "/usr/local/bin/pwsh",
    "/usr/local/microsoft/powershell/7/pwsh",
    "~/.dotnet/tools/pwsh",
];

function isExecutable(path) {
    return nova.fs.access(path, nova.fs.X_OK);
}

// Asks the user's login shell, which has their full PATH (Nova's own PATH is minimal).
function findOnLoginShellPath() {
    return new Promise((resolve) => {
        const shell = nova.environment.SHELL || "/bin/zsh";
        const process = new Process(shell, { args: ["-l", "-c", "command -v pwsh"] });
        let found = null;
        process.onStdout((line) => {
            const path = line.trim();
            if (path.startsWith("/") && isExecutable(path)) {
                found = path;
            }
        });
        process.onDidExit(() => resolve(found));
        try {
            process.start();
        } catch (err) {
            resolve(null);
        }
    });
}

exports.findPwsh = async function () {
    const configured = nova.config.get("powershell.pwshPath", "string");
    if (configured) {
        const path = nova.path.expanduser(configured);
        return isExecutable(path) ? path : null;
    }

    for (const candidate of CANDIDATES) {
        const path = nova.path.expanduser(candidate);
        if (isExecutable(path)) {
            return path;
        }
    }

    return findOnLoginShellPath();
};
