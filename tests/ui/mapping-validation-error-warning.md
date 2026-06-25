# UI Test: mapping-validation "Mapping has errors" guard

Guards the safeguard in `client/src/pages/sync-config.tsx` (`handleSave` →
`validateMappings` → `validation.some(v => v.status === "error")`) that blocks Save
when the field mappings contain a blocking validation ERROR. On Save it shows a
destructive toast ("Mapovanie má chyby" / "Mapping has errors"), expands the
Mapping Evaluation panel (`setShowValidation(true)`), and the config must NOT save
while any error-status validation result is present.

This guard sits AFTER the empty-fixed-field-value check and BEFORE the
duplicate/overlap conflict dialog in `handleSave`, so a mapping error blocks Save
before the conflict dialog can appear.

This is distinct from:
- the "duplicate name" case (`tests/ui/fixed-field-duplicate-warning.md`),
- the "empty value" case (`tests/ui/fixed-field-empty-value-warning.md`), and
- the "mapping overlap" case (`tests/ui/fixed-field-overlap-warning.md`),
all of which concern ONIX fixed fields rather than the field-mapping rows themselves.

This project has no JS test runner, so the test is executed through the Replit
**testing** harness (`runTest`). Feed the test plan below to `runTest` to re-verify
the behavior after any refactor of the sync-config editor or of `validateMappings`.

## Login / setup
- Admin account: username `admin`, password `admin123`.
- Editor lives at `/sync`. The field-mapping rows and the Mapping Evaluation panel
  appear once at least one mapping row exists.
- Set "If record does not exist in target" to **Skip** (`radio-on-missing-skip`) —
  this suppresses the SupplierCode *mapping-validation* warning that otherwise adds an
  unrelated result to ONIX stockitems configs.
- IMPORTANT — auto-added SupplierCode fixed field: when you pick ONIX (stockitems)
  as the target on a NEW config, the editor auto-prepends a `SupplierCode` fixed
  field row with an EMPTY value (`row-fixed-field-0`). The empty-fixed-field-value
  guard runs BEFORE the mapping-validation guard, so this blank SupplierCode value
  will block Save first with the "Pevné polia majú prázdne hodnoty" / "Fixed fields
  have empty values" toast — masking the mapping error you are trying to test.
  Before saving, give that row a value (e.g. type `H-0001` into
  `input-fixed-field-value-0`) or delete the row via `button-delete-fixed-field-0`.
  Filling it is preferred (also satisfies the SupplierCode mapping check).

### Which error to reproduce — IMPORTANT
Reproduce a **duplicate target field**: two mapping rows whose SOURCE fields are
both set and whose TARGET field is the SAME ONIX field. `validateMappings` returns
a `status: "error"` result ("Duplicate target fields: …" / "Duplicitné cieľové
polia: …") for this, which trips the guard.

Do NOT try to reproduce this guard with a "source set but target empty" row.
`handleSave` first computes `validMappings = fieldMappings.filter(m => m.sourceField
&& m.targetField)` and passes only `validMappings` to `validateMappings`. A row with
an empty target is therefore dropped before validation runs — so it can never raise
the "empty source or target field" error through Save. (If ALL rows are empty you
instead hit the separate "No valid field mappings" / "Žiadne platné mapovanie polí"
toast.) The duplicate-target path is the only one that reliably reaches this guard
from the UI.

## Key data-testids
- `button-new-config`, `card-config-editor`, `input-config-name`
- `select-source-module` (options `option-source-{CODE}`)
- `select-target-module` → `option-target-ONIX`
- `radio-on-missing-skip`
- `button-add-mapping`
- Mapping rows: `row-mapping-{idx}`, `select-source-field-{idx}`,
  `select-target-field-{idx}`, `button-remove-mapping-{idx}`
- Fixed-field rows (auto-added SupplierCode): `row-fixed-field-{idx}`,
  `input-fixed-field-name-{idx}`, `input-fixed-field-value-{idx}`,
  `button-delete-fixed-field-{idx}`
- Mapping Evaluation panel: `section-validation`, `button-toggle-validation`,
  result rows `validation-result-{idx}`
- `button-save-config`
- Error toast title: SK "Mapovanie má chyby" / EN "Mapping has errors"
  (description references "Vyhodnotenie mapovania" / "Mapping Evaluation").
- Error result rows carry red styling (`bg-red-50` / `text-red-700`) and the panel
  toggle shows an error (XCircle) icon.

Note on testid naming: the task brief referred to the panel as `select-validation`,
but in the current code the panel container is `section-validation` and its toggle
button is `button-toggle-validation`. Use those.

## Test plan (paste into runTest)
1. New browser context; navigate to `/`. If a login form shows, log in as `admin` / `admin123`.
2. Navigate to `/sync`; assert `page-sync-config` visible.
3. Click `button-new-config`; assert `card-config-editor` visible.
4. Type a unique name into `input-config-name`.
5. Select first `option-source-*` in `select-source-module`; select `option-target-ONIX`
   in `select-target-module`.
6. Click `radio-on-missing-skip`.
   - The editor auto-adds a `SupplierCode` fixed field with an empty value. Type
     `H-0001` into `input-fixed-field-value-0` (press Tab to commit the controlled
     input) so the empty-fixed-field-value guard does not block Save first. (Or delete
     that row with `button-delete-fixed-field-0`.)
7. Click `button-add-mapping`; in `row-mapping-0` pick the first source field in
   `select-source-field-0` and set `select-target-field-0` to a SPECIFIC named target
   field — use `CustomColumns.Brand` (any single concrete field works, just record the
   EXACT label you picked).
8. Click `button-add-mapping` again; in `row-mapping-1` pick a DIFFERENT source field
   in `select-source-field-1`, and set `select-target-field-1` to the **byte-for-byte
   IDENTICAL** target label you used in row 0 (e.g. also `CustomColumns.Brand`). This
   is the crux of the test: both target triggers must display the exact same text.
   Before saving, visually confirm `select-target-field-0` and `select-target-field-1`
   show the same value — if they differ there is no duplicate and Save will succeed.
9. Click `button-save-config`; assert the mapping-error state:
   - A destructive toast appears with title "Mapovanie má chyby" (SK) /
     "Mapping has errors" (EN).
   - The Mapping Evaluation panel is expanded: `section-validation` visible and at
     least one `validation-result-*` row shows the duplicate-target error
     (red styling, text mentions "Duplicate target fields" / "Duplicitné cieľové polia").
   - The config did NOT save: `card-config-editor` is still visible (editor still
     open), and NO duplicate/overlap conflict dialog appeared.
10. Fix the mapping: change `select-target-field-1` to a DIFFERENT, unused target
    field so the two rows no longer share a target.
11. Click `button-save-config` again; assert NO "Mapping has errors" toast appears and
    the config saves (editor closes / config appears in the list).

## Last verified
- 2026-06-25 — PASSED via runTest (source PROMOTRON → target ONIX; two mappings both
  targeting `CustomColumns.Brand` raised "Mapovanie má chyby" and blocked Save; changing
  row 1 to `CustomColumns.EAN` let the config save).
  Notes for re-running in the harness:
  - The Select components are shadcn/Radix dropdowns: open the trigger
    (`select-source-field-{idx}` / `select-target-field-{idx}`) then click the desired
    option from the listbox. Verify the trigger shows the chosen value before saving.
  - Ensure BOTH rows have a non-empty source AND target before the first Save —
    otherwise an empty row is filtered out by `validMappings` and you may hit the
    "No valid field mappings" toast (step 9) or only one valid mapping remains
    (no duplicate), making the guard look broken when it is just leftover empty rows.
  - If the harness leaves the SupplierCode warning visible despite `on_missing=skip`,
    re-check that `radio-on-missing-skip` is actually selected; the duplicate-target
    error is independent of it, but it keeps the panel assertions clean.
