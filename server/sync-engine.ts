import { storage } from "./storage";
import { fetchModuleData } from "./data-fetcher";
import { uploadBackup, rotateBackups, downloadBackup } from "./google-drive";
import { pushToTarget } from "./target-push";
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
          case "uppercase": value = String(value || "").toUpperCase(); break;
          case "lowercase": value = String(value || "").toLowerCase(); break;
          case "trim": value = String(value || "").trim(); break;
          case "number": value = Number(value) || 0; break;
          case "string": value = String(value || ""); break;
          case "boolean": value = Boolean(value); break;
        }
      } catch { }
    }
    result[mapping.targetField] = value;
  }
  return result;
}

async function updatePhase(runId: string, phase: string, extra?: Partial<SyncRun>) {
  const update: any = { details: { phase }, ...extra };
  await storage.updateSyncRun(runId, update);
}

export async function executeSyncRun(
  configId: string,
  triggeredBy?: string
): Promise<string> {
  const config = await storage.getSyncConfig(configId);
  if (!config) throw new Error("Sync config not found");

  const sourceModule = await storage.getModule(config.sourceModuleId);
  if (!sourceModule) throw new Error("Source module not found");

  const targetModule = await storage.getModule(config.targetModuleId);
  if (!targetModule) throw new Error("Target module not found");

  const run = await storage.createSyncRun({
    syncConfigId: configId,
    status: "running",
    triggeredBy: triggeredBy || null,
  });

  const runState = { cancelled: false };
  activeRuns.set(run.id, runState);

  executeAsync(run.id, config, sourceModule, targetModule, runState).catch((err) => {
    console.error(`[sync-engine] Fatal error for run ${run.id}:`, err);
    storage.updateSyncRun(run.id, {
      status: "error",
      errorMessage: err.message || "Fatal error",
      completedAt: new Date(),
      details: { phase: "error" },
    }).catch(() => {});
    activeRuns.delete(run.id);
  });

  return run.id;
}

async function executeAsync(
  runId: string,
  config: SyncConfig,
  sourceModule: any,
  targetModule: any,
  runState: { cancelled: boolean }
) {
  const startTime = Date.now();
  const log = (msg: string) => console.log(`[sync-engine] [${runId.slice(0, 8)}] ${msg}`);

  try {
    log("=== PHASE 1/4: PREFLIGHT ===");
    await updatePhase(runId, "preflight");

    const mappings = (config.fieldMappings || []) as Array<{ sourceField: string; targetField: string; transform?: string }>;
    if (mappings.length === 0) {
      await storage.updateSyncRun(runId, {
        status: "error",
        errorMessage: "No field mappings configured",
        completedAt: new Date(),
        details: { phase: "error" },
      });
      activeRuns.delete(runId);
      return;
    }

    log(`Source: ${sourceModule.code}, Target: ${targetModule.code}, Mappings: ${mappings.length}`);

    if (runState.cancelled) return await markCancelled(runId, 0, 0, 0);

    const schedule = config.schedule as any;
    const doBackup = schedule?.backupBeforeSync !== false;

    if (doBackup) {
      log("=== PHASE 2/4: BACKUP ===");
      await updatePhase(runId, "backup");

      try {
        let backupData: any[] = [];
        try {
          const targetResult = await fetchModuleData(targetModule, 10000, config.targetDataSource || undefined);
          if (targetResult.success && targetResult.preview) {
            backupData = targetResult.preview;
          }
        } catch (err: any) {
          log(`Warning: Could not fetch target data for backup: ${err.message}`);
        }

        const driveResult = await uploadBackup(config.id, config.name, backupData, runId);

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

        log(`Backup created: ${driveResult.fileName} (${backupData.length} records, ${driveResult.fileSize} bytes)`);
      } catch (err: any) {
        log(`BACKUP FAILED: ${err.message}`);
        await storage.updateSyncRun(runId, {
          status: "error",
          errorMessage: `Backup failed: ${err.message}`,
          completedAt: new Date(),
          details: { phase: "error", backupError: err.message },
        });
        activeRuns.delete(runId);
        return;
      }
    } else {
      log("Backup skipped (disabled by user)");
    }

    if (runState.cancelled) return await markCancelled(runId, 0, 0, 0);

    log("=== PHASE 3/4: FETCH SOURCE DATA ===");
    await updatePhase(runId, "fetch");

    let sourceResult: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        sourceResult = await fetchModuleData(sourceModule, 10000, config.sourceDataSource || undefined);
        if (sourceResult.success && sourceResult.preview?.length > 0) break;
        log(`Fetch attempt ${attempt}: ${sourceResult.error || "No data"}`);
      } catch (err: any) {
        log(`Fetch attempt ${attempt} error: ${err.message}`);
      }
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
    }

    if (!sourceResult?.success || !sourceResult.preview?.length) {
      await storage.updateSyncRun(runId, {
        status: "error",
        errorMessage: sourceResult?.error || "No source data available after 3 attempts",
        completedAt: new Date(),
        details: { phase: "error" },
      });
      activeRuns.delete(runId);
      return;
    }

    const allRecords = sourceResult.preview;
    const totalRecords = allRecords.length;
    log(`Fetched ${totalRecords} source records`);

    await storage.updateSyncRun(runId, { recordsTotal: totalRecords, progress: 0 });

    if (runState.cancelled) return await markCancelled(runId, 0, 0, totalRecords);

    log("=== PHASE 4/4: SYNC TO TARGET ===");
    await updatePhase(runId, "sync");

    const BATCH_SIZE = 50;
    const totalBatches = Math.ceil(totalRecords / BATCH_SIZE);
    let processedOk = 0;
    let processedFail = 0;
    let currentBatch = 0;
    const allErrors: Array<{ batch: number; index: number; message: string }> = [];

    await storage.updateSyncRun(runId, {
      batchSize: BATCH_SIZE,
      totalBatches,
      currentBatch: 0,
    });

    for (let i = 0; i < totalRecords; i += BATCH_SIZE) {
      if (runState.cancelled) {
        return await markCancelled(runId, processedOk, processedFail, totalRecords, allErrors, currentBatch);
      }

      currentBatch++;
      const batchRecords = allRecords.slice(i, i + BATCH_SIZE);

      const mappedBatch: Record<string, any>[] = [];
      for (const record of batchRecords) {
        try {
          mappedBatch.push(applyFieldMappings(record, mappings));
        } catch (err: any) {
          processedFail++;
          allErrors.push({ batch: currentBatch, index: i + mappedBatch.length, message: `Mapping error: ${err.message}` });
        }
      }

      if (mappedBatch.length > 0) {
        try {
          const pushResult = await pushToTarget(targetModule, config.targetDataSource || null, mappedBatch, currentBatch - 1);
          processedOk += pushResult.createdCount + pushResult.updatedCount;
          processedFail += pushResult.errorCount;
          for (const e of pushResult.errors) {
            allErrors.push({ batch: currentBatch, ...e });
          }
        } catch (err: any) {
          processedFail += mappedBatch.length;
          allErrors.push({ batch: currentBatch, index: i, message: `Batch push failed: ${err.message}` });
          log(`Batch ${currentBatch} push error: ${err.message}`);
        }
      }

      const totalProcessed = processedOk + processedFail;
      const elapsed = Date.now() - startTime;
      const speedPerSec = elapsed > 0 ? Math.round((totalProcessed / elapsed) * 1000) : 0;
      const remaining = totalRecords - totalProcessed;
      const estimatedMs = speedPerSec > 0 ? (remaining / speedPerSec) * 1000 : 0;

      await storage.updateSyncRun(runId, {
        recordsProcessed: processedOk,
        recordsFailed: processedFail,
        progress: Math.round((totalProcessed / totalRecords) * 100),
        currentBatch,
        totalBatches,
        batchSize: BATCH_SIZE,
        speedPerSec,
        estimatedEndAt: new Date(Date.now() + estimatedMs),
        details: { phase: "sync", batchErrors: allErrors.slice(-20) },
      });

      log(`Batch ${currentBatch}/${totalBatches}: ok=${processedOk} fail=${processedFail} speed=${speedPerSec}/s`);
    }

    const finalStatus = processedFail === 0 ? "success" : "error";
    const duration = Date.now() - startTime;

    await storage.updateSyncRun(runId, {
      status: finalStatus,
      recordsProcessed: processedOk,
      recordsFailed: processedFail,
      progress: 100,
      completedAt: new Date(),
      errorMessage: processedFail > 0 ? `${processedFail} records failed` : null,
      details: {
        phase: "complete",
        duration,
        batchErrors: allErrors.slice(-50),
        totalCreated: processedOk,
        totalFailed: processedFail,
      },
    });

    log(`=== COMPLETE === ok=${processedOk} fail=${processedFail} duration=${duration}ms`);

    try {
      await storage.createSyncLog({
        moduleId: config.sourceModuleId,
        direction: "import",
        status: finalStatus === "success" ? "success" : "error",
        recordsProcessed: processedOk,
        recordsFailed: processedFail,
        errorMessage: processedFail > 0 ? `${processedFail} records failed` : null,
        triggeredBy: null,
      });
    } catch {}
  } catch (err: any) {
    console.error(`[sync-engine] Run ${runId}: Unhandled error:`, err);
    await storage.updateSyncRun(runId, {
      status: "error",
      errorMessage: err.message || "Unknown error",
      completedAt: new Date(),
      details: { phase: "error" },
    });
  } finally {
    activeRuns.delete(runId);
  }
}

async function markCancelled(
  runId: string,
  processedOk: number,
  processedFail: number,
  totalRecords: number,
  errors?: any[],
  batch?: number
) {
  await storage.updateSyncRun(runId, {
    status: "error",
    errorMessage: "cancelled",
    recordsProcessed: processedOk,
    recordsFailed: processedFail,
    progress: totalRecords > 0 ? Math.round(((processedOk + processedFail) / totalRecords) * 100) : 0,
    completedAt: new Date(),
    details: { phase: "cancelled", cancelledAtBatch: batch, batchErrors: errors?.slice(-20) },
  });
  activeRuns.delete(runId);
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

    console.log(`[sync-engine] Restore from backup ${backupId}: ${data.data.length} records downloaded`);
    return {
      success: true,
      message: `Backup data downloaded: ${data.data.length} records from ${backup.fileName}. Data ready for manual review.`,
      recordCount: data.data.length,
    };
  } catch (err: any) {
    return { success: false, message: err.message || "Restore failed" };
  }
}
