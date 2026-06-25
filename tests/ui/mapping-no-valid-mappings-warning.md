# UI Test: "No valid field mappings" guard

Guards the safeguard in `client/src/pages/sync-config.tsx` (`handleSave` →
`validMappings = editor.fieldMappings.filter(m => m.sourceField && m.targetField)`
→ `validMappings.length === 0`) that blocks Save when one or more mapping rows
exist but NONE of them has both a source AND a target field set. On Save it shows
a destructive toast ("Žiadne platné mapovanie polí" / "No valid field mappings")
and the config must NOT save (the editor stays open).

This guard sits in `handleSave` in this order:
1. empty name → "Zadajte názov konfigurácie" / "Enter configuration name"
2. missing module(s) → "Vyberte oba moduly" / "Select both modules"
3. `fieldMappings.length === 0` → "Pridajte aspoň 1 mapovanie polí" /
   "Add at least 1 field mapping" (no rows at all)
4. **`validMappings.length === 0` → "Žiadne platné mapovanie polí" /
   "No valid field mappings"** ← the guard under test (rows exist but every row is
   missing source and/or target)
5. empty ONIX fixed-field value → "Pevné polia majú prázdne hodnoty" /
   "Fixed fields have empty values"
6. mapping validation errors → "Mapovanie má chyby" / "Mapping has errors"

Two ordering facts matter for this test:
- The guard (step 4) requires at least one row to exist, otherwise step 3 fires
  first. So you must click `button-add-mapping` to create a row, but leave its
  source/target unset.
- The guard (step 4) runs BEFORE the empty-fixed-field-value guard (step 5).
  When ONIX (stockitems) is the target on a NEW config, the editor auto-prepends
  a `SupplierCode` fixed field with an EMPTY value (`row-fixed-field-0`). Because
  step 4 runs first, that empty SupplierCode does NOT mask this guard — you will
  see the "No valid field mappings" toast even with the blank SupplierCode present.
  (This is the opposite situation to the duplicate-target test, where the empty
  SupplierCode masks the later mapping-error guard.) You only need to fill or
  delete the SupplierCode row LATER, when you want the corrected config to actually
  save (step 11), so the step-5 guard does not block that final save.

This is distinct from:
- the "Add at least 1 field mapping" case (no rows at all — step 3),
- the "Mapping has errors" / duplicate-target case
  (`tests/ui/mapping-validation-error-warning.md` — step 6), and
- the ONIX fixed-field cases (`tests/ui/fixed-field-duplicate-warning.md`,
  `tests/ui/fixed-field-empty-value-warning.md`,
  `tests/ui/fixed-field-overlap-warning.md`).

This project has no JS test runner, so the test is executed through the Replit
**testing** harness (`runTest`). Feed the test plan below to `runTest` to re-verify
the behavior after any refactor of the sync-config editor or of `handleSave`.

## Login / setup
- Admin account: username `admin`, password `admin123`.
- Editor lives at `/sync`. The field-mapping rows appear once at least one mapping
  row exists (after clicking `button-add-mapping`).
- Set "If record does not exist in target" to **Skip** (`radio-on-missing-skip`) —
  this keeps the mapping-validation results clean (suppresses the SupplierCode
  *mapping-validation* warning on ONIX stockitems configs). It is not strictly
  required to reproduce the step-4 guard, but keeps the final save clean.

## Key data-testids
- `page-sync-config`
- `button-new-config`, `card-config-editor`, `input-config-name`
- `select-source-module` (options `option-source-{CODE}`)
- `select-target-module` → `option-target-ONIX`
- `radio-on-missing-skip`
- `button-add-mapping`
- Mapping rows: `row-mapping-{idx}`, `select-source-field-{idx}`,
  `select-target-field-{idx}`, `button-remove-mapping-{idx}`
- Fixed-field rows (auto-added SupplierCode): `row-fixed-field-{idx}`,
  `input-fixed-field-value-{idx}`, `button-delete-fixed-field-{idx}`
- `button-save-config`
- Guard toast title: SK "Žiadne platné mapovanie polí" / EN "No valid field mappings"

## Test plan (paste into runTest)
1. New browser context; navigate to `/`. If a login form shows, log in as
   `admin` / `admin123`.
2. Navigate to `/sync`; assert `page-sync-config` visible.
3. Click `button-new-config`; assert `card-config-editor` visible.
4. Type a unique name into `input-config-name` (e.g. `no-valid-mappings-test-<rand>`).
5. Select the first `option-source-*` in `select-source-module`; select
   `option-target-ONIX` in `select-target-module`.
6. Click `radio-on-missing-skip`.
7. Click `button-add-mapping` once so `row-mapping-0` appears. **Do NOT** set
   `select-source-field-0` or `select-target-field-0` — leave the row's source and
   target both UNSET (empty/placeholder). Optionally click `button-add-mapping`
   again to add `row-mapping-1`, also leaving both selects unset, to confirm the
   guard fires even with multiple empty rows.
   - Note: do not fill or delete the auto-added `SupplierCode` fixed field yet — the
     step-4 guard runs before the fixed-field guard, so the blank value will not
     interfere with this assertion.
8. Click `button-save-config`; assert the no-valid-mappings state:
   - A destructive toast appears with title "Žiadne platné mapovanie polí" (SK) /
     "No valid field mappings" (EN).
   - The config did NOT save: `card-config-editor` is still visible (editor still
     open), and no config was added to the list.
9. (Negative control, optional) Set ONLY the source on `row-mapping-0`
   (`select-source-field-0`) but leave `select-target-field-0` unset. Click
   `button-save-config` again; assert the SAME "Žiadne platné mapovanie polí" /
   "No valid field mappings" toast appears and the editor stays open — a row with
   only a source (or only a target) is still not a valid mapping.
10. Fill in a valid mapping: in `row-mapping-0` set BOTH `select-source-field-0`
    (first available source field) and `select-target-field-0` (a concrete ONIX
    target field, e.g. `CustomColumns.Brand`). If you added a second empty row in
    step 7, remove it via `button-remove-mapping-1` so it does not retrigger the
    guard. Then give the auto-added `SupplierCode` fixed field a value — type
    `H-0001` into `input-fixed-field-value-0` (press Tab to commit the controlled
    input) or delete the row via `button-delete-fixed-field-0` — so the
    empty-fixed-field-value guard (step 5) does not block this save.
11. Click `button-save-config` again; assert NO "No valid field mappings" toast
    appears and the config saves (editor closes / the new config appears in the
    list).

## Notes for re-running in the harness
- The Select components are shadcn/Radix dropdowns: open the trigger
  (`select-source-field-{idx}` / `select-target-field-{idx}`) then click the desired
  option from the listbox. For step 7 you must NOT open/choose anything — leave the
  triggers on their placeholder so the row stays unset.
- The crux of this test is that at least one row EXISTS (so the step-3
  "Add at least 1 field mapping" guard is passed) but no row has BOTH source and
  target set (so the step-4 "No valid field mappings" guard fires). If you see the
  "Pridajte aspoň 1 mapovanie polí" / "Add at least 1 field mapping" toast instead,
  you have zero rows — click `button-add-mapping` first.
- If step 11 fails to save with a "Pevné polia majú prázdne hodnoty" /
  "Fixed fields have empty values" toast, the SupplierCode fixed field still has an
  empty value — fill `input-fixed-field-value-0` or delete that row, then save again.

## Last verified
- 2026-06-25 — PASSED via runTest (source PROMOTRON → target ONIX, on_missing=skip).
  Adding one mapping row with both source and target unset raised the
  "Žiadne platné mapovanie polí" / "No valid field mappings" toast and kept the
  editor open (config not saved). After setting source + target `CustomColumns.EAN`
  and filling the auto-added SupplierCode fixed field with `H-0001`, Save succeeded
  and the config appeared in the list.
