/**
 * Automated API test: snapshot history stays accurate when a config is renamed.
 *
 * Snapshots store configName at creation time as a point-in-time record.
 * After a rename, existing snapshots must:
 *  1. Still be accessible by syncConfigId (history not lost).
 *  2. Retain the original configName they were created under (historical accuracy).
 *
 * The UI in sync-config.tsx shows a "Name at backup time: ..." note when
 * snap.configName !== config.name, so users are never confused by the discrepancy.
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

test("snapshot list is still accessible by syncConfigId after a config rename", async () => {
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
  const snapBody = (await snapRes.json()) as { ok: boolean; snapshot: { id: string; configName: string; syncConfigId: string } };
  assert.ok(snapBody.ok, "Snapshot should report ok=true");
  assert.equal(
    snapBody.snapshot.configName,
    originalName,
    "Snapshot should store the original config name at creation time",
  );
  assert.equal(
    snapBody.snapshot.syncConfigId,
    configId,
    "Snapshot syncConfigId must match the config id",
  );

  // 3. Rename the config
  const patchRes = await api(`/api/sync-configs/${configId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: renamedName }),
  });
  assert.equal(patchRes.status, 200, `Config rename failed: ${patchRes.status}`);
  const patched = (await patchRes.json()) as { name: string };
  assert.equal(patched.name, renamedName, "Config should have the new name after PATCH");

  // 4. Verify snapshots still accessible by configId — history is not lost
  const listRes = await api(`/api/config-snapshots/${configId}`);
  assert.equal(listRes.status, 200, `GET snapshots after rename failed: ${listRes.status}`);
  const snaps = (await listRes.json()) as Array<{ id: string; configName: string; syncConfigId: string }>;
  assert.ok(snaps.length >= 1, `Expected at least 1 snapshot after rename, got ${snaps.length}`);

  // 5. Verify all snapshots are still keyed to the same syncConfigId
  for (const snap of snaps) {
    assert.equal(
      snap.syncConfigId,
      configId,
      `Snapshot ${snap.id} syncConfigId must still match the config id after rename`,
    );
  }
});

test("snapshots preserve the configName from the time of backup (point-in-time record)", async () => {
  const nameV1 = `__test_historic_name_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const nameV2 = `${nameV1}_v2`;

  // Create config
  const createRes = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify({
      name: nameV1,
      sourceModuleId,
      targetModuleId,
      fieldMappings: [{ sourceField: "field_x", targetField: "field_y" }],
    }),
  });
  assert.equal(createRes.status, 201);
  const { id: configId } = (await createRes.json()) as { id: string };
  createdConfigIds.push(configId);

  // Trigger a snapshot under nameV1
  const snapRes = await api(`/api/config-snapshots/${configId}`, { method: "POST" });
  assert.equal(snapRes.status, 200);
  const { snapshot: snap1 } = (await snapRes.json()) as { ok: boolean; snapshot: { id: string; configName: string } };
  assert.equal(snap1.configName, nameV1, "Snapshot created under nameV1 must store nameV1");

  // Rename to nameV2
  const patchRes = await api(`/api/sync-configs/${configId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: nameV2 }),
  });
  assert.equal(patchRes.status, 200);

  // Re-fetch the snapshot list
  const listRes = await api(`/api/config-snapshots/${configId}`);
  assert.equal(listRes.status, 200);
  const snaps = (await listRes.json()) as Array<{ id: string; configName: string }>;

  // The snapshot created under nameV1 must still carry nameV1 — point-in-time preservation
  const originalSnap = snaps.find(s => s.id === snap1.id);
  assert.ok(originalSnap, `Original snapshot ${snap1.id} must still exist after rename`);
  assert.equal(
    originalSnap!.configName,
    nameV1,
    `Snapshot created under "${nameV1}" must retain that name after config is renamed to "${nameV2}". Got: "${originalSnap!.configName}"`,
  );
  // All snapshots must still be keyed to the correct config
  for (const snap of snaps) {
    assert.equal(
      snap.syncConfigId,
      configId,
      `Snapshot ${snap.id} syncConfigId changed after rename`,
    );
  }
});
