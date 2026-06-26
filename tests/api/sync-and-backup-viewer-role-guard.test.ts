/**
 * Automated API test: viewer-role users cannot run/trigger syncs, cancel/resume
 * runs, or restore/delete/create backups.
 *
 * Guards the requireRole("admin", "operator") middleware on the remaining
 * state-changing sync + backup endpoints in server/routes.ts:
 *   - POST   /api/sync-configs/:id/run        (~line 1087, trigger a sync)
 *   - POST   /api/sync-runs/:id/cancel        (~line 1289)
 *   - POST   /api/sync-runs/:id/resume        (~line 1310)
 *   - POST   /api/sync-backups/:id/restore    (~line 1380)
 *   - DELETE /api/sync-backups/:id            (~line 1399)
 *   - POST   /api/backups/manual/:configId    (~line 1492)
 *   - DELETE /api/sync-backups/config/:configId (~line 1846)
 *   - POST   /api/onix-backup/run             (~line 1881)
 *
 * requireRole rejects with 403 before the route handler runs (see
 * server/auth.ts), so a viewer is blocked even with placeholder IDs and no
 * side effects occur. A regression in requireRole could silently let read-only
 * "viewer" accounts launch syncs or destroy backups. This test asserts each
 * endpoint returns 403 for a viewer, and includes controls confirming an
 * admin reaches *past* the role guard on the same endpoints (a non-403
 * response — typically 404 for the placeholder IDs used here).
 *
 * This is a black-box test that runs against the live dev server. Start the app
 * first (npm run dev), then run:
 *   npx tsx --test tests/api/sync-and-backup-viewer-role-guard.test.ts
 *
 * Override the target/admin creds with BASE_URL / TEST_USERNAME / TEST_PASSWORD.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5000";
const ADMIN_USERNAME = process.env.TEST_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.TEST_PASSWORD || "admin123";

const VIEWER_USERNAME = `__test_viewer_${Date.now()}_${Math.random()
  .toString(36)
  .slice(2)}`;
const VIEWER_PASSWORD = "viewer-pass-123";

// Placeholder IDs that do not exist. The role guard runs before the handler,
// so a viewer is rejected with 403 regardless, and an admin sails past the
// guard into a harmless 404.
const FAKE_ID = "00000000-0000-0000-0000-000000000000";

let adminCookie = "";
let viewerCookie = "";
let viewerUserId = "";

function api(path: string, cookie: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (cookie) headers.set("Cookie", cookie);
  return fetch(`${BASE_URL}${path}`, { ...init, headers });
}

async function login(username: string, password: string): Promise<string> {
  const loginRes = await api("/api/auth/login", "", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  assert.equal(
    loginRes.status,
    200,
    `Login failed for ${username} (${loginRes.status}). Is the dev server running?`,
  );
  const setCookie = loginRes.headers.get("set-cookie");
  assert.ok(setCookie, `Login did not return a session cookie for ${username}`);
  return setCookie.split(";")[0];
}

// The state-changing endpoints guarded by requireRole("admin", "operator")
// that this test covers. Each is exercised with placeholder IDs.
const guardedEndpoints: Array<{
  label: string;
  method: "POST" | "DELETE";
  path: string;
}> = [
  { label: "trigger a sync run", method: "POST", path: `/api/sync-configs/${FAKE_ID}/run` },
  { label: "cancel a sync run", method: "POST", path: `/api/sync-runs/${FAKE_ID}/cancel` },
  { label: "resume a sync run", method: "POST", path: `/api/sync-runs/${FAKE_ID}/resume` },
  { label: "restore a backup", method: "POST", path: `/api/sync-backups/${FAKE_ID}/restore` },
  { label: "delete a backup", method: "DELETE", path: `/api/sync-backups/${FAKE_ID}` },
  { label: "trigger a manual backup", method: "POST", path: `/api/backups/manual/${FAKE_ID}` },
  { label: "delete all backups for a config", method: "DELETE", path: `/api/sync-backups/config/${FAKE_ID}` },
  { label: "run an ONIX backup", method: "POST", path: `/api/onix-backup/run` },
];

before(async () => {
  adminCookie = await login(ADMIN_USERNAME, ADMIN_PASSWORD);

  // Create a dedicated viewer-role user via the admin-only endpoint.
  const createUserRes = await api("/api/users", adminCookie, {
    method: "POST",
    body: JSON.stringify({
      username: VIEWER_USERNAME,
      password: VIEWER_PASSWORD,
      fullName: "Test Viewer",
      role: "viewer",
    }),
  });
  assert.equal(
    createUserRes.status,
    200,
    `Failed to create viewer user (${createUserRes.status})`,
  );
  const viewerUser = (await createUserRes.json()) as { id: string; role: string };
  assert.equal(viewerUser.role, "viewer", "Created user must have the viewer role");
  viewerUserId = viewerUser.id;

  viewerCookie = await login(VIEWER_USERNAME, VIEWER_PASSWORD);
});

after(async () => {
  // Best-effort cleanup of the viewer user.
  if (viewerUserId) {
    try {
      await api(`/api/users/${viewerUserId}`, adminCookie, { method: "DELETE" });
    } catch {
      // best-effort
    }
  }
});

for (const ep of guardedEndpoints) {
  test(`viewer cannot ${ep.label} (${ep.method} ${ep.path} returns 403)`, async () => {
    const res = await api(ep.path, viewerCookie, { method: ep.method });
    assert.equal(
      res.status,
      403,
      `A viewer must not be able to ${ep.label} (got ${res.status})`,
    );
  });
}

test("control: admin reaches past the role guard on these endpoints", async () => {
  // The admin is allowed by requireRole, so it must NOT get a 403. With the
  // placeholder IDs the handler then responds with a non-403 status (typically
  // 404). This proves the guard differentiates admin from viewer rather than
  // blocking everyone.
  const cancelRes = await api(`/api/sync-runs/${FAKE_ID}/cancel`, adminCookie, {
    method: "POST",
  });
  assert.notEqual(
    cancelRes.status,
    403,
    "Admin must be allowed past the role guard on cancel",
  );
  assert.equal(
    cancelRes.status,
    404,
    "Cancelling a nonexistent run should 404 for an admin (past the guard)",
  );

  const resumeRes = await api(`/api/sync-runs/${FAKE_ID}/resume`, adminCookie, {
    method: "POST",
  });
  assert.notEqual(
    resumeRes.status,
    403,
    "Admin must be allowed past the role guard on resume",
  );
  assert.equal(
    resumeRes.status,
    404,
    "Resuming a nonexistent run should 404 for an admin (past the guard)",
  );

  const runRes = await api(`/api/sync-configs/${FAKE_ID}/run`, adminCookie, {
    method: "POST",
  });
  assert.notEqual(
    runRes.status,
    403,
    "Admin must be allowed past the role guard on sync run",
  );
  assert.equal(
    runRes.status,
    404,
    "Running a nonexistent config should 404 for an admin (past the guard)",
  );

  // Deleting all backups for a nonexistent config is harmless (no backups
  // match the placeholder ID) and confirms the admin reaches past the guard.
  const deleteByConfigRes = await api(
    `/api/sync-backups/config/${FAKE_ID}`,
    adminCookie,
    { method: "DELETE" },
  );
  assert.notEqual(
    deleteByConfigRes.status,
    403,
    "Admin must be allowed past the role guard on delete-backups-by-config",
  );
  assert.equal(
    deleteByConfigRes.status,
    200,
    "Deleting backups for a nonexistent config should succeed (0 deleted) for an admin",
  );
});
