#!/usr/bin/env bash
#
# SyncHub single-command test runner.
#
# Runs the whole automated check suite in one shot so a regression can't slip
# through just because someone forgot which individual command to run:
#
#   1. Every backend test under `tests/server/**/*.test.ts`, executed with the
#      bundled tsx (this project has no separate JS test runner).
#   2. TypeScript type-check (`tsc --noEmit`) over the whole project.
#
# Per project rules `package.json` must NOT be edited, so there is no npm script
# for this — invoke the runner directly:
#
#   bash scripts/run-tests.sh
#
# Behaviour: the runner executes EVERY check (it does not abort on the first
# failure) and prints a pass/fail summary at the end. It exits non-zero if ANY
# check failed, and 0 only when every check passed.
#
# Why run-all instead of fail-fast: the project compiles via esbuild/tsx, which
# does not type-check, so `tsc --noEmit` can surface pre-existing type errors
# that do not stop the app from running. Aborting on the first failure would
# hide the backend-test results behind those type errors. Running all checks
# keeps every signal visible while still failing the overall run.
#
# Note: markdown runTest plans under `tests/ui/` are manual/agent-driven UI
# checks, not standalone scripts, so they are NOT executed here — they are
# listed in the summary for discoverability only.

set -uo pipefail

# Always run from the project root regardless of the caller's cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# --- pretty output helpers -------------------------------------------------
if [ -t 1 ]; then
  BOLD="$(printf '\033[1m')"; GREEN="$(printf '\033[32m')"
  RED="$(printf '\033[31m')"; DIM="$(printf '\033[2m')"; RESET="$(printf '\033[0m')"
else
  BOLD=""; GREEN=""; RED=""; DIM=""; RESET=""
fi

PASSED=()
FAILED=()

# run_check <label> <command...>
# Runs a single named check, streams its output, and records pass/fail.
# Does NOT abort the suite — every check runs so all signals stay visible.
run_check() {
  local label="$1"; shift
  echo ""
  echo "${BOLD}▶ ${label}${RESET}"
  echo "${DIM}\$ $*${RESET}"
  if "$@"; then
    echo "${GREEN}✓ PASS${RESET} — ${label}"
    PASSED+=("$label")
  else
    local code=$?
    echo "${RED}✗ FAIL${RESET} — ${label} (exit ${code})"
    FAILED+=("$label")
  fi
}

print_summary() {
  echo ""
  echo "${BOLD}════════════════════ TEST SUMMARY ════════════════════${RESET}"
  for c in "${PASSED[@]:-}"; do
    [ -n "$c" ] && echo "  ${GREEN}✓${RESET} $c"
  done
  for c in "${FAILED[@]:-}"; do
    [ -n "$c" ] && echo "  ${RED}✗${RESET} $c"
  done
  echo "${BOLD}──────────────────────────────────────────────────────${RESET}"
  local pass_count=${#PASSED[@]}
  local fail_count=${#FAILED[@]}
  if [ "$fail_count" -eq 0 ]; then
    echo "  ${GREEN}${BOLD}ALL CHECKS PASSED${RESET} (${pass_count} passed)"
  else
    echo "  ${RED}${BOLD}CHECKS FAILED${RESET} (${pass_count} passed, ${fail_count} failed)"
  fi
  echo "${BOLD}══════════════════════════════════════════════════════${RESET}"

  # Discoverability: list manual UI runTest plans (not auto-executed here).
  local ui_plans
  ui_plans=$(find tests/ui -maxdepth 1 -name '*.md' 2>/dev/null | sort)
  if [ -n "$ui_plans" ]; then
    echo ""
    echo "${DIM}Manual UI runTest plans (run via the testing skill, not by this script):${RESET}"
    while IFS= read -r f; do
      [ -n "$f" ] && echo "${DIM}  - $f${RESET}"
    done <<< "$ui_plans"
  fi
}

echo "${BOLD}SyncHub test runner${RESET} — $(date '+%Y-%m-%d %H:%M:%S')"

# --- 1. Backend tests ------------------------------------------------------
# Discover every *.test.ts under tests/server (recursively), sorted for a
# stable, predictable run order.
mapfile -t TEST_FILES < <(find tests/server -type f -name '*.test.ts' 2>/dev/null | sort)

if [ "${#TEST_FILES[@]}" -eq 0 ]; then
  echo ""
  echo "${RED}No backend test files found under tests/server/**/*.test.ts${RESET}"
  FAILED+=("backend: no test files found")
else
  for test_file in "${TEST_FILES[@]}"; do
    run_check "backend: ${test_file}" npx tsx "$test_file"
  done
fi

# --- 2. TypeScript type-check ---------------------------------------------
run_check "TypeScript type-check (tsc --noEmit)" npx tsc --noEmit

print_summary

# Exit non-zero if any check failed.
[ "${#FAILED[@]}" -eq 0 ]
