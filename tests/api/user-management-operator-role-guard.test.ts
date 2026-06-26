/**
 * Automated API test: operator-role users cannot create, update, or delete
 * other users' accounts (including role changes and password resets).
 *
 * Operators are a privileged role (more than a read-only viewer), but the
 * user-management state-changing endpoints in server/routes.ts are guarded by
 * requireRole("admin") — so operators must be blocked too. This test guards
 * against a regression that loosened the guard from "admin" to "admin/operator"
 * and silently let operators create/delete accounts or change roles:
 *   - POST   /api/users        (create a user)
 *   - PATCH  /api/users/:id    (update user — covers role change + password reset)
 *   - DELETE /api/users/:id    (delete a user)
 *
 * requireRole rejects with 403 before the route handler runs (see
 * server/auth.ts), so an operator is blocked even with placeholder IDs and no
 * side effects occur. This test asserts each endpoint returns 403 for an
 * operator, and includes a control confirming an admin reaches *past* the role
 * guard on the same endpoints (a non-403 response).
 *
 * This is a black-box test that runs against the live dev server. Start the app
 * first (npm run dev), then run:
 *   npx tsx --test tests/api/user-management-operator-role-guard.test.ts
 *
 * Override the target/admin creds with BASE_URL / TEST_USERNAME / TEST_PASSWORD.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5000";
const ADMIN_USERNAME = process.env.TEST_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.TEST_PASSWORD || "admin123";

const OPERATOR_USERNAME = `__test_operator_${Date.now()}_${Math.random()
  .toString(36)
  .slice(2)}`;
const OPERATOR_PASSWORD = "operator-pass-123";

// Placeholder id that does not exist. The role guard runs before the handler,
// so an operator is rejected with 403 regardless, and an admin sails past the
// guard into a harmless 404 (PATCH) or no-op delete (DELETE).
const FAKE_ID = "00000000-0000-0000-0000-000000000000";

let adminCookie = "";
let operatorCookie = "";
let operatorUserId = "";

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
// only meaningful for the admin controls — the operator is rejected by the
// guard before the handler parses it.
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

  // Create a dedicated operator-role user via the admin-only endpoint.
  const createUserRes = await api("/api/users", adminCookie, {
    method: "POST",
    body: JSON.stringify({
      username: OPERATOR_USERNAME,
      password: OPERATOR_PASSWORD,
      fullName: "Test Operator",
      role: "operator",
    }),
  });
  assert.equal(
    createUserRes.status,
    200,
    `Failed to create operator user (${createUserRes.status})`,
  );
  const operatorUser = (await createUserRes.json()) as {
    id: string;
    role: string;
  };
  assert.equal(
    operatorUser.role,
    "operator",
    "Created user must have the operator role",
  );
  operatorUserId = operatorUser.id;

  operatorCookie = await login(OPERATOR_USERNAME, OPERATOR_PASSWORD);
});

after(async () => {
  // Best-effort cleanup of the operator user.
  if (operatorUserId) {
    try {
      await api(`/api/users/${operatorUserId}`, adminCookie, {
        method: "DELETE",
      });
    } catch {
      // best-effort
    }
  }
});

for (const ep of guardedEndpoints) {
  test(`operator cannot ${ep.label} (${ep.method} ${ep.path} returns 403)`, async () => {
    const res = await api(ep.path, operatorCookie, {
      method: ep.method,
      ...(ep.body !== undefined ? { body: JSON.stringify(ep.body) } : {}),
    });
    assert.equal(
      res.status,
      403,
      `An operator must not be able to ${ep.label} (got ${res.status})`,
    );
  });
}

test("operator cannot escalate their own role to admin (PATCH self returns 403)", async () => {
  // A privileged-but-not-admin operator flipping their own role. The guard must
  // block this before the handler runs.
  const res = await api(`/api/users/${operatorUserId}`, operatorCookie, {
    method: "PATCH",
    body: JSON.stringify({ role: "admin" }),
  });
  assert.equal(
    res.status,
    403,
    `An operator must not be able to change their own role (got ${res.status})`,
  );

  // Confirm the role really did not change by reading it back as admin.
  const usersRes = await api("/api/users", adminCookie, { method: "GET" });
  assert.equal(usersRes.status, 200, "Admin should be able to list users");
  const users = (await usersRes.json()) as Array<{ id: string; role: string }>;
  const stillOperator = users.find((u) => u.id === operatorUserId);
  assert.ok(stillOperator, "The test operator user should still exist");
  assert.equal(
    stillOperator!.role,
    "operator",
    "The operator's role must remain unchanged after the blocked escalation attempt",
  );
});

test("control: admin reaches past the role guard on user-management endpoints", async () => {
  // The admin is allowed by requireRole, so it must NOT get a 403. With the
  // placeholder id the PATCH handler responds 404 (user not found) and the
  // DELETE handler responds 200 (deleting a nonexistent id is a harmless no-op).
  // This proves the guard differentiates admin from operator rather than
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
