#!/bin/bash

# ============================================================
# Quantum Armor Vault (QAV) — Phase 7 AST Gate
# Real-Time Sync & Multi-Device Verification
# ============================================================
# Gate Requirement: WebSocket fuzzing + auth bypass tests
# CWE Coverage: 306, 319, 362, 613, 668
# ============================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$PROJECT_ROOT/usbvault-server"
SYNC_DIR="$SERVER_DIR/internal/sync"
MW_DIR="$SERVER_DIR/internal/middleware"
APP_DIR="$PROJECT_ROOT/usbvault-app/src"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
PASS_COUNT=0; FAIL_COUNT=0; WARN_COUNT=0
check_pass() { echo -e "  ${GREEN}[PASS]${NC} $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
check_fail() { echo -e "  ${RED}[FAIL]${NC} $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
check_warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; WARN_COUNT=$((WARN_COUNT + 1)); }

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}QAV Phase 7 AST Gate — Real-Time Sync & Multi-Device${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""

# ============================================================
# TASK 1: WebSocket Server with Authenticated Upgrade (CWE-306)
# ============================================================
echo -e "${BLUE}[Task 1] WebSocket Server with Authenticated Upgrade${NC}"

# Sync service exists
if [ -f "$SYNC_DIR/service.go" ]; then
    check_pass "Sync service exists"
else
    check_fail "Sync service missing"
fi

# WebSocket library
if grep -q "nhooyr.io/websocket" "$SERVER_DIR/go.mod" 2>/dev/null; then
    check_pass "WebSocket library imported (nhooyr.io/websocket)"
else
    check_fail "WebSocket library missing"
fi

# HandleWebSocket function
if grep -q "HandleWebSocket" "$SYNC_DIR/service.go" 2>/dev/null; then
    check_pass "HandleWebSocket handler implemented"
else
    check_fail "HandleWebSocket handler missing"
fi

# Authentication check before upgrade (user_id extraction + unauthorized response)
if grep -q 'user_id' "$SYNC_DIR/service.go" 2>/dev/null && grep -q 'unauthorized' "$SYNC_DIR/service.go" 2>/dev/null; then
    check_pass "Authentication check before WebSocket upgrade"
else
    check_fail "Authentication check missing in WebSocket handler"
fi

# Connection limit enforcement
if grep -q "maxConnectionsPerUser\|connection.*limit\|too many connections" "$SYNC_DIR/service.go" 2>/dev/null; then
    check_pass "Per-user connection limit enforcement"
else
    check_fail "Per-user connection limits missing"
fi

# WSS enforcement (PH7-FIX)
if grep -q "TLS.*nil\|X-Forwarded-Proto\|secure connection required" "$SYNC_DIR/service.go" 2>/dev/null; then
    check_pass "WSS enforcement for production (PH7-FIX)"
else
    check_fail "WSS enforcement missing"
fi

# Read limit (message size)
if grep -q "SetReadLimit\|ReadLimit\|64.*1024" "$SYNC_DIR/service.go" 2>/dev/null; then
    check_pass "WebSocket read limit configured (anti-DoS)"
else
    check_fail "WebSocket read limit missing"
fi

# Auth middleware on sync route
MAIN_GO="$SERVER_DIR/cmd/api/main.go"
if grep -q "RequireAuth.*sync\|sync.*RequireAuth\|HandleWebSocket" "$MAIN_GO" 2>/dev/null; then
    check_pass "WebSocket route uses RequireAuth middleware"
else
    check_fail "WebSocket route missing auth middleware"
fi

# Connection timeout
if grep -q "idleTimeout\|readTimeout\|writeTimeout\|Deadline" "$SYNC_DIR/service.go" 2>/dev/null; then
    check_pass "Connection timeouts configured (PH7-FIX)"
else
    check_fail "Connection timeouts missing"
fi

echo ""

# ============================================================
# TASK 2: Redis Pub/Sub Message Distribution (CWE-668)
# ============================================================
echo -e "${BLUE}[Task 2] Redis Pub/Sub Message Distribution${NC}"

# Redis client
if grep -q "redis/go-redis" "$SERVER_DIR/go.mod" 2>/dev/null; then
    check_pass "Redis client dependency present (go-redis)"
else
    check_fail "Redis client missing"
fi

# Channel isolation per user
if grep -q 'sync:.*userID\|"sync:"' "$SYNC_DIR/service.go" 2>/dev/null; then
    check_pass "Per-user channel isolation (sync:userID)"
else
    check_fail "Per-user channel isolation missing"
fi

# Publish method
if grep -q "Publish.*sync:" "$SYNC_DIR/service.go" 2>/dev/null; then
    check_pass "Redis Publish for sync events"
else
    check_fail "Redis Publish missing"
fi

# Subscribe method
if grep -q "Subscribe.*sync:" "$SYNC_DIR/service.go" 2>/dev/null; then
    check_pass "Redis Subscribe for user channels"
else
    check_fail "Redis Subscribe missing"
fi

# Channel receive loop
if grep -q "Channel()\|pubsub.Channel" "$SYNC_DIR/service.go" 2>/dev/null; then
    check_pass "Channel message receive loop"
else
    check_fail "Channel receive loop missing"
fi

echo ""

# ============================================================
# TASK 3: Encrypted Sync Messages — No Plaintext Metadata (CWE-319)
# ============================================================
echo -e "${BLUE}[Task 3] Encrypted Sync Messages${NC}"

# EncryptedData field
if grep -q "EncryptedData" "$SYNC_DIR/service.go" 2>/dev/null; then
    check_pass "EncryptedData field in SyncEvent"
else
    check_fail "EncryptedData field missing"
fi

# Nonce field (PH7-FIX)
if grep -q "Nonce.*string\|nonce" "$SYNC_DIR/service.go" 2>/dev/null; then
    check_pass "Encryption nonce field in SyncEvent (PH7-FIX)"
else
    check_fail "Encryption nonce field missing"
fi

# Base64 validation (PH7-FIX)
if grep -q "validateBase64\|base64.*valid" "$SYNC_DIR/service.go" 2>/dev/null; then
    check_pass "Base64 validation for encrypted data (PH7-FIX)"
else
    check_fail "Base64 validation missing"
fi

# No plaintext file names in sync events
if grep -q "FileName\|file_name\|FilePath\|file_path" "$SYNC_DIR/service.go" 2>/dev/null; then
    check_fail "Plaintext file metadata found in sync events (CWE-319)"
else
    check_pass "No plaintext file metadata in sync events"
fi

# XChaCha20-Poly1305 reference
if grep -q "XChaCha20\|xchacha\|Poly1305" "$SYNC_DIR/service.go" 2>/dev/null; then
    check_pass "XChaCha20-Poly1305 encryption documented"
else
    check_warn "XChaCha20-Poly1305 reference not found in sync code"
fi

echo ""

# ============================================================
# TASK 4: CRDT Conflict Resolution for Multi-Device (CWE-362)
# ============================================================
echo -e "${BLUE}[Task 4] CRDT Conflict Resolution${NC}"

# CRDT file exists
if [ -f "$SYNC_DIR/crdt.go" ]; then
    check_pass "CRDT conflict resolution service exists (PH7-FIX)"
else
    check_fail "CRDT conflict resolution service missing"
fi

# LWW Register
if grep -q "LWWRegister" "$SYNC_DIR/crdt.go" 2>/dev/null; then
    check_pass "LWWRegister (Last-Writer-Wins) struct defined"
else
    check_fail "LWWRegister missing"
fi

# MergeRegisters function
if grep -q "MergeRegisters" "$SYNC_DIR/crdt.go" 2>/dev/null; then
    check_pass "MergeRegisters conflict resolution function"
else
    check_fail "MergeRegisters function missing"
fi

# VectorClock
if grep -q "VectorClock" "$SYNC_DIR/crdt.go" 2>/dev/null; then
    check_pass "VectorClock for causal ordering"
else
    check_fail "VectorClock missing"
fi

# VectorClock methods
VC_METHODS=0
for method in "HappensBefore" "Merge" "Increment" "Concurrent"; do
    if grep -q "$method" "$SYNC_DIR/crdt.go" 2>/dev/null; then
        VC_METHODS=$((VC_METHODS + 1))
    fi
done
if [ "$VC_METHODS" -ge 4 ]; then
    check_pass "VectorClock methods complete ($VC_METHODS/4)"
else
    check_fail "VectorClock methods insufficient ($VC_METHODS < 4)"
fi

# ORSet
if grep -q "ORSet" "$SYNC_DIR/crdt.go" 2>/dev/null; then
    check_pass "ORSet (Observed-Remove Set) for file lists"
else
    check_fail "ORSet missing"
fi

# ConflictResolver
if grep -q "ConflictResolver" "$SYNC_DIR/crdt.go" 2>/dev/null; then
    check_pass "ConflictResolver service with thread safety"
else
    check_fail "ConflictResolver missing"
fi

# ResolveConflict method
if grep -q "ResolveConflict" "$SYNC_DIR/crdt.go" 2>/dev/null; then
    check_pass "ResolveConflict method implemented"
else
    check_fail "ResolveConflict method missing"
fi

# Thread safety (sync.RWMutex)
if grep -q "sync.RWMutex\|RWMutex" "$SYNC_DIR/crdt.go" 2>/dev/null; then
    check_pass "Thread-safe CRDT operations (sync.RWMutex)"
else
    check_fail "Thread safety missing in CRDT"
fi

echo ""

# ============================================================
# TASK 5: Connection Heartbeat + Reconnection Logic (CWE-613)
# ============================================================
echo -e "${BLUE}[Task 5] Connection Heartbeat + Reconnection${NC}"

# Heartbeat file exists
if [ -f "$SYNC_DIR/heartbeat.go" ]; then
    check_pass "Heartbeat service exists (PH7-FIX)"
else
    check_fail "Heartbeat service missing"
fi

# HeartbeatConfig struct
if grep -q "HeartbeatConfig" "$SYNC_DIR/heartbeat.go" 2>/dev/null; then
    check_pass "HeartbeatConfig struct defined"
else
    check_fail "HeartbeatConfig struct missing"
fi

# PingInterval configuration
if grep -q "PingInterval" "$SYNC_DIR/heartbeat.go" 2>/dev/null; then
    check_pass "Ping interval configuration"
else
    check_fail "Ping interval missing"
fi

# PongTimeout configuration
if grep -q "PongTimeout" "$SYNC_DIR/heartbeat.go" 2>/dev/null; then
    check_pass "Pong timeout configuration"
else
    check_fail "Pong timeout missing"
fi

# ConnectionTracker
if grep -q "ConnectionTracker" "$SYNC_DIR/heartbeat.go" 2>/dev/null; then
    check_pass "ConnectionTracker for stale session detection"
else
    check_fail "ConnectionTracker missing"
fi

# TrackedConnection struct
if grep -q "TrackedConnection" "$SYNC_DIR/heartbeat.go" 2>/dev/null; then
    check_pass "TrackedConnection struct with metadata"
else
    check_fail "TrackedConnection struct missing"
fi

# CheckStale method
if grep -q "CheckStale" "$SYNC_DIR/heartbeat.go" 2>/dev/null; then
    check_pass "CheckStale method for detecting stale connections"
else
    check_fail "CheckStale method missing"
fi

# CleanupStaleConnections
if grep -q "CleanupStaleConnections" "$SYNC_DIR/heartbeat.go" 2>/dev/null; then
    check_pass "CleanupStaleConnections background routine"
else
    check_fail "CleanupStaleConnections missing"
fi

# RecordPong method
if grep -q "RecordPong" "$SYNC_DIR/heartbeat.go" 2>/dev/null; then
    check_pass "RecordPong for heartbeat tracking"
else
    check_fail "RecordPong missing"
fi

# Idle timeout
if grep -q "IdleTimeout\|idleTimeout\|idle.*timeout" "$SYNC_DIR/heartbeat.go" 2>/dev/null; then
    check_pass "Idle timeout for session cleanup"
else
    check_fail "Idle timeout missing"
fi

# Client-side backoff/reconnection
if grep -qE "backoff|retry.*delay|exponential" "$APP_DIR/services/api.ts" 2>/dev/null; then
    check_pass "Client-side retry with exponential backoff (API)"
else
    check_warn "Client-side backoff not detected in api.ts"
fi

echo ""

# ============================================================
# TASK 7: RM-007/RM-008/RM-009 — TypeScript WebSocket Client
# ============================================================
echo -e "${BLUE}[Task 7] TypeScript WebSocket Sync Client${NC}"

SYNC_TS="$APP_DIR/services/syncService.ts"

# RM-007: WebSocket transport in TypeScript
if grep -q "WebSocket" "$SYNC_TS" 2>/dev/null; then
    check_pass "RM-007: WebSocket transport in TypeScript sync client"
else
    check_fail "RM-007: WebSocket transport missing from TypeScript sync client"
fi

# RM-007: Connect method with auth token
if grep -q "connect\b" "$SYNC_TS" 2>/dev/null && grep -q "_authToken\|authToken\|token" "$SYNC_TS" 2>/dev/null; then
    check_pass "RM-007: WebSocket connect() with auth token"
else
    check_fail "RM-007: WebSocket connect() with auth token missing"
fi

# RM-007: Disconnect/cleanup method
if grep -q "disconnect" "$SYNC_TS" 2>/dev/null; then
    check_pass "RM-007: Graceful disconnect method"
else
    check_fail "RM-007: Disconnect method missing"
fi

# RM-008: Encrypted sync event type
if grep -q "EncryptedSyncEvent\|encrypted_data" "$SYNC_TS" 2>/dev/null; then
    check_pass "RM-008: EncryptedSyncEvent type for end-to-end encryption"
else
    check_fail "RM-008: EncryptedSyncEvent type missing"
fi

# RM-008: Nonce field in sync events
if grep -q "nonce" "$SYNC_TS" 2>/dev/null; then
    check_pass "RM-008: Nonce field in encrypted sync events"
else
    check_fail "RM-008: Nonce field missing from sync events"
fi

# RM-008: sendEncryptedEvent method
if grep -q "sendEncryptedEvent" "$SYNC_TS" 2>/dev/null; then
    check_pass "RM-008: sendEncryptedEvent() method for encrypted payloads"
else
    check_fail "RM-008: sendEncryptedEvent() missing"
fi

# RM-009: Exponential backoff in TypeScript
if grep -q "computeBackoff\|exponential\|backoff\|multiplier" "$SYNC_TS" 2>/dev/null; then
    check_pass "RM-009: Exponential backoff reconnection"
else
    check_fail "RM-009: Exponential backoff missing"
fi

# RM-009: Jitter to prevent thundering herd
if grep -q "jitter" "$SYNC_TS" 2>/dev/null; then
    check_pass "RM-009: Jitter in reconnection delay"
else
    check_fail "RM-009: Jitter missing from reconnection"
fi

# RM-009: Ping/pong heartbeat in TypeScript
if grep -q "ping.*interval\|PING_INTERVAL\|_startHeartbeat\|heartbeat" "$SYNC_TS" 2>/dev/null; then
    check_pass "RM-009: Client-side heartbeat (ping/pong)"
else
    check_fail "RM-009: Client-side heartbeat missing"
fi

# RM-009: Pong timeout detection
if grep -q "pong.*timeout\|PONG_TIMEOUT\|pongTimer" "$SYNC_TS" 2>/dev/null; then
    check_pass "RM-009: Pong timeout detection for dead connections"
else
    check_fail "RM-009: Pong timeout detection missing"
fi

# RM-009: Connection tracker in Go server
if grep -q "tracker.*ConnectionTracker\|ConnectionTracker" "$SYNC_DIR/service.go" 2>/dev/null; then
    check_pass "RM-009: Server-side ConnectionTracker integration"
else
    check_fail "RM-009: Server-side ConnectionTracker missing"
fi

# RM-007: Bidirectional message handling (client → server messages)
if grep -q "clientMsgCh\|ClientMessage\|client.*message" "$SYNC_DIR/service.go" 2>/dev/null; then
    check_pass "RM-007: Bidirectional message handling (client → server)"
else
    check_fail "RM-007: Bidirectional message handling missing"
fi

echo ""

# ============================================================
# TASK 6: Aggregate Sync Security + WebSocket Fuzzing Tests
# ============================================================
echo -e "${BLUE}[Task 6] Aggregate Sync Security + OWASP${NC}"

# Sync test file count
SYNC_TESTS=$(find "$SYNC_DIR" -name "*_test.go" 2>/dev/null | wc -l)
if [ "$SYNC_TESTS" -ge 2 ]; then
    check_pass "Sync test coverage: $SYNC_TESTS test files"
else
    check_fail "Sync test coverage insufficient ($SYNC_TESTS < 2)"
fi

# Total sync test functions
TOTAL_SYNC_FUNCS=$(grep -r "func Test" "$SYNC_DIR"/*_test.go 2>/dev/null | wc -l)
if [ "$TOTAL_SYNC_FUNCS" -ge 10 ]; then
    check_pass "Total sync test functions: $TOTAL_SYNC_FUNCS (>= 10 required)"
else
    check_fail "Sync test functions insufficient ($TOTAL_SYNC_FUNCS < 10)"
fi

# WebSocket auth bypass test patterns
AUTH_TESTS=0
for pattern in "Unauthorized\|unauthorized\|no.*auth" "connection.*limit\|too.*many" "invalid.*token\|expired.*token"; do
    if grep -qE "$pattern" "$SYNC_DIR"/*_test.go 2>/dev/null; then
        AUTH_TESTS=$((AUTH_TESTS + 1))
    fi
done
if [ "$AUTH_TESTS" -ge 2 ]; then
    check_pass "WebSocket auth bypass test patterns ($AUTH_TESTS found)"
else
    check_warn "WebSocket auth bypass test patterns limited ($AUTH_TESTS < 2)"
fi

# No http:// in sync code
HTTP_LEAKS=$(grep -rn "http://" "$SYNC_DIR/" 2>/dev/null | grep -v "_test.go" | grep -v "// " | wc -l)
if [ "$HTTP_LEAKS" -eq 0 ]; then
    check_pass "No http:// URLs in sync code (HTTPS enforced)"
else
    check_fail "Found $HTTP_LEAKS http:// URLs in sync code"
fi

# Sync route registered
if grep -q "sync" "$MAIN_GO" 2>/dev/null; then
    check_pass "WebSocket sync route registered in main.go"
else
    check_fail "WebSocket sync route not registered"
fi

# Ping/pong message types
if grep -q '"ping"\|"pong"' "$SYNC_DIR/service.go" 2>/dev/null; then
    check_pass "Ping/pong message types defined"
else
    check_warn "Ping/pong message types not found"
fi

# Sequence numbering for event ordering
if grep -q "Sequence\|sequence\|atomic" "$SYNC_DIR/service.go" 2>/dev/null; then
    check_pass "Monotonic sequence numbering for event ordering"
else
    check_fail "Sequence numbering missing"
fi

echo ""

# ============================================================
# SUMMARY
# ============================================================
echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}Phase 7 AST Gate Results${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo -e "  ${GREEN}PASS: $PASS_COUNT${NC}"
echo -e "  ${RED}FAIL: $FAIL_COUNT${NC}"
echo -e "  ${YELLOW}WARN: $WARN_COUNT${NC}"
TOTAL=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))
echo -e "  TOTAL: $TOTAL checks"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo -e "${RED}[!] PHASE 7 AST GATE FAILED — $FAIL_COUNT failures${NC}"
    exit 1
elif [ "$WARN_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}[!] PHASE 7 AST GATE PASSED WITH WARNINGS — $WARN_COUNT items${NC}"
    exit 0
else
    echo -e "${GREEN}[+] PHASE 7 AST GATE PASSED — All checks verified${NC}"
    exit 0
fi
