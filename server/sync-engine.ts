import { storage } from "./storage";
import { fetchModuleData } from "./data-fetcher";
import { uploadBackup, rotateBackups, downloadBackup } from "./google-drive";
import { pushToTarget } from "./target-push";
import type { SyncConfig, SyncRun } from "@shared/schema";
import type { PushRecordResult } from "./target-push";

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

function getNestedValue(obj: Record<string, any>, dotPath: string): any {
  if (dotPath in obj) return obj[dotPath];
  const parts = dotPath.split(".");
  let current: any = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function applyFieldMappings(
  record: Record<string, any>,
  mappings: Array<{ sourceField: string; targetField: string; transform?: string }>
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const mapping of mappings) {
    let value = getNestedValue(record, mapping.sourceField);
    if (mapping.transform) {
      try {
        switch (mapping.transform) {
          case "uppercase": value = String(value || "").toUpperCase(); break;
          case "lowercase": value = String(value || "").toLowerCase(); break;
          case "trim": value = String(value || "").trim(); break;
          case "number": value = Number(value) || 0; break;
          case "integer": value = parseInt(String(value), 10) || 0; break;
          case "price": {
            let s = String(value || "0").replace(/[^\d.,\-]/g, "");
            const lastDot = s.lastIndexOf(".");
            const lastComma = s.lastIndexOf(",");
            const decSep = Math.max(lastDot, lastComma);
            if (decSep >= 0) {
              const before = s.substring(0, decSep).replace(/[.,]/g, "");
              const after = s.substring(decSep + 1);
              s = before + "." + after;
            }
            value = parseFloat(s) || 0;
            break;
          }
          case "string": value = String(value || ""); break;
          case "boolean": value = Boolean(value); break;
        }
      } catch { }
    }
    result[mapping.targetField] = value;
  }
  return result;
}

const PHASE_ORDER = ["preflight", "backup", "fetch", "sync"] as const;

function buildPhaseHistory(currentPhase: string): Record<string, string> {
  const history: Record<string, string> = {};
  let foundCurrent = false;
  for (const p of PHASE_ORDER) {
    if (p === currentPhase) {
      history[p] = "running";
      foundCurrent = true;
    } else if (!foundCurrent) {
      history[p] = "done";
    } else {
      history[p] = "pending";
    }
  }
  return history;
}

function buildErrorPhaseHistory(failedAtPhase: string): Record<string, string> {
  const history: Record<string, string> = {};
  let foundFailed = false;
  for (const p of PHASE_ORDER) {
    if (p === failedAtPhase) {
      history[p] = "error";
      foundFailed = true;
    } else if (!foundFailed) {
      history[p] = "done";
    } else {
      history[p] = "pending";
    }
  }
  return history;
}

async function updatePhase(runId: string, phase: string, extra?: Partial<SyncRun>) {
  const phaseHistory = buildPhaseHistory(phase);
  const update: any = { details: { phase, phaseHistory }, ...extra };
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
      details: { phase: "error", phaseHistory: buildErrorPhaseHistory("preflight") },
    }).catch(() => {});
    activeRuns.delete(run.id);
  });

  return run.id;
}

const MAX_CONSECUTIVE_FAIL_BATCHES = 3;
const MAX_SYNCED_RECORDS_STORED = 200;

async function executeAsync(
  runId: string,
  config: SyncConfig,
  sourceModule: any,
  targetModule: any,
  runState: { cancelled: boolean }
) {
  const startTime = Date.now();
  const log = (msg: string) => console.log(`[sync-engine] [${runId.slice(0, 8)}] ${msg}`);
  let backupStats: { uploadedRecordCount: number; totalTargetRecords: number; fileSize: number; fileName: string; truncated: boolean } | null = null;

  try {
    log("=== PHASE 1/4: PREFLIGHT ===");
    await updatePhase(runId, "preflight");

    const mappings = (config.fieldMappings || []) as Array<{ sourceField: string; targetField: string; transform?: string }>;
    if (mappings.length === 0) {
      await storage.updateSyncRun(runId, {
        status: "error",
        errorMessage: "No field mappings configured",
        completedAt: new Date(),
        details: { phase: "error", phaseHistory: buildErrorPhaseHistory("preflight") },
      });
      try {
        await storage.createAuditLog({
          userId: config.createdBy || "system",
          action: "sync_complete",
          entity: "sync_config",
          entityId: config.id,
          details: { runId, configName: config.name, sourceModule: sourceModule.code, targetModule: targetModule.code, status: "error", error: "No field mappings configured", duration: Date.now() - startTime, durationFormatted: `${Math.round((Date.now() - startTime) / 1000)}s` },
        });
      } catch {}
      activeRuns.delete(runId);
      return;
    }

    log(`Source: ${sourceModule.code}, Target: ${targetModule.code}, Mappings: ${mappings.length}`);

    if (runState.cancelled) return await markCancelled(runId, 0, 0, 0, 0, 0);

    const schedule = config.schedule as any;
    const doBackup = schedule?.backupBeforeSync !== false;

    if (doBackup) {
      log("=== PHASE 2/4: BACKUP ===");
      await updatePhase(runId, "backup");

      try {
        let backupData: any[] = [];
        try {
          const targetResult = await fetchModuleData(targetModule, 2000, config.targetDataSource || undefined);
          if (targetResult.success && targetResult.preview) {
            backupData = targetResult.preview;
          }
        } catch (err: any) {
          log(`Warning: Could not fetch target data for backup: ${err.message}`);
        }

        const driveResult = await uploadBackup(config.id, config.name, backupData, runId, targetModule.name, mappings);

        const backup = await storage.createSyncBackup({
          syncConfigId: config.id,
          syncRunId: runId,
          fileName: driveResult.fileName,
          fileSize: driveResult.fileSize,
          googleDriveFileId: driveResult.fileId,
          googleDriveUrl: driveResult.webViewLink,
          backupRecordCount: driveResult.uploadedRecordCount,
          configSnapshot: {
            name: config.name,
            sourceModuleId: config.sourceModuleId,
            targetModuleId: config.targetModuleId,
            fieldMappings: config.fieldMappings,
            totalTargetRecords: backupData.length,
            truncated: driveResult.uploadedRecordCount < backupData.length,
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

        backupStats = {
          uploadedRecordCount: driveResult.uploadedRecordCount,
          totalTargetRecords: backupData.length,
          fileSize: driveResult.fileSize,
          fileName: driveResult.fileName,
          truncated: driveResult.uploadedRecordCount < backupData.length,
        };
        log(`Backup created: ${driveResult.fileName} (${driveResult.uploadedRecordCount}/${backupData.length} records, ${driveResult.fileSize} bytes)`);
      } catch (err: any) {
        log(`BACKUP FAILED: ${err.message}`);
        await storage.updateSyncRun(runId, {
          status: "error",
          errorMessage: `Backup failed: ${err.message}`,
          completedAt: new Date(),
          details: { phase: "error", backupError: err.message, phaseHistory: buildErrorPhaseHistory("backup") },
        });
        try {
          await storage.createAuditLog({
            userId: config.createdBy || "system",
            action: "sync_complete",
            entity: "sync_config",
            entityId: config.id,
            details: { runId, configName: config.name, sourceModule: sourceModule.code, targetModule: targetModule.code, status: "error", error: `Backup failed: ${err.message}`, duration: Date.now() - startTime, durationFormatted: `${Math.round((Date.now() - startTime) / 1000)}s` },
          });
        } catch {}
        activeRuns.delete(runId);
        return;
      }
    } else {
      log("Backup skipped (disabled by user)");
    }

    if (runState.cancelled) return await markCancelled(runId, 0, 0, 0, 0, 0);

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
      const fetchError = sourceResult?.error || "No source data available after 3 attempts";
      await storage.updateSyncRun(runId, {
        status: "error",
        errorMessage: fetchError,
        completedAt: new Date(),
        details: { phase: "error", phaseHistory: buildErrorPhaseHistory("fetch") },
      });
      try {
        await storage.createAuditLog({
          userId: config.createdBy || "system",
          action: "sync_complete",
          entity: "sync_config",
          entityId: config.id,
          details: { runId, configName: config.name, sourceModule: sourceModule.code, targetModule: targetModule.code, status: "error", error: fetchError, duration: Date.now() - startTime, durationFormatted: `${Math.round((Date.now() - startTime) / 1000)}s` },
        });
      } catch {}
      activeRuns.delete(runId);
      return;
    }

    const allRecords = sourceResult.preview;
    const totalRecords = allRecords.length;
    log(`Fetched ${totalRecords} source records`);

    await storage.updateSyncRun(runId, { recordsTotal: totalRecords, progress: 0 });

    if (runState.cancelled) return await markCancelled(runId, 0, 0, 0, 0, totalRecords);

    log("=== PHASE 4/4: SYNC TO TARGET ===");
    await updatePhase(runId, "sync");

    const BATCH_SIZE = 50;
    const totalBatches = Math.ceil(totalRecords / BATCH_SIZE);
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    let currentBatch = 0;
    let consecutiveFailBatches = 0;
    const allErrors: Array<{ batch: number; index: number; message: string }> = [];
    const syncedRecords: PushRecordResult[] = [];

    await storage.updateSyncRun(runId, {
      batchSize: BATCH_SIZE,
      totalBatches,
      currentBatch: 0,
    });

    for (let i = 0; i < totalRecords; i += BATCH_SIZE) {
      if (runState.cancelled) {
        return await markCancelled(runId, totalCreated, totalUpdated, totalFailed, 0, totalRecords, allErrors, syncedRecords, currentBatch);
      }

      currentBatch++;
      const batchRecords = allRecords.slice(i, i + BATCH_SIZE);

      const mappedBatch: Record<string, any>[] = [];
      for (const rawRecord of batchRecords) {
        try {
          mappedBatch.push(applyFieldMappings(rawRecord, mappings));
        } catch (err: any) {
          totalFailed++;
          allErrors.push({ batch: currentBatch, index: i + mappedBatch.length, message: `Mapping error: ${err.message}` });
          if (syncedRecords.length < MAX_SYNCED_RECORDS_STORED) {
            syncedRecords.push({ sourceIndex: i + mappedBatch.length, target_id: null, status: "error", errorMsg: `Mapping: ${err.message}` });
          }
        }
      }

      let batchErrorCount = 0;
      let lastPushRecords: PushRecordResult[] = [];

      if (mappedBatch.length > 0) {
        try {
          const pushResult = await pushToTarget(targetModule, config.targetDataSource || null, mappedBatch, currentBatch - 1, batchRecords);
          totalCreated += pushResult.createdCount;
          totalUpdated += pushResult.updatedCount;
          totalFailed += pushResult.errorCount;
          batchErrorCount = pushResult.errorCount;
          lastPushRecords = pushResult.records;
          for (const e of pushResult.errors) {
            allErrors.push({ batch: currentBatch, ...e });
          }
          for (const r of pushResult.records) {
            if (syncedRecords.length < MAX_SYNCED_RECORDS_STORED) {
              syncedRecords.push(r);
            }
          }
        } catch (err: any) {
          totalFailed += mappedBatch.length;
          batchErrorCount = mappedBatch.length;
          allErrors.push({ batch: currentBatch, index: i, message: `Batch push failed: ${err.message}` });
          log(`Batch ${currentBatch} push error: ${err.message}`);
        }
      }

      if (batchErrorCount === mappedBatch.length && mappedBatch.length > 0) {
        consecutiveFailBatches++;
      } else {
        consecutiveFailBatches = 0;
      }

      if (consecutiveFailBatches >= MAX_CONSECUTIVE_FAIL_BATCHES) {
        const lastError = allErrors.length > 0 ? allErrors[allErrors.length - 1].message : "Unknown error";
        const totalProcessed = totalCreated + totalUpdated + totalFailed;
        const earlyDuration = Date.now() - startTime;
        const earlyMappingNames = mappings.map(m => `${m.sourceField} → ${m.targetField}`);
        const earlySampleIds = syncedRecords
          .filter(r => r.status === "created" && r.target_id != null)
          .slice(0, 10)
          .map(r => r.target_id);
        const earlyCompletionSummary = {
          totalCreated,
          totalUpdated,
          totalFailed,
          totalProcessed: totalCreated + totalUpdated,
          sourceRecordCount: totalRecords,
          fieldMappings: earlyMappingNames,
          fieldCount: mappings.length,
          sampleTargetIds: earlySampleIds,
          backupStats,
          durationMs: earlyDuration,
          durationFormatted: earlyDuration >= 60000
            ? `${Math.floor(earlyDuration / 60000)}m ${Math.round((earlyDuration % 60000) / 1000)}s`
            : `${Math.round(earlyDuration / 1000)}s`,
          completedAt: new Date().toISOString(),
          earlyStop: true,
          earlyStopReason: `${consecutiveFailBatches} consecutive 100% error batches`,
        };
        log(`EARLY STOP: ${consecutiveFailBatches} consecutive batches failed. Last error: ${lastError}`);
        await storage.updateSyncRun(runId, {
          status: "error",
          recordsProcessed: totalCreated + totalUpdated,
          recordsFailed: totalFailed,
          progress: Math.round((totalProcessed / totalRecords) * 100),
          completedAt: new Date(),
          errorMessage: `Sync stopped: ${consecutiveFailBatches} consecutive batches failed (${totalFailed} records). Last error: ${lastError}`,
          details: {
            phase: "error",
            phaseHistory: { preflight: "done", backup: "done", fetch: "done", sync: "error" },
            earlyStopReason: `${consecutiveFailBatches} consecutive 100% error batches`,
            totalCreated,
            totalUpdated,
            totalFailed,
            batchErrors: allErrors.slice(-50),
            syncedRecords,
            completionSummary: earlyCompletionSummary,
          },
        });
        try {
          await storage.createAuditLog({
            userId: config.createdBy || "system",
            action: "sync_complete",
            entity: "sync_config",
            entityId: config.id,
            details: {
              runId,
              configName: config.name,
              sourceModule: sourceModule.code,
              targetModule: targetModule.code,
              status: "error",
              error: `Early stop: ${consecutiveFailBatches} consecutive batches failed`,
              recordsProcessed: totalCreated + totalUpdated,
              recordsFailed: totalFailed,
              totalCreated,
              totalUpdated,
              duration: Date.now() - startTime,
              durationFormatted: `${Math.round((Date.now() - startTime) / 1000)}s`,
            },
          });
        } catch {}
        activeRuns.delete(runId);
        return;
      }

      const totalProcessed = totalCreated + totalUpdated + totalFailed;
      const elapsed = Date.now() - startTime;
      const speedPerSec = elapsed > 0 ? Math.round((totalProcessed / elapsed) * 1000) : 0;
      const remaining = totalRecords - totalProcessed;
      const estimatedMs = speedPerSec > 0 ? (remaining / speedPerSec) * 1000 : 0;

      const lastBatchSample = batchRecords.slice(0, 3).map((r: any, idx: number) => {
        const mapped = mappedBatch[idx];
        const keys = Object.keys(r);
        const label = r.Name || r.name || r.Code || r.code || r.Nazov || r.nazov ||
                      r.Description || r.description || r.Title || r.title ||
                      (keys.length > 0 ? String(r[keys[0]]).slice(0, 60) : `record ${i + idx + 1}`);
        const result = lastPushRecords[idx] || null;
        return {
          index: i + idx + 1,
          label: String(label).slice(0, 80),
          status: result?.status || "created",
          targetId: result?.target_id || null,
          fields: mapped ? Object.keys(mapped).length : keys.length,
        };
      });

      const batchCreatedCount = lastPushRecords.filter(r => r.status === "created").length;
      const batchUpdatedCount = lastPushRecords.filter(r => r.status === "updated").length;

      await storage.updateSyncRun(runId, {
        recordsProcessed: totalCreated + totalUpdated,
        recordsFailed: totalFailed,
        progress: Math.round((totalProcessed / totalRecords) * 100),
        currentBatch,
        totalBatches,
        batchSize: BATCH_SIZE,
        speedPerSec,
        estimatedEndAt: new Date(Date.now() + estimatedMs),
        details: {
          phase: "sync",
          phaseHistory: buildPhaseHistory("sync"),
          totalCreated,
          totalUpdated,
          totalFailed,
          batchErrors: allErrors.slice(-20),
          liveBatch: {
            batchNumber: currentBatch,
            recordsInBatch: batchRecords.length,
            sample: lastBatchSample,
            batchCreated: batchCreatedCount,
            batchUpdated: batchUpdatedCount,
            batchErrors: batchErrorCount,
          },
          elapsedMs: elapsed,
        },
      });

      log(`Batch ${currentBatch}/${totalBatches}: created=${totalCreated} updated=${totalUpdated} fail=${totalFailed} speed=${speedPerSec}/s`);
    }

    const processedOk = totalCreated + totalUpdated;
    const finalStatus = totalFailed === 0 ? "success" : (processedOk > 0 ? "partial" : "error");
    const duration = Date.now() - startTime;

    const sampleTargetIds = syncedRecords
      .filter(r => r.status === "created" && r.target_id != null)
      .slice(0, 10)
      .map(r => r.target_id);

    const mappingNames = mappings.map(m => `${m.sourceField} → ${m.targetField}`);

    const completionSummary = {
      totalCreated,
      totalUpdated,
      totalFailed,
      totalProcessed: processedOk,
      sourceRecordCount: totalRecords,
      fieldMappings: mappingNames,
      fieldCount: mappings.length,
      sampleTargetIds,
      backupStats,
      durationMs: duration,
      durationFormatted: duration >= 60000
        ? `${Math.floor(duration / 60000)}m ${Math.round((duration % 60000) / 1000)}s`
        : `${Math.round(duration / 1000)}s`,
      completedAt: new Date().toISOString(),
    };

    await storage.updateSyncRun(runId, {
      status: finalStatus,
      recordsProcessed: processedOk,
      recordsFailed: totalFailed,
      progress: 100,
      completedAt: new Date(),
      errorMessage: totalFailed > 0 ? `${totalFailed} records failed` : null,
      details: {
        phase: "complete",
        phaseHistory: { preflight: "done", backup: "done", fetch: "done", sync: "done" },
        duration,
        totalCreated,
        totalUpdated,
        totalFailed,
        batchErrors: allErrors.slice(-50),
        syncedRecords,
        completionSummary,
      },
    });

    log(`=== COMPLETE === created=${totalCreated} updated=${totalUpdated} fail=${totalFailed} duration=${duration}ms`);

    try {
      await storage.createSyncLog({
        moduleId: config.sourceModuleId,
        direction: "import",
        status: finalStatus,
        recordsProcessed: processedOk,
        recordsFailed: totalFailed,
        errorMessage: totalFailed > 0 ? `${totalFailed} records failed` : null,
        triggeredBy: null,
      });
    } catch {}

    try {
      await storage.createAuditLog({
        userId: config.createdBy || "system",
        action: "sync_complete",
        entity: "sync_config",
        entityId: config.id,
        details: {
          runId,
          configName: config.name,
          sourceModule: sourceModule.code,
          targetModule: targetModule.code,
          status: finalStatus,
          recordsProcessed: processedOk,
          recordsFailed: totalFailed,
          totalCreated,
          totalUpdated,
          duration,
          durationFormatted: `${Math.round(duration / 1000)}s`,
        },
      });
    } catch {}
  } catch (err: any) {
    console.error(`[sync-engine] Run ${runId}: Unhandled error:`, err);
    await storage.updateSyncRun(runId, {
      status: "error",
      errorMessage: err.message || "Unknown error",
      completedAt: new Date(),
      details: { phase: "error", phaseHistory: buildErrorPhaseHistory("sync") },
    });

    try {
      await storage.createAuditLog({
        userId: config.createdBy || "system",
        action: "sync_complete",
        entity: "sync_config",
        entityId: config.id,
        details: {
          runId,
          configName: config.name,
          sourceModule: sourceModule.code,
          targetModule: targetModule.code,
          status: "error",
          error: err.message || "Unknown error",
          duration: Date.now() - startTime,
          durationFormatted: `${Math.round((Date.now() - startTime) / 1000)}s`,
        },
      });
    } catch {}
  } finally {
    activeRuns.delete(runId);
  }
}

async function markCancelled(
  runId: string,
  created: number,
  updated: number,
  failed: number,
  _unused: number,
  totalRecords: number,
  errors?: any[],
  syncedRecords?: PushRecordResult[],
  batch?: number
) {
  const processedOk = created + updated;
  const totalProcessed = processedOk + failed;
  await storage.updateSyncRun(runId, {
    status: "error",
    errorMessage: "cancelled",
    recordsProcessed: processedOk,
    recordsFailed: failed,
    progress: totalRecords > 0 ? Math.round((totalProcessed / totalRecords) * 100) : 0,
    completedAt: new Date(),
    details: {
      phase: "cancelled",
      phaseHistory: { preflight: "done", backup: "done", fetch: "done", sync: "done" },
      cancelledAtBatch: batch,
      totalCreated: created,
      totalUpdated: updated,
      totalFailed: failed,
      batchErrors: errors?.slice(-20),
      syncedRecords: syncedRecords || [],
    },
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
