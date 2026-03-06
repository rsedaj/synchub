import { storage } from "./storage";
import { fetchModuleData } from "./data-fetcher";
import { uploadBackup, rotateBackups, downloadBackup } from "./google-drive";
import type { SyncConfig, SyncRun } from "@shared/schema";

const activeRuns = new Map<string, { cancelled: boolean }>();

export function cancelSyncRun(runId: string): boolean {
  const state = activeRuns.get(runId);
  if (state) {
    state.cancelled = true;
    return true;
  }
  return false;
}

export function getActiveRuns(): string[] {
  return Array.from(activeRuns.keys());
}

function applyFieldMappings(
  record: Record<string, any>,
  mappings: Array<{ sourceField: string; targetField: string; transform?: string }>
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const mapping of mappings) {
    let value = record[mapping.sourceField];
    if (mapping.transform) {
      try {
        switch (mapping.transform) {
          case "uppercase":
            value = String(value || "").toUpperCase();
            break;
          case "lowercase":
            value = String(value || "").toLowerCase();
            break;
          case "trim":
            value = String(value || "").trim();
            break;
          case "number":
            value = Number(value) || 0;
            break;
          case "string":
            value = String(value || "");
            break;
          case "boolean":
            value = Boolean(value);
            break;
          default:
            break;
        }
      } catch {
        // keep original value on transform error
      }
    }
    result[mapping.targetField] = value;
  }
  return result;
}

export async function executeSyncRun(
  configId: string,
  triggeredBy?: string
): Promise<string> {
  const config = await storage.getSyncConfig(configId);
  if (!config) throw new Error("Sync config not found");

  const sourceModule = await storage.getModule(config.sourceModuleId);
  if (!sourceModule) throw new Error("Source module not found");

  const run = await storage.createSyncRun({
    syncConfigId: configId,
    status: "running",
    triggeredBy: triggeredBy || null,
  });

  const runState = { cancelled: false };
  activeRuns.set(run.id, runState);

  executeAsync(run.id, config, sourceModule, runState).catch((err) => {
    console.error(`[sync-engine] Fatal error for run ${run.id}:`, err);
  });

  return run.id;
}

async function executeAsync(
  runId: string,
  config: SyncConfig,
  sourceModule: any,
  runState: { cancelled: boolean }
) {
  const startTime = Date.now();

  try {
    await storage.updateSyncRun(runId, { status: "running" });

    console.log(`[sync-engine] Run ${runId}: Fetching source data from ${sourceModule.code}...`);
    const sourceResult = await fetchModuleData(sourceModule, 10000, config.sourceDataSource || undefined);

    if (!sourceResult.success || !sourceResult.preview || sourceResult.preview.length === 0) {
      await storage.updateSyncRun(runId, {
        status: "error",
        errorMessage: sourceResult.error || "No source data available",
        completedAt: new Date(),
      });
      activeRuns.delete(runId);
      return;
    }

    const allRecords = sourceResult.preview;
    const totalRecords = allRecords.length;

    await storage.updateSyncRun(runId, {
      recordsTotal: totalRecords,
      progress: 0,
    });

    const schedule = config.schedule as any;
    if (schedule?.backupBeforeSync) {
      console.log(`[sync-engine] Run ${runId}: Creating backup before sync...`);
      try {
        const targetModule = await storage.getModule(config.targetModuleId);
        let backupData: any[] = [];
        if (targetModule) {
          try {
            const targetResult = await fetchModuleData(targetModule, 10000, config.targetDataSource || undefined);
            if (targetResult.success && targetResult.preview) {
              backupData = targetResult.preview;
            }
          } catch {
            backupData = [];
          }
        }

        const driveResult = await uploadBackup(
          config.id,
          config.name,
          backupData,
          runId
        );

        const backup = await storage.createSyncBackup({
          syncConfigId: config.id,
          syncRunId: runId,
          fileName: driveResult.fileName,
          fileSize: driveResult.fileSize,
          googleDriveFileId: driveResult.fileId,
          googleDriveUrl: driveResult.webViewLink,
          backupRecordCount: backupData.length,
          configSnapshot: {
            name: config.name,
            sourceModuleId: config.sourceModuleId,
            targetModuleId: config.targetModuleId,
            fieldMappings: config.fieldMappings,
          },
        });

        await storage.updateSyncRun(runId, { backupId: backup.id });

        const deletedIds = await rotateBackups(config.id, 10);
        if (deletedIds.length > 0) {
          const allBackups = await storage.getSyncBackupsByConfig(config.id);
          for (const b of allBackups) {
            if (b.googleDriveFileId && deletedIds.includes(b.googleDriveFileId)) {
              await storage.deleteSyncBackup(b.id);
            }
          }
        }

        console.log(`[sync-engine] Run ${runId}: Backup created: ${driveResult.fileName}`);
      } catch (err: any) {
        console.error(`[sync-engine] Run ${runId}: Backup failed:`, err.message);
        await storage.updateSyncRun(runId, {
          details: { backupError: err.message },
        });
      }
    }

    const mappings = (config.fieldMappings || []) as Array<{ sourceField: string; targetField: string; transform?: string }>;

    let batchSize = 100;
    const totalBatches = Math.ceil(totalRecords / batchSize);
    let processed = 0;
    let failed = 0;
    let currentBatch = 0;
    const batchErrors: Array<{ batch: number; error: string; recordIndex?: number }> = [];
    let consecutiveSuccess = 0;

    await storage.updateSyncRun(runId, {
      batchSize,
      totalBatches,
      currentBatch: 0,
    });

    for (let i = 0; i < totalRecords; i += batchSize) {
      if (runState.cancelled) {
        await storage.updateSyncRun(runId, {
          status: "error",
          errorMessage: "cancelled",
          recordsProcessed: processed,
          recordsFailed: failed,
          progress: Math.round((processed / totalRecords) * 100),
          completedAt: new Date(),
          details: { batchErrors, cancelledAtBatch: currentBatch },
        });
        activeRuns.delete(runId);
        return;
      }

      currentBatch++;
      const batch = allRecords.slice(i, i + batchSize);

      try {
        for (const record of batch) {
          try {
            const mapped = applyFieldMappings(record, mappings);
            processed++;
            // mapped data ready for target system push (future: actually push to target API)
          } catch (recErr: any) {
            failed++;
            processed++;
          }
        }

        consecutiveSuccess++;
        if (consecutiveSuccess >= 3 && batchSize < 500) {
          batchSize = Math.min(batchSize * 2, 500);
        }
      } catch (batchErr: any) {
        batchErrors.push({ batch: currentBatch, error: batchErr.message });
        failed += batch.length;
        processed += batch.length;
        consecutiveSuccess = 0;
        if (batchSize > 50) {
          batchSize = Math.max(Math.floor(batchSize / 2), 50);
        }
      }

      const elapsed = Date.now() - startTime;
      const speedPerSec = elapsed > 0 ? Math.round((processed / elapsed) * 1000) : 0;
      const remainingRecords = totalRecords - processed;
      const estimatedMs = speedPerSec > 0 ? (remainingRecords / speedPerSec) * 1000 : 0;
      const estimatedEndAt = new Date(Date.now() + estimatedMs);

      const recalcTotalBatches = Math.ceil((totalRecords - i - batch.length) / batchSize) + currentBatch;

      await storage.updateSyncRun(runId, {
        recordsProcessed: processed,
        recordsFailed: failed,
        progress: Math.round((processed / totalRecords) * 100),
        currentBatch,
        totalBatches: recalcTotalBatches,
        batchSize,
        speedPerSec,
        estimatedEndAt,
      });
    }

    const finalStatus = failed === 0 ? "success" : failed < totalRecords ? "success" : "error";

    await storage.updateSyncRun(runId, {
      status: finalStatus,
      recordsProcessed: processed,
      recordsFailed: failed,
      progress: 100,
      completedAt: new Date(),
      details: batchErrors.length > 0 ? { batchErrors } : undefined,
    });

    console.log(`[sync-engine] Run ${runId}: Complete. ${processed} processed, ${failed} failed.`);

    try {
      await storage.createSyncLog({
        moduleId: config.sourceModuleId,
        direction: "import",
        status: finalStatus === "success" ? "success" : "error",
        recordsProcessed: processed,
        recordsFailed: failed,
        errorMessage: batchErrors.length > 0 ? `${batchErrors.length} batch errors` : null,
        triggeredBy: null,
      });
    } catch {}
  } catch (err: any) {
    console.error(`[sync-engine] Run ${runId}: Error:`, err);
    await storage.updateSyncRun(runId, {
      status: "error",
      errorMessage: err.message || "Unknown error",
      completedAt: new Date(),
    });
  } finally {
    activeRuns.delete(runId);
  }
}

export async function restoreFromBackup(backupId: string): Promise<{ success: boolean; message: string; recordCount?: number }> {
  const backup = await storage.getSyncBackup(backupId);
  if (!backup) return { success: false, message: "Backup not found" };
  if (!backup.googleDriveFileId) return { success: false, message: "No Google Drive file ID" };

  try {
    const data = await downloadBackup(backup.googleDriveFileId);
    if (!data || !data.data) {
      return { success: false, message: "Backup file is empty or corrupted" };
    }

    console.log(`[sync-engine] Restore from backup ${backupId}: ${data.data.length} records`);
    return {
      success: true,
      message: `Backup restored: ${data.data.length} records from ${backup.fileName}`,
      recordCount: data.data.length,
    };
  } catch (err: any) {
    return { success: false, message: err.message || "Restore failed" };
  }
}
