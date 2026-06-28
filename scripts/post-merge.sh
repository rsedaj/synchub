#!/bin/bash
set -e

npm install

# --- GitHub remote setup + PAT health check ---
# GITHUB_PAT (classic token with `repo` + `workflow` scopes) lets pushes that
# touch .github/workflows/ succeed. When it is missing or has expired, those
# pushes fail SILENTLY. We update the remote when the PAT is present AND warn
# loudly when the PAT is missing or expired, so the next person knows to renew
# it (see replit.md -> "GitHub Push & PAT Renewal").
CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || true)

if echo "$CURRENT_REMOTE" | grep -q "github\.com"; then
  if [ -z "$GITHUB_PAT" ]; then
    echo "post-merge: WARNING - GITHUB_PAT is not set. Pushes to .github/workflows/ will fail (no 'workflow' scope). Renew it: see replit.md -> 'GitHub Push & PAT Renewal'." >&2
  else
    REPO_PATH=$(echo "$CURRENT_REMOTE" | sed 's|.*github\.com[:/]\(.*\)|\1|' | sed 's|\.git$||')
    git remote set-url origin "https://x-access-token:${GITHUB_PAT}@github.com/${REPO_PATH}.git"
    echo "post-merge: git remote 'origin' updated to use GITHUB_PAT for github.com/${REPO_PATH}"

    # Validate the token so an expired/revoked/under-scoped PAT surfaces here
    # instead of at the next failed push. We capture the response headers so we
    # can also inspect the granted scopes (GitHub returns them in the
    # `x-oauth-scopes` header). A token can be valid (200) yet still lack the
    # `workflow` scope, which is the exact silent failure this guards against.
    # Non-fatal: never block the merge on this check.
    PAT_RESPONSE=$(curl -s -o /dev/null -D - -w $'\nHTTP_CODE:%{http_code}' \
      -H "Authorization: Bearer ${GITHUB_PAT}" \
      -H "Accept: application/vnd.github+json" \
      https://api.github.com/user 2>/dev/null || true)
    HTTP_CODE=$(printf '%s\n' "$PAT_RESPONSE" | sed -n 's/^HTTP_CODE://p' | tr -d '\r')
    HTTP_CODE=${HTTP_CODE:-000}

    if [ "$HTTP_CODE" = "200" ]; then
      if printf '%s\n' "$PAT_RESPONSE" | grep -qi '^x-oauth-scopes:'; then
        OAUTH_SCOPES=$(printf '%s\n' "$PAT_RESPONSE" | grep -i '^x-oauth-scopes:' | sed 's/^[^:]*://' | tr -d '\r' | tr ',' ' ')
        MISSING=""
        printf '%s' "$OAUTH_SCOPES" | grep -qw "repo" || MISSING="repo"
        printf '%s' "$OAUTH_SCOPES" | grep -qw "workflow" || MISSING="${MISSING:+$MISSING, }workflow"
        if [ -n "$MISSING" ]; then
          echo "post-merge: WARNING - GITHUB_PAT is valid but missing required scope(s): ${MISSING}. Pushes to .github/workflows/ will fail. Renew with repo+workflow scopes: see replit.md -> 'GitHub Push & PAT Renewal'." >&2
        else
          echo "post-merge: GITHUB_PAT validated OK (token valid; repo + workflow scopes present)."
        fi
      else
        echo "post-merge: NOTE - GITHUB_PAT is valid but its scopes could not be determined (no x-oauth-scopes header; likely a fine-grained token). Ensure it can push to .github/workflows/. See replit.md -> 'GitHub Push & PAT Renewal'." >&2
      fi
    elif [ "$HTTP_CODE" = "401" ]; then
      echo "post-merge: WARNING - GITHUB_PAT is expired or revoked (GitHub API returned 401). Pushes will fail until it is renewed: see replit.md -> 'GitHub Push & PAT Renewal'." >&2
    else
      echo "post-merge: NOTE - could not verify GITHUB_PAT (GitHub API returned HTTP ${HTTP_CODE}); remote URL was still updated." >&2
    fi
  fi
fi
