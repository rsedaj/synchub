/**
 * Automated API test: viewer-role users cannot create, update, or delete other
 * users' accounts (including role changes and password resets).
 *
 * Guards the requireRole("admin") middleware on the user-management
 * state-changing endpoints in server/routes.ts:
 *   - POST   /api/users        (~line 529, create a user)
 *   - PATCH  /api/users/:id    (~line 552, update user — covers role change + password reset)
 *   - DELETE /api/users/:id    (~line 592, delete a user)
 *
 * These are the most privilege-sensitive writes in the app: a regression in
 * requireRole here could let a read-only "viewer" escalate their own role,
 * reset another user's password, or delete accounts. requireRole rejects with
 * 403 before the route handler runs (see server/auth.ts), so a viewer is
 * blocked even with placeholder IDs and no side effects occur. This test
 * asserts each endpoint returns 403 for a viewer, and includes controls
 * confirming an admin reaches *past* the role guard on the same endpoints (a
 * non-403 response — 404 for the placeholder PATCH, 200 for the harmless
 * DELETE of a nonexistent id).
 *
 * This is a black-box test that runs against the live dev server. Start the app
 * first (npm run dev), then run:
 *   npx tsx --test tests/api/user-management-viewer-role-guard.test.ts
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

// Placeholder id that does not exist. The role guard runs before the handler,
// so a viewer is rejected with 403 regardless, and an admin sails past the
// guard into a harmless 404 (PATCH) or no-op delete (DELETE).
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

// The user-management write endpoints guarded by requireRole("admin"). Each is
// exercised with a placeholder id and/or a representative body. The body is
// only meaningful for the admin controls — the viewer is rejected by the guard
// before the handler parses it.
const guardedEndpoints: Array<{
  label: string;
  method: "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
}> = [
  {
    label: "create a user",
    method: "POST",
    path: `/api/users`,
    body: {
      username: `__should_not_exist_${Date.now()}`,
      password: "nope-123",
      fullName: "Should Not Exist",
      role: "admin",
    },
  },
  {
    label: "change another user's role",
    method: "PATCH",
    path: `/api/users/${FAKE_ID}`,
    body: { role: "admin" },
  },
  {
    label: "reset another user's password",
    method: "PATCH",
    path: `/api/users/${FAKE_ID}`,
    body: { password: "hijacked-123" },
  },
  {
    label: "delete a user",
    method: "DELETE",
    path: `/api/users/${FAKE_ID}`,
  },
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
    const res = await api(ep.path, viewerCookie, {
      method: ep.method,
      ...(ep.body !== undefined ? { body: JSON.stringify(ep.body) } : {}),
    });
    assert.equal(
      res.status,
      403,
      `A viewer must not be able to ${ep.label} (got ${res.status})`,
    );
  });
}

test("viewer cannot escalate their own role to admin (PATCH self returns 403)", async () => {
  // The most dangerous escalation: a viewer flipping their own role. The guard
  // must block this before the handler runs.
  const res = await api(`/api/users/${viewerUserId}`, viewerCookie, {
    method: "PATCH",
    body: JSON.stringify({ role: "admin" }),
  });
  assert.equal(
    res.status,
    403,
    `A viewer must not be able to change their own role (got ${res.status})`,
  );

  // Confirm the role really did not change by reading it back as admin.
  const usersRes = await api("/api/users", adminCookie, { method: "GET" });
  assert.equal(usersRes.status, 200, "Admin should be able to list users");
  const users = (await usersRes.json()) as Array<{ id: string; role: string }>;
  const stillViewer = users.find((u) => u.id === viewerUserId);
  assert.ok(stillViewer, "The test viewer user should still exist");
  assert.equal(
    stillViewer!.role,
    "viewer",
    "The viewer's role must remain unchanged after the blocked escalation attempt",
  );
});

test("control: admin reaches past the role guard on user-management endpoints", async () => {
  // The admin is allowed by requireRole, so it must NOT get a 403. With the
  // placeholder id the PATCH handler responds 404 (user not found) and the
  // DELETE handler responds 200 (deleting a nonexistent id is a harmless no-op).
  // This proves the guard differentiates admin from viewer rather than
  // blocking everyone.
  const patchRes = await api(`/api/users/${FAKE_ID}`, adminCookie, {
    method: "PATCH",
    body: JSON.stringify({ fullName: "Nobody" }),
  });
  assert.notEqual(
    patchRes.status,
    403,
    "Admin must be allowed past the role guard on user update",
  );
  assert.equal(
    patchRes.status,
    404,
    "Updating a nonexistent user should 404 for an admin (past the guard)",
  );

  const deleteRes = await api(`/api/users/${FAKE_ID}`, adminCookie, {
    method: "DELETE",
  });
  assert.notEqual(
    deleteRes.status,
    403,
    "Admin must be allowed past the role guard on user delete",
  );
  assert.equal(
    deleteRes.status,
    200,
    "Deleting a nonexistent user should succeed (no-op) for an admin (past the guard)",
  );
});
