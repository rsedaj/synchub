#!/usr/bin/env bash
# test-import-guard.sh — Negative test for the import-graph safety gate.
#
# The "API safety checks" CI job relies on scripts/check-server-imports.ts to
# fail the workflow when a server file imports a module that does not exist
# (missing/renamed/never-committed file). This script proves the guard catches
# a REAL regression, not just that the happy path passes:
#
#   1. Baseline: run the server import check on the clean tree — must PASS.
#   2. Inject a deliberate broken import: append
#        import "./__ci_import_guard_probe__";
#      to server/index.ts (the module intentionally does not exist).
#   3. Re-run the check — it must EXIT NON-ZERO and name the missing module.
#   4. Restore server/index.ts (also on any interrupt/failure, via trap) and
#      re-run the check once more to confirm the tree is back to green.
#
# Usage:
#   bash script/test-import-guard.sh
#   npm run test:import-guard   # via package.json
#
# Safe to run locally: server/index.ts is always restored from a byte-exact
# backup, even if the script is interrupted.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET="$ROOT/server/index.ts"
CHECK="npx tsx $ROOT/scripts/check-server-imports.ts"

BACKUP="$(mktemp)"
LOG="$(mktemp)"
restore() {
  # Restore the original entry file byte-for-byte, no matter how we exit.
  if [ -s "$BACKUP" ]; then
    cp "$BACKUP" "$TARGET"
  fi
  rm -f "$BACKUP" "$LOG"
}
trap restore EXIT

cp "$TARGET" "$BACKUP"

echo "▶  Step 1/3: baseline — import check must pass on the clean tree…"
if ! $CHECK > "$LOG" 2>&1; then
  echo "✗  Baseline import check FAILED on an unmodified tree — fix that first:" >&2
  cat "$LOG" >&2
  exit 1
fi
echo "✓  Baseline passes."

echo "▶  Step 2/3: injecting a broken import into server/index.ts…"
printf '\nimport "./__ci_import_guard_probe__";\n' >> "$TARGET"

set +e
$CHECK > "$LOG" 2>&1
PROBE_EXIT=$?
set -e

# Restore immediately so step 3 runs on the clean file.
cp "$BACKUP" "$TARGET"

if [ "$PROBE_EXIT" -eq 0 ]; then
  echo "✗  Import check PASSED despite a deliberately broken import — the guard is NOT catching regressions." >&2
  cat "$LOG" >&2
  exit 1
fi
if ! grep -q "__ci_import_guard_probe__" "$LOG"; then
  echo "✗  Import check failed (exit $PROBE_EXIT) but did not name the missing module — output:" >&2
  cat "$LOG" >&2
  exit 1
fi
echo "✓  Guard caught the broken import (exit $PROBE_EXIT) and named the missing module."

echo "▶  Step 3/3: confirming the restored tree is green again…"
if ! $CHECK > "$LOG" 2>&1; then
  echo "✗  Import check fails after restore — server/index.ts may not have been restored cleanly:" >&2
  cat "$LOG" >&2
  exit 1
fi
echo "✓  Restored tree passes."
echo ""
echo "✓  Import guard negative test PASSED — a broken import reliably fails the CI gate."
