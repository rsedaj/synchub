#!/bin/bash
set -e

npm install

# If GITHUB_PAT is set and origin points to github.com, update the remote URL
# so that pushes including .github/workflows/ (which require `workflow` scope)
# succeed. This is a no-op when the Replit GitHub OAuth integration token
# already has the workflow scope, or when origin is not a GitHub remote.
CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || true)

if [ -n "$GITHUB_PAT" ] && echo "$CURRENT_REMOTE" | grep -q "github\.com"; then
  REPO_PATH=$(echo "$CURRENT_REMOTE" | sed 's|.*github\.com[:/]\(.*\)|\1|' | sed 's|\.git$||')
  git remote set-url origin "https://x-access-token:${GITHUB_PAT}@github.com/${REPO_PATH}.git"
  echo "post-merge: git remote 'origin' updated to use GITHUB_PAT for github.com/${REPO_PATH}"
fi
