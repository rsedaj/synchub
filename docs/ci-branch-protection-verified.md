# Branch Protection Verification — "API safety checks" required status check

**Verified:** 2026-08-05  
**Branch protection rule:** `main` — require PR + "API safety checks" must pass before merge

## What was tested

A dummy PR (`ci/verify-branch-protection` → `main`) was opened to confirm that:

1. The required status check **"API safety checks"** (GitHub Actions job `test` in `.github/workflows/deploy.yml`) is enforced by the branch-protection rule on `main`.
2. The merge button remains locked until that check turns green.
3. Once the check passes, the PR becomes mergeable.

## Outcome

| Step | Result |
|------|--------|
| PR opened with no failing code | CI workflow triggered automatically |
| Merge button state before CI | **Blocked** — "Required statuses must pass before merging" |
| "API safety checks" result | ✅ Passed |
| Merge button state after CI | **Enabled** — merge permitted |

## How the guard is configured

- **Repository:** `rsedaj/synchub` (public)
- **Protected branch:** `main`
- **Rule:** Require status checks to pass before merging → required context: `API safety checks`
- **Additional settings:** Require a pull request before merging (direct push blocked); include administrators

## Workflow job that supplies the check

File: `.github/workflows/deploy.yml`, job `test` (name: `API safety checks`)

Steps run:
1. Check server / client / orphan import graphs resolve (`tsx scripts/check-*.ts`)
2. Initialize DB schema (`drizzle-kit push`)
3. Verify CI crash-detection guard (`npm run test:ci-crash`)
4. Run API safety tests (`npm run test:ci`)

All four must succeed for the status check to turn green and unblock the merge.

## Conclusion

The gate is working as intended. Any PR that breaks the import graph, schema push, crash guard, or API safety tests will be blocked from merging to `main` until the issue is fixed.
