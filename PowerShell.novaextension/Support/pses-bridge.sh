#!/bin/sh
# Starts PowerShell Editor Services with named pipes (Unix sockets) and bridges Nova's
# stdio language client to the language service socket.
#
# Named-pipe mode is needed for debugging: PSES only creates its debug service alongside
# the language server in this mode (its stdio debug-only mode crashes on PowerShell 7.6).
#
# Usage: pses-bridge.sh PWSH SERVER_DIR SESSION_FILE OUTPUT_FILE LOG_DIR LOG_LEVEL HOST_VERSION

PWSH="$1"
SERVER_DIR="$2"
SESSION_FILE="$3"
OUTPUT_FILE="$4"
LOG_DIR="$5"
LOG_LEVEL="$6"
HOST_VERSION="$7"

rm -f "$SESSION_FILE"
: > "$OUTPUT_FILE"

# Script output from debug sessions goes to the PSES console, captured in OUTPUT_FILE
# for the debug adapter relay to forward to Nova's debug console.
NO_COLOR=1 "$PWSH" -NoLogo -NoProfile -NonInteractive \
    -File "$SERVER_DIR/PowerShellEditorServices/Start-EditorServices.ps1" \
    -HostName Nova -HostProfileId Nova -HostVersion "$HOST_VERSION" \
    -BundledModulesPath "$SERVER_DIR" \
    -LogPath "$LOG_DIR" -LogLevel "$LOG_LEVEL" \
    -SessionDetailsPath "$SESSION_FILE" \
    < /dev/null > "$OUTPUT_FILE" 2>&1 &
PSES_PID=$!

cleanup() {
    kill "$PSES_PID" 2>/dev/null
    rm -f "$SESSION_FILE"
}
trap cleanup EXIT INT TERM HUP

# Watchdog: stop PSES if this bridge is killed outright (SIGKILL skips the trap) or if
# the process that launched it (Nova's extension host) goes away.
BRIDGE_PID=$$
LAUNCHER_PID=$PPID
(
    ticks=0
    while kill -0 "$BRIDGE_PID" 2>/dev/null && kill -0 "$LAUNCHER_PID" 2>/dev/null && kill -0 "$PSES_PID" 2>/dev/null; do
        sleep 1
        ticks=$((ticks + 1))
        # Keep this session's files fresh so other Nova windows' stale-file cleanup skips them.
        if [ $((ticks % 60)) -eq 0 ]; then
            touch "$SESSION_FILE" "$OUTPUT_FILE" 2>/dev/null
        fi
    done
    kill "$PSES_PID" 2>/dev/null
) < /dev/null > /dev/null 2>&1 &

# Wait up to 60 seconds for PSES to report its socket names.
i=0
while [ $i -lt 600 ]; do
    if [ -s "$SESSION_FILE" ] && grep -q '"status":"started"' "$SESSION_FILE"; then
        break
    fi
    if ! kill -0 "$PSES_PID" 2>/dev/null; then
        echo "PowerShell Editor Services exited during startup:" >&2
        cat "$OUTPUT_FILE" >&2
        exit 1
    fi
    sleep 0.1
    i=$((i + 1))
done

PIPE=$(sed -n 's/.*"languageServicePipeName":"\([^"]*\)".*/\1/p' "$SESSION_FILE")
if [ -z "$PIPE" ]; then
    echo "PowerShell Editor Services did not start: $(cat "$SESSION_FILE" 2>/dev/null)" >&2
    exit 1
fi

nc -U "$PIPE"
