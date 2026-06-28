#!/usr/bin/env bash
#
# SyncHub single-command test runner.
#
# Runs the whole automated check suite in one shot so a regression can't slip
# through just because someone forgot which individual command to run:
#
#   1. Every OFFLINE backend test under `tests/server/**/*.test.ts`, executed
#      with the bundled tsx (this project has no separate JS test runner).
#   2. The black-box API tests under `tests/api/**/*.test.ts`, run against a live
#      server via `scripts/run-api-tests.sh` (which boots/reuses the dev server,
#      waits for /api/health, then tears down a server it started). This is what
#      guards the field-mapping / name / module validation in `server/routes.ts`.
#   3. TypeScript type-check (`tsc --noEmit`) over the whole project.
#
# THIS is the single canonical command used by automation. The automated "test"
# validation step runs `bash scripts/run-tests.sh --backend-only` so the offline
# AND live-server API checks both run on every change — there is no separate
# command to remember.
#
# Per project rules `package.json` must NOT be edited, so there is no npm script
# for this — invoke the runner directly:
#
#   bash scripts/run-tests.sh                 # full suite (backend + api + tsc)
#   bash scripts/run-tests.sh --backend-only  # backend + api tests (skip tsc)
#   bash scripts/run-tests.sh --no-api        # skip the live-server API tests
#
# The `--backend-only` flag is what the automated "test" validation step runs on
# every change. It deliberately skips the `tsc --noEmit` type-check because the
# project compiles via esbuild/tsx (which does not type-check) and there are
# pre-existing, unrelated type errors in the codebase. Including tsc in the
# automatic gate would keep it perpetually red and mask the backend-test signal
# (i.e. the ONIX index safety checks this gate exists to protect). Run the full
# suite manually with `bash scripts/run-tests.sh` to also see type-check results.
#
# The `--no-api` flag skips the live-server API phase for environments with no
# database / server available; the offline backend tests still run.
#
# Behaviour: the runner executes EVERY selected check (it does not abort on the
# first failure) and prints a pass/fail summary at the end. It exits non-zero if
# ANY check failed, and 0 only when every check passed.
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

# --- argument parsing ------------------------------------------------------
# --backend-only: run the backend tests but skip the tsc type-check (used by
# the automated validation gate — see the header for why).
BACKEND_ONLY=0
RUN_API=1
for arg in "$@"; do
  case "$arg" in
    --backend-only) BACKEND_ONLY=1 ;;
    --no-api) RUN_API=0 ;;
    -h|--help)
      echo "Usage: bash scripts/run-tests.sh [--backend-only] [--no-api]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: bash scripts/run-tests.sh [--backend-only] [--no-api]" >&2
      exit 2
      ;;
  esac
done

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

# --- 0. Server import-graph smoke check ------------------------------------
# Fast, offline resolution of the whole local server import graph from
# server/index.ts. Catches a missing/renamed server module (e.g. a new file
# imported by routes.ts but never committed) immediately with a clear "Could
# not resolve" error, instead of only at runtime via a 120s health-check
# timeout. It does NOT type-check (esbuild only resolves/parses), so it stays
# green despite the project's pre-existing unrelated tsc errors.
run_check "server import graph resolves" npx tsx scripts/check-server-imports.ts

# --- 0b. Client import-graph smoke check -----------------------------------
# Frontend twin of the server import check above. Fast, offline resolution of
# the whole local client import graph from client/src/main.tsx. Catches a React
# component imported by the client but never committed (or renamed) immediately
# with a clear "Could not resolve" error, instead of only at the end of the slow
# Vite production build in the Docker image stage. It does NOT type-check or run
# the full build (esbuild only resolves/parses), so it stays green despite the
# project's pre-existing unrelated tsc errors.
run_check "client import graph resolves" npx tsx scripts/check-client-imports.ts

# --- 0c. Orphan import-graph smoke check -----------------------------------
# Covers the files the two checks above do NOT reach: the test files under
# tests/server/** and tests/api/**, standalone config/scripts (vite.config.ts,
# drizzle.config.ts, scripts/*.ts, ...) and any unused-but-committed component.
# It resolves each of those non-entry files' local import graph and fails
# immediately with a clear "Could not resolve" error when one references a
# missing/renamed module — instead of only when that specific test executes (or
# never, for an unused component). Like the checks above it does NOT type-check
# or run the tests (esbuild only resolves/parses), so it stays green despite the
# project's pre-existing unrelated tsc errors.
run_check "orphan import graph resolves" npx tsx scripts/check-orphan-imports.ts

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

# --- 2. Black-box API tests (live server) ---------------------------------
# Delegated to scripts/run-api-tests.sh, which reuses a server already serving
# /api/health or boots one itself, runs every tests/api/**/*.test.ts, and tears
# down a server it started. This is the part that keeps the field-mapping / name
# / module validation in server/routes.ts from regressing. Skipped with --no-api
# for environments without a database / server available.
if [ "$RUN_API" -eq 1 ]; then
  run_check "api: tests/api (live server)" bash "$SCRIPT_DIR/run-api-tests.sh"
else
  echo ""
  echo "${DIM}Skipping live-server API tests (--no-api).${RESET}"
fi

# --- 3. TypeScript type-check ---------------------------------------------
# Skipped in --backend-only mode (the automated validation gate) because the
# project has pre-existing, unrelated tsc errors that would keep the gate red.
if [ "$BACKEND_ONLY" -eq 0 ]; then
  run_check "TypeScript type-check (tsc --noEmit)" npx tsc --noEmit
else
  echo ""
  echo "${DIM}Skipping TypeScript type-check (--backend-only). Run \`bash scripts/run-tests.sh\` for the full suite.${RESET}"
fi

print_summary

# Exit non-zero if any check failed.
[ "${#FAILED[@]}" -eq 0 ]
