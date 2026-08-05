# Branch Protection Verification — "API safety checks" required status check

**Verified:** 2026-08-05  
**Branch protection rule:** `main` — require PR + "API safety checks" must pass before merge

## What was tested

A test PR (`ci/gate-verification-clean` → `main`, PR #2) was opened to confirm that:

1. The required status check **"API safety checks"** (GitHub Actions job `test` in `.github/workflows/deploy.yml`) runs automatically on every PR targeting `main`.
2. The merge button remains locked while CI is running and while the required check is pending.
3. Once the check passes the PR becomes content-mergeable; any remaining block is from other protection settings (e.g. required review), not from the status check.

## How the guard is configured

- **Repository:** `rsedaj/synchub` (public)
- **Protected branch:** `main`
- **Rule:** Require status checks to pass before merging → required context: **`API safety checks`**
- **Enforcement level:** `non_admins` — repository admins can bypass for emergency fixes
- **Direct push:** blocked for non-admins; pull request required

## Workflow job that supplies the check

File: `.github/workflows/deploy.yml`, job `test` (name: `API safety checks`)

Triggers: `push: [main]`, `pull_request: [main]`, `workflow_dispatch`

Steps run on every PR:
1. Verify the import guard catches a broken import (`npm run test:import-guard` — negative self-test, see below)
2. Check server / client / orphan import graphs resolve (`tsx scripts/check-*.ts`)
3. Initialize DB schema (`drizzle-kit push`)
4. Verify CI crash-detection guard (`npm run test:ci-crash`)
5. Run API safety tests against a live dev server (`npm run test:ci`)

All five must succeed for the status check to turn green and unblock the merge.

## Negative test: proving the guard catches a real regression

It is not enough that the happy path passes — the gate must demonstrably FAIL
when an actual regression (e.g. a missing/renamed module) is introduced. The
automated negative test `script/test-import-guard.sh` (`npm run test:import-guard`)
runs as the first step of the `test` job on every PR and:

1. Runs `scripts/check-server-imports.ts` on the clean tree → must pass.
2. Appends a deliberately broken import (`import "./__ci_import_guard_probe__";`,
   a module that does not exist) to `server/index.ts`.
3. Re-runs the check → asserts it **exits non-zero** and names the missing module.
4. Restores `server/index.ts` (guaranteed via a `trap`, even on interrupt) and
   re-runs the check → must pass again.

If the guard ever stops detecting broken imports (e.g. an esbuild config change
makes resolution errors non-fatal), this self-test fails the whole workflow, so
the regression in the guard itself blocks the PR.

### Manual procedure (equivalent)

```bash
npm run test:import-guard        # automated version
# or by hand:
echo 'import "./no-such-module";' >> server/index.ts
npx tsx scripts/check-server-imports.ts; echo "exit=$?"   # expect exit=1
git checkout -- server/index.ts
```

## Important fix made during verification

The original `deploy.yml` only had `push: [main]` as a trigger — **not** `pull_request`. This meant the "API safety checks" context would never be reported on a PR commit, permanently blocking every PR. The workflow was updated as part of this verification:

- Added `pull_request: branches: [main]` trigger to the `test` job
- Added `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` guard on `build-and-push` so Docker builds only happen on actual merges, not on PR check runs

## Verified outcome (PR #2)

| Step | Result |
|------|--------|
| `pull_request` trigger added to workflow on main | ✅ Done |
| PR #2 opened (`ci/gate-verification-clean` → `main`) | ✅ CI triggered automatically |
| GitHub Actions run ID | `31011109875` |
| "API safety checks" job | ✅ `completed / success` |
| "Build Docker image" job | ✅ `skipped` (PR event — correct) |
| "Smoke-test" and "Deploy" jobs | ✅ `skipped` (PR event — correct) |
| PR mergeable after check passed | `True` (unblocked by status check gate) |
| PR mergeable_state | `blocked` (by PR-review requirement — separate protection, also correct) |

## Conclusion

The gate is working as intended. Any PR that breaks the import graph, schema push, crash guard, or API safety tests will be blocked from merging to `main` until the issue is fixed. The `build-and-push`, `smoke-test`, and `deploy` jobs are correctly skipped on PR runs and only execute on actual merges to `main`.
