#!/usr/bin/env bash
# ci-test.sh — Start the dev server, run test:all, then shut it down.
#
# Usage:
#   npm run test:ci          # via package.json
#   bash script/ci-test.sh  # direct
#
# The script works in two stages:
#   1. Launch `npm run dev` in the background and poll /api/health until the
#      server responds (up to 60 s).
#   2. Run `npm run test:all` and capture its exit code.
#
# A SIGTERM/EXIT trap ensures the background server is always killed, even if
# the tests error out or the script is interrupted (Ctrl-C in CI).

set -euo pipefail

PORT="${PORT:-5000}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"
TIMEOUT=60   # seconds to wait for server startup
SERVER_PID=""

# ── Cleanup trap ──────────────────────────────────────────────────────────────
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo ""
    echo "⏹  Stopping dev server (PID $SERVER_PID)…"
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    echo "✓  Dev server stopped."
  fi
}
trap cleanup EXIT INT TERM

# ── Start dev server in background ───────────────────────────────────────────
echo "▶  Starting dev server on port ${PORT}…"
npm run dev &
SERVER_PID=$!

# ── Wait for server readiness ─────────────────────────────────────────────────
echo "⏳  Waiting for server at ${HEALTH_URL} (timeout ${TIMEOUT}s)…"
elapsed=0
until curl -sf "${HEALTH_URL}" > /dev/null 2>&1; do
  if [ $elapsed -ge $TIMEOUT ]; then
    echo "✗  Server did not become ready within ${TIMEOUT}s — aborting." >&2
    exit 1
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done
echo "✓  Server ready after ${elapsed}s."
echo ""

# ── Run the full test suite ───────────────────────────────────────────────────
npm run test:all
TEST_EXIT=$?

# Cleanup runs via trap; propagate test exit code.
exit $TEST_EXIT
