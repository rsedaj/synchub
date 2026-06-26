#!/usr/bin/env bash
#
# SyncHub black-box API test runner.
#
# The offline suite (`scripts/run-tests.sh`) only covers `tests/server/**/*.test.ts`.
# The black-box API tests under `tests/api/**/*.test.ts` need a LIVE dev server on
# port 5000 — they hit real HTTP endpoints and fail with ECONNREFUSED when nothing
# is listening. This script closes that gap so duplicate/empty field-mapping
# validation in `server/routes.ts` (and the other API guards) can't silently regress.
#
# What it does:
#   1. If a server is already answering on $BASE_URL/api/health, it reuses it.
#   2. Otherwise it boots `npm run dev`, waits for /api/health to go green, and
#      remembers to tear it down afterwards.
#   3. Runs every `tests/api/**/*.test.ts` via the bundled tsx test runner.
#   4. Stops the server it started (a pre-existing server is left untouched) and
#      exits with the test runner's exit code.
#
# Per project rules `package.json` must NOT be edited, so there is no npm script —
# invoke directly:
#
#   bash scripts/run-api-tests.sh
#
# By default it runs EVERY tests/api/**/*.test.ts file. Pass one or more
# filename substrings to run only the matching files (server boot/teardown is
# identical). This is what scripts/run-viewer-role-tests.sh uses to run just the
# viewer-role permission suite:
#
#   bash scripts/run-api-tests.sh viewer-role-guard
#   bash scripts/run-api-tests.sh sync-config sync-and-backup
#
# Configuration (all optional, sane defaults):
#   BASE_URL        Base URL of the server under test (default http://127.0.0.1:5000)
#   PORT            Port the booted dev server listens on (default 5000)
#   TEST_USERNAME   Login used by the API tests (default admin)
#   TEST_PASSWORD   Password used by the API tests (default admin123)
#   READY_TIMEOUT   Seconds to wait for /api/health before giving up (default 120)

set -uo pipefail

# Always run from the project root regardless of the caller's cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${BASE_URL:-http://127.0.0.1:5000}"
PORT="${PORT:-5000}"
TEST_USERNAME="${TEST_USERNAME:-admin}"
TEST_PASSWORD="${TEST_PASSWORD:-admin123}"
READY_TIMEOUT="${READY_TIMEOUT:-120}"
HEALTH_URL="${BASE_URL%/}/api/health"

export BASE_URL TEST_USERNAME TEST_PASSWORD

# --- pretty output helpers -------------------------------------------------
if [ -t 1 ]; then
  BOLD="$(printf '\033[1m')"; GREEN="$(printf '\033[32m')"
  RED="$(printf '\033[31m')"; DIM="$(printf '\033[2m')"; RESET="$(printf '\033[0m')"
else
  BOLD=""; GREEN=""; RED=""; DIM=""; RESET=""
fi

SERVER_PID=""          # process-group leader of the dev server we booted
SERVER_LOG=""          # log file for the booted dev server
STARTED_SERVER=0       # 1 only if THIS script booted the server

cleanup() {
  if [ "$STARTED_SERVER" -eq 1 ] && [ -n "$SERVER_PID" ]; then
    echo ""
    echo "${DIM}Stopping dev server (pgid $SERVER_PID)...${RESET}"
    # Negative PID targets the whole process group started via setsid, so tsx
    # and its child server process are all signalled.
    kill -TERM "-$SERVER_PID" 2>/dev/null || kill -TERM "$SERVER_PID" 2>/dev/null || true
    for _ in $(seq 1 20); do
      kill -0 "$SERVER_PID" 2>/dev/null || break
      sleep 0.5
    done
    kill -KILL "-$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

is_healthy() {
  curl --silent --fail --max-time 5 "$HEALTH_URL" > /dev/null 2>&1
}

echo "${BOLD}SyncHub API test runner${RESET} — $(date '+%Y-%m-%d %H:%M:%S')"
echo "${DIM}Target: $BASE_URL  (health: $HEALTH_URL)${RESET}"

# --- 1. Ensure a server is listening ---------------------------------------
if is_healthy; then
  echo "${GREEN}✓${RESET} Reusing the server already running at $BASE_URL"
else
  echo "${DIM}No server detected — booting \`npm run dev\` on port $PORT...${RESET}"
  SERVER_LOG="$(mktemp -t synchub-api-server.XXXXXX.log)"
  # setsid puts the dev server in its own process group so cleanup can kill the
  # whole tree (npm -> tsx -> node) at once.
  PORT="$PORT" NODE_ENV="${NODE_ENV:-development}" setsid npm run dev > "$SERVER_LOG" 2>&1 &
  SERVER_PID=$!
  STARTED_SERVER=1

  echo "${DIM}Waiting up to ${READY_TIMEOUT}s for $HEALTH_URL ...${RESET}"
  ready=0
  for _ in $(seq 1 "$READY_TIMEOUT"); do
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      echo "${RED}✗ The dev server exited before becoming ready.${RESET}"
      echo "${DIM}---- server log ----${RESET}"
      cat "$SERVER_LOG" || true
      exit 1
    fi
    if is_healthy; then
      ready=1
      break
    fi
    sleep 1
  done

  if [ "$ready" -ne 1 ]; then
    echo "${RED}✗ Server did not become ready within ${READY_TIMEOUT}s.${RESET}"
    echo "${DIM}---- server log ----${RESET}"
    cat "$SERVER_LOG" || true
    exit 1
  fi
  echo "${GREEN}✓${RESET} Server is up"
fi

# --- 2. Run the API tests --------------------------------------------------
# Optional positional args narrow the run to files whose path contains ANY of
# the given substrings (e.g. "viewer-role-guard"). With no args, run them all.
mapfile -t ALL_API_TEST_FILES < <(find tests/api -type f -name '*.test.ts' 2>/dev/null | sort)

if [ "$#" -eq 0 ]; then
  API_TEST_FILES=("${ALL_API_TEST_FILES[@]}")
else
  API_TEST_FILES=()
  for f in "${ALL_API_TEST_FILES[@]}"; do
    for pattern in "$@"; do
      case "$f" in
        *"$pattern"*) API_TEST_FILES+=("$f"); break ;;
      esac
    done
  done
fi

if [ "${#API_TEST_FILES[@]}" -eq 0 ]; then
  if [ "$#" -gt 0 ]; then
    echo "${RED}✗ No API test files under tests/api/**/*.test.ts matched: $*${RESET}"
  else
    echo "${RED}✗ No API test files found under tests/api/**/*.test.ts${RESET}"
  fi
  exit 1
fi

echo ""
echo "${BOLD}▶ Running ${#API_TEST_FILES[@]} API test file(s) against $BASE_URL${RESET}"
for f in "${API_TEST_FILES[@]}"; do
  echo "${DIM}  - $f${RESET}"
done
echo "${DIM}\$ npx tsx --test ${API_TEST_FILES[*]}${RESET}"
echo ""

npx tsx --test "${API_TEST_FILES[@]}"
TEST_EXIT=$?

echo ""
if [ "$TEST_EXIT" -eq 0 ]; then
  echo "${GREEN}${BOLD}✓ ALL API TESTS PASSED${RESET}"
else
  echo "${RED}${BOLD}✗ API TESTS FAILED${RESET} (exit ${TEST_EXIT})"
fi

exit "$TEST_EXIT"
