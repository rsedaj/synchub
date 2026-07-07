/**
 * Automated API test: POST /api/config-snapshots/:id/restore
 *
 * Verifies that:
 *  1. Restoring a known snapshot applies the stored settings to the live config.
 *  2. An audit log row with action="restore_backup" is created.
 *  3. A deleted (non-existent) snapshot ID returns 404.
 *  4. A snapshot whose snapshotJson has invalid data returns 422.
 *
 * The 404 test creates a real snapshot and deletes it so Express routing is
 * exercised with a genuine UUID format (avoids dev-server rewrite quirks with
 * the nil UUID 00000000-...).
 *
 * The 422 test injects a corrupt snapshot directly via PostgreSQL (DATABASE_URL),
 * because snapshots created through the public API always carry valid data.
 *
 * Run against a live dev server:
 *   npx tsx --test tests/api/config-snapshot-restore.test.ts
 *
 * Override target with BASE_URL / TEST_USERNAME / TEST_PASSWORD env vars.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5000";
const USERNAME = process.env.TEST_USERNAME || "admin";
const PASSWORD = process.env.TEST_PASSWORD || "admin123";

let cookie = "";
let sourceModuleId = "";
let targetModuleId = "";
const createdConfigIds: string[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (cookie) headers.set("Cookie", cookie);
  return fetch(`${BASE_URL}${path}`, { ...init, headers });
}

function baseConfig(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    sourceModuleId,
    targetModuleId,
    fieldMappings: [{ sourceField: "src_a", targetField: "tgt_a" }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

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
  assert.ok(modules.length >= 2, `Need at least 2 modules, found ${modules.length}`);
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("POST /api/config-snapshots/<deleted-id>/restore returns 404", async () => {
  // Create a real config + snapshot so we get a genuine UUID that Express will
  // route correctly, then delete the snapshot before trying to restore it.
  const configName = `__test_restore_404_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const createRes = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify(baseConfig(configName)),
  });
  assert.equal(createRes.status, 201, `Config creation failed: ${createRes.status}`);
  const { id: configId } = (await createRes.json()) as { id: string };
  createdConfigIds.push(configId);

  const snapRes = await api(`/api/config-snapshots/${configId}`, { method: "POST" });
  assert.equal(snapRes.status, 200, `Snapshot creation failed: ${snapRes.status}`);
  const snapBody = (await snapRes.json()) as { ok: boolean; snapshot: { id: string } };
  const snapshotId = snapBody.snapshot.id;

  // Delete the snapshot so it no longer exists
  const delRes = await api(`/api/config-snapshots/${snapshotId}`, { method: "DELETE" });
  assert.equal(delRes.status, 200, `Snapshot delete failed: ${delRes.status}`);

  // Now try to restore — must return 404
  const restoreRes = await api(`/api/config-snapshots/${snapshotId}/restore`, {
    method: "POST",
  });
  assert.equal(restoreRes.status, 404, `Expected 404 for deleted snapshot, got ${restoreRes.status}`);
  const body = (await restoreRes.json()) as { message: string };
  assert.ok(body.message, "404 response must include a message");
});

test("restore applies snapshot settings to the live sync config", async () => {
  const configName = `__test_restore_apply_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // 1. Create a config with fieldMappings [src_a → tgt_a]
  const createRes = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify(baseConfig(configName)),
  });
  assert.equal(createRes.status, 201, `Config creation failed: ${createRes.status}`);
  const created = (await createRes.json()) as { id: string };
  createdConfigIds.push(created.id);
  const configId = created.id;

  // 2. Trigger a manual snapshot while config has [src_a → tgt_a]
  const snapRes = await api(`/api/config-snapshots/${configId}`, { method: "POST" });
  assert.equal(snapRes.status, 200, `Manual snapshot failed: ${snapRes.status}`);
  const snapBody = (await snapRes.json()) as {
    ok: boolean;
    snapshot: { id: string };
  };
  assert.ok(snapBody.ok, "Snapshot response must have ok=true");
  const snapshotId = snapBody.snapshot.id;

  // 3. Modify the config — change fieldMappings to [src_b → tgt_b]
  const patchRes = await api(`/api/sync-configs/${configId}`, {
    method: "PATCH",
    body: JSON.stringify({
      fieldMappings: [{ sourceField: "src_b", targetField: "tgt_b" }],
    }),
  });
  assert.equal(patchRes.status, 200, `Config PATCH failed: ${patchRes.status}`);
  const patched = (await patchRes.json()) as {
    fieldMappings: Array<{ sourceField: string; targetField: string }>;
  };
  assert.deepEqual(
    patched.fieldMappings,
    [{ sourceField: "src_b", targetField: "tgt_b" }],
    "Config must have the new mappings after PATCH",
  );

  // 4. Restore from the snapshot (which has [src_a → tgt_a])
  const restoreRes = await api(`/api/config-snapshots/${snapshotId}/restore`, {
    method: "POST",
  });
  // Capture body text once to avoid "Body already consumed" error
  const restoreText = await restoreRes.text();
  assert.equal(
    restoreRes.status,
    200,
    `Restore failed with ${restoreRes.status}: ${restoreText}`,
  );
  const restoreBody = JSON.parse(restoreText) as {
    ok: boolean;
    results: { syncConfigs: number; skipped: string[]; errors: string[] };
  };
  assert.ok(restoreBody.ok, "Restore response must have ok=true");
  assert.equal(restoreBody.results.syncConfigs, 1, "Restore must report 1 updated config");
  assert.equal(restoreBody.results.errors.length, 0, "Restore must report no errors");

  // 5. Fetch the live config and verify it is back to [src_a → tgt_a]
  const listRes = await api("/api/sync-configs");
  assert.equal(listRes.status, 200, "GET /api/sync-configs failed");
  const configs = (await listRes.json()) as Array<{
    id: string;
    fieldMappings: Array<{ sourceField: string; targetField: string }>;
  }>;
  const liveConfig = configs.find(c => c.id === configId);
  assert.ok(liveConfig, `Config ${configId} must still exist after restore`);
  assert.deepEqual(
    liveConfig!.fieldMappings,
    [{ sourceField: "src_a", targetField: "tgt_a" }],
    "Config fieldMappings must be restored to the snapshot values",
  );
});

test("restore writes an audit log entry with action=restore_backup", async () => {
  const configName = `__test_restore_audit_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // Create config + snapshot
  const createRes = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify(baseConfig(configName)),
  });
  assert.equal(createRes.status, 201);
  const { id: configId } = (await createRes.json()) as { id: string };
  createdConfigIds.push(configId);

  const snapRes = await api(`/api/config-snapshots/${configId}`, { method: "POST" });
  assert.equal(snapRes.status, 200);
  const { snapshot } = (await snapRes.json()) as { ok: boolean; snapshot: { id: string } };
  const snapshotId = snapshot.id;

  // Restore
  const restoreText = await (
    await api(`/api/config-snapshots/${snapshotId}/restore`, { method: "POST" })
  ).text();
  const restoreBody = JSON.parse(restoreText) as { ok: boolean };
  assert.ok(restoreBody.ok, `Restore must succeed, got: ${restoreText}`);

  // Fetch ALL audit logs (large limit, no server-side action/entity filter so
  // we can diagnose what was actually persisted if the assertion fails).
  const logsRes = await api(`/api/audit-logs?limit=1000`);
  assert.equal(logsRes.status, 200, "GET /api/audit-logs must return 200");
  const allLogs = (await logsRes.json()) as Array<{
    action: string;
    entity: string;
    entityId: string;
  }>;

  const entry = allLogs.find(
    l =>
      l.action === "restore_backup" &&
      l.entity === "config_snapshot" &&
      l.entityId === snapshotId,
  );
  assert.ok(
    entry !== undefined,
    `Expected an audit log entry for snapshot ${snapshotId} with ` +
      `action=restore_backup / entity=config_snapshot. ` +
      `Recent restore_backup entries: ${JSON.stringify(
        allLogs.filter(l => l.action === "restore_backup").slice(0, 5),
      )}`,
  );
});

test("restore reports skipped when config's source module is deleted", async () => {
  // This test exercises the skipped path in restoreSyncConfigsFromBackup:
  //   config not found by id or name  AND  source/target module no longer exists
  //
  // There is no public DELETE /api/modules endpoint, so we create and remove
  // the temp modules directly via PostgreSQL — the same technique the 422 test
  // uses to inject a corrupt snapshot.

  if (!process.env.DATABASE_URL) {
    console.log("SKIP: DATABASE_URL not set — cannot create/delete temp modules");
    return;
  }

  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const srcCode = `__test_src_${suffix}`;
  const tgtCode = `__test_tgt_${suffix}`;
  const configName = `__test_restore_skipped_${suffix}`;

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let tempSrcModuleId = "";
  let tempTgtModuleId = "";
  let configId = "";
  let snapshotId = "";

  try {
    // 1. Create two temp modules via SQL
    const srcResult = await pool.query(
      `INSERT INTO api_modules (code, name, status, sort_order, is_active, config, data_fields)
       VALUES ($1, $1, 'disconnected', 999, true, '{}', '[]')
       RETURNING id`,
      [srcCode],
    );
    tempSrcModuleId = srcResult.rows[0].id;

    const tgtResult = await pool.query(
      `INSERT INTO api_modules (code, name, status, sort_order, is_active, config, data_fields)
       VALUES ($1, $1, 'disconnected', 999, true, '{}', '[]')
       RETURNING id`,
      [tgtCode],
    );
    tempTgtModuleId = tgtResult.rows[0].id;

    // 2. Create a sync config referencing the temp modules
    const createRes = await api("/api/sync-configs", {
      method: "POST",
      body: JSON.stringify({
        name: configName,
        sourceModuleId: tempSrcModuleId,
        targetModuleId: tempTgtModuleId,
        fieldMappings: [{ sourceField: "f_src", targetField: "f_tgt" }],
      }),
    });
    const createText = await createRes.text();
    assert.equal(createRes.status, 201, `Config creation failed: ${createRes.status} — ${createText}`);
    ({ id: configId } = JSON.parse(createText) as { id: string });
    createdConfigIds.push(configId); // ensure cleanup even if test fails mid-way

    // 3. Take a snapshot
    const snapRes = await api(`/api/config-snapshots/${configId}`, { method: "POST" });
    assert.equal(snapRes.status, 200, `Snapshot creation failed: ${snapRes.status}`);
    const snapBody = (await snapRes.json()) as { ok: boolean; snapshot: { id: string } };
    assert.ok(snapBody.ok, "Snapshot must report ok=true");
    snapshotId = snapBody.snapshot.id;

    // 4. Delete the sync config so the restore can't find it by id or name
    const delConfigRes = await api(`/api/sync-configs/${configId}`, { method: "DELETE" });
    assert.equal(delConfigRes.status, 200, `Config delete failed: ${delConfigRes.status}`);
    // Remove from cleanup list — already gone
    const idx = createdConfigIds.indexOf(configId);
    if (idx !== -1) createdConfigIds.splice(idx, 1);

    // 5. Delete the source module via SQL so the re-create path is blocked
    await pool.query(`DELETE FROM api_modules WHERE id = $1`, [tempSrcModuleId]);
    tempSrcModuleId = ""; // mark as cleaned up

    // 6. Restore — must succeed (200) but report the config as skipped
    const restoreRes = await api(`/api/config-snapshots/${snapshotId}/restore`, {
      method: "POST",
    });
    const restoreText = await restoreRes.text();
    assert.equal(
      restoreRes.status,
      200,
      `Expected 200 for skipped restore, got ${restoreRes.status}: ${restoreText}`,
    );
    const restoreBody = JSON.parse(restoreText) as {
      ok: boolean;
      results: { syncConfigs: number; skipped: string[]; errors: string[] };
    };
    assert.ok(restoreBody.ok, `Restore must report ok=true, got: ${restoreText}`);
    assert.ok(
      restoreBody.results.skipped.length > 0,
      `results.skipped must be non-empty when source module is deleted; got: ${JSON.stringify(restoreBody.results)}`,
    );
    assert.equal(restoreBody.results.errors.length, 0, "results.errors must be empty for a clean skip");

    // 7. Assert the audit log details.skipped is non-empty for this restore
    const logsRes = await api(`/api/audit-logs?limit=1000`);
    assert.equal(logsRes.status, 200, "GET /api/audit-logs must return 200");
    const allLogs = (await logsRes.json()) as Array<{
      action: string;
      entity: string;
      entityId: string;
      details: Record<string, unknown>;
    }>;

    const entry = allLogs.find(
      l =>
        l.action === "restore_backup" &&
        l.entity === "config_snapshot" &&
        l.entityId === snapshotId,
    );
    assert.ok(
      entry !== undefined,
      `Expected audit log entry for snapshot ${snapshotId} with action=restore_backup. ` +
        `Recent restore_backup entries: ${JSON.stringify(
          allLogs.filter(l => l.action === "restore_backup").slice(0, 5),
        )}`,
    );
    const auditSkipped = entry!.details?.skipped as unknown[];
    assert.ok(
      Array.isArray(auditSkipped) && auditSkipped.length > 0,
      `Audit log details.skipped must be a non-empty array when a config was skipped; got: ${JSON.stringify(entry!.details)}`,
    );
  } finally {
    // Best-effort cleanup: delete temp modules if they were created
    if (tempSrcModuleId) {
      await pool.query(`DELETE FROM api_modules WHERE id = $1`, [tempSrcModuleId]).catch(() => {});
    }
    if (tempTgtModuleId) {
      await pool.query(`DELETE FROM api_modules WHERE id = $1`, [tempTgtModuleId]).catch(() => {});
    }
    await pool.end();
  }
});

test("restore returns 422 when snapshot data fails schema validation", async () => {
  // This case requires injecting a corrupt snapshotJson directly into the DB because
  // snapshots created through the public API always carry valid data (configs are
  // validated on creation). We use DATABASE_URL (available in the same environment).
  //
  // We corrupt `name` to "" (empty string) which fails z.string().min(1) in
  // updateSyncConfigSchema — even after .partial(), provided values are still
  // validated; only undefined is allowed to bypass the min(1) check.

  if (!process.env.DATABASE_URL) {
    console.log("SKIP: DATABASE_URL not set — cannot inject corrupt snapshot");
    return;
  }

  const configName = `__test_restore_422_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // 1. Create a valid config + snapshot
  const createRes = await api("/api/sync-configs", {
    method: "POST",
    body: JSON.stringify(baseConfig(configName)),
  });
  assert.equal(createRes.status, 201, `Config creation failed: ${createRes.status}`);
  const { id: configId } = (await createRes.json()) as { id: string };
  createdConfigIds.push(configId);

  const snapRes = await api(`/api/config-snapshots/${configId}`, { method: "POST" });
  assert.equal(snapRes.status, 200, `Snapshot creation failed: ${snapRes.status}`);
  const { snapshot } = (await snapRes.json()) as { ok: boolean; snapshot: { id: string } };
  const snapshotId = snapshot.id;

  // 2. Corrupt the snapshot: set name="" — fails z.string().min(1) in
  //    updateSyncConfigSchema even when .partial() makes the field optional,
  //    because optional() only allows `undefined`, not an empty string.
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(
      `UPDATE config_snapshots
         SET snapshot_json = jsonb_set(snapshot_json::jsonb, '{name}', '""'::jsonb)
       WHERE id = $1
       RETURNING id`,
      [snapshotId],
    );
    assert.equal(
      result.rowCount,
      1,
      `SQL UPDATE matched ${result.rowCount} rows — expected 1 (snapshot ${snapshotId})`,
    );
  } finally {
    await pool.end();
  }

  // 3. Attempt restore — must fail with 422
  const restoreRes = await api(`/api/config-snapshots/${snapshotId}/restore`, {
    method: "POST",
  });
  const restoreText = await restoreRes.text();
  assert.equal(
    restoreRes.status,
    422,
    `Expected 422 for corrupt snapshot (name=""), got ${restoreRes.status}: ${restoreText}`,
  );
  const body = JSON.parse(restoreText) as {
    message: string;
    results: { errors: string[] };
  };
  assert.ok(body.message, "422 response must include a message");
  assert.ok(
    body.results?.errors?.length > 0,
    `422 response must include at least one error in results.errors, got: ${JSON.stringify(body.results)}`,
  );
});
