/**
 * Automated API test: server-side validation rejects broken field mappings.
 *
 * Guards the validation added in server/routes.ts (refineNoDuplicateMappingTargets
 * plus the min(1) source/target constraints) so POST/PATCH /api/sync-configs
 * cannot persist configs whose fieldMappings contain duplicate target fields or
 * empty source/target fields.
 *
 * This is a black-box test that runs against the live dev server. Start the app
 * first (npm run dev), then run:
 *   npx tsx --test tests/api/sync-config-mapping-validation.test.ts
 *
 * Override the target with BASE_URL / TEST_USERNAME / TEST_PASSWORD env vars.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5000";
const USERNAME = process.env.TEST_USERNAME || "admin";
const PASSWORD = process.env.TEST_PASSWORD || "admin123";

let cookie = "";
let sourceModuleId = "";
let targetModuleId = "";
const createdConfigIds: string[] = [];

function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (cookie) headers.set("Cookie", cookie);
  return fetch(`${BASE_URL}${path}`, { ...init, headers });
}

function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    name: `__test_mapping_validation_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    sourceModuleId,
    targetModuleId,
    fieldMappings: [
      { sourceField: "src_a", targetField: "tgt_a" },
      { sourceField: "src_b", targetField: "tgt_b" },
    ],
    ...overrides,
  };
}

before(async () => {
  const loginRes = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  assert.equal(
    loginRes.status,
    200,
    `Login failed (${loginRes.status}). Is the dev server running and is ${USERNAME}/${PASSWORD} valid?`,
  );
  const setCookie = loginRes.headers.get("set-cookie");
  assert.ok(setCookie, "Login did not return a session cookie");
  cookie = setCookie.split(";")[0];

  const modulesRes = await api("/api/modules");
  assert.equal(modulesRes.status, 200, "Failed to load modules");
  const modules = (await modulesRes.json()) as Array<{ id: string }>;
  assert.ok(
    modules.length >= 2,
    `Need at least 2 modules to build a sync config, found ${modules.length}`,
  );
  sourceModuleId = modules[0].id;
  targetModuleId = modules[1].id;
});

after(async () => {
  for (const id of createdConfigIds) {
    try {
      await api(`/api/sync-configs/${id}`, { method: "DELETE" });
    } catch {
      // best-effort cleanup
    }
  }
});

test("POST rejects two mappings sharing one targetField with 400", async () => {
  const res = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify(
      baseConfig({
        fieldMappings: [
          { sourceField: "src_a", targetField: "dup" },
          { sourceField: "src_b", targetField: "dup" },
        ],
      }),
    ),
  });
  assert.equal(res.status, 400, "Duplicate target field should be rejected");
  const body = await res.json();
  const fieldMappingErrors = (body?.errors?.fieldMappings ?? []) as string[];
  assert.ok(
    fieldMappingErrors.some((m) => /[Dd]uplicate target field/.test(m)),
    `Expected a duplicate-target error, got: ${JSON.stringify(body.errors)}`,
  );
});

test("POST rejects an empty targetField with 400", async () => {
  const res = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify(
      baseConfig({
        fieldMappings: [{ sourceField: "src_a", targetField: "" }],
      }),
    ),
  });
  assert.equal(res.status, 400, "Empty targetField should be rejected");
});

test("POST rejects an empty sourceField with 400", async () => {
  const res = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify(
      baseConfig({
        fieldMappings: [{ sourceField: "", targetField: "tgt_a" }],
      }),
    ),
  });
  assert.equal(res.status, 400, "Empty sourceField should be rejected");
});

test("POST accepts a config with distinct targets and returns 201", async () => {
  const res = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify(baseConfig()),
  });
  assert.equal(res.status, 201, "A config with distinct targets should be accepted");
  const created = (await res.json()) as { id: string };
  assert.ok(created.id, "Created config should have an id");
  createdConfigIds.push(created.id);
});

test("PATCH rejects updating to a duplicate targetField with 400", async () => {
  const createRes = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify(baseConfig()),
  });
  assert.equal(createRes.status, 201);
  const created = (await createRes.json()) as { id: string };
  createdConfigIds.push(created.id);

  const res = await api(`/api/sync-configs/${created.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      fieldMappings: [
        { sourceField: "src_a", targetField: "dup" },
        { sourceField: "src_b", targetField: "dup" },
      ],
    }),
  });
  assert.equal(res.status, 400, "PATCH with duplicate target should be rejected");
  const body = await res.json();
  const fieldMappingErrors = (body?.errors?.fieldMappings ?? []) as string[];
  assert.ok(
    fieldMappingErrors.some((m) => /[Dd]uplicate target field/.test(m)),
    `Expected a duplicate-target error, got: ${JSON.stringify(body.errors)}`,
  );
});

test("PATCH rejects updating to an empty targetField with 400", async () => {
  const createRes = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify(baseConfig()),
  });
  assert.equal(createRes.status, 201);
  const created = (await createRes.json()) as { id: string };
  createdConfigIds.push(created.id);

  const res = await api(`/api/sync-configs/${created.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      fieldMappings: [{ sourceField: "src_a", targetField: "" }],
    }),
  });
  assert.equal(res.status, 400, "PATCH with empty targetField should be rejected");
});

test("PATCH accepts distinct targets and returns 200", async () => {
  const createRes = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify(baseConfig()),
  });
  assert.equal(createRes.status, 201);
  const created = (await createRes.json()) as { id: string };
  createdConfigIds.push(created.id);

  const res = await api(`/api/sync-configs/${created.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      fieldMappings: [
        { sourceField: "src_c", targetField: "tgt_c" },
        { sourceField: "src_d", targetField: "tgt_d" },
      ],
    }),
  });
  assert.equal(res.status, 200, "PATCH with distinct targets should be accepted");
});
