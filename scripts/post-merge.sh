#!/bin/bash
set -e

npm install

# Restore git remote with workflow-scoped PAT so .github/workflows/ pushes work.
# Requires GITHUB_PAT secret (repo + workflow scopes) stored in Replit Secrets.
# Derives the GitHub repo path from the current remote URL — no hardcoded owner/repo.
if [ -n "$GITHUB_PAT" ]; then
  CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || true)
  REPO_PATH=$(echo "$CURRENT_REMOTE" | sed 's|.*github\.com[:/]\(.*\)|\1|' | sed 's|\.git$||')
  if [ -n "$REPO_PATH" ]; then
    git remote set-url origin "https://x-access-token:${GITHUB_PAT}@github.com/${REPO_PATH}.git"
  fi
fi
