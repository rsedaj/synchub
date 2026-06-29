/**
 * Automated API test: the per-run diagnostic event log endpoints.
 *
 * Every sync run persists a detailed, always-accessible diagnostic log so
 * problems can be diagnosed anytime. Two endpoints expose it (server/routes.ts):
 *   - GET /api/sync-runs/:id/events      (~line 1030) — JSON event rows
 *   - GET /api/sync-runs/:id/export-log  (~line 1046) — downloadable .txt
 *
 * Both are guarded by requireAuth, mirror export-csv's auth/validation parity,
 * and 404 on an unknown run. The events feed MUST be ordered by `seq` (a
 * per-run monotonic counter), NOT by createdAt — this is what keeps the
 * chronological narrative stable, including across resumed runs that append to
 * the same run's log. This test guards:
 *   1. unauthenticated access is rejected (401),
 *   2. an unknown run id 404s for an admin (past auth, into the handler),
 *   3. for a real run (if any exist) the events feed returns a JSON array
 *      ordered by non-decreasing seq, and export-log streams a text/plain
 *      attachment.
 *
 * This is a black-box test that runs against the live dev server. Start the app
 * first (npm run dev), then run:
 *   npx tsx --test tests/api/sync-run-events-log.test.ts
 *
 * Override the target/admin creds with BASE_URL / TEST_USERNAME / TEST_PASSWORD.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5000";
const ADMIN_USERNAME = process.env.TEST_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.TEST_PASSWORD || "admin123";

// A run id that does not exist. The handler runs after requireAuth, so an
// authenticated admin sails past auth into a harmless 404.
const FAKE_ID = "00000000-0000-0000-0000-000000000000";

let adminCookie = "";

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
});

test("unauthenticated request to the events feed is rejected (401)", async () => {
  const res = await api(`/api/sync-runs/${FAKE_ID}/events`, "");
  assert.equal(res.status, 401, `Events feed must require auth (got ${res.status})`);
});

test("unauthenticated request to export-log is rejected (401)", async () => {
  const res = await api(`/api/sync-runs/${FAKE_ID}/export-log`, "");
  assert.equal(res.status, 401, `Export-log must require auth (got ${res.status})`);
});

test("admin reaches past auth and gets 404 for an unknown run (events)", async () => {
  const res = await api(`/api/sync-runs/${FAKE_ID}/events`, adminCookie);
  assert.notEqual(res.status, 401, "Admin must be authenticated past requireAuth");
  assert.equal(res.status, 404, `Unknown run events should 404 (got ${res.status})`);
});

test("admin reaches past auth and gets 404 for an unknown run (export-log)", async () => {
  const res = await api(`/api/sync-runs/${FAKE_ID}/export-log`, adminCookie);
  assert.notEqual(res.status, 401, "Admin must be authenticated past requireAuth");
  assert.equal(res.status, 404, `Unknown run export-log should 404 (got ${res.status})`);
});

test("a real run's events feed is a seq-ordered JSON array and export-log is a text attachment", async () => {
  const runsRes = await api("/api/sync-runs?limit=10", adminCookie);
  assert.equal(runsRes.status, 200, `Listing sync runs should succeed (got ${runsRes.status})`);
  const runs = (await runsRes.json()) as Array<{ id: string }>;
  assert.ok(Array.isArray(runs), "sync-runs listing must be an array");

  if (runs.length === 0) {
    // No runs yet in this environment — the auth + 404 contracts above still
    // provide coverage. Nothing more to assert.
    return;
  }

  const runId = runs[0].id;

  // Events feed: 200 + JSON array, ordered by non-decreasing seq.
  const eventsRes = await api(`/api/sync-runs/${runId}/events?limit=5000`, adminCookie);
  assert.equal(eventsRes.status, 200, `Events feed should return 200 (got ${eventsRes.status})`);
  const events = (await eventsRes.json()) as Array<{ seq: number; level: string; message: string }>;
  assert.ok(Array.isArray(events), "Events feed must be a JSON array");
  let prevSeq = -Infinity;
  for (const ev of events) {
    assert.equal(typeof ev.seq, "number", "Each event must carry a numeric seq");
    assert.ok(
      ev.seq >= prevSeq,
      `Events must be ordered by non-decreasing seq (saw ${ev.seq} after ${prevSeq})`,
    );
    prevSeq = ev.seq;
    assert.ok(
      ["info", "warn", "error"].includes(ev.level),
      `Event level must be info/warn/error (got ${ev.level})`,
    );
  }

  // The level filter must only ever return rows of the requested level.
  const errOnlyRes = await api(`/api/sync-runs/${runId}/events?level=error`, adminCookie);
  assert.equal(errOnlyRes.status, 200, "Filtered events feed should return 200");
  const errOnly = (await errOnlyRes.json()) as Array<{ level: string }>;
  for (const ev of errOnly) {
    assert.equal(ev.level, "error", "level=error filter must only return error rows");
  }

  // Export-log: 200 downloadable text/plain attachment.
  const exportRes = await api(`/api/sync-runs/${runId}/export-log`, adminCookie);
  assert.equal(exportRes.status, 200, `Export-log should return 200 (got ${exportRes.status})`);
  const contentType = exportRes.headers.get("content-type") || "";
  assert.ok(
    contentType.includes("text/plain"),
    `Export-log must be text/plain (got "${contentType}")`,
  );
  const disposition = exportRes.headers.get("content-disposition") || "";
  assert.ok(
    disposition.includes("attachment"),
    `Export-log must be a downloadable attachment (got "${disposition}")`,
  );
  const body = await exportRes.text();
  assert.ok(body.length > 0, "Export-log body must not be empty");
});
