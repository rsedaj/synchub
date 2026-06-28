#!/bin/bash
set -e

npm install

# Restore git remote with workflow-scoped PAT so .github/workflows/ pushes work.
# Requires GITHUB_PAT secret (repo + workflow scopes) stored in Replit Secrets.
#
# Fails loudly if GITHUB_PAT is missing so the problem is never silent.
# Only rewrites origin when it points to a github.com URL.
if [ -z "$GITHUB_PAT" ]; then
  echo "WARNING: GITHUB_PAT secret is not set." >&2
  echo "         Pushes that include .github/workflows/ changes will be rejected by GitHub." >&2
  echo "         Add a GitHub PAT with 'repo' + 'workflow' scopes to Replit Secrets as GITHUB_PAT." >&2
  exit 1
fi

CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || true)

if echo "$CURRENT_REMOTE" | grep -q "github\.com"; then
  REPO_PATH=$(echo "$CURRENT_REMOTE" | sed 's|.*github\.com[:/]\(.*\)|\1|' | sed 's|\.git$||')
  NEW_REMOTE="https://x-access-token:${GITHUB_PAT}@github.com/${REPO_PATH}.git"
  git remote set-url origin "$NEW_REMOTE"
  echo "git remote 'origin' updated to use GITHUB_PAT for github.com/${REPO_PATH}"
else
  echo "origin does not point to github.com — skipping remote rewrite"
fi

# Verify the PAT can push to .github/workflows/ by checking token scopes.
SCOPES=$(curl -s -I -H "Authorization: token ${GITHUB_PAT}" \
  "https://api.github.com/user" 2>/dev/null \
  | grep -i "^x-oauth-scopes:" | tr -d '\r' | sed 's/x-oauth-scopes: //')

echo "GitHub token scopes: ${SCOPES}"

if echo "$SCOPES" | grep -q "workflow"; then
  echo "OK: token has 'workflow' scope — .github/workflows/ pushes will succeed."
else
  echo "ERROR: token is missing 'workflow' scope (found: ${SCOPES})." >&2
  echo "       Replace GITHUB_PAT with a token that includes repo + workflow scopes." >&2
  exit 1
fi
