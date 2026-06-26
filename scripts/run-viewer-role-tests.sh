#!/usr/bin/env bash
#
# SyncHub viewer-role permission suite runner.
#
# Runs EVERY black-box viewer-role guard test under
# `tests/api/*viewer-role-guard*.test.ts` in a single pass against a live dev
# server, so the whole read-only-permission surface can be verified with one
# command instead of remembering each individual `npx tsx --test <file>`.
#
# These tests assert that "viewer" accounts get 403 on write endpoints across
# sync configs, modules/logs, and sync/backup. New *viewer-role-guard*.test.ts
# files are picked up automatically — no edit to this script is needed.
#
# It delegates server boot/reuse/teardown to scripts/run-api-tests.sh and just
# passes the "viewer-role-guard" filename filter, so behaviour (reusing a server
# already serving /api/health, or booting `npm run dev` and tearing it down)
# stays identical to the full API suite.
#
# Per project rules `package.json` must NOT be edited, so there is no npm script
# — invoke directly:
#
#   bash scripts/run-viewer-role-tests.sh
#
# Configuration: the same env vars as scripts/run-api-tests.sh
# (BASE_URL, PORT, TEST_USERNAME, TEST_PASSWORD, READY_TIMEOUT).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec bash "$SCRIPT_DIR/run-api-tests.sh" viewer-role-guard
