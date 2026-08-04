# UI Test: ONIX match-field stats panel — ⚠ warning on zero-count field

Guards the end-to-end data flow that surfaces per-field match index stats (⚠/✓
rows) in the sync run log panel when a configured ONIX match field has 0 indexed
values.

## What this protects (producer → consumer chain)

A regression anywhere in this chain silently hides the zero-field warning, so the
test pins every link:

1. **`server/target-push.ts` — `buildOnixIndex`**
   Builds `fieldNonEmptyCount: Map<string, number>` while indexing ONIX records.
   Every configured match target field is **pre-initialised to 0** before the loop
   so that fields with no indexed values appear explicitly (count=0) rather than
   being absent from the map. A count of 0 is the definitive signal that matching
   will always fail for that field → new cards would be created instead of updating
   existing ones → silent duplicates.
   `PushResult.onixIndexFieldStats` is `Object.fromEntries(fieldNonEmptyCount)`.

2. **`server/sync-engine.ts`**
   The first batch result that carries `onixIndexFieldStats` is captured:
   ```
   if (pushResult.onixIndexFieldStats && !onixIndexFieldStats)
     onixIndexFieldStats = pushResult.onixIndexFieldStats;
   ```
   At completion the engine writes:
   ```
   details.onixIndex = { ..., fieldStats: onixIndexFieldStats }
   ```
   The `onixIndex` block is emitted whenever `onixIndexFieldStats` is defined,
   even when `onixIndexIncomplete` is false (clean pagination, field still zero).

3. **`client/src/pages/sync-dashboard.tsx` (~line 3248)**
   In the expanded log row the dashboard reads:
   ```
   const onixIndexInfo = det?.onixIndex;     // { fieldStats?: Record<string, number> }
   const fieldStats = onixIndexInfo?.fieldStats;
   ```
   When `fieldStats` exists and has at least one key:
   - The section `data-testid="section-onix-field-stats-<runId>"` is rendered.
   - `hasZeroField = Object.values(fieldStats).some(v => v === 0)` controls border
     colour: red (`border-red-500/40 bg-red-500/10`) when any field is zero,
     green otherwise.
   - Each entry renders one row `data-testid="onix-field-stat-<runId>-<field>"`:
     - zero count → `⚠` prefix, red text, tooltip from
       `syncDash.onixFieldStatsZeroTitle`.
     - non-zero count → `✓` prefix, green text.
   - When `fieldStats` is absent the entire section is NOT rendered.

The companion executable server test at
`tests/server/onix-field-stats.test.ts`
(run with `npx tsx tests/server/onix-field-stats.test.ts`)
covers the producer side (Cases 1–5). This doc covers the consumer/UI side.

## Login / setup

- Admin account: username `admin`, password `admin123`.
- The run log lives at `/sync-dashboard`. Open it, click `button-tab-logs` to
  switch to the run-log tab. Each run is a collapsed row `log-run-<runId>`;
  clicking `button-log-expand-<runId>` expands it.
- `sync_runs.syncConfigId` is NOT NULL → `sync_configs(id)`. Injected runs must
  reference an existing config id.

## Key data-testids

| testid | when present |
|--------|-------------|
| `button-tab-logs` | always — switches to run-log tab |
| `log-run-<runId>` | row in the log list |
| `button-log-expand-<runId>` | expand toggle for a row |
| `section-onix-field-stats-<runId>` | only when `details.onixIndex.fieldStats` has ≥ 1 key |
| `onix-field-stat-<runId>-<field>` | one per `fieldStats` entry (field name is the key, e.g. `CustomColumns.Product_Code`) |

## Relevant DB schema (sync_runs)

- `id` varchar PK (default `gen_random_uuid()`)
- `sync_config_id` varchar NOT NULL → `sync_configs(id)`
- `status` enum `pending|running|success|partial|error` (use `success`)
- `details` jsonb — set to control the dashboard output:
  - Zero-field run:
    `{"onixIndex":{"fieldStats":{"Ns_Number":3,"CustomColumns.Product_Code":0}}}`
  - All-ok run:
    `{"onixIndex":{"fieldStats":{"Ns_Number":3,"CustomColumns.Product_Code":5}}}`
  - No-stats run:
    `{"completionSummary":"ok"}` (fieldStats absent → section not rendered)
- `started_at` timestamp NOT NULL (default now)

## Test plan (paste into runTest)

1. [New Context] Create a new browser context.
2. [Browser] Navigate to `/`. If a login form shows, log in as `admin` / `admin123`.
3. [DB] Find an existing config id to attach runs to:
   `SELECT id FROM sync_configs LIMIT 1;` Record it as `${CFG}`.
   - If no row exists, create a minimal one:
     `INSERT INTO sync_configs (name, source_module_id, target_module_id, is_enabled)
      SELECT 'ZZ FIELD-STATS-TEST', m.id, m.id, false FROM api_modules m LIMIT 1
      RETURNING id;`
     Use the returned id as `${CFG}`.
4. [DB] Insert a ZERO-FIELD run and capture its id as `${ZERO}`:
   ```sql
   INSERT INTO sync_runs (sync_config_id, status, details)
   VALUES ('${CFG}', 'success',
     '{"onixIndex":{"fieldStats":{"Ns_Number":3,"CustomColumns.Product_Code":0}}}'::jsonb)
   RETURNING id;
   ```
5. [DB] Insert an ALL-OK run (all field counts positive) and capture its id as `${OK}`:
   ```sql
   INSERT INTO sync_runs (sync_config_id, status, details)
   VALUES ('${CFG}', 'success',
     '{"onixIndex":{"fieldStats":{"Ns_Number":3,"CustomColumns.Product_Code":5}}}'::jsonb)
   RETURNING id;
   ```
6. [DB] Insert a NO-STATS run (no onixIndex.fieldStats key) and capture its id as `${NONE}`:
   ```sql
   INSERT INTO sync_runs (sync_config_id, status, details)
   VALUES ('${CFG}', 'success', '{"completionSummary":"ok"}'::jsonb)
   RETURNING id;
   ```
7. [Browser] Navigate to `/sync-dashboard`. Click `button-tab-logs` to open the log tab.

### ZERO-FIELD run — section renders with red styling and ⚠ row

8. [Browser] Locate `log-run-${ZERO}` (scroll or filter to "success" if needed).
   Click `button-log-expand-${ZERO}`.
9. [Verify]
   - `section-onix-field-stats-${ZERO}` is visible.
   - The section has red border/background (the `hasZeroField` branch):
     look for classes containing `red` or a `border-red` colour on that element.
   - `onix-field-stat-${ZERO}-Ns_Number` is visible and shows "✓" (count=3 > 0).
   - `onix-field-stat-${ZERO}-CustomColumns.Product_Code` is visible and shows "⚠"
     (count=0). The element must contain the warning icon `⚠` (not `✓`) and
     the field name `CustomColumns.Product_Code` in monospace.
   - The row for the zero field has red text styling (class contains `red`).
   - No amber `warning-onix-index-incomplete-${ZERO}` banner is present (incomplete
     index is a separate condition; this run has only fieldStats, no incomplete flag).

### ALL-OK run — section renders with green styling and all ✓ rows

10. [Browser] Click `button-log-expand-${ZERO}` to collapse it, then click
    `button-log-expand-${OK}` to expand the all-ok run.
11. [Verify]
    - `section-onix-field-stats-${OK}` is visible.
    - The section has green border/background (the `!hasZeroField` branch):
      look for classes containing `green`.
    - `onix-field-stat-${OK}-Ns_Number` shows "✓" and is styled green.
    - `onix-field-stat-${OK}-CustomColumns.Product_Code` shows "✓" (count=5 > 0)
      and is styled green.
    - Neither row shows "⚠".

### NO-STATS run — section is absent

12. [Browser] Collapse `${OK}`, expand `${NONE}` via `button-log-expand-${NONE}`.
13. [Verify]
    - `section-onix-field-stats-${NONE}` is NOT present in the DOM
      (when `details.onixIndex.fieldStats` is absent the block is not rendered).

### Cleanup

14. [DB] Remove the injected rows:
    ```sql
    DELETE FROM sync_runs WHERE id IN ('${ZERO}', '${OK}', '${NONE}');
    ```
    If a test config was created in step 3:
    ```sql
    DELETE FROM sync_configs WHERE id = '${CFG}' AND name = 'ZZ FIELD-STATS-TEST';
    ```

## Notes for maintenance

- The `data-testid` on each field row includes the raw field name as the suffix,
  e.g. `onix-field-stat-${runId}-CustomColumns.Product_Code`. If the dashboard
  changes the testid format (sync-dashboard.tsx line ~3268), update this doc.
- "Zero-count field absent from fieldStats" was a real bug (fixed in
  `server/target-push.ts` `buildOnixIndex`): fields with 0 indexed values were
  simply not added to `fieldNonEmptyCount`, so the key never appeared in
  `onixIndexFieldStats` and the ⚠ row never rendered. The fix pre-initialises
  all `targetFields` to 0 before the record loop.

## Last verified

- 2026-08-04 — Test plan written. Companion server test
  `tests/server/onix-field-stats.test.ts` passes all 5 cases
  (run `npx tsx tests/server/onix-field-stats.test.ts`).
  The pre-init fix was verified to be necessary: without it, Case 1 failed
  (`CustomColumns.Product_Code` was `undefined`, not `0`).
