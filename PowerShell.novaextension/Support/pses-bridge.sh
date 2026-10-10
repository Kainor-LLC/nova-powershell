#!/bin/sh
# Starts PowerShell Editor Services with named pipes (Unix sockets) and bridges Nova's
# stdio language client to the language service socket.
#
# Named-pipe mode is needed for debugging: PSES only creates its debug service alongside
# the language server in this mode (its stdio debug-only mode crashes on PowerShell 7.6).
#
# Usage: pses-bridge.sh PWSH SERVER_DIR SESSION_FILE OUTPUT_FILE LOG_DIR LOG_LEVEL HOST_VERSION CACHE_DIR

PWSH="$1"
SERVER_DIR="$2"
SESSION_FILE="$3"
OUTPUT_FILE="$4"
LOG_DIR="$5"
LOG_LEVEL="$6"
HOST_VERSION="$7"
CACHE_DIR="$8"
SUPPORT_DIR=$(cd "$(dirname "$0")" && pwd)

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
# The extension uses this to stop PSES itself: Nova sends no shutdown or exit when an
# extension deactivates and only kills the server after a ~15 s grace period. Killing
# PSES closes the socket, which ends the relay and this bridge.
echo "$PSES_PID" > "$SESSION_FILE.pid"

cleanup() {
    kill "$PSES_PID" 2>/dev/null
    rm -f "$SESSION_FILE" "$SESSION_FILE.pid"
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

# Relay stdio to the language service socket. The relay waits for PSES's session file
# itself and exits as soon as Nova closes stdin or PSES closes the socket; the trap
# above then stops PSES. (nc isn't used: on macOS it keeps running after stdin closes,
# and PSES keeps running after the LSP "exit", so Nova had to wait out its timeout.)
NOVA_PS_SESSION_FILE="$SESSION_FILE" NOVA_PS_CACHE_DIR="$CACHE_DIR" NOVA_PS_LSP_LOG="$SESSION_FILE.relay.log" \
    "$PWSH" -NoLogo -NoProfile -NonInteractive -File "$SUPPORT_DIR/LspRelay.ps1"
