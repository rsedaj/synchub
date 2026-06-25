# UI Test: ONIX fixed-field "duplicate name" warning

Guards the safeguard in `client/src/pages/sync-config.tsx` that warns when the SAME
ONIX fixed field name is added more than once (`duplicateFixedFieldIndices` → inline
hint + save-time conflict dialog).

This is distinct from the "mapping overlap" case (see
`tests/ui/fixed-field-overlap-warning.md`): here two fixed-field rows share the same
name, rather than a fixed field colliding with a mapped target field.

This project has no JS test runner, so the test is executed through the Replit
**testing** harness (`runTest`). Feed the test plan below to `runTest` to re-verify
the behavior after any refactor of the sync-config editor.

## Login / setup
- Admin account: username `admin`, password `admin123`.
- Editor lives at `/sync`. Fixed-field section only appears when the target module is ONIX.
- A duplicate = two (or more) ONIX fixed fields whose names are equal (case-insensitive,
  trimmed). Both/all colliding rows get flagged.
- Each fixed field must have a non-empty VALUE, otherwise an "empty values" toast blocks
  saving before the conflict dialog is reached.
- The config also needs at least one valid field mapping (source + target both set),
  otherwise save is blocked before the conflict dialog.
- To reach the conflict dialog on Save the mapping must have no blocking validation
  errors. Set "If record does not exist in target" to **Skip**
  (`radio-on-missing-skip`) — this suppresses the SupplierCode requirement that
  otherwise blocks saving ONIX stockitems configs.

## Key data-testids
- `button-new-config`, `card-config-editor`, `input-config-name`
- `select-source-module` (options `option-source-{CODE}`)
- `select-target-module` → `option-target-ONIX`
- `section-onix-fixed-fields`, `radio-on-missing-skip`
- `button-add-mapping`, `select-source-field-0`, `select-target-field-0`
- `button-add-fixed-field`
- Fixed-field rows: `row-fixed-field-{idx}`, `input-fixed-field-name-{idx}`,
  `input-fixed-field-value-{idx}`
- `hint-fixed-field-duplicate` (inline duplicate hint)
- `button-save-config`
- Conflict dialog: `button-confirm-duplicate-fixed` ("Save anyway"),
  `button-cancel-duplicate-fixed` ("Go back and fix"), title "Konflikt pevných polí" /
  "Conflicting fixed fields"
- Conflict input styling classes: `border-destructive ring-1 ring-destructive`;
  tooltip title SK "Toto pole je nastavené viackrát" / EN "This field is set more than once".

## Test plan (paste into runTest)
1. New browser context; navigate to `/`. If a login form shows, log in as `admin` / `admin123`.
2. Navigate to `/sync`; assert `page-sync-config` visible.
3. Click `button-new-config`; assert `card-config-editor` visible.
4. Type a unique name into `input-config-name`.
5. Select first `option-source-*` in `select-source-module`; select `option-target-ONIX` in `select-target-module`.
6. Assert `section-onix-fixed-fields` visible. Click `radio-on-missing-skip`.
7. Click `button-add-mapping`; pick first source field in `select-source-field-0`; pick first
   target field in `select-target-field-0` (any field — it does NOT need to match the fixed field name).
8. Click `button-add-fixed-field` once; type `Ns_Code` into `input-fixed-field-name-0`; type `H` into `input-fixed-field-value-0`.
9. Click `button-add-fixed-field` again; type the SAME name `Ns_Code` into `input-fixed-field-name-1`; type `H` into `input-fixed-field-value-1`.
10. Assert duplicate state:
    - `hint-fixed-field-duplicate` is visible.
    - BOTH `input-fixed-field-name-0` and `input-fixed-field-name-1` have classes
      `border-destructive` and `ring-destructive`.
    - Both name inputs have a non-empty conflict tooltip title (SK "Toto pole je nastavené viackrát").
11. Click `button-save-config`; assert the conflict dialog appears
    (`button-confirm-duplicate-fixed` and `button-cancel-duplicate-fixed` visible).
12. Click `button-cancel-duplicate-fixed`; assert dialog closed and editor still open.
13. Change `input-fixed-field-name-1` to a different, non-duplicate name (e.g. `Ist_Dmj`).
14. Assert no-duplicate state: `hint-fixed-field-duplicate` gone; neither name input has
    destructive classes.
15. Click `button-save-config` again; assert the conflict dialog does NOT appear and the config saves.

## Last verified
- 2026-06-25 — PASSED via runTest (source PROMOTRON → target ONIX, duplicate name `Ns_Code`).
  Note: fixed-field value inputs are React controlled inputs; in the harness, press Tab
  after typing each value (and verify it committed) or Save may wrongly report empty values.
