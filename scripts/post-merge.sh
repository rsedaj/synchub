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

    # Validate the token so an expired/revoked PAT surfaces here instead of at
    # the next failed push. Non-fatal: never block the merge on this check.
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer ${GITHUB_PAT}" \
      -H "Accept: application/vnd.github+json" \
      https://api.github.com/user 2>/dev/null || true)
    HTTP_CODE=${HTTP_CODE:-000}

    if [ "$HTTP_CODE" = "200" ]; then
      echo "post-merge: GITHUB_PAT validated OK (GitHub API returned 200)."
    elif [ "$HTTP_CODE" = "401" ]; then
      echo "post-merge: WARNING - GITHUB_PAT is expired or revoked (GitHub API returned 401). Pushes will fail until it is renewed: see replit.md -> 'GitHub Push & PAT Renewal'." >&2
    else
      echo "post-merge: NOTE - could not verify GITHUB_PAT (GitHub API returned HTTP ${HTTP_CODE}); remote URL was still updated." >&2
    fi
  fi
fi
