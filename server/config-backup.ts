import type { SyncConfig, ApiModule } from "@shared/schema";

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
  createSyncConfig(data: Record<string, unknown>): Promise<unknown>;
  updateSyncConfig(id: string, data: Record<string, unknown>): Promise<unknown>;
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
        await deps.updateSyncConfig(existing.id, {
          name: imp.name,
          sourceModuleId: remappedSourceId,
          targetModuleId: remappedTargetId,
          fieldMappings: imp.fieldMappings,
          schedule: imp.schedule,
          isEnabled: imp.isEnabled,
          autoRetry: imp.autoRetry,
          retryDelayMin: imp.retryDelayMin,
        });
        results.syncConfigs++;
      } else {
        const currentModules = await deps.getAllModules();
        const sourceExists = currentModules.find(m => m.id === remappedSourceId);
        const targetExists = currentModules.find(m => m.id === remappedTargetId);
        if (sourceExists && targetExists) {
          await deps.createSyncConfig({
            name: imp.name,
            sourceModuleId: remappedSourceId,
            targetModuleId: remappedTargetId,
            fieldMappings: imp.fieldMappings,
            schedule: imp.schedule,
            isEnabled: imp.isEnabled ?? true,
            autoRetry: imp.autoRetry ?? false,
            retryDelayMin: imp.retryDelayMin ?? 3,
          });
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
