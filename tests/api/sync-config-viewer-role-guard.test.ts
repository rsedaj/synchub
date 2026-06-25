/**
 * Automated API test: viewer-role users cannot create, edit, or delete sync
 * configs.
 *
 * Guards the requireRole("admin", "operator") middleware on the sync-config
 * write endpoints in server/routes.ts (POST ~line 838, PATCH ~line 863,
 * DELETE ~line 900). A regression in requireRole could silently let read-only
 * "viewer" accounts mutate configs; this test asserts each write endpoint
 * returns 403 for a viewer, and includes a control that an admin can still
 * perform the same actions.
 *
 * This is a black-box test that runs against the live dev server. Start the app
 * first (npm run dev), then run:
 *   npx tsx --test tests/api/sync-config-viewer-role-guard.test.ts
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
let sourceModuleId = "";
let targetModuleId = "";
const createdConfigIds: string[] = [];

function api(path: string, cookie: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (cookie) headers.set("Cookie", cookie);
  return fetch(`${BASE_URL}${path}`, { ...init, headers });
}

function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    name: `__test_viewer_role_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`,
    sourceModuleId,
    targetModuleId,
    fieldMappings: [
      { sourceField: "src_a", targetField: "tgt_a" },
      { sourceField: "src_b", targetField: "tgt_b" },
    ],
    ...overrides,
  };
}

async function login(
  username: string,
  password: string,
): Promise<string> {
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

async function createConfigAsAdmin(): Promise<{ id: string; name: string }> {
  const res = await api("/api/sync-configs", adminCookie, {
    method: "POST",
    body: JSON.stringify(baseConfig()),
  });
  assert.equal(res.status, 201, "Admin should be able to create a config");
  const created = (await res.json()) as { id: string; name: string };
  createdConfigIds.push(created.id);
  return created;
}

before(async () => {
  adminCookie = await login(ADMIN_USERNAME, ADMIN_PASSWORD);

  // Load two modules to build valid sync configs.
  const modulesRes = await api("/api/modules", adminCookie);
  assert.equal(modulesRes.status, 200, "Failed to load modules");
  const modules = (await modulesRes.json()) as Array<{ id: string }>;
  assert.ok(
    modules.length >= 2,
    `Need at least 2 modules to build a sync config, found ${modules.length}`,
  );
  sourceModuleId = modules[0].id;
  targetModuleId = modules[1].id;

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
  // Best-effort cleanup of configs created during the test.
  for (const id of createdConfigIds) {
    try {
      await api(`/api/sync-configs/${id}`, adminCookie, { method: "DELETE" });
    } catch {
      // best-effort
    }
  }
  // Best-effort cleanup of the viewer user.
  if (viewerUserId) {
    try {
      await api(`/api/users/${viewerUserId}`, adminCookie, { method: "DELETE" });
    } catch {
      // best-effort
    }
  }
});

test("viewer cannot create a sync config (POST returns 403)", async () => {
  const res = await api("/api/sync-configs", viewerCookie, {
    method: "POST",
    body: JSON.stringify(baseConfig()),
  });
  assert.equal(res.status, 403, "A viewer must not be able to create a config");
});

test("viewer cannot edit a sync config (PATCH returns 403)", async () => {
  const created = await createConfigAsAdmin();
  const res = await api(`/api/sync-configs/${created.id}`, viewerCookie, {
    method: "PATCH",
    body: JSON.stringify({ name: `${created.name}_hacked` }),
  });
  assert.equal(res.status, 403, "A viewer must not be able to edit a config");

  // Confirm nothing was mutated.
  const after = await api(`/api/sync-configs/${created.id}`, adminCookie);
  assert.equal(after.status, 200, "Admin should still see the config");
  const cfg = (await after.json()) as { name: string };
  assert.equal(cfg.name, created.name, "The config name must be unchanged");
});

test("viewer cannot delete a sync config (DELETE returns 403)", async () => {
  const created = await createConfigAsAdmin();
  const res = await api(`/api/sync-configs/${created.id}`, viewerCookie, {
    method: "DELETE",
  });
  assert.equal(res.status, 403, "A viewer must not be able to delete a config");

  // Confirm the config still exists.
  const after = await api(`/api/sync-configs/${created.id}`, adminCookie);
  assert.equal(after.status, 200, "The config must still exist after a blocked delete");
});

test("control: admin can create, edit, and delete a sync config", async () => {
  // Create.
  const createRes = await api("/api/sync-configs", adminCookie, {
    method: "POST",
    body: JSON.stringify(baseConfig()),
  });
  assert.equal(createRes.status, 201, "Admin should be able to create a config");
  const created = (await createRes.json()) as { id: string; name: string };

  // Edit.
  const newName = `${created.name}_renamed`;
  const patchRes = await api(`/api/sync-configs/${created.id}`, adminCookie, {
    method: "PATCH",
    body: JSON.stringify({ name: newName }),
  });
  assert.equal(patchRes.status, 200, "Admin should be able to edit a config");
  const patched = (await patchRes.json()) as { name: string };
  assert.equal(patched.name, newName, "The admin edit should persist");

  // Delete.
  const deleteRes = await api(`/api/sync-configs/${created.id}`, adminCookie, {
    method: "DELETE",
  });
  assert.equal(deleteRes.status, 200, "Admin should be able to delete a config");

  // Confirm deletion.
  const after = await api(`/api/sync-configs/${created.id}`, adminCookie);
  assert.equal(after.status, 404, "The config should be gone after deletion");
});
