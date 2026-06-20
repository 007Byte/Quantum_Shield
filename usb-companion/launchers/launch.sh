#!/bin/bash
# USBVault Enterprise — Linux Launcher
# Run this file to start USBVault from your USB drive.
# No installation required. No admin required for daily use.

# ── Configuration ─────────────────────────────────────────────────────
MAX_RESTARTS=5
RESTART_DELAY=1
PORT_RANGE_START=3001
PORT_RANGE_END=3005
MIN_NODE_VERSION=20
LOG_FILE=""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
USB_ROOT="$SCRIPT_DIR"

export USB_STANDALONE_MODE=true
export NODE_ENV=production

echo "╔══════════════════════════════════════════╗"
echo "║        USBVault Enterprise Edition       ║"
echo "║     Portable Encrypted File Storage      ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Find Node.js ──────────────────────────────────────────────────────
if [ -x "$USB_ROOT/node/bin/node" ]; then
    NODE="$USB_ROOT/node/bin/node"
    echo "Using portable Node.js: $NODE"
elif command -v node &>/dev/null; then
    NODE="$(command -v node)"
    echo "Using system Node.js: $NODE"
else
    echo ""
    echo "ERROR: Node.js not found."
    echo "Please install Node.js 20+ or place a portable copy in $USB_ROOT/node/"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

# ── Verify Node.js version ───────────────────────────────────────────
NODE_VERSION_RAW=$("$NODE" --version 2>/dev/null)
NODE_MAJOR=$(echo "$NODE_VERSION_RAW" | sed 's/v//' | cut -d. -f1)

if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt "$MIN_NODE_VERSION" ] 2>/dev/null; then
    echo ""
    echo "ERROR: Node.js $MIN_NODE_VERSION+ is required (found: ${NODE_VERSION_RAW:-unknown})."
    echo "Please update Node.js or place a compatible portable copy in $USB_ROOT/node/"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi
echo "Node.js version: $NODE_VERSION_RAW ✓"

# ── Find companion directory ──────────────────────────────────────────
COMPANION_DIR="$USB_ROOT/companion"
[ -d "$COMPANION_DIR" ] || COMPANION_DIR="$USB_ROOT"

# Set up log file
LOG_FILE="$COMPANION_DIR/companion.log"
echo "--- USBVault Companion started $(date) ---" >> "$LOG_FILE"

# ── Detect available port ─────────────────────────────────────────────
COMPANION_PORT=""
for PORT in $(seq $PORT_RANGE_START $PORT_RANGE_END); do
    # Use ss (preferred) or netstat as fallback
    if command -v ss &>/dev/null; then
        if ! ss -tlnp 2>/dev/null | grep -q ":${PORT} "; then
            COMPANION_PORT=$PORT
            break
        fi
    elif command -v netstat &>/dev/null; then
        if ! netstat -tlnp 2>/dev/null | grep -q ":${PORT} "; then
            COMPANION_PORT=$PORT
            break
        fi
    else
        # No port-checking tool available; try the default
        COMPANION_PORT=$PORT
        break
    fi
    echo "Port $PORT is in use, trying next..."
done

if [ -z "$COMPANION_PORT" ]; then
    echo ""
    echo "ERROR: No available port in range $PORT_RANGE_START-$PORT_RANGE_END."
    echo "Please close the application using one of these ports and try again."
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

export USB_COMPANION_PORT=$COMPANION_PORT
echo "Using port: $COMPANION_PORT"

# Write port to file so frontend can discover it
echo "$COMPANION_PORT" > "$COMPANION_DIR/.companion-port"

# ── Watchdog: start companion with auto-restart ───────────────────────
RESTART_COUNT=0
COMPANION_PID=""

start_companion() {
    cd "$COMPANION_DIR"
    "$NODE" src/server.js >> "$LOG_FILE" 2>&1 &
    COMPANION_PID=$!
    echo "Companion started (PID: $COMPANION_PID)"
}

cleanup() {
    echo ""
    echo "Shutting down USBVault..."
    if [ -n "$COMPANION_PID" ]; then
        kill "$COMPANION_PID" 2>/dev/null
        wait "$COMPANION_PID" 2>/dev/null
    fi
    rm -f "$COMPANION_DIR/.companion-port"
    echo "Safe to remove USB drive. Restart your computer to clear RAM."
    exit 0
}

trap cleanup INT TERM

start_companion

# Wait for initial health check
echo -n "Waiting for service"
SERVICE_READY=false
for i in $(seq 1 30); do
    if curl -s "http://127.0.0.1:$COMPANION_PORT/health" > /dev/null 2>&1; then
        echo " ready!"
        SERVICE_READY=true
        break
    fi
    if ! kill -0 "$COMPANION_PID" 2>/dev/null; then
        echo " failed!"
        echo ""
        echo "ERROR: Companion service failed to start."
        echo "Check the log file for details: $LOG_FILE"
        tail -20 "$LOG_FILE" 2>/dev/null
        echo ""
        read -p "Press Enter to exit..."
        exit 1
    fi
    echo -n "."
    sleep 0.5
done

if [ "$SERVICE_READY" = false ]; then
    echo ""
    echo "ERROR: Companion service did not respond within 15 seconds."
    echo "Check the log file: $LOG_FILE"
    kill "$COMPANION_PID" 2>/dev/null
    read -p "Press Enter to exit..."
    exit 1
fi

# Open browser
echo "Opening USBVault in your browser..."
xdg-open "http://127.0.0.1:$COMPANION_PORT" 2>/dev/null || sensible-browser "http://127.0.0.1:$COMPANION_PORT" 2>/dev/null || echo "Please open http://127.0.0.1:$COMPANION_PORT in your browser"

echo ""
echo "USBVault is running on port $COMPANION_PORT."
echo "Press Ctrl+C to stop."
echo "Remember to eject your USB drive safely when done."
echo ""

# ── Watchdog loop: monitor and restart on crash ───────────────────────
while true; do
    wait "$COMPANION_PID" 2>/dev/null
    EXIT_CODE=$?

    if ! kill -0 $$ 2>/dev/null; then
        break
    fi

    if [ $EXIT_CODE -eq 0 ] || [ $EXIT_CODE -eq 143 ] || [ $EXIT_CODE -eq 130 ]; then
        echo "Companion stopped normally."
        break
    fi

    RESTART_COUNT=$((RESTART_COUNT + 1))
    echo "[$(date)] Companion exited unexpectedly (code: $EXIT_CODE, restart $RESTART_COUNT/$MAX_RESTARTS)" | tee -a "$LOG_FILE"

    if [ $RESTART_COUNT -ge $MAX_RESTARTS ]; then
        echo ""
        echo "ERROR: Companion has crashed $MAX_RESTARTS times. Giving up."
        echo "Check the log file: $LOG_FILE"
        rm -f "$COMPANION_DIR/.companion-port"
        read -p "Press Enter to exit..."
        exit 1
    fi

    echo "Restarting in ${RESTART_DELAY}s..."
    sleep $RESTART_DELAY
    start_companion

    for i in $(seq 1 10); do
        if curl -s "http://127.0.0.1:$COMPANION_PORT/health" > /dev/null 2>&1; then
            echo "Companion recovered successfully."
            break
        fi
        sleep 0.5
    done
done
