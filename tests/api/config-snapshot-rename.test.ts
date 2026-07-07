/**
 * Automated API test: snapshot history stays accurate when a config is renamed.
 *
 * Verifies that:
 *  1. Snapshots created before a rename are still returned by
 *     GET /api/config-snapshots/:configId (history is not lost).
 *  2. The configName stored on all existing snapshots is updated to the new
 *     name after a PATCH /api/sync-configs/:id rename (keeps display accurate).
 *
 * Run against a live dev server:
 *   npx tsx --test tests/api/config-snapshot-rename.test.ts
 *
 * Override target with BASE_URL / TEST_USERNAME / TEST_PASSWORD env vars.
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
    `Need at least 2 modules, found ${modules.length}`,
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

test("snapshot list survives config rename and configName is updated", async () => {
  const originalName = `__test_rename_snap_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const renamedName = `${originalName}_renamed`;

  // 1. Create config
  const createRes = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify({
      name: originalName,
      sourceModuleId,
      targetModuleId,
      fieldMappings: [{ sourceField: "src_a", targetField: "tgt_a" }],
    }),
  });
  assert.equal(createRes.status, 201, `Config creation failed: ${createRes.status}`);
  const created = (await createRes.json()) as { id: string };
  assert.ok(created.id, "Created config should have an id");
  createdConfigIds.push(created.id);
  const configId = created.id;

  // 2. Trigger a manual snapshot
  const snapRes = await api(`/api/config-snapshots/${configId}`, { method: "POST" });
  assert.equal(snapRes.status, 200, `Snapshot creation failed: ${snapRes.status}`);
  const snapBody = (await snapRes.json()) as { ok: boolean; snapshot: { id: string; configName: string } };
  assert.ok(snapBody.ok, "Snapshot should report ok=true");
  assert.equal(
    snapBody.snapshot.configName,
    originalName,
    "Snapshot should store the original config name",
  );

  // 3. Rename the config
  const patchRes = await api(`/api/sync-configs/${configId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: renamedName }),
  });
  assert.equal(patchRes.status, 200, `Config rename failed: ${patchRes.status}`);
  const patched = (await patchRes.json()) as { name: string };
  assert.equal(patched.name, renamedName, "Config should have the new name after PATCH");

  // 4. Verify snapshots still accessible by configId
  const listRes = await api(`/api/config-snapshots/${configId}`);
  assert.equal(listRes.status, 200, `GET snapshots after rename failed: ${listRes.status}`);
  const snaps = (await listRes.json()) as Array<{ id: string; configName: string }>;
  assert.ok(snaps.length >= 1, `Expected at least 1 snapshot, got ${snaps.length}`);

  // 5. Verify configName was updated to the new name in all existing snapshots
  const staleNameSnap = snaps.find(s => s.configName === originalName);
  assert.equal(
    staleNameSnap,
    undefined,
    `Expected no snapshots with the old name "${originalName}" after rename — found one: ${JSON.stringify(staleNameSnap)}`,
  );
  for (const snap of snaps) {
    assert.equal(
      snap.configName,
      renamedName,
      `Snapshot ${snap.id} still has old configName "${snap.configName}", expected "${renamedName}"`,
    );
  }
});

test("snapshot list is grouped by syncConfigId, not configName — survives rename even if name update lags", async () => {
  const name = `__test_rename_grouping_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // Create config + snapshot
  const createRes = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify({
      name,
      sourceModuleId,
      targetModuleId,
      fieldMappings: [{ sourceField: "field_x", targetField: "field_y" }],
    }),
  });
  assert.equal(createRes.status, 201);
  const { id: configId } = (await createRes.json()) as { id: string };
  createdConfigIds.push(configId);

  const snapRes = await api(`/api/config-snapshots/${configId}`, { method: "POST" });
  assert.equal(snapRes.status, 200);

  // Rename
  await api(`/api/sync-configs/${configId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: `${name}_v2` }),
  });

  // GET by configId must still return the snapshot regardless of name
  const listRes = await api(`/api/config-snapshots/${configId}`);
  assert.equal(listRes.status, 200);
  const snaps = (await listRes.json()) as Array<{ syncConfigId: string }>;
  assert.ok(snaps.length >= 1, "Snapshots must still be accessible after rename");
  for (const s of snaps) {
    assert.equal(s.syncConfigId, configId, "syncConfigId must always match the config id");
  }
});
