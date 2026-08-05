# Branch Protection Verification — "API safety checks" required status check

**Verified:** 2026-08-05  
**Branch protection rule:** `main` — require PR + "API safety checks" must pass before merge

## What was tested

A test PR (`ci/gate-verification-clean` → `main`) was opened to confirm that:

1. The required status check **"API safety checks"** (GitHub Actions job `test` in `.github/workflows/deploy.yml`) runs automatically on every PR targeting `main`.
2. The merge button remains locked until that check turns green.
3. Once the check passes the PR becomes mergeable (merge button enabled).

## How the guard is configured

- **Repository:** `rsedaj/synchub` (public)
- **Protected branch:** `main`
- **Rule:** Require status checks to pass before merging → required context: `API safety checks`
- **Additional settings:** Require a pull request before merging (direct push blocked for non-admins); include administrators: no

## Workflow job that supplies the check

File: `.github/workflows/deploy.yml`, job `test` (name: `API safety checks`)

Triggers: `push: [main]`, `pull_request: [main]`, `workflow_dispatch`

Steps run on every PR:
1. Check server / client / orphan import graphs resolve (`tsx scripts/check-*.ts`)
2. Initialize DB schema (`drizzle-kit push`)
3. Verify CI crash-detection guard (`npm run test:ci-crash`)
4. Run API safety tests against a live dev server (`npm run test:ci`)

All four must succeed for the status check to turn green and unblock the merge.

## Finding during verification

The original `deploy.yml` only had `push: [main]` as a trigger — **not** `pull_request`. This meant the "API safety checks" context would never be reported on a PR commit, making every PR permanently unmerge-able. The workflow was updated as part of this verification to add the `pull_request: [main]` trigger and to guard `build-and-push` / `smoke-test` / `deploy` jobs so they only run on actual pushes to main (not on PR checks).

## Outcome

| Step | Result |
|------|--------|
| `pull_request` trigger added to workflow | ✅ CI now fires on every PR targeting main |
| PR opened with no failing code | CI workflow triggered automatically |
| Merge button state while CI is running | **Blocked** — "Required statuses must pass before merging" |
| "API safety checks" job result | ✅ Passed (all import-graph, schema, crash-guard and API tests green) |
| Merge button state after CI passes | **Enabled** — PR is mergeable |
| Branch protection enforcement level | `non_admins` — only repo admins can bypass |

## Conclusion

The gate is working as intended. Any PR that breaks the import graph, schema push, crash guard, or API safety tests will be blocked from merging to `main` until the issue is fixed. The `build-and-push`, `smoke-test`, and `deploy` jobs are skipped on PRs and only run on actual merges to `main`.
