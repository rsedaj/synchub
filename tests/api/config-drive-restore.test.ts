/**
 * Automated API test: POST /api/backups/config-restore-from-drive/:fileId
 *
 * Tests the real Drive restore route's skipped path via a dev/test bypass:
 * when fileId === "__test__" and NODE_ENV !== "production", the route reads
 * backup JSON from req.body.backup instead of downloading from Google Drive.
 * The rest of the route (validation, restoreSyncConfigsFromBackup, audit log,
 * response shape) runs identically to a real Drive restore.
 *
 * Verifies that:
 *  1. When the sync config in the backup no longer exists AND the source module
 *     has been deleted, the route returns HTTP 200 with results.skipped
 *     non-empty and results.errors empty.
 *  2. The audit log entry written by the route (entity="config_restore_from_drive")
 *     includes details.restored.skipped as a non-empty array.
 *
 * Both tests require DATABASE_URL (to create/delete temp modules via SQL) and
 * are skipped when it is absent.
 *
 * Run against a live dev server:
 *   npx tsx --test tests/api/config-drive-restore.test.ts
 *
 * Override target with BASE_URL / TEST_USERNAME / TEST_PASSWORD env vars.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5000";
const USERNAME = process.env.TEST_USERNAME || "admin";
const PASSWORD = process.env.TEST_PASSWORD || "admin123";

// Sentinel file ID — routes.ts treats this as a test bypass when
// NODE_ENV !== "production", reading backup from req.body.backup.
const TEST_FILE_ID = "__test__";

let cookie = "";
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

test("Drive restore reports skipped when sync config's source module is deleted", async () => {
  // Strategy:
  //  1. Create two temp modules via SQL.
  //  2. Create a sync config via API referencing those modules.
  //  3. Build an in-memory backup JSON (same shape as a real Drive backup).
  //  4. Delete the sync config (so restore can't find it by id or name).
  //  5. Delete the source module via SQL (blocks the re-create path).
  //  6. POST backup to /api/backups/config-restore-from-drive/__test__
  //     (the real Drive route, using the dev/test bypass for the download step).
  //  7. Assert HTTP 200, results.skipped non-empty, results.errors empty.

  if (!process.env.DATABASE_URL) {
    console.log("SKIP: DATABASE_URL not set — cannot create/delete temp modules via SQL");
    return;
  }

  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const srcCode = `__test_drive_src_${suffix}`;
  const tgtCode = `__test_drive_tgt_${suffix}`;
  const configName = `__test_drive_restore_skipped_${suffix}`;

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let tempSrcModuleId = "";
  let tempTgtModuleId = "";
  let configId = "";

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

    // 2. Create a sync config via API referencing the temp modules
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
    createdConfigIds.push(configId);

    // 3. Build backup JSON matching the Drive backup format
    const backup = {
      version: "1.0",
      type: "config",
      appVersion: "test",
      syncConfigs: [
        {
          id: configId,
          name: configName,
          sourceModuleId: tempSrcModuleId,
          targetModuleId: tempTgtModuleId,
          fieldMappings: [{ sourceField: "f_src", targetField: "f_tgt" }],
          isEnabled: true,
          autoRetry: false,
          retryDelayMin: 3,
          schedule: null,
        },
      ],
    };

    // 4. Delete the sync config so restore can't find it by id or name
    const delConfigRes = await api(`/api/sync-configs/${configId}`, { method: "DELETE" });
    assert.equal(delConfigRes.status, 200, `Config delete failed: ${delConfigRes.status}`);
    const idx = createdConfigIds.indexOf(configId);
    if (idx !== -1) createdConfigIds.splice(idx, 1);

    // 5. Delete the source module via SQL so the re-create path is blocked
    await pool.query(`DELETE FROM api_modules WHERE id = $1`, [tempSrcModuleId]);
    tempSrcModuleId = "";

    // 6. POST to the real Drive restore route using the dev/test bypass
    const restoreRes = await api(`/api/backups/config-restore-from-drive/${TEST_FILE_ID}`, {
      method: "POST",
      body: JSON.stringify({ backup }),
    });
    const restoreText = await restoreRes.text();
    assert.equal(
      restoreRes.status,
      200,
      `Expected 200 from Drive restore route, got ${restoreRes.status}: ${restoreText}`,
    );
    const restoreBody = JSON.parse(restoreText) as {
      success: boolean;
      results: { syncConfigs: number; skipped: string[]; errors: string[] };
    };

    // 7. Assert skipped is non-empty, errors is empty
    assert.ok(
      restoreBody.results.skipped.length > 0,
      `results.skipped must be non-empty when source module is deleted; got: ${JSON.stringify(restoreBody.results)}`,
    );
    assert.equal(
      restoreBody.results.errors.length,
      0,
      `results.errors must be empty for a clean skip; got: ${JSON.stringify(restoreBody.results.errors)}`,
    );
  } finally {
    if (tempSrcModuleId) {
      await pool.query(`DELETE FROM api_modules WHERE id = $1`, [tempSrcModuleId]).catch(() => {});
    }
    if (tempTgtModuleId) {
      await pool.query(`DELETE FROM api_modules WHERE id = $1`, [tempTgtModuleId]).catch(() => {});
    }
    await pool.end();
  }
});

test("Drive restore audit log records details.restored.skipped when a config is skipped", async () => {
  // Same setup as the first test, but verifies the audit log entry written by
  // the real Drive restore route (entity="config_restore_from_drive") includes
  // details.restored.skipped as a non-empty array.

  if (!process.env.DATABASE_URL) {
    console.log("SKIP: DATABASE_URL not set — cannot create/delete temp modules via SQL");
    return;
  }

  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const srcCode = `__test_drive_src2_${suffix}`;
  const tgtCode = `__test_drive_tgt2_${suffix}`;
  const configName = `__test_drive_restore_audit_${suffix}`;

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let tempSrcModuleId = "";
  let tempTgtModuleId = "";
  let configId = "";

  try {
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

    const createRes = await api("/api/sync-configs", {
      method: "POST",
      body: JSON.stringify({
        name: configName,
        sourceModuleId: tempSrcModuleId,
        targetModuleId: tempTgtModuleId,
        fieldMappings: [{ sourceField: "g_src", targetField: "g_tgt" }],
      }),
    });
    const createText = await createRes.text();
    assert.equal(createRes.status, 201, `Config creation failed: ${createRes.status} — ${createText}`);
    ({ id: configId } = JSON.parse(createText) as { id: string });
    createdConfigIds.push(configId);

    const backup = {
      version: "1.0",
      type: "config",
      appVersion: "test",
      syncConfigs: [
        {
          id: configId,
          name: configName,
          sourceModuleId: tempSrcModuleId,
          targetModuleId: tempTgtModuleId,
          fieldMappings: [{ sourceField: "g_src", targetField: "g_tgt" }],
          isEnabled: true,
          autoRetry: false,
          retryDelayMin: 3,
          schedule: null,
        },
      ],
    };

    const delConfigRes = await api(`/api/sync-configs/${configId}`, { method: "DELETE" });
    assert.equal(delConfigRes.status, 200, `Config delete failed: ${delConfigRes.status}`);
    const idx = createdConfigIds.indexOf(configId);
    if (idx !== -1) createdConfigIds.splice(idx, 1);

    await pool.query(`DELETE FROM api_modules WHERE id = $1`, [tempSrcModuleId]);
    tempSrcModuleId = "";

    const restoreText = await (
      await api(`/api/backups/config-restore-from-drive/${TEST_FILE_ID}`, {
        method: "POST",
        body: JSON.stringify({ backup }),
      })
    ).text();
    const restoreBody = JSON.parse(restoreText) as { success: boolean };
    assert.ok(restoreBody.success, `Drive restore must succeed, got: ${restoreText}`);

    // Check audit log: entity="config_restore_from_drive", details.restored.skipped non-empty
    const logsRes = await api("/api/audit-logs?limit=1000");
    assert.equal(logsRes.status, 200, "GET /api/audit-logs must return 200");
    const allLogs = (await logsRes.json()) as Array<{
      action: string;
      entity: string;
      details: Record<string, any>;
    }>;

    const entry = allLogs.find(
      l => l.action === "update" && l.entity === "config_restore_from_drive",
    );
    assert.ok(
      entry !== undefined,
      `Expected an audit log entry with action=update / entity=config_restore_from_drive. ` +
        `Recent update entries: ${JSON.stringify(
          allLogs.filter(l => l.action === "update").slice(0, 5),
        )}`,
    );

    const auditSkipped = entry!.details?.restored?.skipped as unknown[];
    assert.ok(
      Array.isArray(auditSkipped) && auditSkipped.length > 0,
      `Audit log details.restored.skipped must be a non-empty array; got: ${JSON.stringify(entry!.details)}`,
    );
  } finally {
    if (tempSrcModuleId) {
      await pool.query(`DELETE FROM api_modules WHERE id = $1`, [tempSrcModuleId]).catch(() => {});
    }
    if (tempTgtModuleId) {
      await pool.query(`DELETE FROM api_modules WHERE id = $1`, [tempTgtModuleId]).catch(() => {});
    }
    await pool.end();
  }
});
