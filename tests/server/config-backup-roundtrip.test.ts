/**
 * Automated test: config backup -> restore preserves every sync-config setting.
 *
 * Guards the backup/restore contract in server/config-backup.ts (used by
 * POST /api/backups/config-to-drive and
 * POST /api/backups/config-restore-from-drive/:fileId).
 *
 * A previous bug silently dropped settings during restore. This test exports a
 * config with mapSyncConfigForBackup, then runs restoreSyncConfigsFromBackup
 * against an in-memory fake storage and asserts that isEnabled, autoRetry,
 * retryDelayMin and schedule.backupBeforeSync survive a full round trip through
 * BOTH restore branches:
 *   - config already exists -> update
 *   - new config -> create
 *
 * Pure unit test (no live server / DB / Google Drive). Run with:
 *   npx tsx --test tests/server/config-backup-roundtrip.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SyncConfig } from "@shared/schema";
import {
  mapSyncConfigForBackup,
  restoreSyncConfigsFromBackup,
  type RestoreSyncConfigsDeps,
  type RestoreSyncConfigsResult,
} from "../../server/config-backup.ts";

const MODULE_A = "module-a";
const MODULE_B = "module-b";

function makeStoredConfig(overrides: Partial<SyncConfig> = {}): SyncConfig {
  return {
    id: "config-1",
    name: "Promotron -> ONIX",
    targetModuleId: MODULE_B,
    sourceModuleId: MODULE_A,
    targetDataSource: null,
    sourceDataSource: null,
    sourceRecordLimit: 120000,
    fieldMappings: [{ sourceField: "src", targetField: "tgt" }],
    matchFields: [],
    matchOperator: "and",
    matchNormalization: null,
    onMissing: "create",
    targetStock: null,
    sourceFilters: [],
    hKodConfig: null,
    onixFixedFields: null,
    schedule: { enabled: true, frequency: "daily", backupBeforeSync: false },
    notes: null,
    isEnabled: false,
    autoRetry: true,
    retryDelayMin: 17,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as SyncConfig;
}

/**
 * In-memory storage stand-in that records the exact payloads handed to
 * create/update, so the test can inspect what restore would persist.
 */
function makeFakeStorage(existing: Array<Pick<SyncConfig, "id" | "name">>) {
  const created: Array<Record<string, unknown>> = [];
  const updated: Array<{ id: string; data: Record<string, unknown> }> = [];
  const deps: RestoreSyncConfigsDeps = {
    getAllSyncConfigs: async () => existing,
    getAllModules: async () => [{ id: MODULE_A }, { id: MODULE_B }],
    createSyncConfig: async (data) => {
      created.push(data);
      return data;
    },
    updateSyncConfig: async (id, data) => {
      updated.push({ id, data });
      return data;
    },
  };
  return { deps, created, updated };
}

function emptyResults(): RestoreSyncConfigsResult {
  return { syncConfigs: 0, skipped: [], errors: [] };
}

test("update branch: round trip preserves every setting on an existing config", async () => {
  const stored = makeStoredConfig();
  const backupEntry = mapSyncConfigForBackup(stored);

  const { deps, created, updated } = makeFakeStorage([{ id: stored.id, name: stored.name }]);
  const results = emptyResults();

  await restoreSyncConfigsFromBackup([backupEntry], {}, deps, results);

  assert.equal(results.syncConfigs, 1, "one config should be restored");
  assert.equal(created.length, 0, "existing config must NOT be re-created");
  assert.equal(updated.length, 1, "existing config must be updated in place");
  assert.equal(updated[0].id, stored.id);

  const data = updated[0].data;
  assert.equal(data.isEnabled, stored.isEnabled, "isEnabled dropped on restore");
  assert.equal(data.autoRetry, stored.autoRetry, "autoRetry dropped on restore");
  assert.equal(data.retryDelayMin, stored.retryDelayMin, "retryDelayMin dropped on restore");
  assert.deepEqual(data.schedule, stored.schedule, "schedule (with backupBeforeSync) dropped on restore");
  assert.equal(
    (data.schedule as { backupBeforeSync?: boolean }).backupBeforeSync,
    false,
    "schedule.backupBeforeSync not preserved",
  );
});

test("create branch: round trip preserves every setting on a new config", async () => {
  const stored = makeStoredConfig({
    isEnabled: true,
    autoRetry: false,
    retryDelayMin: 9,
    schedule: { enabled: false, frequency: "weekly", backupBeforeSync: true },
  });
  const backupEntry = mapSyncConfigForBackup(stored);

  const { deps, created, updated } = makeFakeStorage([]);
  const results = emptyResults();

  await restoreSyncConfigsFromBackup([backupEntry], {}, deps, results);

  assert.equal(results.syncConfigs, 1, "one config should be restored");
  assert.equal(updated.length, 0, "no existing config means nothing to update");
  assert.equal(created.length, 1, "a new config must be created");

  const data = created[0];
  assert.equal(data.isEnabled, stored.isEnabled, "isEnabled dropped on restore");
  assert.equal(data.autoRetry, stored.autoRetry, "autoRetry dropped on restore");
  assert.equal(data.retryDelayMin, stored.retryDelayMin, "retryDelayMin dropped on restore");
  assert.deepEqual(data.schedule, stored.schedule, "schedule (with backupBeforeSync) dropped on restore");
  assert.equal(
    (data.schedule as { backupBeforeSync?: boolean }).backupBeforeSync,
    true,
    "schedule.backupBeforeSync not preserved",
  );
});

test("create branch: falsy settings are preserved, not replaced by defaults", async () => {
  // isEnabled:false and autoRetry:false are falsy booleans; the restore create
  // branch uses `?? default` so these MUST survive rather than flip to the
  // true/false defaults a `||` would have forced. retryDelayMin is kept at a
  // valid non-default value (1) to prove a provided value is not overwritten by
  // the 3 default (0 is rejected by the canonical schema's min(1) rule).
  const stored = makeStoredConfig({
    isEnabled: false,
    autoRetry: false,
    retryDelayMin: 1,
    schedule: { enabled: false, frequency: "daily", backupBeforeSync: false },
  });
  const backupEntry = mapSyncConfigForBackup(stored);

  const { deps, created } = makeFakeStorage([]);
  const results = emptyResults();

  await restoreSyncConfigsFromBackup([backupEntry], {}, deps, results);

  assert.equal(created.length, 1);
  const data = created[0];
  assert.equal(data.isEnabled, false, "isEnabled=false must not flip to default true");
  assert.equal(data.autoRetry, false, "autoRetry=false preserved");
  assert.equal(data.retryDelayMin, 1, "retryDelayMin=1 must not flip to default 3");
  assert.equal((data.schedule as { backupBeforeSync?: boolean }).backupBeforeSync, false);
});

test("create branch: duplicate mapping targets are rejected, not persisted", async () => {
  // A backup that points two rows at the same target field must be caught by the
  // same refineNoDuplicateMappingTargets check the POST route uses, instead of
  // being written straight to the DB.
  const stored = makeStoredConfig({
    id: "dup-mapping",
    name: "Dup mapping",
    fieldMappings: [
      { sourceField: "a", targetField: "Stav" },
      { sourceField: "b", targetField: "Stav" },
    ],
  });
  const backupEntry = mapSyncConfigForBackup(stored);

  const { deps, created } = makeFakeStorage([]);
  const results = emptyResults();

  await restoreSyncConfigsFromBackup([backupEntry], {}, deps, results);

  assert.equal(created.length, 0, "invalid config must NOT be created");
  assert.equal(results.syncConfigs, 0, "invalid config must not count as restored");
  assert.equal(results.errors.length, 1, "one validation error should be reported");
  assert.match(results.errors[0], /Dup mapping/);
  assert.match(results.errors[0], /Duplicate target fields/);
});

test("update branch: duplicate fixed fields are rejected, not persisted", async () => {
  // The update branch must enforce the same refineNoDuplicateFixedFields rule as
  // the PATCH route, so a backup can't overwrite an existing config with a shape
  // that silently drops fixed-field rows during sync.
  const stored = makeStoredConfig({
    id: "dup-fixed",
    name: "Dup fixed",
    onixFixedFields: [
      { field: "Sklad", value: "1", condition: "always" },
      { field: "Sklad", value: "2", condition: "always" },
    ],
  });
  const backupEntry = {
    ...mapSyncConfigForBackup(stored),
    onixFixedFields: stored.onixFixedFields,
  };

  const { deps, updated } = makeFakeStorage([{ id: stored.id, name: stored.name }]);
  const results = emptyResults();

  await restoreSyncConfigsFromBackup([backupEntry], {}, deps, results);

  assert.equal(updated.length, 0, "invalid config must NOT be updated");
  assert.equal(results.syncConfigs, 0, "invalid config must not count as restored");
  assert.equal(results.errors.length, 1, "one validation error should be reported");
  assert.match(results.errors[0], /Dup fixed/);
  assert.match(results.errors[0], /Duplicate fixed fields/);
});
