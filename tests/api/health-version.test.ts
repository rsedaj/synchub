/**
 * Automated API test: /api/health reports the canonical APP_VERSION.
 *
 * Guards against a silent regression where the health endpoint returns a
 * different version string than shared/version.ts (e.g. falling back to the
 * npm package version "1.0.0"). Coolify uses /api/health to verify a deploy,
 * so a mismatch here means a deploy can look healthy while reporting the wrong
 * version. This test pins the health endpoint to APP_VERSION.
 *
 * This is a black-box test that runs against the live dev server. Start the app
 * first (npm run dev), then run:
 *   npx tsx --test tests/api/health-version.test.ts
 *
 * Override the target with the BASE_URL env var.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { APP_VERSION } from "@shared/version";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5000";

test("GET /api/health returns status ok and version === APP_VERSION", async () => {
  const res = await fetch(`${BASE_URL}/api/health`);
  assert.equal(
    res.status,
    200,
    `Health check failed (${res.status}). Is the dev server running?`,
  );

  const body = (await res.json()) as {
    status?: string;
    version?: string;
  };

  assert.equal(body.status, "ok", `Expected status "ok", got: ${body.status}`);
  assert.equal(
    body.version,
    APP_VERSION,
    `Health version "${body.version}" does not match APP_VERSION "${APP_VERSION}" from shared/version.ts`,
  );
});
