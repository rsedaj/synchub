# UI Test: incomplete ONIX index "duplicate risk" warning banner

Guards the end-to-end data flow that surfaces a duplicate-creation risk to operators
when a sync ran against an INCOMPLETE in-memory ONIX card index.

## What this protects (producer → consumer chain)

A regression anywhere in this chain silently hides the duplicate-risk banner, so the
test pins every link:

1. **`server/target-push.ts` — `pushToTarget` (→ `pushToOnix` / `buildOnixIndex`)**
   When the ONIX index fetch returns fewer cards than ONIX reports via
   `@odata.count`, `buildOnixIndex` sets `complete = false`
   (`complete = indexExpectedCount == null ? true : arr.length >= indexExpectedCount`).
   The resulting `PushResult` then surfaces three fields:
   - `onixIndexComplete` (`= onixIndex.complete` — `false` when incomplete),
   - `onixIndexRecordCount` (`= onixIndex.recordCount` — how many cards were indexed),
   - `onixIndexExpectedCount` (`= onixIndex.expectedCount` — ONIX `@odata.count`).
2. **`server/sync-engine.ts`** When any batch's `pushResult.onixIndexComplete === false`,
   the engine records `onixIndexIncomplete = true` plus the record/expected counts, and
   writes them into the run as
   `details.onixIndex = { incomplete: true, recordCount, expectedCount }`.
   When every batch's index is complete, `details.onixIndex` is omitted.
3. **`client/src/pages/sync-dashboard.tsx`** In the expanded log row, when
   `details.onixIndex.incomplete` is truthy it renders the amber warning banner
   `data-testid="warning-onix-index-incomplete-<runId>"` with the localized title
   (`syncDash.onixIndexIncompleteTitle`) and a description
   (`syncDash.onixIndexIncompleteDesc`) where `{indexed}` is replaced by
   `recordCount` and `{expected}` by `expectedCount`. When `onixIndex` is absent (or
   `incomplete` is falsy) the banner is NOT rendered.

This doc covers the CONSUMER side (the dashboard render). The PRODUCER side — that
`pushToTarget` actually returns `onixIndexComplete` / `onixIndexRecordCount` /
`onixIndexExpectedCount` when the index is incomplete — has a companion executable
test at `tests/server/onix-index-incomplete.test.ts`
(run with `npx tsx tests/server/onix-index-incomplete.test.ts`).

This project has no JS test runner, so the UI test below is executed through the
Replit **testing** harness (`runTest`). The harness injects runs directly with `[DB]`
steps (reproducing the exact `details.onixIndex` shape that the producer chain above
writes), then verifies the dashboard render. Feed the test plan below to `runTest`
after any refactor of the sync engine, target-push surfacing, or sync-dashboard log row.

## Login / setup
- Admin account: username `admin`, password `admin123`.
- The run log lives on the sync dashboard at `/sync-dashboard`. The page opens on the
  "overview" tab; click `button-tab-logs` to switch to the run log. Each run is a
  collapsed row `log-run-<runId>`; clicking `button-log-expand-<runId>` expands it to
  reveal phases and the warning banner.
- `sync_runs.syncConfigId` is `NOT NULL` and references `sync_configs(id)`, so the
  test must attach injected runs to an EXISTING config id (query one first), not a
  made-up id.
- The dashboard only labels a run's config name when the config exists; injected runs
  must therefore reference a real config.

## Key data-testids
- `button-tab-logs` (switches the dashboard to the run-log tab)
- `log-run-<runId>` (row), `button-log-expand-<runId>` (expand toggle)
- `warning-onix-index-incomplete-<runId>` (the amber duplicate-risk banner; ONLY
  rendered when `details.onixIndex.incomplete` is truthy)

## Relevant DB schema (sync_runs)
- `id` varchar PK (default `gen_random_uuid()`)
- `sync_config_id` varchar NOT NULL → `sync_configs(id)`
- `status` enum: `pending|running|success|partial|error` (use `success`)
- `details` jsonb — the object read by the dashboard; set
  `{"onixIndex": {"incomplete": true, "recordCount": 12345, "expectedCount": 67890}}`
  for the incomplete case
- `started_at` timestamp NOT NULL (default now)

## Test plan (paste into runTest)
1. [New Context] Create a new browser context.
2. [Browser] Navigate to `/`. If a login form shows, log in as `admin` / `admin123`.
3. [DB] Find an existing config id to attach runs to:
   `SELECT id FROM sync_configs LIMIT 1`. Record it as `${CFG}`.
   - If no row exists, create a minimal one:
     `INSERT INTO sync_configs (name, source_module_id, target_module_id, is_enabled)
      SELECT 'ZZ ONIX-INDEX-TEST', m.id, m.id, false FROM api_modules m LIMIT 1
      RETURNING id;` and use the returned id as `${CFG}`.
4. [DB] Insert an INCOMPLETE-index run and capture its id as `${INC}`:
   `INSERT INTO sync_runs (sync_config_id, status, details)
    VALUES ('${CFG}', 'success',
      '{"onixIndex":{"incomplete":true,"recordCount":12345,"expectedCount":67890}}'::jsonb)
    RETURNING id;`
5. [DB] Insert a CONTROL run (no onixIndex) and capture its id as `${OK}`:
   `INSERT INTO sync_runs (sync_config_id, status, details)
    VALUES ('${CFG}', 'success', '{"completionSummary":"ok"}'::jsonb)
    RETURNING id;`
6. [Browser] Navigate to `/sync-dashboard`. Click `button-tab-logs` to open the run log.
7. [Browser] In the log card, locate `log-run-${INC}` (if the status filter select is
   set, choose "all" or "success", and scroll if needed). Click `button-log-expand-${INC}`.
8. [Verify] (incomplete run, expanded)
   - `warning-onix-index-incomplete-${INC}` is visible.
   - Its text contains the indexed/expected counts: `12,345` and `67,890`
     (numbers are locale-formatted via `toLocaleString()`; the exact grouping
     separator may vary, but both numbers appear and `expected` is not `?`).
   - The banner shows the duplicate-risk title (SK "Neúplný ONIX index — riziko
     duplikátov" / EN "Incomplete ONIX index — duplicate risk").
9. [Browser] Click `button-log-expand-${OK}` to expand the control run.
10. [Verify] (control run, expanded)
    - `warning-onix-index-incomplete-${OK}` is NOT present (the banner does not render
      when `details.onixIndex` is absent).
11. [DB] (optional, also covers the `incomplete:false` branch) Update the incomplete
    run to a complete index and re-check:
    `UPDATE sync_runs SET details =
      '{"onixIndex":{"incomplete":false,"recordCount":67890,"expectedCount":67890}}'::jsonb
     WHERE id = '${INC}';`
    [Browser] Reload `/sync-dashboard`, open `button-tab-logs`, expand `${INC}` again.
    [Verify] `warning-onix-index-incomplete-${INC}` is NOT present (banner only shows
    when `incomplete` is truthy).
12. [DB] Cleanup the injected rows:
    `DELETE FROM sync_runs WHERE id IN ('${INC}', '${OK}');`
    (and delete the test config if you created one in step 3:
    `DELETE FROM sync_configs WHERE id = '${CFG}' AND name = 'ZZ ONIX-INDEX-TEST';`)

## Last verified
- 2026-06-25 — PASSED via runTest. Injected an incomplete run
  (`recordCount: 12345`, `expectedCount: 67890`) and a control run; the banner
  `warning-onix-index-incomplete-<runId>` rendered with both counts (12,345 / 67,890)
  and the duplicate-risk title for the incomplete run, and was absent for the control
  run. Injected rows were cleaned up.
  Note: the `sync_configs` "enabled" column is `is_enabled` (not `is_active`); the
  fallback insert in step 3 uses `is_enabled`.
