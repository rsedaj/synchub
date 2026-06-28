#!/bin/bash
set -e

npm install

# Restore git remote with workflow-scoped PAT so .github/workflows/ pushes work.
# Requires GITHUB_PAT secret (repo + workflow scopes) stored in Replit Secrets.
if [ -n "$GITHUB_PAT" ]; then
  git remote set-url origin "https://x-access-token:${GITHUB_PAT}@github.com/rsedaj/synchub.git"
fi
