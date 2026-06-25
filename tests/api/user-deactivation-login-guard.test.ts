/**
 * Automated API test: deactivated user accounts cannot sign in.
 *
 * Admins can deactivate an account by setting isActive=false via
 * PATCH /api/users/:id (server/routes.ts ~lines 700-738). The login flow
 * rejects deactivated users in the Passport LocalStrategy (server/auth.ts:
 * `if (!user.isActive) return done(null, false, ...)`), so POST /api/auth/login
 * must return a non-200 status for a deactivated account. This is a sensitive
 * security boundary: a regression here could let removed or suspended staff
 * regain access.
 *
 * This test creates a user via the admin endpoint, confirms it can log in while
 * active (control), deactivates it, and asserts a subsequent login is rejected.
 *
 * This is a black-box test that runs against the live dev server. Start the app
 * first (npm run dev), then run:
 *   npx tsx --test tests/api/user-deactivation-login-guard.test.ts
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

const TARGET_USERNAME = uniqueName("__test_deactivate");
const TARGET_PASSWORD = "deactivate-pass-123";

let adminCookie = "";
let targetUserId = "";

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
  return user.id;
}

before(async () => {
  adminCookie = await login(ADMIN_USERNAME, ADMIN_PASSWORD);
  targetUserId = await createUserAsAdmin(TARGET_USERNAME, TARGET_PASSWORD, "viewer");
});

after(async () => {
  // Best-effort cleanup of the user created during the test.
  if (targetUserId) {
    try {
      await api(`/api/users/${targetUserId}`, adminCookie, { method: "DELETE" });
    } catch {
      // best-effort
    }
  }
});

test("control: an active user can log in", async () => {
  const res = await api("/api/auth/login", "", {
    method: "POST",
    body: JSON.stringify({ username: TARGET_USERNAME, password: TARGET_PASSWORD }),
  });
  assert.equal(res.status, 200, "An active user must be able to log in");
});

test("a deactivated user can no longer sign in", async () => {
  // Deactivate the account via the admin endpoint.
  const patchRes = await api(`/api/users/${targetUserId}`, adminCookie, {
    method: "PATCH",
    body: JSON.stringify({ isActive: false }),
  });
  assert.equal(patchRes.status, 200, "Admin should be able to deactivate the user");
  const patched = (await patchRes.json()) as { isActive: boolean };
  assert.equal(patched.isActive, false, "The account must be marked inactive");

  // A subsequent login with the same valid credentials must be rejected.
  const loginRes = await api("/api/auth/login", "", {
    method: "POST",
    body: JSON.stringify({ username: TARGET_USERNAME, password: TARGET_PASSWORD }),
  });
  assert.notEqual(
    loginRes.status,
    200,
    "A deactivated user must NOT be able to log in",
  );
});
