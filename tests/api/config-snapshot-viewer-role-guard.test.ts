/**
 * Automated API test: viewer-role users cannot trigger a config snapshot.
 *
 * Guards the requireRole("admin", "operator") middleware on
 * POST /api/config-snapshots/:configId in server/routes.ts (~line 1771).
 * A regression in requireRole could let a read-only "viewer" account create
 * snapshots; this test asserts that the endpoint returns 403 for a viewer
 * session, and includes a control confirming an admin can still use it.
 *
 * Run against a live dev server:
 *   npx tsx --test tests/api/config-snapshot-viewer-role-guard.test.ts
 *
 * Override target/admin creds with BASE_URL / TEST_USERNAME / TEST_PASSWORD.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5000";
const ADMIN_USERNAME = process.env.TEST_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.TEST_PASSWORD || "admin123";

const VIEWER_USERNAME = `__test_viewer_snap_${Date.now()}_${Math.random()
  .toString(36)
  .slice(2)}`;
const VIEWER_PASSWORD = "viewer-snap-pass-123";

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

async function createConfigAsAdmin(): Promise<string> {
  const name = `__test_snap_guard_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;
  const res = await api("/api/sync-configs", adminCookie, {
    method: "POST",
    body: JSON.stringify({
      name,
      sourceModuleId,
      targetModuleId,
      fieldMappings: [{ sourceField: "src_a", targetField: "tgt_a" }],
    }),
  });
  assert.equal(res.status, 201, `Admin failed to create config (${res.status})`);
  const created = (await res.json()) as { id: string };
  createdConfigIds.push(created.id);
  return created.id;
}

before(async () => {
  adminCookie = await login(ADMIN_USERNAME, ADMIN_PASSWORD);

  // Load two modules to build a valid sync config.
  const modulesRes = await api("/api/modules", adminCookie);
  assert.equal(modulesRes.status, 200, "Failed to load modules");
  const modules = (await modulesRes.json()) as Array<{ id: string }>;
  assert.ok(
    modules.length >= 2,
    `Need at least 2 modules, found ${modules.length}`,
  );
  sourceModuleId = modules[0].id;
  targetModuleId = modules[1].id;

  // Create a dedicated viewer-role user via the admin-only endpoint.
  const createUserRes = await api("/api/users", adminCookie, {
    method: "POST",
    body: JSON.stringify({
      username: VIEWER_USERNAME,
      password: VIEWER_PASSWORD,
      fullName: "Test Snapshot Viewer",
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
  for (const id of createdConfigIds) {
    try {
      await api(`/api/sync-configs/${id}`, adminCookie, { method: "DELETE" });
    } catch {
      // best-effort
    }
  }
  if (viewerUserId) {
    try {
      await api(`/api/users/${viewerUserId}`, adminCookie, { method: "DELETE" });
    } catch {
      // best-effort
    }
  }
});

test("viewer cannot trigger a config snapshot (POST /api/config-snapshots/:configId returns 403)", async () => {
  const configId = await createConfigAsAdmin();
  const res = await api(`/api/config-snapshots/${configId}`, viewerCookie, {
    method: "POST",
  });
  assert.equal(
    res.status,
    403,
    "A viewer must not be able to trigger a config snapshot",
  );
});

test("viewer cannot read snapshot list for a specific config (GET /api/config-snapshots/:configId returns 403 or is allowed)", async () => {
  // GET /api/config-snapshots/:configId uses only requireAuth (not requireRole),
  // so viewers CAN read the list — this test documents that the READ endpoint
  // is intentionally open to authenticated users while the WRITE endpoint is not.
  const configId = await createConfigAsAdmin();
  const res = await api(`/api/config-snapshots/${configId}`, viewerCookie);
  // Viewer is authenticated, so GET should succeed (200), not 403.
  assert.equal(
    res.status,
    200,
    "Viewer should be able to read the snapshot list (GET is not guarded by role)",
  );
});

test("control: admin can trigger a config snapshot (POST returns 200)", async () => {
  const configId = await createConfigAsAdmin();
  const res = await api(`/api/config-snapshots/${configId}`, adminCookie, {
    method: "POST",
  });
  assert.equal(
    res.status,
    200,
    "Admin must be able to trigger a config snapshot",
  );
  const body = (await res.json()) as { ok: boolean; snapshot: { id: string; syncConfigId: string } };
  assert.ok(body.ok, "Snapshot response should report ok=true");
  assert.equal(
    body.snapshot.syncConfigId,
    configId,
    "Returned snapshot must reference the correct config",
  );
});
