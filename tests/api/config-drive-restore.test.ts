/**
 * Automated API test: POST /api/backups/config-restore-from-drive/:fileId
 *
 * Tests the real Drive restore route via a dev/test bypass:
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
 *  3. When a multi-config payload contains one valid and one invalid config
 *     (duplicate target fields), the route returns 422 and the valid config's
 *     DB state is unchanged — confirming the validate-first / atomic guarantee.
 *  4. When a backup has BOTH a failing module entry AND a failing syncConfig
 *     entry, the route returns a single 422 and performs no partial writes —
 *     neither the module nor the config DB state is changed.
 *
 * All tests require DATABASE_URL (to create/delete temp modules via SQL) and
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

test("Drive restore returns 422 and leaves valid config unchanged when batch contains an invalid config", async () => {
  // Strategy:
  //  1. Create two temp modules via SQL.
  //  2. Create a valid sync config via API referencing those modules with
  //     fieldMappings [{ sourceField: "orig_src", targetField: "orig_tgt" }].
  //  3. Build a backup with TWO syncConfig entries:
  //       - Entry A (valid update): the existing config with fieldMappings
  //         changed to [{ sourceField: "new_src", targetField: "new_tgt" }].
  //       - Entry B (invalid): a new config with duplicate target fields
  //         [{ sourceField: "x", targetField: "dup" }, { sourceField: "y", targetField: "dup" }].
  //  4. POST backup to /api/backups/config-restore-from-drive/__test__.
  //  5. Assert HTTP 422 (validate-first means nothing was written).
  //  6. Assert the valid config still has the ORIGINAL fieldMappings (unchanged).

  if (!process.env.DATABASE_URL) {
    console.log("SKIP: DATABASE_URL not set — cannot create/delete temp modules via SQL");
    return;
  }

  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const srcCode = `__test_drive_partial_src_${suffix}`;
  const tgtCode = `__test_drive_partial_tgt_${suffix}`;
  const configName = `__test_drive_partial_valid_${suffix}`;
  const invalidConfigName = `__test_drive_partial_invalid_${suffix}`;

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

    // 2. Create a valid sync config via API with the original fieldMappings
    const createRes = await api("/api/sync-configs", {
      method: "POST",
      body: JSON.stringify({
        name: configName,
        sourceModuleId: tempSrcModuleId,
        targetModuleId: tempTgtModuleId,
        fieldMappings: [{ sourceField: "orig_src", targetField: "orig_tgt" }],
      }),
    });
    const createText = await createRes.text();
    assert.equal(createRes.status, 201, `Config creation failed: ${createRes.status} — ${createText}`);
    ({ id: configId } = JSON.parse(createText) as { id: string });
    createdConfigIds.push(configId);

    // 3. Build a backup with one valid and one invalid syncConfig entry
    const backup = {
      version: "1.0",
      type: "config",
      appVersion: "test",
      syncConfigs: [
        // Entry A — valid update: same name/id, different (valid) fieldMappings
        {
          id: configId,
          name: configName,
          sourceModuleId: tempSrcModuleId,
          targetModuleId: tempTgtModuleId,
          fieldMappings: [{ sourceField: "new_src", targetField: "new_tgt" }],
          isEnabled: true,
          autoRetry: false,
          retryDelayMin: 3,
          schedule: null,
        },
        // Entry B — invalid: duplicate target fields (both map to "dup").
        // Use a fixed UUID that won't match any existing config.
        {
          id: "00000000-dead-beef-cafe-000000000002",
          name: invalidConfigName,
          sourceModuleId: tempSrcModuleId,
          targetModuleId: tempTgtModuleId,
          fieldMappings: [
            { sourceField: "x", targetField: "dup" },
            { sourceField: "y", targetField: "dup" },
          ],
          isEnabled: true,
          autoRetry: false,
          retryDelayMin: 3,
          schedule: null,
        },
      ],
    };

    // 4. POST to the real Drive restore route via the dev/test bypass
    const restoreRes = await api(`/api/backups/config-restore-from-drive/${TEST_FILE_ID}`, {
      method: "POST",
      body: JSON.stringify({ backup }),
    });
    const restoreText = await restoreRes.text();

    // 5. Assert 422 — validation failed, nothing written
    assert.equal(
      restoreRes.status,
      422,
      `Expected 422 from Drive restore route when batch contains an invalid config, got ${restoreRes.status}: ${restoreText}`,
    );
    const restoreBody = JSON.parse(restoreText) as {
      message: string;
      results: { syncConfigs: number; skipped: string[]; errors: string[] };
    };
    assert.ok(
      restoreBody.results.errors.length > 0,
      `results.errors must be non-empty; got: ${JSON.stringify(restoreBody.results)}`,
    );
    assert.equal(
      restoreBody.results.syncConfigs,
      0,
      `results.syncConfigs must be 0 (no writes); got: ${restoreBody.results.syncConfigs}`,
    );

    // 6. Assert the valid config still has the ORIGINAL fieldMappings
    const listRes = await api("/api/sync-configs");
    assert.equal(listRes.status, 200, "GET /api/sync-configs must return 200");
    const configs = (await listRes.json()) as Array<{
      id: string;
      fieldMappings: Array<{ sourceField: string; targetField: string }>;
    }>;
    const liveConfig = configs.find(c => c.id === configId);
    assert.ok(liveConfig, `Config ${configId} must still exist`);
    assert.deepEqual(
      liveConfig!.fieldMappings,
      [{ sourceField: "orig_src", targetField: "orig_tgt" }],
      `Config fieldMappings must be unchanged (validate-first guarantee); got: ${JSON.stringify(liveConfig!.fieldMappings)}`,
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

test("Drive restore returns 422 and leaves valid module unchanged when batch contains an invalid module (empty name)", async () => {
  // Confirms the validate-first guarantee for the modules section:
  // when one module entry has an empty name, Phase 1 adds it to results.errors,
  // Phase 2 writes nothing, and the 422 guard fires — so the valid module's
  // name in the DB remains unchanged.

  if (!process.env.DATABASE_URL) {
    console.log("SKIP: DATABASE_URL not set — cannot introspect module state via SQL");
    return;
  }

  // 1. Fetch two real modules that exist in the system
  const modulesRes = await api("/api/modules");
  assert.equal(modulesRes.status, 200, "GET /api/modules must return 200");
  const modules = (await modulesRes.json()) as Array<{ id: string; code: string; name: string }>;
  assert.ok(modules.length >= 2, `Need at least 2 modules, found ${modules.length}`);
  const modA = modules[0];
  const modB = modules[1];

  const originalNameA = modA.name;

  // 2. Build backup: module A is valid (name = updated), module B is invalid (name = "")
  const updatedNameA = `__drive_test_updated_${Date.now()}`;
  const backup = {
    version: "1.0",
    type: "config",
    appVersion: "test",
    modules: [
      {
        id: modA.id,
        code: modA.code,
        name: updatedNameA,    // valid — would be applied if not for the 422
        status: "disconnected",
        sortOrder: 999,
        config: {},
        dataFields: [],
      },
      {
        id: modB.id,
        code: modB.code,
        name: "",              // INVALID — triggers Phase 1 error
        status: "disconnected",
        sortOrder: 999,
        config: {},
        dataFields: [],
      },
    ],
  };

  // 3. POST to the real Drive restore route using the dev/test bypass
  const restoreRes = await api(`/api/backups/config-restore-from-drive/${TEST_FILE_ID}`, {
    method: "POST",
    body: JSON.stringify({ backup }),
  });
  const restoreText = await restoreRes.text();
  assert.equal(
    restoreRes.status,
    422,
    `Expected 422 when module batch has an invalid entry, got ${restoreRes.status}: ${restoreText}`,
  );
  const restoreBody = JSON.parse(restoreText) as {
    results: { modules: number; errors: string[] };
  };
  assert.ok(
    restoreBody.results.errors.length > 0,
    `results.errors must be non-empty; got: ${JSON.stringify(restoreBody.results)}`,
  );
  assert.equal(
    restoreBody.results.modules,
    0,
    `results.modules must be 0 — validate-first guarantees no writes; got: ${restoreBody.results.modules}`,
  );

  // 4. Assert module A's name was NOT changed (validate-first held)
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const row = await pool.query(`SELECT name FROM api_modules WHERE id = $1`, [modA.id]);
    assert.equal(row.rows.length, 1, `Module ${modA.id} must still exist in the DB`);
    assert.equal(
      row.rows[0].name,
      originalNameA,
      `Module A name must be unchanged ("${originalNameA}"), got: "${row.rows[0].name}"`,
    );
  } finally {
    await pool.end();
  }
});

test("Drive restore with mixed module and config errors returns 422 and no partial writes", async () => {
  // Strategy:
  //  1. Create two temp modules (src + tgt) via SQL.
  //  2. Create a valid sync config referencing those modules.
  //  3. Build a backup with:
  //       - A modules section containing one entry for the src module but with
  //         name="" — triggers the explicit Phase 1 validation guard in routes.ts
  //         ("name must be a non-empty string") so no DB write is attempted for
  //         the module at all.
  //       - A syncConfigs section containing an invalid config (duplicate target
  //         fields) — would also 422 if the modules guard didn't fire first.
  //  4. POST backup to /api/backups/config-restore-from-drive/__test__.
  //  5. Assert HTTP 422 — modules Phase 1 guard fires, syncConfig section is
  //     never reached (single error path, no partial writes).
  //  6. Assert the src module still has its original name/status (no write attempted).
  //  7. Assert the valid sync config still has its ORIGINAL fieldMappings (not touched).

  if (!process.env.DATABASE_URL) {
    console.log("SKIP: DATABASE_URL not set — cannot create/delete temp modules via SQL");
    return;
  }

  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const srcCode = `__test_mixed_src_${suffix}`;
  const tgtCode = `__test_mixed_tgt_${suffix}`;
  const configName = `__test_mixed_config_${suffix}`;
  const originalModuleName = `orig_name_${suffix}`;

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let tempSrcModuleId = "";
  let tempTgtModuleId = "";
  let configId = "";

  try {
    // 1. Create two temp modules via SQL
    const srcResult = await pool.query(
      `INSERT INTO api_modules (code, name, status, sort_order, is_active, config, data_fields)
       VALUES ($1, $2, 'disconnected', 999, true, '{}', '[]')
       RETURNING id`,
      [srcCode, originalModuleName],
    );
    tempSrcModuleId = srcResult.rows[0].id;

    const tgtResult = await pool.query(
      `INSERT INTO api_modules (code, name, status, sort_order, is_active, config, data_fields)
       VALUES ($1, $1, 'disconnected', 999, true, '{}', '[]')
       RETURNING id`,
      [tgtCode],
    );
    tempTgtModuleId = tgtResult.rows[0].id;

    // 2. Create a valid sync config via API
    const createRes = await api("/api/sync-configs", {
      method: "POST",
      body: JSON.stringify({
        name: configName,
        sourceModuleId: tempSrcModuleId,
        targetModuleId: tempTgtModuleId,
        fieldMappings: [{ sourceField: "orig_src", targetField: "orig_tgt" }],
      }),
    });
    const createText = await createRes.text();
    assert.equal(createRes.status, 201, `Config creation failed: ${createRes.status} — ${createText}`);
    ({ id: configId } = JSON.parse(createText) as { id: string });
    createdConfigIds.push(configId);

    // 3. Build a backup with a failing module entry AND a failing syncConfig entry.
    //    The module entry has name="" which triggers the Phase 1 validation guard
    //    (routes.ts: "name must be a non-empty string") — no DB write is attempted.
    //    The syncConfig entry has duplicate target fields (would 422 if reached).
    const backup = {
      version: "1.0",
      type: "config",
      appVersion: "test",
      modules: [
        {
          id: tempSrcModuleId,
          code: srcCode,
          name: "",               // INVALID — triggers Phase 1 modules 422 guard
          description: null,
          baseUrl: null,
          status: "disconnected", // valid status; error is name-only
          config: {},
          dataFields: [],
          docsUrl: null,
          sortOrder: 999,
        },
      ],
      syncConfigs: [
        {
          id: "00000000-dead-beef-cafe-000000000099",
          name: `__test_mixed_invalid_${suffix}`,
          sourceModuleId: tempSrcModuleId,
          targetModuleId: tempTgtModuleId,
          fieldMappings: [
            { sourceField: "x", targetField: "dup" },
            { sourceField: "y", targetField: "dup" },
          ],
          isEnabled: true,
          autoRetry: false,
          retryDelayMin: 3,
          schedule: null,
        },
      ],
    };

    // 4. POST to the real Drive restore route via the dev/test bypass
    const restoreRes = await api(`/api/backups/config-restore-from-drive/${TEST_FILE_ID}`, {
      method: "POST",
      body: JSON.stringify({ backup }),
    });
    const restoreText = await restoreRes.text();

    // 5. Assert 422 — module error must halt processing before configs are touched
    assert.equal(
      restoreRes.status,
      422,
      `Expected 422 when backup has both module and config errors, got ${restoreRes.status}: ${restoreText}`,
    );
    const restoreBody = JSON.parse(restoreText) as {
      message: string;
      results: { modules: number; syncConfigs: number; errors: string[] };
    };
    assert.ok(
      restoreBody.results.errors.length > 0,
      `results.errors must be non-empty; got: ${JSON.stringify(restoreBody.results)}`,
    );
    assert.equal(
      restoreBody.results.modules,
      0,
      `results.modules must be 0 (failed module was not written); got: ${restoreBody.results.modules}`,
    );
    assert.equal(
      restoreBody.results.syncConfigs,
      0,
      `results.syncConfigs must be 0 (processing halted before configs); got: ${restoreBody.results.syncConfigs}`,
    );

    // 6. Assert the module still has its ORIGINAL name and status (no partial write)
    const modRow = await pool.query(
      `SELECT name, status FROM api_modules WHERE id = $1`,
      [tempSrcModuleId],
    );
    assert.equal(modRow.rows.length, 1, "Module must still exist");
    assert.equal(
      modRow.rows[0].name,
      originalModuleName,
      `Module name must be unchanged; got: ${modRow.rows[0].name}`,
    );
    assert.equal(
      modRow.rows[0].status,
      "disconnected",
      `Module status must be unchanged; got: ${modRow.rows[0].status}`,
    );

    // 7. Assert the sync config still has its ORIGINAL fieldMappings (not touched)
    const listRes = await api("/api/sync-configs");
    assert.equal(listRes.status, 200, "GET /api/sync-configs must return 200");
    const configs = (await listRes.json()) as Array<{
      id: string;
      fieldMappings: Array<{ sourceField: string; targetField: string }>;
    }>;
    const liveConfig = configs.find(c => c.id === configId);
    assert.ok(liveConfig, `Config ${configId} must still exist`);
    assert.deepEqual(
      liveConfig!.fieldMappings,
      [{ sourceField: "orig_src", targetField: "orig_tgt" }],
      `Config fieldMappings must be unchanged (halted before syncConfigs); got: ${JSON.stringify(liveConfig!.fieldMappings)}`,
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

test("Drive restore Phase 2 is atomic: a storage error mid-batch rolls back earlier writes", async () => {
  // Strategy:
  //  1. Create two temp modules (M1, M2) via SQL.
  //  2. Create two sync configs (A and B) via API, both referencing M1/M2.
  //  3. Build a backup with TWO syncConfig entries that both match existing
  //     configs (UPDATE path in Phase 1 — Zod-only validation, no FK check):
  //       - Config A (first): valid update, changes fieldMappings to
  //         "tx_a_src" / "tx_a_tgt".  Phase 2 writes this first (succeeds).
  //       - Config B (second): update that sets sourceModuleId to a
  //         non-existent UUID "00000000-0000-0000-0000-000000000000".
  //         Passes Zod (.string().min(1)), but triggers a FK constraint
  //         violation in Phase 2 when Drizzle tries to commit.
  //  4. POST backup → Phase 2 writes A then fails on B → transaction rolls
  //     back → route returns 422 with a storage error in results.errors.
  //  5. Assert HTTP 422.
  //  6. Assert config A still has its ORIGINAL fieldMappings (not "tx_a_*"),
  //     confirming the rollback covered config A's write.

  if (!process.env.DATABASE_URL) {
    console.log("SKIP: DATABASE_URL not set — cannot create/delete temp modules via SQL");
    return;
  }

  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const srcCode = `__test_tx_src_${suffix}`;
  const tgtCode = `__test_tx_tgt_${suffix}`;
  const configAName = `__test_tx_config_a_${suffix}`;
  const configBName = `__test_tx_config_b_${suffix}`;

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let tempSrcModuleId = "";
  let tempTgtModuleId = "";
  let configAId = "";
  let configBId = "";

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

    // 2. Create config A via API — will be updated in the restore batch
    const createARes = await api("/api/sync-configs", {
      method: "POST",
      body: JSON.stringify({
        name: configAName,
        sourceModuleId: tempSrcModuleId,
        targetModuleId: tempTgtModuleId,
        fieldMappings: [{ sourceField: "orig_a_src", targetField: "orig_a_tgt" }],
      }),
    });
    const createAText = await createARes.text();
    assert.equal(createARes.status, 201, `Config A creation failed: ${createARes.status} — ${createAText}`);
    ({ id: configAId } = JSON.parse(createAText) as { id: string });
    createdConfigIds.push(configAId);

    // 2b. Create config B via API — also updated in the restore batch (will fail)
    const createBRes = await api("/api/sync-configs", {
      method: "POST",
      body: JSON.stringify({
        name: configBName,
        sourceModuleId: tempSrcModuleId,
        targetModuleId: tempTgtModuleId,
        fieldMappings: [{ sourceField: "orig_b_src", targetField: "orig_b_tgt" }],
      }),
    });
    const createBText = await createBRes.text();
    assert.equal(createBRes.status, 201, `Config B creation failed: ${createBRes.status} — ${createBText}`);
    ({ id: configBId } = JSON.parse(createBText) as { id: string });
    createdConfigIds.push(configBId);

    // 3. Build backup:
    //    - Config A: valid update (new fieldMappings, same real modules) — writes first in Phase 2
    //    - Config B: update with a non-existent sourceModuleId (FK violation in Phase 2)
    const backup = {
      version: "1.0",
      type: "config",
      appVersion: "test",
      syncConfigs: [
        {
          id: configAId,
          name: configAName,
          sourceModuleId: tempSrcModuleId,
          targetModuleId: tempTgtModuleId,
          fieldMappings: [{ sourceField: "tx_a_src", targetField: "tx_a_tgt" }],
          isEnabled: true,
          autoRetry: false,
          retryDelayMin: 3,
          schedule: null,
        },
        {
          id: configBId,
          name: configBName,
          // Non-existent module ID: passes Zod (.string().min(1)) but triggers
          // a FK constraint violation in the DB during Phase 2.
          sourceModuleId: "00000000-0000-0000-0000-000000000000",
          targetModuleId: tempTgtModuleId,
          fieldMappings: [{ sourceField: "tx_b_src", targetField: "tx_b_tgt" }],
          isEnabled: true,
          autoRetry: false,
          retryDelayMin: 3,
          schedule: null,
        },
      ],
    };

    // 4. POST to the Drive restore route (dev/test bypass)
    const restoreRes = await api(`/api/backups/config-restore-from-drive/${TEST_FILE_ID}`, {
      method: "POST",
      body: JSON.stringify({ backup }),
    });
    const restoreText = await restoreRes.text();

    // 5. Route must return 422 (storage error bubbled up via results.errors)
    assert.equal(
      restoreRes.status,
      422,
      `Expected 422 from Drive restore route when Phase 2 storage error occurs; got ${restoreRes.status}: ${restoreText}`,
    );
    const restoreBody = JSON.parse(restoreText) as {
      results: { errors: string[] };
    };
    assert.ok(
      restoreBody.results.errors.length > 0,
      `results.errors must be non-empty after Phase 2 storage error; got: ${JSON.stringify(restoreBody.results)}`,
    );

    // 6. Config A must still have its ORIGINAL fieldMappings — the transaction
    //    rolled back config A's write even though it executed first in Phase 2.
    const listRes = await api("/api/sync-configs");
    assert.equal(listRes.status, 200, "GET /api/sync-configs must return 200");
    const configs = (await listRes.json()) as Array<{
      id: string;
      fieldMappings: Array<{ sourceField: string; targetField: string }>;
    }>;
    const liveConfigA = configs.find(c => c.id === configAId);
    assert.ok(liveConfigA, `Config A (${configAId}) must still exist after failed restore`);
    assert.deepEqual(
      liveConfigA!.fieldMappings,
      [{ sourceField: "orig_a_src", targetField: "orig_a_tgt" }],
      `Config A fieldMappings must be UNCHANGED (transaction rolled back config A's write); ` +
        `got: ${JSON.stringify(liveConfigA!.fieldMappings)}`,
    );
  } finally {
    if (tempSrcModuleId) {
      await pool.query(`DELETE FROM sync_configs WHERE source_module_id = $1 OR target_module_id = $1`, [tempSrcModuleId]).catch(() => {});
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

test("Drive restore users section: validate-first prevents partial writes when a user entry has an invalid role", async () => {
  // Strategy:
  //  Both existing users are referenced in the backup. User X (first in the
  //  array) has a valid update — under the old per-entry approach this write
  //  would be committed before user Y is processed. User Y (second) has an
  //  invalid role value that passes z.string() but fails the Phase 1
  //  role-enum guard. With validate-first: Phase 1 processes ALL entries
  //  first, catches Y's invalid role, and blocks Phase 2 entirely —
  //  user X is NOT written. The route returns 422 and user X's DB state is
  //  unchanged.
  //
  //  This guards against a regression where validate-first in the users loop
  //  is dropped (reverting to per-entry try/catch), which would allow partial
  //  writes when the valid user is processed before the invalid one.

  if (!process.env.DATABASE_URL) {
    console.log("SKIP: DATABASE_URL not set — cannot create a temp operator user via API");
    return;
  }

  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const operatorUsername = `__test_op_${suffix}`;
  const originalFullName = `Original_${suffix}`;
  let operatorUserId = "";

  try {
    // 1. Create a temporary operator user via the admin API.
    //    This user will be user X — the one written first under a per-entry approach.
    const createRes = await api("/api/users", {
      method: "POST",
      body: JSON.stringify({
        username: operatorUsername,
        password: "TestPass123!",
        fullName: originalFullName,
        role: "operator",
      }),
    });
    const createText = await createRes.text();
    assert.equal(
      createRes.status,
      200,
      `Create operator user failed: ${createRes.status} — ${createText}`,
    );
    const newUser = JSON.parse(createText) as { id: string };
    operatorUserId = newUser.id;

    // 2. Build backup with users array:
    //    - Operator user (first in array): valid update — would succeed alone.
    //    - Admin user (second in array): invalid role "__invalid_role__"
    //      → caught by Phase 1 role-enum validation before any writes.
    //    Ordering is intentional: operator FIRST so that a per-entry approach
    //    would commit it before the admin's invalid role is discovered.
    const backup = {
      version: "1.0",
      type: "config",
      appVersion: "test",
      users: [
        {
          username: operatorUsername,
          fullName: "SHOULD_NOT_BE_WRITTEN",
          email: null,
          role: "operator",
          isActive: true,
        },
        {
          username: USERNAME,
          fullName: "Any Name",
          email: null,
          role: "__invalid_role__",
          isActive: true,
        },
      ],
    };

    // 3. POST restore → Phase 1 catches admin's invalid role → 422, no writes.
    const restoreRes = await api(`/api/backups/config-restore-from-drive/${TEST_FILE_ID}`, {
      method: "POST",
      body: JSON.stringify({ backup }),
    });
    const restoreText = await restoreRes.text();
    assert.equal(
      restoreRes.status,
      422,
      `Expected 422 when users section has an invalid role, got ${restoreRes.status}: ${restoreText}`,
    );
    const restoreBody = JSON.parse(restoreText) as {
      message: string;
      results: { errors: string[] };
    };
    assert.ok(
      Array.isArray(restoreBody.results?.errors) && restoreBody.results.errors.length > 0,
      `422 response must include at least one error in results.errors; got: ${restoreText}`,
    );
    assert.ok(
      restoreBody.results.errors.some(e => /invalid role/i.test(e)),
      `Error message must mention "invalid role"; got: ${JSON.stringify(restoreBody.results.errors)}`,
    );

    // 4. Assert operator user's fullName is UNCHANGED — validate-first prevented
    //    the write even though the operator entry itself was valid.
    const usersRes = await api("/api/users");
    assert.equal(usersRes.status, 200, "GET /api/users must return 200");
    const allUsers = (await usersRes.json()) as Array<{
      id: string;
      username: string;
      fullName: string;
    }>;
    const liveOperator = allUsers.find(u => u.id === operatorUserId);
    assert.ok(
      liveOperator !== undefined,
      `Operator user (${operatorUserId}) must still exist after failed restore`,
    );
    assert.equal(
      liveOperator!.fullName,
      originalFullName,
      `Operator fullName must be UNCHANGED — validate-first blocked the write; ` +
        `got: "${liveOperator!.fullName}", expected: "${originalFullName}"`,
    );
  } finally {
    if (operatorUserId) {
      await api(`/api/users/${operatorUserId}`, { method: "DELETE" }).catch(() => {});
    }
  }
});
