import type { ZodError } from "zod";
import type { SyncConfig, ApiModule } from "@shared/schema";
import { syncConfigs } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  createSyncConfigSchema,
  updateSyncConfigSchema,
  type CreateSyncConfigInput,
  type UpdateSyncConfigInput,
} from "./sync-config-validation";

// Flatten a Zod validation error into a single human-readable line for the
// restore results, e.g. `fieldMappings: Duplicate target fields ...`.
function formatValidationError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

/**
 * Shape of a single sync-config entry inside a Google Drive config backup.
 *
 * IMPORTANT: every field here is part of the backup/restore contract. Removing
 * one (e.g. isEnabled, autoRetry, retryDelayMin or schedule, which carries
 * backupBeforeSync) silently drops that setting on the next restore. The
 * round-trip test in tests/server/config-backup-roundtrip.test.ts guards this.
 */
export interface SyncConfigBackupEntry {
  id: string;
  name: string;
  sourceModuleId: string;
  targetModuleId: string;
  fieldMappings: SyncConfig["fieldMappings"];
  schedule: SyncConfig["schedule"];
  isEnabled: boolean;
  autoRetry: boolean;
  retryDelayMin: number;
}

/**
 * Project a stored sync config into the subset persisted in a config backup.
 * Used by POST /api/backups/config-to-drive.
 */
export function mapSyncConfigForBackup(c: SyncConfig): SyncConfigBackupEntry {
  return {
    id: c.id,
    name: c.name,
    sourceModuleId: c.sourceModuleId,
    targetModuleId: c.targetModuleId,
    fieldMappings: c.fieldMappings,
    schedule: c.schedule,
    isEnabled: c.isEnabled,
    autoRetry: c.autoRetry,
    retryDelayMin: c.retryDelayMin,
  };
}

export interface RestoreSyncConfigsDeps {
  getAllSyncConfigs(): Promise<Pick<SyncConfig, "id" | "name">[]>;
  getAllModules(): Promise<Pick<ApiModule, "id">[]>;
  createSyncConfig(data: CreateSyncConfigInput): Promise<unknown>;
  updateSyncConfig(id: string, data: UpdateSyncConfigInput): Promise<unknown>;
}

export interface RestoreSyncConfigsResult {
  syncConfigs: number;
  skipped: string[];
  errors: string[];
}

type PendingOp =
  | { type: "update"; id: string; data: UpdateSyncConfigInput }
  | { type: "create"; data: CreateSyncConfigInput }
  | { type: "skip" };

/**
 * A minimal duck-typed interface for the Drizzle db (or transaction) object so
 * that config-backup.ts is not tightly coupled to the specific driver type.
 * When `txDb` is provided to `restoreSyncConfigsFromBackup`, Phase 2 executes
 * all writes inside a single DB transaction — any storage error mid-batch rolls
 * back earlier writes in the same batch, preserving atomicity.
 */
export interface TransactionRunner {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
}

/**
 * Restore the sync-config section of a config backup.
 *
 * Covers both branches:
 *  - an existing config (matched by id or name) is updated in place;
 *  - a new config is created when its source/target modules exist after remap.
 *
 * Uses a two-phase validate-then-write strategy: Phase 1 validates every
 * config and collects the pending operations without touching the DB; Phase 2
 * executes all writes only when no validation errors were found. This prevents
 * partial restores where an early-batch config is written before a later config
 * fails — a 422 response now truly means "nothing was changed".
 *
 * When `txDb` is provided (production routes), Phase 2 wraps all writes in a
 * DB transaction: a storage error on write N automatically rolls back writes
 * 1..N-1, maintaining atomicity even against unexpected DB-level failures.
 *
 * When `txDb` is omitted (unit tests using mock deps), Phase 2 falls back to
 * calling `deps.createSyncConfig` / `deps.updateSyncConfig` directly without a
 * transaction wrapper — this keeps the offline test suite DB-agnostic.
 *
 * Used by POST /api/config-snapshots/:id/restore and
 * POST /api/backups/config-restore-from-drive/:fileId. Mutates the passed-in
 * `results` accumulator so the route can keep a single shared result.
 */
export async function restoreSyncConfigsFromBackup(
  importConfigs: any[],
  moduleIdMap: Record<string, string>,
  deps: RestoreSyncConfigsDeps,
  results: RestoreSyncConfigsResult,
  txDb?: TransactionRunner,
): Promise<void> {
  const existingConfigs = await deps.getAllSyncConfigs();
  const currentModules = await deps.getAllModules();

  // ── Phase 1: Validate all configs, collect pending operations ──────────────
  // No DB writes happen here. Any validation error aborts the entire batch.
  const pending: PendingOp[] = [];

  for (const imp of importConfigs) {
    try {
      const remappedSourceId = moduleIdMap[imp.sourceModuleId] || imp.sourceModuleId;
      const remappedTargetId = moduleIdMap[imp.targetModuleId] || imp.targetModuleId;

      const existing = existingConfigs.find(c => c.id === imp.id || c.name === imp.name);
      if (existing) {
        const parsed = updateSyncConfigSchema.safeParse({
          name: imp.name,
          sourceModuleId: remappedSourceId,
          targetModuleId: remappedTargetId,
          fieldMappings: imp.fieldMappings,
          onixFixedFields: imp.onixFixedFields,
          schedule: imp.schedule,
          isEnabled: imp.isEnabled,
          autoRetry: imp.autoRetry,
          retryDelayMin: imp.retryDelayMin,
        });
        if (!parsed.success) {
          results.errors.push(`Sync config "${imp.name}": ${formatValidationError(parsed.error)}`);
          pending.push({ type: "skip" });
          continue;
        }
        pending.push({ type: "update", id: existing.id, data: parsed.data });
      } else {
        const sourceExists = currentModules.find(m => m.id === remappedSourceId);
        const targetExists = currentModules.find(m => m.id === remappedTargetId);
        if (sourceExists && targetExists) {
          const parsed = createSyncConfigSchema.safeParse({
            name: imp.name,
            sourceModuleId: remappedSourceId,
            targetModuleId: remappedTargetId,
            fieldMappings: imp.fieldMappings,
            onixFixedFields: imp.onixFixedFields,
            schedule: imp.schedule,
            isEnabled: imp.isEnabled ?? true,
            autoRetry: imp.autoRetry ?? false,
            retryDelayMin: imp.retryDelayMin ?? 3,
          });
          if (!parsed.success) {
            results.errors.push(`Sync config "${imp.name}": ${formatValidationError(parsed.error)}`);
            pending.push({ type: "skip" });
            continue;
          }
          pending.push({ type: "create", data: parsed.data });
        } else {
          results.skipped.push(`Sync config "${imp.name}": source or target module not found after ID remap`);
          pending.push({ type: "skip" });
        }
      }
    } catch (e: any) {
      results.errors.push(`Sync config "${imp.name}": ${e.message}`);
      pending.push({ type: "skip" });
    }
  }

  // ── Phase 2: Write only when every config passed validation ────────────────
  // Any validation error in Phase 1 leaves results.errors non-empty, which
  // causes the route to return 422 — and since we haven't written anything yet,
  // the database is guaranteed to be unchanged.
  if (results.errors.length > 0) {
    return;
  }

  if (txDb) {
    // Transaction path (production): all writes committed atomically.
    // A storage error on write N (e.g. FK constraint violation) causes Drizzle
    // to roll back the entire transaction, leaving configs 1..N-1 unchanged.
    try {
      await txDb.transaction(async (tx: any) => {
        for (const op of pending) {
          if (op.type === "update") {
            await tx
              .update(syncConfigs)
              .set({ ...op.data, updatedAt: new Date() })
              .where(eq(syncConfigs.id, op.id));
            results.syncConfigs++;
          } else if (op.type === "create") {
            await tx.insert(syncConfigs).values(op.data);
            results.syncConfigs++;
          }
          // "skip" ops are already recorded in results.skipped during Phase 1
        }
      });
    } catch (e: any) {
      results.errors.push(`Storage error during sync-config write (all changes rolled back): ${e.message}`);
    }
  } else {
    // No-transaction path: used by unit tests with mock deps so the offline
    // test suite remains DB-agnostic.
    for (const op of pending) {
      if (op.type === "update") {
        await deps.updateSyncConfig(op.id, op.data);
        results.syncConfigs++;
      } else if (op.type === "create") {
        await deps.createSyncConfig(op.data);
        results.syncConfigs++;
      }
      // "skip" ops are already recorded in results.skipped during Phase 1
    }
  }
}
