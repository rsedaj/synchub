# UI Test: "Snapshot now" button hidden for viewer-role users

Guards the `canEdit` check in `client/src/pages/sync-config.tsx` (~line 689):

```ts
const canEdit = user?.role === "admin" || user?.role === "operator";
```

The "Zálohovať teraz" / "Snapshot now" button is built as:

```tsx
const snapshotBtn = canEdit && (
  <Button data-testid={`button-snapshot-now-${config.id}`} ...>
    Zálohovať teraz
  </Button>
);
```

Because it uses `canEdit && (...)`, the button is **completely absent from the
DOM** (not just disabled) when the logged-in user has the `viewer` role.

This is distinct from:
- The server-side guard (`requireRole("admin", "operator")` on
  `POST /api/config-snapshots/:configId`) — tested by
  `tests/api/config-snapshot-viewer-role-guard.test.ts`.

## Automated API verification (already passing)

`tests/api/config-snapshot-viewer-role-guard.test.ts` confirms:
1. Viewer session → `POST /api/config-snapshots/:configId` → **403**
2. Admin session → `POST /api/config-snapshots/:configId` → **200**

Run with:
```bash
bash scripts/run-api-tests.sh config-snapshot-viewer-role-guard
```

## Login / setup

- Admin account: `admin` / `admin123`
- Viewer account: create a temporary user via
  `POST /api/users` with `{ role: "viewer" }`, or use an existing viewer.
- The sync configs page is at `/sync`.
- Each config card shows the "Zálohovať teraz" button **only when `canEdit`
  is true** — i.e. only for admin and operator users.

## Key data-testids

- `button-snapshot-now-{configId}` — the snapshot button; must be **absent**
  for viewer, present for admin/operator
- `page-sync-config` — confirms the page loaded

## Test plan (paste into `runTest`)

1. New browser context; navigate to `/`. Log in as `admin` / `admin123`.
2. Navigate to `/sync`; assert `page-sync-config` visible.
3. Note the id of at least one existing config card (visible in
   `data-testid="text-config-name-{id}"` or via `GET /api/sync-configs`).
4. **Admin control:** Confirm `button-snapshot-now-{configId}` IS present
   in the DOM for admin users.
5. New browser context (clears admin session).
6. Navigate to `/`; log in as a viewer-role user.
7. Navigate to `/sync`; assert `page-sync-config` visible and config cards
   are listed.
8. **Viewer guard:** Assert that NO element with a `data-testid` matching
   `button-snapshot-now-*` exists anywhere on the page. The button must be
   completely absent from the DOM (not just hidden or disabled).

## Last verified

- 2026-07-07 — PASSED via `runTest`. After logging in as a viewer-role user
  and navigating to `/sync`, no element with `data-testid="button-snapshot-now-*"`
  was found on the page. The config cards were visible, but the snapshot button
  was completely absent from the DOM. Admin control confirmed the button IS
  present under an admin session. Server-side guard also confirmed:
  `POST /api/config-snapshots/:configId` returns 403 for viewer sessions
  (automated API test in `tests/api/config-snapshot-viewer-role-guard.test.ts`).
