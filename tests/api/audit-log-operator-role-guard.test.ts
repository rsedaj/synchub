/**
 * Automated API test: operator-role users cannot read the audit log.
 *
 * The audit log can reveal sensitive account activity (logins, role changes,
 * deletions), so GET /api/audit-logs is guarded by requireRole("admin") in
 * server/routes.ts. Operators are a privileged role (more than a read-only
 * viewer) but must still be blocked from reading the audit trail. This test
 * guards against a regression that loosened the guard from "admin" to
 * "admin/operator" and silently exposed the audit log to operators.
 *
 * requireRole rejects with 403 before the route handler runs (see
 * server/auth.ts), so the operator is blocked outright. This test asserts the
 * endpoint returns 403 for an operator, and includes a control confirming an
 * admin reaches *past* the role guard on the same endpoint (a 200 response).
 *
 * This is a black-box test that runs against the live dev server. Start the app
 * first (npm run dev), then run:
 *   npx tsx --test tests/api/audit-log-operator-role-guard.test.ts
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

test("operator cannot read the audit log (GET /api/audit-logs returns 403)", async () => {
  const res = await api("/api/audit-logs", operatorCookie, { method: "GET" });
  assert.equal(
    res.status,
    403,
    `An operator must not be able to read the audit log (got ${res.status})`,
  );
});

test("control: admin reaches past the role guard on the audit log", async () => {
  // The admin is allowed by requireRole, so it must NOT get a 403 and should
  // successfully read the audit log. This proves the guard differentiates admin
  // from operator rather than blocking everyone.
  const res = await api("/api/audit-logs", adminCookie, { method: "GET" });
  assert.notEqual(
    res.status,
    403,
    "Admin must be allowed past the role guard on the audit log",
  );
  assert.equal(
    res.status,
    200,
    "Admin should be able to read the audit log (past the guard)",
  );
  const logs = await res.json();
  assert.ok(
    Array.isArray(logs),
    "The audit log endpoint should return an array for an admin",
  );
});
