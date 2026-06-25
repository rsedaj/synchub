# UI Test: "Enter configuration name" + "Select both modules" guards

Guards the two earliest safeguards in `client/src/pages/sync-config.tsx`
(`handleSave`) that block Save before any mapping/fixed-field guard runs:

1. **empty name** → destructive toast "Zadajte názov konfigurácie" /
   "Enter configuration name" (`!editor.name.trim()`).
2. **missing source or target module** → destructive toast "Vyberte oba moduly"
   / "Select both modules" (`!editor.targetModuleId || !editor.sourceModuleId`).

In both cases the config must NOT save (the editor stays open). These two guards
fire BEFORE all of the mapping/fixed-field guards, so they cannot be reached once
those later branches have run — the test must trigger each one in isolation.

`handleSave` runs the guards in this order:
1. **empty name → "Zadajte názov konfigurácie" / "Enter configuration name"**
   ← guard #1 under test
2. **missing module(s) → "Vyberte oba moduly" / "Select both modules"**
   ← guard #2 under test
3. `fieldMappings.length === 0` → "Pridajte aspoň 1 mapovanie polí" /
   "Add at least 1 field mapping"
4. `validMappings.length === 0` → "Žiadne platné mapovanie polí" /
   "No valid field mappings"
5. empty ONIX fixed-field value → "Pevné polia majú prázdne hodnoty" /
   "Fixed fields have empty values"
6. mapping validation errors → "Mapovanie má chyby" / "Mapping has errors"

Ordering facts that matter for this test:
- Because guard #1 (empty name) runs first, you can assert it with NO modules and
  NO mappings selected — nothing later can mask it.
- To reach guard #2 you must give the config a non-empty name but leave at least
  one module unselected. On a NEW config the editor opens with both modules empty.
- **UI dependency:** the SOURCE module dropdown (`select-source-module`) is hidden
  until a TARGET module is chosen — until then the source card only shows the hint
  "Najprv vyberte cieľový modul vpravo →" / "First select a target module on the
  right →". So you cannot select only the source. To trigger guard #2, select ONLY
  the TARGET module (`select-target-module`) and leave the source unselected, then
  Save — `editor.sourceModuleId` is still empty, so guard #2 fires.
- Once BOTH modules are selected, guard #2 passes and the later mapping guards
  (#3/#4) take over — so do not select the source module until you intend to move
  past this guard.

This is distinct from:
- the "Add at least 1 field mapping" case (`tests/ui/mapping-no-rows-warning.md`,
  step 3),
- the "No valid field mappings" case
  (`tests/ui/mapping-no-valid-mappings-warning.md`, step 4),
- the "Mapping has errors" / duplicate-target case
  (`tests/ui/mapping-validation-error-warning.md`, step 6), and
- the ONIX fixed-field cases (`tests/ui/fixed-field-duplicate-warning.md`,
  `tests/ui/fixed-field-empty-value-warning.md`,
  `tests/ui/fixed-field-overlap-warning.md`).

This project has no JS test runner, so the test is executed through the Replit
**testing** harness (`runTest`). Feed the test plan below to `runTest` to re-verify
the behavior after any refactor of the sync-config editor or of `handleSave`.

## Login / setup
- Admin account: username `admin`, password `admin123`.
- Editor lives at `/sync`. A NEW config opens with an empty name and both modules
  unselected — exactly the state needed to trigger guards #1 and #2.
- Set "If record does not exist in target" to **Skip** (`radio-on-missing-skip`)
  before the final save — this keeps the mapping-validation results clean
  (suppresses the SupplierCode *mapping-validation* warning on ONIX stockitems
  configs).

## Key data-testids
- `page-sync-config`
- `button-new-config`, `card-config-editor`, `input-config-name`
- `select-source-module` (options `option-source-{CODE}`)
- `select-target-module` (options `option-target-{CODE}`, e.g. `option-target-ONIX`)
- `radio-on-missing-skip`
- `button-add-mapping`
- Mapping rows: `row-mapping-{idx}`, `select-source-field-{idx}`,
  `select-target-field-{idx}`, `button-remove-mapping-{idx}`
- Fixed-field rows (auto-added SupplierCode): `row-fixed-field-{idx}`,
  `input-fixed-field-value-{idx}`, `button-delete-fixed-field-{idx}`
- `button-save-config`
- Saved config names in the list: `text-config-name-{id}`
- Guard toast titles:
  - SK "Zadajte názov konfigurácie" / EN "Enter configuration name"
  - SK "Vyberte oba moduly" / EN "Select both modules"

## Test plan (paste into runTest)
1. New browser context; navigate to `/`. If a login form shows, log in as
   `admin` / `admin123`.
2. Navigate to `/sync`; assert `page-sync-config` visible.
3. Click `button-new-config`; assert `card-config-editor` visible. Leave
   `input-config-name` blank and both modules unselected.
4. **Guard #1 (empty name):** click `button-save-config`; assert:
   - A destructive toast appears with title "Zadajte názov konfigurácie" (SK) /
     "Enter configuration name" (EN).
   - The config did NOT save: `card-config-editor` is still visible (editor still
     open), and no config was added to the list.
5. Type a unique name into `input-config-name` (e.g.
   `name-module-guard-<rand>`). Select ONLY the target module: pick
   `option-target-ONIX` in `select-target-module`. Leave the source module
   unselected (do NOT touch `select-source-module`).
   - Note: the source dropdown only appears AFTER the target is chosen, so this is
     the only way to reach guard #2 — a config with a target but no source.
6. **Guard #2 (missing module):** click `button-save-config`; assert:
   - A destructive toast appears with title "Vyberte oba moduly" (SK) /
     "Select both modules" (EN).
   - The config did NOT save: `card-config-editor` is still visible, and no config
     was added to the list.
   - Note: do NOT see the "Zadajte názov konfigurácie" / "Enter configuration
     name" toast here (the name is now filled).
7. Now select the source module: pick the first `option-source-*` in
   `select-source-module` (visible now that the target is set). Click
   `radio-on-missing-skip`.
8. Add one valid mapping: click `button-add-mapping` so `row-mapping-0` appears,
   then set BOTH `select-source-field-0` (first available source field) and
   `select-target-field-0` (a concrete ONIX target field, e.g.
   `CustomColumns.Brand` or `CustomColumns.EAN`). Then give the auto-added
   `SupplierCode` fixed field a value — type `H-0001` into
   `input-fixed-field-value-0` (press Tab to commit the controlled input) or
   delete the row via `button-delete-fixed-field-0` — so the empty-fixed-field
   guard does not block this save.
9. Click `button-save-config`; assert NO "Zadajte názov konfigurácie" /
   "Enter configuration name" and NO "Vyberte oba moduly" / "Select both modules"
   toast appears, and the config saves (editor closes / the new config appears in
   the list as `text-config-name-{id}`).

## Notes for re-running in the harness
- The Select components are shadcn/Radix dropdowns: open the trigger
  (`select-source-module` / `select-target-module` /
  `select-source-field-{idx}` / `select-target-field-{idx}`) then click the
  desired option from the listbox.
- The crux of this test is reaching each early guard in isolation: guard #1 needs
  an EMPTY name; guard #2 needs a filled name but a MISSING module. If you fill
  both fields too early you will fall through to the mapping guards
  ("Pridajte aspoň 1 mapovanie polí" / "Add at least 1 field mapping") instead.
- If step 9 fails to save with a "Pevné polia majú prázdne hodnoty" / "Fixed
  fields have empty values" toast, the SupplierCode fixed field still has an empty
  value — fill `input-fixed-field-value-0` or delete that row, then save again.

## Last verified
- 2026-06-25 — PASSED via runTest. Saving with an EMPTY name raised the
  "Zadajte názov konfigurácie" / "Enter configuration name" toast and kept the
  editor open (config not saved). After filling the name and selecting ONLY the
  target (ONIX) — leaving the source unselected — Save raised the "Vyberte oba
  moduly" / "Select both modules" toast (and no empty-name toast), editor still
  open. After then selecting a source module, on_missing=skip, one mapping row
  (source `id` → target `CountryOfOrigin`) and filling the auto-added SupplierCode
  fixed field with `H-0001`, Save succeeded and the new config appeared in the
  saved configurations list.
