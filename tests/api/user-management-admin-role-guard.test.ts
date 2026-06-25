/**
 * Automated API test: only admins can manage user accounts.
 *
 * The user-management endpoints in server/routes.ts are guarded by
 * requireRole("admin") (GET/POST /api/users ~lines 667-698, PATCH/DELETE
 * /api/users/:id ~lines 700-756, GET /api/audit-logs ~line 758). This boundary
 * is stricter than the sync-config endpoints because it controls account
 * creation and role assignment. A regression in requireRole could silently let
 * non-admin "operator" or "viewer" accounts read or mutate user accounts and
 * read the audit trail.
 *
 * This test logs in as both a viewer-role and an operator-role user and asserts
 * that every user-management endpoint returns 403 for each. It includes a
 * control asserting an admin can still access the same endpoints.
 *
 * This is a black-box test that runs against the live dev server. Start the app
 * first (npm run dev), then run:
 *   npx tsx --test tests/api/user-management-admin-role-guard.test.ts
 *
 * Override the target/admin creds with BASE_URL / TEST_USERNAME / TEST_PASSWORD.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5000";
const ADMIN_USERNAME = process.env.TEST_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.TEST_PASSWORD || "admin123";

function uniqueName(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

const VIEWER_USERNAME = uniqueName("__test_viewer");
const VIEWER_PASSWORD = "viewer-pass-123";
const OPERATOR_USERNAME = uniqueName("__test_operator");
const OPERATOR_PASSWORD = "operator-pass-123";

let adminCookie = "";
let viewerCookie = "";
let operatorCookie = "";
const createdUserIds: string[] = [];

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

async function createUserAsAdmin(
  username: string,
  password: string,
  role: string,
): Promise<string> {
  const res = await api("/api/users", adminCookie, {
    method: "POST",
    body: JSON.stringify({
      username,
      password,
      fullName: `Test ${role}`,
      role,
    }),
  });
  assert.equal(res.status, 200, `Failed to create ${role} user (${res.status})`);
  const user = (await res.json()) as { id: string; role: string };
  assert.equal(user.role, role, `Created user must have the ${role} role`);
  createdUserIds.push(user.id);
  return user.id;
}

before(async () => {
  adminCookie = await login(ADMIN_USERNAME, ADMIN_PASSWORD);

  await createUserAsAdmin(VIEWER_USERNAME, VIEWER_PASSWORD, "viewer");
  await createUserAsAdmin(OPERATOR_USERNAME, OPERATOR_PASSWORD, "operator");

  viewerCookie = await login(VIEWER_USERNAME, VIEWER_PASSWORD);
  operatorCookie = await login(OPERATOR_USERNAME, OPERATOR_PASSWORD);
});

after(async () => {
  // Best-effort cleanup of the users created during the test.
  for (const id of createdUserIds) {
    try {
      await api(`/api/users/${id}`, adminCookie, { method: "DELETE" });
    } catch {
      // best-effort
    }
  }
});

// A non-admin must be blocked from every user-management endpoint. Run the same
// assertions for both the viewer and the operator role.
for (const role of ["viewer", "operator"] as const) {
  const cookieFor = () => (role === "viewer" ? viewerCookie : operatorCookie);

  test(`${role} cannot list users (GET /api/users returns 403)`, async () => {
    const res = await api("/api/users", cookieFor());
    assert.equal(res.status, 403, `A ${role} must not be able to list users`);
  });

  test(`${role} cannot create a user (POST /api/users returns 403)`, async () => {
    const res = await api("/api/users", cookieFor(), {
      method: "POST",
      body: JSON.stringify({
        username: uniqueName("__test_should_not_exist"),
        password: "nope-123456",
        fullName: "Should Not Exist",
        role: "viewer",
      }),
    });
    assert.equal(res.status, 403, `A ${role} must not be able to create a user`);
  });

  test(`${role} cannot update a user (PATCH /api/users/:id returns 403)`, async () => {
    // Target the admin's own account id-shape; the guard must reject before any
    // lookup, so any id is fine here.
    const res = await api(`/api/users/${createdUserIds[0]}`, cookieFor(), {
      method: "PATCH",
      body: JSON.stringify({ fullName: "Hacked Name" }),
    });
    assert.equal(res.status, 403, `A ${role} must not be able to update a user`);
  });

  test(`${role} cannot delete a user (DELETE /api/users/:id returns 403)`, async () => {
    const res = await api(`/api/users/${createdUserIds[0]}`, cookieFor(), {
      method: "DELETE",
    });
    assert.equal(res.status, 403, `A ${role} must not be able to delete a user`);
  });

  test(`${role} cannot read audit logs (GET /api/audit-logs returns 403)`, async () => {
    const res = await api("/api/audit-logs", cookieFor());
    assert.equal(res.status, 403, `A ${role} must not be able to read audit logs`);
  });
}

test("control: admin can manage users and read audit logs", async () => {
  // List users.
  const listRes = await api("/api/users", adminCookie);
  assert.equal(listRes.status, 200, "Admin should be able to list users");

  // Create a user.
  const newUsername = uniqueName("__test_admin_created");
  const createRes = await api("/api/users", adminCookie, {
    method: "POST",
    body: JSON.stringify({
      username: newUsername,
      password: "admin-created-123",
      fullName: "Admin Created",
      role: "viewer",
    }),
  });
  assert.equal(createRes.status, 200, "Admin should be able to create a user");
  const created = (await createRes.json()) as { id: string };
  createdUserIds.push(created.id);

  // Update the user.
  const patchRes = await api(`/api/users/${created.id}`, adminCookie, {
    method: "PATCH",
    body: JSON.stringify({ fullName: "Admin Updated" }),
  });
  assert.equal(patchRes.status, 200, "Admin should be able to update a user");
  const patched = (await patchRes.json()) as { fullName: string };
  assert.equal(patched.fullName, "Admin Updated", "The admin edit should persist");

  // Read audit logs.
  const auditRes = await api("/api/audit-logs", adminCookie);
  assert.equal(auditRes.status, 200, "Admin should be able to read audit logs");

  // Delete the user.
  const deleteRes = await api(`/api/users/${created.id}`, adminCookie, {
    method: "DELETE",
  });
  assert.equal(deleteRes.status, 200, "Admin should be able to delete a user");
});
