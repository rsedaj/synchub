import type { ZodError } from "zod";
import type { SyncConfig, ApiModule } from "@shared/schema";
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

/**
 * Restore the sync-config section of a config backup.
 *
 * Covers both branches:
 *  - an existing config (matched by id or name) is updated in place;
 *  - a new config is created when its source/target modules exist after remap.
 *
 * Used by POST /api/backups/config-restore-from-drive/:fileId. Mutates the
 * passed-in `results` accumulator so the route can keep a single shared result.
 */
export async function restoreSyncConfigsFromBackup(
  importConfigs: any[],
  moduleIdMap: Record<string, string>,
  deps: RestoreSyncConfigsDeps,
  results: RestoreSyncConfigsResult,
): Promise<void> {
  const existingConfigs = await deps.getAllSyncConfigs();
  for (const imp of importConfigs) {
    try {
      const remappedSourceId = moduleIdMap[imp.sourceModuleId] || imp.sourceModuleId;
      const remappedTargetId = moduleIdMap[imp.targetModuleId] || imp.targetModuleId;

      const existing = existingConfigs.find(c => c.id === imp.id || c.name === imp.name);
      if (existing) {
        // Validate against the same canonical schema + duplicate-detection rules
        // the PATCH route uses, so a backup can't write a malformed shape,
        // duplicate fixed fields, or duplicate mapping targets straight to the DB.
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
          continue;
        }
        await deps.updateSyncConfig(existing.id, parsed.data);
        results.syncConfigs++;
      } else {
        const currentModules = await deps.getAllModules();
        const sourceExists = currentModules.find(m => m.id === remappedSourceId);
        const targetExists = currentModules.find(m => m.id === remappedTargetId);
        if (sourceExists && targetExists) {
          // Validate against the same canonical schema + duplicate-detection rules
          // the POST route uses (see comment above).
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
            continue;
          }
          await deps.createSyncConfig(parsed.data);
          results.syncConfigs++;
        } else {
          results.skipped.push(`Sync config "${imp.name}": source or target module not found after ID remap`);
        }
      }
    } catch (e: any) {
      results.errors.push(`Sync config "${imp.name}": ${e.message}`);
    }
  }
}
