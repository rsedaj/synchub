#!/usr/bin/env bash
# Trigger a Coolify redeploy for SyncHub (Hetzner)
#
# Prerequisites — set these two Replit secrets (or export them locally):
#   COOLIFY_WEBHOOK_URL  — Coolify → vaša app → Deploy → Webhook URL
#                          napr. https://coolify.hauerland.sk/api/v1/deploy?uuid=xxx&force=false
#   COOLIFY_TOKEN        — Coolify → User Settings → API tokens → Create
#                          napr. 1|xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
#
# Usage:
#   bash scripts/coolify-deploy.sh
#
# Or as a one-liner:
#   curl --silent --fail --show-error \
#     -X POST "$COOLIFY_WEBHOOK_URL" \
#     -H "Authorization: Bearer $COOLIFY_TOKEN" \
#     -H "Content-Type: application/json"

set -euo pipefail

: "${COOLIFY_WEBHOOK_URL:?COOLIFY_WEBHOOK_URL is not set}"
: "${COOLIFY_TOKEN:?COOLIFY_TOKEN is not set}"

echo "Triggering Coolify deploy..."
curl --silent --fail --show-error \
  -X POST "$COOLIFY_WEBHOOK_URL" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Content-Type: application/json"

echo ""
echo "Deploy triggered. Monitor at: https://coolify.hauerland.sk"
