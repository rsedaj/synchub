# UI Test: "Add at least 1 field mapping" guard (zero mapping rows)

Guards the safeguard in `client/src/pages/sync-config.tsx` (`handleSave` →
`editor.fieldMappings.length === 0`) that blocks Save when the config has NO
mapping rows at all. On Save it shows a destructive toast ("Pridajte aspoň 1
mapovanie polí" / "Add at least 1 field mapping") and the config must NOT save
(the editor stays open).

This guard sits in `handleSave` in this order:
1. empty name → "Zadajte názov konfigurácie" / "Enter configuration name"
2. missing module(s) → "Vyberte oba moduly" / "Select both modules"
3. **`fieldMappings.length === 0` → "Pridajte aspoň 1 mapovanie polí" /
   "Add at least 1 field mapping"** ← the guard under test (no rows at all)
4. `validMappings.length === 0` → "Žiadne platné mapovanie polí" /
   "No valid field mappings" (rows exist but every row is missing source and/or
   target)
5. empty ONIX fixed-field value → "Pevné polia majú prázdne hodnoty" /
   "Fixed fields have empty values"
6. mapping validation errors → "Mapovanie má chyby" / "Mapping has errors"

Ordering facts that matter for this test:
- The guard (step 3) requires ZERO mapping rows. So you must NOT click
  `button-add-mapping` before the first Save assertion — the moment a row exists
  (even an empty one), step 3 passes and step 4 ("No valid field mappings") fires
  instead.
- This guard runs BEFORE the empty-fixed-field-value guard (step 5). When ONIX
  (stockitems) is the target on a NEW config, the editor auto-prepends a
  `SupplierCode` fixed field with an EMPTY value (`row-fixed-field-0`). Because
  step 3 runs first, that empty SupplierCode does NOT mask this guard — you will
  see the "Add at least 1 field mapping" toast even with the blank SupplierCode
  present. You only need to fill or delete the SupplierCode row LATER, when you
  want the corrected config to actually save (step 9), so the step-5 guard does
  not block that final save.

This is distinct from:
- the "No valid field mappings" case (rows exist but none has both source and
  target — step 4; `tests/ui/mapping-no-valid-mappings-warning.md`),
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
- Editor lives at `/sync`. The field-mapping rows appear only once at least one
  mapping row exists (after clicking `button-add-mapping`) — for the first
  assertion you deliberately keep zero rows.
- Set "If record does not exist in target" to **Skip** (`radio-on-missing-skip`) —
  this keeps the mapping-validation results clean (suppresses the SupplierCode
  *mapping-validation* warning on ONIX stockitems configs). It is not strictly
  required to reproduce the step-3 guard, but keeps the final save clean.

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
- Guard toast title: SK "Pridajte aspoň 1 mapovanie polí" / EN "Add at least 1
  field mapping"

## Test plan (paste into runTest)
1. New browser context; navigate to `/`. If a login form shows, log in as
   `admin` / `admin123`.
2. Navigate to `/sync`; assert `page-sync-config` visible.
3. Click `button-new-config`; assert `card-config-editor` visible.
4. Type a unique name into `input-config-name` (e.g. `no-rows-test-<rand>`).
5. Select the first `option-source-*` in `select-source-module`; select
   `option-target-ONIX` in `select-target-module`.
6. Click `radio-on-missing-skip`.
7. **Do NOT** click `button-add-mapping` — leave the config with ZERO mapping
   rows (no `row-mapping-0` should exist).
   - Note: do not fill or delete the auto-added `SupplierCode` fixed field yet —
     the step-3 guard runs before the fixed-field guard, so the blank value will
     not interfere with this assertion.
8. Click `button-save-config`; assert the no-rows state:
   - A destructive toast appears with title "Pridajte aspoň 1 mapovanie polí" (SK)
     / "Add at least 1 field mapping" (EN).
   - The config did NOT save: `card-config-editor` is still visible (editor still
     open), and no config was added to the list.
9. Add one valid mapping: click `button-add-mapping` so `row-mapping-0` appears,
   then set BOTH `select-source-field-0` (first available source field) and
   `select-target-field-0` (a concrete ONIX target field, e.g.
   `CustomColumns.Brand` or `CustomColumns.EAN`). Then give the auto-added
   `SupplierCode` fixed field a value — type `H-0001` into
   `input-fixed-field-value-0` (press Tab to commit the controlled input) or
   delete the row via `button-delete-fixed-field-0` — so the empty-fixed-field
   guard (step 5) does not block this save.
10. Click `button-save-config` again; assert NO "Add at least 1 field mapping"
    toast (and no "No valid field mappings" toast) appears and the config saves
    (editor closes / the new config appears in the list).

## Notes for re-running in the harness
- The Select components are shadcn/Radix dropdowns: open the trigger
  (`select-source-field-{idx}` / `select-target-field-{idx}`) then click the desired
  option from the listbox.
- The crux of this test is that ZERO mapping rows exist (step 3 guard). If you see
  the "Žiadne platné mapovanie polí" / "No valid field mappings" toast instead,
  a mapping row already exists — you must NOT have clicked `button-add-mapping`
  before the first Save assertion.
- If step 10 fails to save with a "Pevné polia majú prázdne hodnoty" / "Fixed
  fields have empty values" toast, the SupplierCode fixed field still has an empty
  value — fill `input-fixed-field-value-0` or delete that row, then save again.

## Last verified
- 2026-06-25 — PASSED via runTest (source PROMOTRON → target ONIX, on_missing=skip).
  Saving with ZERO mapping rows raised the "Pridajte aspoň 1 mapovanie polí" /
  "Add at least 1 field mapping" toast and kept the editor open (config not saved).
  After adding one mapping row with both source and a `CustomColumns` ONIX target
  set, and filling the auto-added SupplierCode fixed field with `H-0001`, Save
  succeeded and the new config appeared in the saved configurations list.
