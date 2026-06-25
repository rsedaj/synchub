/**
 * Automated API test: viewer-role users cannot edit modules, toggle a module's
 * active state, or post sync logs.
 *
 * Guards the requireRole("admin", "operator") middleware on these write
 * endpoints in server/routes.ts:
 *   - PATCH /api/modules/:id              (~line 459)
 *   - PATCH /api/modules/:id/toggle-active (~line 508)
 *   - POST  /api/sync-logs                (~line 642)
 *
 * A regression in requireRole could silently let read-only "viewer" accounts
 * mutate modules or fabricate sync-log history. This test asserts each endpoint
 * returns 403 for a viewer, and includes a control that an admin can still
 * perform the same actions.
 *
 * This is a black-box test that runs against the live dev server. Start the app
 * first (npm run dev), then run:
 *   npx tsx --test tests/api/modules-and-logs-viewer-role-guard.test.ts
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

let adminCookie = "";
let viewerCookie = "";
let viewerUserId = "";
let moduleId = "";
const createdSyncLogIds: string[] = [];

function api(path: string, cookie: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (cookie) headers.set("Cookie", cookie);
  return fetch(`${BASE_URL}${path}`, { ...init, headers });
}

function syncLogBody(overrides: Record<string, unknown> = {}) {
  return {
    moduleId,
    direction: "import",
    status: "success",
    recordsProcessed: 1,
    recordsFailed: 0,
    ...overrides,
  };
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

before(async () => {
  adminCookie = await login(ADMIN_USERNAME, ADMIN_PASSWORD);

  // Load a module to target with the module-write endpoints and sync logs.
  const modulesRes = await api("/api/modules", adminCookie);
  assert.equal(modulesRes.status, 200, "Failed to load modules");
  const modules = (await modulesRes.json()) as Array<{ id: string }>;
  assert.ok(modules.length >= 1, `Need at least 1 module, found ${modules.length}`);
  moduleId = modules[0].id;

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
  // Best-effort cleanup of the viewer user. (Sync logs have no delete endpoint;
  // they are harmless test records tied to the admin user.)
  if (viewerUserId) {
    try {
      await api(`/api/users/${viewerUserId}`, adminCookie, { method: "DELETE" });
    } catch {
      // best-effort
    }
  }
});

test("viewer cannot edit a module (PATCH /api/modules/:id returns 403)", async () => {
  // Capture the current name so we can confirm nothing changed.
  const beforeRes = await api(`/api/modules/${moduleId}`, adminCookie);
  assert.equal(beforeRes.status, 200, "Admin should be able to read the module");
  const before = (await beforeRes.json()) as { name: string };

  const res = await api(`/api/modules/${moduleId}`, viewerCookie, {
    method: "PATCH",
    body: JSON.stringify({ name: `${before.name}_hacked` }),
  });
  assert.equal(res.status, 403, "A viewer must not be able to edit a module");

  const afterRes = await api(`/api/modules/${moduleId}`, adminCookie);
  assert.equal(afterRes.status, 200, "Admin should still see the module");
  const after = (await afterRes.json()) as { name: string };
  assert.equal(after.name, before.name, "The module name must be unchanged");
});

test("viewer cannot toggle a module's active state (PATCH toggle-active returns 403)", async () => {
  const beforeRes = await api(`/api/modules/${moduleId}`, adminCookie);
  assert.equal(beforeRes.status, 200, "Admin should be able to read the module");
  const before = (await beforeRes.json()) as { isActive: boolean };

  const res = await api(`/api/modules/${moduleId}/toggle-active`, viewerCookie, {
    method: "PATCH",
  });
  assert.equal(res.status, 403, "A viewer must not be able to toggle a module");

  const afterRes = await api(`/api/modules/${moduleId}`, adminCookie);
  assert.equal(afterRes.status, 200, "Admin should still see the module");
  const after = (await afterRes.json()) as { isActive: boolean };
  assert.equal(
    after.isActive,
    before.isActive,
    "The module's active state must be unchanged",
  );
});

test("viewer cannot post a sync log (POST /api/sync-logs returns 403)", async () => {
  const res = await api("/api/sync-logs", viewerCookie, {
    method: "POST",
    body: JSON.stringify(syncLogBody()),
  });
  assert.equal(res.status, 403, "A viewer must not be able to post a sync log");
});

test("control: admin can edit a module, toggle it, and post a sync log", async () => {
  // Edit, then restore the name.
  const beforeRes = await api(`/api/modules/${moduleId}`, adminCookie);
  assert.equal(beforeRes.status, 200, "Admin should be able to read the module");
  const original = (await beforeRes.json()) as { name: string; isActive: boolean };

  const newName = `${original.name}_renamed`;
  const patchRes = await api(`/api/modules/${moduleId}`, adminCookie, {
    method: "PATCH",
    body: JSON.stringify({ name: newName }),
  });
  assert.equal(patchRes.status, 200, "Admin should be able to edit a module");
  const patched = (await patchRes.json()) as { name: string };
  assert.equal(patched.name, newName, "The admin edit should persist");

  const restoreRes = await api(`/api/modules/${moduleId}`, adminCookie, {
    method: "PATCH",
    body: JSON.stringify({ name: original.name }),
  });
  assert.equal(restoreRes.status, 200, "Admin should be able to restore the name");

  // Toggle twice to leave the active state as it was.
  const toggle1 = await api(`/api/modules/${moduleId}/toggle-active`, adminCookie, {
    method: "PATCH",
  });
  assert.equal(toggle1.status, 200, "Admin should be able to toggle a module");
  const toggle2 = await api(`/api/modules/${moduleId}/toggle-active`, adminCookie, {
    method: "PATCH",
  });
  assert.equal(toggle2.status, 200, "Admin should be able to toggle a module back");
  const restored = (await toggle2.json()) as { isActive: boolean };
  assert.equal(
    restored.isActive,
    original.isActive,
    "The active state should be restored after two toggles",
  );

  // Post a sync log.
  const logRes = await api("/api/sync-logs", adminCookie, {
    method: "POST",
    body: JSON.stringify(syncLogBody()),
  });
  assert.equal(logRes.status, 200, "Admin should be able to post a sync log");
  const log = (await logRes.json()) as { id: string };
  assert.ok(log.id, "The created sync log should have an id");
  createdSyncLogIds.push(log.id);
});
