# UI Test: ONIX fixed-field "mapping overlap" warning

Guards the safeguard in `client/src/pages/sync-config.tsx` that warns when an ONIX
fixed field shares a name with a target field already filled by a regular field
mapping (`mappingOverlapFixedFieldIndices` → inline hint + save-time conflict dialog).

This project has no JS test runner, so the test is executed through the Replit
**testing** harness (`runTest`). Feed the test plan below to `runTest` to re-verify
the behavior after any refactor of the sync-config editor.

## Login / setup
- Admin account: username `admin`, password `admin123`.
- Editor lives at `/sync`. Fixed-field section only appears when the target module is ONIX.
- An overlap = an ONIX fixed field whose name equals the target field of a mapping
  (where both source + target are set).
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
- `button-add-fixed-field`, `input-fixed-field-name-0`, `input-fixed-field-value-0`
- `hint-fixed-field-mapping-overlap` (inline overlap hint)
- `button-save-config`
- Conflict dialog: `button-confirm-duplicate-fixed` ("Save anyway"),
  `button-cancel-duplicate-fixed` ("Go back and fix"), title "Konflikt pevných polí" /
  "Conflicting fixed fields"
- Conflict input styling classes: `border-destructive ring-1 ring-destructive`;
  tooltip title SK "Toto pole už vypĺňa mapovanie" / EN "This field is already filled by a mapping".

## Test plan (paste into runTest)
1. New browser context; navigate to `/`. If a login form shows, log in as `admin` / `admin123`.
2. Navigate to `/sync`; assert `page-sync-config` visible.
3. Click `button-new-config`; assert `card-config-editor` visible.
4. Type a unique name into `input-config-name`.
5. Select first `option-source-*` in `select-source-module`; select `option-target-ONIX` in `select-target-module`.
6. Assert `section-onix-fixed-fields` visible. Click `radio-on-missing-skip`.
7. Click `button-add-mapping`; pick first source field in `select-source-field-0`; pick first
   target field in `select-target-field-0` and record it as `TARGET_FIELD`.
8. Click `button-add-fixed-field`; type `TARGET_FIELD` into `input-fixed-field-name-0`; type `X` into `input-fixed-field-value-0`.
9. Assert overlap state:
   - `hint-fixed-field-mapping-overlap` is visible.
   - `input-fixed-field-name-0` has classes `border-destructive` and `ring-destructive`.
   - `input-fixed-field-name-0` has a non-empty conflict tooltip title.
10. Click `button-save-config`; assert the conflict dialog appears
    (`button-confirm-duplicate-fixed` and `button-cancel-duplicate-fixed` visible).
11. Click `button-cancel-duplicate-fixed`; assert dialog closed and editor still open.
12. Clear `input-fixed-field-name-0` and type a non-overlapping name (not `TARGET_FIELD`).
13. Assert no-overlap state: `hint-fixed-field-mapping-overlap` gone; input no longer has destructive classes.
14. Click `button-save-config` again; assert the conflict dialog does NOT appear and the config saves.

## Last verified
- 2026-06-25 — PASSED via runTest (source PROMOTRON → target ONIX, TARGET_FIELD `CountryOfOrigin`).
