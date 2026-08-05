#!/usr/bin/env bash
# test-ci-crash-detection.sh — Verify that ci-test.sh detects a server crash quickly.
#
# This script exercises the PID-alive guard in ci-test.sh:
#
#   if ! kill -0 "$SERVER_PID" 2>/dev/null; then
#     echo "✗  Dev server process … exited before becoming ready — aborting." >&2
#     exit 1
#   fi
#
# It replaces `npm` with a stub whose `run dev` sub-command exits immediately
# (simulating a crash), runs ci-test.sh, and asserts:
#   1. The exit code is non-zero.
#   2. The script finishes in under 10 s (not after the full 60 s timeout).
#
# Usage:
#   bash script/test-ci-crash-detection.sh
#   npm run test:ci-crash   # via package.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CI_TEST="${SCRIPT_DIR}/ci-test.sh"

STUB_DIR="$(mktemp -d)"
LOG_FILE="$(mktemp)"
trap 'rm -rf "$STUB_DIR" "$LOG_FILE"' EXIT

# ── Create a fake `npm` whose "run dev" exits 1 immediately ───────────────────
# Any other npm sub-command (e.g. run test:all) is not reached in this test
# because ci-test.sh aborts as soon as the server PID disappears.
cat > "$STUB_DIR/npm" <<'EOF'
#!/usr/bin/env bash
# Stub npm: exit immediately with failure to simulate a server crash.
exit 1
EOF
chmod +x "$STUB_DIR/npm"

echo "▶  Running ci-test.sh with an immediately-crashing server stub…"

SECONDS=0   # bash built-in seconds counter
# Run ci-test.sh with the stub npm prepended to PATH.
# Capture combined output; we expect a non-zero exit.
if PATH="$STUB_DIR:$PATH" bash "$CI_TEST" >"$LOG_FILE" 2>&1; then
  echo "✗  FAIL: ci-test.sh exited 0 — expected a non-zero exit after crash." >&2
  echo "   Output from ci-test.sh:" >&2
  cat "$LOG_FILE" >&2
  exit 1
fi
elapsed=$SECONDS

echo "✓  ci-test.sh exited non-zero after ${elapsed}s (crash detected)."

MAX_SECONDS=10
if [ "$elapsed" -ge "$MAX_SECONDS" ]; then
  echo "✗  FAIL: ci-test.sh took ${elapsed}s — expected < ${MAX_SECONDS}s." >&2
  echo "   The PID-alive guard (kill -0) may be missing or bypassed." >&2
  echo "   Output from ci-test.sh:" >&2
  cat "$LOG_FILE" >&2
  exit 1
fi

echo "✓  PASS: server crash detected in ${elapsed}s (well under ${MAX_SECONDS}s limit)."
