/**
 * Automated API test: server-side validation rejects configs that are missing a
 * name or modules.
 *
 * Guards the validation in server/routes.ts (createSyncConfigSchema: name.min(1),
 * sourceModuleId.min(1), targetModuleId.min(1), fieldMappings.min(1)) so a direct
 * API caller cannot bypass the client-side handleSave guards and persist a config
 * without a name or without source/target modules.
 *
 * This is a black-box test that runs against the live dev server. Start the app
 * first (npm run dev), then run:
 *   npx tsx --test tests/api/sync-config-name-and-modules-validation.test.ts
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
    name: `__test_name_modules_validation_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    sourceModuleId,
    targetModuleId,
    fieldMappings: [
      { sourceField: "src_a", targetField: "tgt_a" },
      { sourceField: "src_b", targetField: "tgt_b" },
    ],
    ...overrides,
  };
}

async function countConfigs(): Promise<number> {
  const res = await api("/api/sync-configs");
  assert.equal(res.status, 200, "Failed to list sync configs");
  const configs = (await res.json()) as unknown[];
  return configs.length;
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

test("POST rejects an empty name with 400 and persists nothing", async () => {
  const before = await countConfigs();
  const res = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify(baseConfig({ name: "" })),
  });
  assert.equal(res.status, 400, "An empty name should be rejected");
  const body = await res.json();
  const nameErrors = (body?.errors?.name ?? []) as string[];
  assert.ok(
    nameErrors.length > 0,
    `Expected a name validation error, got: ${JSON.stringify(body.errors)}`,
  );
  assert.equal(await countConfigs(), before, "No config should be persisted");
});

test("POST rejects a missing name with 400", async () => {
  const config = baseConfig();
  delete (config as Record<string, unknown>).name;
  const res = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify(config),
  });
  assert.equal(res.status, 400, "A missing name should be rejected");
});

test("POST rejects an empty sourceModuleId with 400 and persists nothing", async () => {
  const before = await countConfigs();
  const res = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify(baseConfig({ sourceModuleId: "" })),
  });
  assert.equal(res.status, 400, "An empty sourceModuleId should be rejected");
  const body = await res.json();
  const sourceErrors = (body?.errors?.sourceModuleId ?? []) as string[];
  assert.ok(
    sourceErrors.length > 0,
    `Expected a sourceModuleId validation error, got: ${JSON.stringify(body.errors)}`,
  );
  assert.equal(await countConfigs(), before, "No config should be persisted");
});

test("POST rejects a missing sourceModuleId with 400", async () => {
  const config = baseConfig();
  delete (config as Record<string, unknown>).sourceModuleId;
  const res = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify(config),
  });
  assert.equal(res.status, 400, "A missing sourceModuleId should be rejected");
});

test("POST rejects an empty targetModuleId with 400 and persists nothing", async () => {
  const before = await countConfigs();
  const res = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify(baseConfig({ targetModuleId: "" })),
  });
  assert.equal(res.status, 400, "An empty targetModuleId should be rejected");
  const body = await res.json();
  const targetErrors = (body?.errors?.targetModuleId ?? []) as string[];
  assert.ok(
    targetErrors.length > 0,
    `Expected a targetModuleId validation error, got: ${JSON.stringify(body.errors)}`,
  );
  assert.equal(await countConfigs(), before, "No config should be persisted");
});

test("POST rejects a missing targetModuleId with 400", async () => {
  const config = baseConfig();
  delete (config as Record<string, unknown>).targetModuleId;
  const res = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify(config),
  });
  assert.equal(res.status, 400, "A missing targetModuleId should be rejected");
});

test("POST rejects an empty fieldMappings array with 400 and persists nothing", async () => {
  const before = await countConfigs();
  const res = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify(baseConfig({ fieldMappings: [] })),
  });
  assert.equal(
    res.status,
    400,
    "A config with zero field mappings should be rejected",
  );
  const body = await res.json();
  const mappingErrors = (body?.errors?.fieldMappings ?? []) as string[];
  assert.ok(
    mappingErrors.length > 0,
    `Expected a fieldMappings validation error, got: ${JSON.stringify(body.errors)}`,
  );
  assert.equal(await countConfigs(), before, "No config should be persisted");
});

test("POST accepts a config with all required fields and returns 201", async () => {
  const res = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify(baseConfig()),
  });
  assert.equal(
    res.status,
    201,
    "A config with a name, both modules, and mappings should be accepted",
  );
  const created = (await res.json()) as { id: string };
  assert.ok(created.id, "Created config should have an id");
  createdConfigIds.push(created.id);
});
