# UI Test: ONIX fixed-field "empty value" warning

Guards the safeguard in `client/src/pages/sync-config.tsx` (`handleSave` →
`emptyFixedIndices`) that blocks Save when an ONIX fixed field has a NAME but a
blank VALUE. On Save it shows a destructive toast ("Pevné polia majú prázdne
hodnoty" / "Fixed fields have empty values"), highlights the offending value
input(s) (`highlightedFixedFields` state → `border-destructive ring-destructive`
on `input-fixed-field-value-{idx}`), and scrolls/focuses the first one
(`fixedFieldValueRefs`). The config must NOT save while any flagged value is empty.

This is distinct from:
- the "duplicate name" case (`tests/ui/fixed-field-duplicate-warning.md`), where two
  fixed-field rows share the same NAME, and
- the "mapping overlap" case (`tests/ui/fixed-field-overlap-warning.md`), where a
  fixed field collides with a mapped target field.

The empty-value guard runs BEFORE the duplicate/overlap conflict dialog and before
the mapping-validation pass, so a blank value blocks Save first.

This project has no JS test runner, so the test is executed through the Replit
**testing** harness (`runTest`). Feed the test plan below to `runTest` to re-verify
the behavior after any refactor of the sync-config editor.

## Login / setup
- Admin account: username `admin`, password `admin123`.
- Editor lives at `/sync`. Fixed-field section only appears when the target module is ONIX.
- An "empty value" = a fixed field whose NAME is non-empty (after trim) but whose
  VALUE is empty (after trim). Only such rows are flagged. A row with both name and
  value blank is ignored (not flagged).
- The config also needs at least one valid field mapping (source + target both set),
  otherwise save is blocked by the "no valid field mappings" toast before the
  empty-value check is reached.
- Set "If record does not exist in target" to **Skip** (`radio-on-missing-skip`) —
  this suppresses the SupplierCode requirement that otherwise blocks saving ONIX
  stockitems configs.

## Key data-testids
- `button-new-config`, `card-config-editor`, `input-config-name`
- `select-source-module` (options `option-source-{CODE}`)
- `select-target-module` → `option-target-ONIX`
- `section-onix-fixed-fields`, `radio-on-missing-skip`
- `button-add-mapping`, `select-source-field-0`, `select-target-field-0`
- `button-add-fixed-field`
- Fixed-field rows: `row-fixed-field-{idx}`, `input-fixed-field-name-{idx}`,
  `input-fixed-field-value-{idx}`
- `button-save-config`
- Empty-value highlight styling classes on the VALUE input: `border-destructive`,
  `ring-destructive` (full set: `border-destructive ring-1 ring-destructive`).
- Empty-value toast title: SK "Pevné polia majú prázdne hodnoty" /
  EN "Fixed fields have empty values".

## Test plan (paste into runTest)
1. New browser context; navigate to `/`. If a login form shows, log in as `admin` / `admin123`.
2. Navigate to `/sync`; assert `page-sync-config` visible.
3. Click `button-new-config`; assert `card-config-editor` visible.
4. Type a unique name into `input-config-name`.
5. Select first `option-source-*` in `select-source-module`; select `option-target-ONIX` in `select-target-module`.
6. Assert `section-onix-fixed-fields` visible. Click `radio-on-missing-skip`.
7. Click `button-add-mapping`; pick first source field in `select-source-field-0`; pick first
   target field in `select-target-field-0` (any field — it does NOT need to match the fixed field name).
8. Click `button-add-fixed-field` once; type `Ns_Code` into `input-fixed-field-name-0`;
   LEAVE `input-fixed-field-value-0` EMPTY (do not type anything).
9. Click `button-save-config`; assert the empty-value state:
   - A destructive toast appears with title "Pevné polia majú prázdne hodnoty" (SK)
     / "Fixed fields have empty values" (EN).
   - `input-fixed-field-value-0` has classes `border-destructive` and `ring-destructive`.
   - The config did NOT save: `card-config-editor` is still visible (editor still open),
     and no duplicate/overlap conflict dialog appeared.
10. Type a value `H` into `input-fixed-field-value-0` (press Tab after to commit the
    controlled input — see note). Assert the destructive classes are gone from
    `input-fixed-field-value-0` (highlight clears on change).
11. Click `button-save-config` again; assert NO empty-value toast appears and the config
    saves (editor closes / config appears in the list).

## Last verified
- 2026-06-25 — PASSED via runTest (source PROMOTRON → target ONIX, fixed field `Ns_Code`
  saved empty, then filled with `H`).
  Notes for re-running in the harness:
  - Fixed-field value inputs are React controlled inputs; press Tab after typing the value
    (and verify the value committed) or Save may wrongly report it empty.
  - The harness sometimes adds more than one fixed-field row. Because EVERY named-but-empty
    row blocks Save, ensure exactly ONE row before the empty-value assertion: delete any
    extra rows via `button-delete-fixed-field-{idx}` (or fill every named row's value before
    the final Save). Otherwise the guard correctly keeps blocking and the save-proceeds step
    will look like a failure when it is really leftover empty rows.
