import { storage } from "./storage";
import { fetchModuleData } from "./data-fetcher";
import { uploadBackup, downloadBackup, deleteBackupFile } from "./google-drive";
import { saveLocalBackup, deleteLocalBackup } from "./local-backup";
import { pushToTarget } from "./target-push";
import { createHash } from "crypto";
import type { SyncConfig, SyncRun } from "@shared/schema";
import type { PushRecordResult, VATTransformEntry } from "./target-push";
import { lookupCountry } from "../shared/countries";
import type { CountryFormat } from "../shared/countries";

const activeRuns = new Map<string, { cancelled: boolean }>();

export interface CheckpointData {
  globalOffset: number;
  totalCreated: number;
  totalUpdated: number;
  totalFailed: number;
  totalSkippedByMatch: number;
  errors: Array<{ batch: number; index: number; message: string }>;
  savedAt: string;
}

const CHECKPOINT_EVERY_BATCHES = 1;

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
  for (let i = 0; i < parts.length; i++) {
    if (current == null) return undefined;
    const part = parts[i];
    if (Array.isArray(current)) {
      const match = current.find((item: any) => {
        if (!item || typeof item !== "object") return false;
        const k = item.Key || item.key || item.Name || item.name || item.ColumnName || item.columnName;
        return k === part;
      });
      if (match) {
        if (i === parts.length - 1) {
          return match.Value ?? match.value ?? match.ColumnValue ?? match.columnValue ?? undefined;
        }
        current = match.Value ?? match.value ?? match.ColumnValue ?? match.columnValue;
        continue;
      }
      const idx = parseInt(part, 10);
      if (!isNaN(idx) && idx >= 0 && idx < current.length) {
        current = current[idx];
        continue;
      }
      return undefined;
    }
    if (typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function applyFieldMappings(
  record: Record<string, any>,
  mappings: Array<{ sourceField: string; targetField: string; transform?: string }>
): { result: Record<string, any>; vatTransforms: VATTransformEntry[] } {
  const result: Record<string, any> = {};
  const vatTransforms: VATTransformEntry[] = [];

  function parsePrice(v: any): number {
    let s = String(v || "0").replace(/[^\d.,\-]/g, "");
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    const decSep = Math.max(lastDot, lastComma);
    if (decSep >= 0) {
      const before = s.substring(0, decSep).replace(/[.,]/g, "");
      const after = s.substring(decSep + 1);
      s = before + "." + after;
    }
    return parseFloat(s) || 0;
  }

  for (const mapping of mappings) {
    let value = getNestedValue(record, mapping.sourceField);
    if (mapping.transform) {
      try {
        const colonIdx = mapping.transform.indexOf(":");
        const transformType = colonIdx >= 0 ? mapping.transform.substring(0, colonIdx) : mapping.transform;
        const transformParam = colonIdx >= 0 ? mapping.transform.substring(colonIdx + 1) : undefined;

        switch (transformType) {
          case "uppercase": value = String(value || "").toUpperCase(); break;
          case "lowercase": value = String(value || "").toLowerCase(); break;
          case "trim": value = String(value || "").trim(); break;
          case "number": value = Number(value) || 0; break;
          case "integer": value = parseInt(String(value), 10) || 0; break;
          case "price": value = parsePrice(value); break;
          case "price_excl_vat": {
            const rateRaw = parseFloat(transformParam ?? "NaN");
            const rate = Number.isFinite(rateRaw) ? rateRaw : 23;
            const originalPrice = parsePrice(value);
            const convertedPrice = Math.round((originalPrice / (1 + rate / 100)) * 100) / 100;
            vatTransforms.push({ field: mapping.targetField, originalPrice, convertedPrice, vatRate: rate });
            value = convertedPrice;
            break;
          }
          case "string": value = String(value || ""); break;
          case "boolean": value = Boolean(value); break;
          case "multiply": {
            const coeff = parseFloat(transformParam ?? "NaN");
            const factor = Number.isFinite(coeff) ? coeff : 1;
            const num = parseFloat(String(value).replace(/[^\d.,\-]/g, "").replace(",", ".")) || 0;
            value = Math.round(num * factor * 100) / 100;
            break;
          }
          case "pad_left": {
            const parts = (transformParam ?? "8:0").split(":");
            const l = parseInt(parts[0], 10) || 8;
            const c = parts.length > 1 ? parts[1] : "0";
            value = String(value ?? "").padStart(l, c || " ");
            break;
          }
          case "pad_right": {
            const parts = (transformParam ?? "8: ").split(":");
            const l = parseInt(parts[0], 10) || 8;
            const c = parts.length > 1 ? parts[1] : " ";
            value = String(value ?? "").padEnd(l, c || " ");
            break;
          }
          case "truncate": {
            const l = parseInt(transformParam ?? "8", 10) || 8;
            value = String(value ?? "").substring(0, l);
            break;
          }
          case "country": {
            const fmt = (transformParam || "name_sk") as CountryFormat;
            const resolved = lookupCountry(String(value ?? ""), fmt);
            if (resolved !== undefined) value = resolved;
            break;
          }
        }
      } catch (_e) { }
    }
    result[mapping.targetField] = value;
  }
  return { result, vatTransforms };
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

async function resilientDbUpdate(runId: string, update: any, label = "update"): Promise<void> {
  const MAX_DB_RETRIES = 5;
  for (let attempt = 1; attempt <= MAX_DB_RETRIES; attempt++) {
    try {
      await storage.updateSyncRun(runId, update);
      return;
    } catch (err: any) {
      const msg = err.message || "";
      const isConnectionError = msg.includes("terminated") || msg.includes("ECONNREFUSED") ||
        msg.includes("connection") || msg.includes("timeout") || msg.includes("EPIPE");
      if (isConnectionError && attempt < MAX_DB_RETRIES) {
        console.warn(`[sync-engine] DB ${label} retry ${attempt}/${MAX_DB_RETRIES}: ${msg.slice(0, 120)}`);
        await new Promise(r => setTimeout(r, 3000 * attempt));
        continue;
      }
      throw err;
    }
  }
}

async function updatePhase(runId: string, phase: string, extra?: Partial<SyncRun>) {
  const phaseHistory = buildPhaseHistory(phase);
  const update: any = { details: { phase, phaseHistory }, ...extra };
  await resilientDbUpdate(runId, update, `phase:${phase}`);
}

function computeRecordHash(record: Record<string, any>, mappings: Array<{ sourceField: string }>): string {
  const vals: string[] = [];
  for (const m of mappings) {
    const v = record[m.sourceField];
    vals.push(v != null ? String(v) : "");
  }
  return createHash("md5").update(vals.join("|")).digest("hex");
}

function getRecordKey(record: Record<string, any>, matchFields?: string[]): string | null {
  if (matchFields && matchFields.length > 0) {
    for (const mf of matchFields) {
      const v = record[mf];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return record.id || record.code || record.sku || record.gtin ||
    record.Code || record.SKU || record.product_id ||
    record.externalId || record.productId || record.item_id ||
    record.article_number || record.articleNumber || null;
}

export async function executeSyncRun(
  configId: string,
  triggeredBy?: string,
  fullSync: boolean = false
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

  executeAsync(run.id, config, sourceModule, targetModule, runState, fullSync).catch((err) => {
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
  runState: { cancelled: boolean },
  fullSync: boolean = false,
  resumeFrom?: CheckpointData
) {
  const startTime = Date.now();
  const isResume = !!resumeFrom;
  const log = (msg: string) => console.log(`[sync-engine] [${runId.slice(0, 8)}]${isResume ? " [RESUME]" : ""} ${msg}`);
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
        await storage.createSyncLog({ moduleId: config.sourceModuleId, direction: "import", status: "error", recordsProcessed: 0, recordsFailed: 0, errorMessage: "No field mappings configured", triggeredBy: null });
      } catch {}
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
    const doDriveBackup = schedule?.backupBeforeSync !== false;

    if (!isResume) {
      log("=== PHASE 2/4: BACKUP ===");
      await updatePhase(runId, "backup");

      try {
        let backupData: any[] = [];
        try {
          const targetResult = await fetchModuleData(targetModule, 0, config.targetDataSource || undefined);
          if (targetResult.success && targetResult.preview) {
            backupData = targetResult.preview;
          }
        } catch (err: any) {
          log(`Warning: Could not fetch target data for backup: ${err.message}`);
        }

        // LOCAL BACKUP — SEDAJ Cloud (vždy, primárne úložisko)
        let localFilePath: string | null = null;
        try {
          const ts = new Date().toISOString().replace(/[:.]/g, "-");
          const safeName = config.name.replace(/[^a-zA-Z0-9]/g, "_");
          const localFileName = `backup_${safeName}_${ts}.json`;
          const localResult = await saveLocalBackup(config.id, localFileName, {
            configId: config.id, configName: config.name, runId,
            exportedAt: new Date().toISOString(),
            totalRecords: backupData.length,
            data: backupData,
          });
          localFilePath = localResult.filePath;
          log(`SEDAJ Cloud backup saved: ${localFilePath} (${localResult.fileSize} bytes)`);
        } catch (localErr: any) {
          log(`Warning: SEDAJ Cloud backup failed: ${localErr.message}`);
        }

        // GOOGLE DRIVE — sekundárne, len ak je povolené v nastaveniach sync
        let driveFileId: string | null = null;
        let driveFileName = "";
        let driveFileSize = 0;
        let driveUrl = "";
        let driveTotalFiles = 0;
        let driveParts: any[] = [];
        let driveRecordCount = 0;

        if (doDriveBackup) {
          try {
            const driveResult = await uploadBackup(config.id, config.name, backupData, runId, targetModule.name, mappings);
            driveFileId = driveResult.primaryFileId;
            driveFileName = driveResult.primaryFileName;
            driveFileSize = driveResult.combinedFileSize;
            driveUrl = driveResult.primaryWebViewLink;
            driveTotalFiles = driveResult.totalFiles;
            driveParts = driveResult.parts;
            driveRecordCount = driveResult.totalRecords;
            log(`Google Drive backup: ${driveResult.totalFiles} file(s), ${driveResult.totalRecords} records`);
          } catch (driveErr: any) {
            log(`Warning: Google Drive backup failed (SEDAJ Cloud backup je zachovaná): ${driveErr.message}`);
          }
        } else {
          log("Google Drive backup skipped (disabled in sync config)");
        }

        const backupType = localFilePath && driveFileId ? "both"
          : driveFileId ? "gdrive"
          : "local";

        const effectiveFileName = driveFileName || (localFilePath ? localFilePath.split("/").pop()! : `backup_${config.name}`);
        const effectiveFileSize = driveFileSize;
        const effectiveRecordCount = driveRecordCount || backupData.length;

        // Detect DB environment from target module base URL
        const detectDbEnv = (url: string | null | undefined): string => {
          if (!url) return "unknown";
          if (url.includes("hauerland_spol_s_ro")) return "production";
          if (url.includes("testovacia_hauerland")) return "test";
          return "unknown";
        };
        const dbEnvironment = detectDbEnv(targetModule.baseUrl);

        // Auto-generate human-readable description
        const envLabel = dbEnvironment === "production" ? " (ostrá DB)" : dbEnvironment === "test" ? " (testovacia DB)" : "";
        const description = `Záloha pred synchronizáciou "${config.name}"${envLabel} — ${effectiveRecordCount.toLocaleString("sk")} záznamov z ${targetModule.name}`;

        const backup = await storage.createSyncBackup({
          syncConfigId: config.id,
          syncRunId: runId,
          fileName: effectiveFileName,
          fileSize: effectiveFileSize,
          googleDriveFileId: driveFileId ?? undefined,
          googleDriveUrl: driveUrl || undefined,
          backupRecordCount: effectiveRecordCount,
          localFilePath: localFilePath ?? undefined,
          backupType,
          description,
          dbEnvironment,
          configSnapshot: {
            name: config.name,
            sourceModuleId: config.sourceModuleId,
            targetModuleId: config.targetModuleId,
            fieldMappings: config.fieldMappings,
            totalTargetRecords: backupData.length,
            truncated: false,
            totalFiles: driveTotalFiles || (localFilePath ? 1 : 0),
            parts: driveParts.map(p => ({
              fileId: p.fileId,
              fileName: p.fileName,
              fileSize: p.fileSize,
              webViewLink: p.webViewLink,
              recordCount: p.recordCount,
              partNumber: p.partNumber,
            })),
          },
        });

        await storage.updateSyncRun(runId, { backupId: backup.id });

        const allBackups = await storage.getSyncBackupsByConfig(config.id);
        if (allBackups.length > 10) {
          const toDelete = allBackups.slice(10);
          for (const old of toDelete) {
            const snap = old.configSnapshot as any;
            if (snap?.parts && Array.isArray(snap.parts)) {
              for (const part of snap.parts) {
                if (part.fileId) {
                  try { await deleteBackupFile(part.fileId); } catch {}
                }
              }
            } else if (old.googleDriveFileId) {
              try { await deleteBackupFile(old.googleDriveFileId); } catch {}
            }
            if (old.localFilePath) {
              try { await deleteLocalBackup(old.localFilePath); } catch {}
            }
            await storage.deleteSyncBackup(old.id);
          }
        }

        backupStats = {
          uploadedRecordCount: effectiveRecordCount,
          totalTargetRecords: backupData.length,
          fileSize: effectiveFileSize,
          fileName: effectiveFileName,
          truncated: false,
          totalFiles: driveTotalFiles || (localFilePath ? 1 : 0),
        };
        log(`Backup complete: type=${backupType}, records=${backupData.length}`);
      } catch (err: any) {
        log(`BACKUP PHASE ERROR: ${err.message}`);
        await storage.updateSyncRun(runId, {
          status: "error",
          errorMessage: `Backup failed: ${err.message}`,
          completedAt: new Date(),
          details: { phase: "error", backupError: err.message, phaseHistory: buildErrorPhaseHistory("backup") },
        });
        try {
          await storage.createSyncLog({ moduleId: config.sourceModuleId, direction: "import", status: "error", recordsProcessed: 0, recordsFailed: 0, errorMessage: `Backup failed: ${err.message}`.slice(0, 500), triggeredBy: null });
        } catch {}
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
      log("Backup skipped (resume mode)");
    }

    if (runState.cancelled) return await markCancelled(runId, 0, 0, 0, 0, 0);

    log("=== PHASE 3/4: FETCH SOURCE DATA ===");
    await updatePhase(runId, "fetch");

    let sourceResult: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const recordLimit = config.sourceRecordLimit ?? 120000;
        sourceResult = await fetchModuleData(sourceModule, recordLimit, config.sourceDataSource || undefined);
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
        await storage.createSyncLog({ moduleId: config.sourceModuleId, direction: "import", status: "error", recordsProcessed: 0, recordsFailed: 0, errorMessage: fetchError.slice(0, 500), triggeredBy: null });
      } catch {}
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

    const _rawFetchedRecords = sourceResult.preview;
    log(`Fetched ${_rawFetchedRecords.length} source records`);

    const _srcFilters: Array<{ field: string; operator: string; value: string }> =
      ((config as any).sourceFilters || []).filter((f: any) => f?.field && f?.value != null && String(f.value).trim() !== "");
    const allFetchedRecords = _srcFilters.length > 0
      ? _rawFetchedRecords.filter(rec =>
          _srcFilters.every(f => {
            const v = String(rec[f.field] ?? "").trim();
            const fv = String(f.value).trim();
            switch (f.operator) {
              case "starts_with": return v.toLowerCase().startsWith(fv.toLowerCase());
              case "ends_with":   return v.toLowerCase().endsWith(fv.toLowerCase());
              case "contains":    return v.toLowerCase().includes(fv.toLowerCase());
              case "not_contains": return !v.toLowerCase().includes(fv.toLowerCase());
              case "equals":      return v === fv;
              case "not_equals":  return v !== fv;
              default:            return true;
            }
          })
        )
      : _rawFetchedRecords;
    if (_srcFilters.length > 0) {
      log(`Source filters applied (${_srcFilters.length}): ${allFetchedRecords.length}/${_rawFetchedRecords.length} records passed (${_rawFetchedRecords.length - allFetchedRecords.length} filtered out)`);
    }

    let allRecords = allFetchedRecords;
    let totalSkipped = 0;
    const baselineUpdates: Array<{ recordKey: string; fieldHash: string; index: number }> = [];
    const batchableBaselines: Array<{ recordKey: string; fieldHash: string } | null> = [];

    const cfgMatchFields = ((config as any).matchFields || []).filter((f: string) => f && f.trim());

    if (!fullSync && !isResume) {
      log("=== DELTA MODE: comparing with baseline ===");
      let baselines: Map<string, string>;
      try {
        baselines = await storage.getBaselines(config.id);
        log(`Loaded ${baselines.size} baseline entries`);
      } catch (err: any) {
        log(`Baseline load failed, falling back to full sync: ${err.message}`);
        baselines = new Map();
      }

      const changedRecords: Record<string, any>[] = [];
      for (let i = 0; i < allFetchedRecords.length; i++) {
        const rec = allFetchedRecords[i];
        const key = getRecordKey(rec, cfgMatchFields);
        if (!key) {
          changedRecords.push(rec);
          batchableBaselines.push(null);
          continue;
        }
        const hash = computeRecordHash(rec, mappings);
        const prevHash = baselines.get(String(key));
        if (prevHash !== hash) {
          changedRecords.push(rec);
          batchableBaselines.push({ recordKey: String(key), fieldHash: hash });
          baselineUpdates.push({ recordKey: String(key), fieldHash: hash, index: i });
        } else {
          totalSkipped++;
        }
      }

      allRecords = changedRecords;
      if (allRecords.length === 0 && totalSkipped > 0) {
        log(`Delta result: 0 zmenených, ${totalSkipped} bez zmeny — nič sa neodošle do ONIX`);
      } else {
        const sampleKeys = allRecords.slice(0, 5).map(r => getRecordKey(r, cfgMatchFields)).filter(Boolean);
        const sampleStr = sampleKeys.length ? ` (ukážka: ${sampleKeys.join(", ")}${allRecords.length > 5 ? ", …" : ""})` : "";
        log(`Delta result: ${allRecords.length} zmenených${sampleStr}, ${totalSkipped} bez zmeny (preskočených)`);
      }
    } else {
      log("=== FULL SYNC MODE ===");
      for (let i = 0; i < allFetchedRecords.length; i++) {
        const rec = allFetchedRecords[i];
        const key = getRecordKey(rec, cfgMatchFields);
        if (key) {
          const hash = computeRecordHash(rec, mappings);
          batchableBaselines.push({ recordKey: String(key), fieldHash: hash });
          baselineUpdates.push({ recordKey: String(key), fieldHash: hash, index: i });
        } else {
          batchableBaselines.push(null);
        }
      }
    }

    const totalRecords = allRecords.length;

    await storage.updateSyncRun(runId, {
      recordsTotal: totalRecords,
      progress: 0,
      details: {
        phase: "fetch",
        deltaMode: !fullSync,
        totalFetched: allFetchedRecords.length,
        totalChanged: totalRecords,
        totalSkipped,
      },
    });

    if (totalRecords === 0 && !fullSync) {
      log("No changes detected — nothing to sync");
      if (baselineUpdates.length > 0) {
        try {
          await storage.upsertBaselines(config.id, baselineUpdates);
          log(`Saved ${baselineUpdates.length} baseline entries`);
        } catch (err: any) {
          log(`Failed to save baselines: ${err.message}`);
        }
      }
      await resilientDbUpdate(runId, {
        status: "success",
        recordsProcessed: 0,
        recordsFailed: 0,
        progress: 100,
        completedAt: new Date(),
        details: {
          phase: "complete",
          phaseHistory: { preflight: "done", backup: "done", fetch: "done", sync: "skipped" },
          deltaMode: true,
          totalFetched: allFetchedRecords.length,
          totalSkipped,
          totalChanged: 0,
          duration: Date.now() - startTime,
        },
      }, "delta-no-changes");
      activeRuns.delete(runId);
      return;
    }

    if (runState.cancelled) return await markCancelled(runId, 0, 0, 0, 0, totalRecords);

    log("=== PHASE 4/4: SYNC TO TARGET ===");
    await updatePhase(runId, "sync");

    const BATCH_SIZE = 50;
    const totalBatches = Math.ceil(totalRecords / BATCH_SIZE);
    const startOffset = resumeFrom?.globalOffset ?? 0;
    let totalCreated = resumeFrom?.totalCreated ?? 0;
    let totalUpdated = resumeFrom?.totalUpdated ?? 0;
    let totalFailed = resumeFrom?.totalFailed ?? 0;
    let totalSkippedByMatch = resumeFrom?.totalSkippedByMatch ?? 0;
    let currentBatch = Math.floor(startOffset / BATCH_SIZE);
    let consecutiveFailBatches = 0;
    const allErrors: Array<{ batch: number; index: number; message: string }> = resumeFrom?.errors ? [...resumeFrom.errors] : [];
    const allSkippedItems: Array<{ nsNumber: string; reason: string }> = [];
    const syncedRecords: PushRecordResult[] = [];
    let allLatencyMs = 0;
    let allLatencyCount = 0;
    let globalMinLatency = Infinity;
    const ETA_WINDOW = 5;
    const batchSpeeds: number[] = [];
    const batchSpeedHistory: Array<{b: number; s: number}> = [];
    const vatSamples: Array<{field: string; original: number; converted: number; rate: string}> = [];
    const sourceFiltersApplied = _rawFetchedRecords.length - allFetchedRecords.length;
    let hKodStartNumber: number | undefined;
    let globalMaxLatency = 0;

    if (isResume) {
      log(`Resuming from offset ${startOffset}/${totalRecords} (already processed: created=${totalCreated} updated=${totalUpdated} failed=${totalFailed} skipped=${totalSkippedByMatch})`);
    }

    await storage.updateSyncRun(runId, {
      batchSize: BATCH_SIZE,
      totalBatches,
      currentBatch,
    });

    if (!isResume) {
      const initialCheckpoint: CheckpointData = {
        globalOffset: startOffset,
        totalCreated,
        totalUpdated,
        totalFailed,
        totalSkippedByMatch,
        errors: [],
        savedAt: new Date().toISOString(),
      };
      storage.updateSyncRun(runId, { checkpointData: initialCheckpoint } as any).catch(() => {});
      log(`Initial checkpoint saved (offset 0, total ${totalRecords})`);
    }

    let hKodNextNumber: number | undefined = (config as any).hKodConfig?.enabled
      ? ((config as any).hKodConfig.nextNumber ?? 0)
      : undefined;
    if (hKodNextNumber !== undefined) hKodStartNumber = hKodNextNumber;

    for (let i = startOffset; i < totalRecords; i += BATCH_SIZE) {
      if (runState.cancelled) {
        return await markCancelled(runId, totalCreated, totalUpdated, totalFailed, 0, totalRecords, allErrors, syncedRecords, currentBatch);
      }

      currentBatch++;
      const batchRecords = allRecords.slice(i, i + BATCH_SIZE);

      const mappedBatch: Record<string, any>[] = [];
      const batchVatByMappedIdx: (VATTransformEntry[] | undefined)[] = [];
      let batchLocalIdx = 0;
      for (const rawRecord of batchRecords) {
        const globalIdx = i + batchLocalIdx;
        try {
          const { result, vatTransforms } = applyFieldMappings(rawRecord, mappings);
          batchVatByMappedIdx.push(vatTransforms.length > 0 ? vatTransforms : undefined);
          mappedBatch.push(result);
        } catch (err: any) {
          totalFailed++;
          allErrors.push({ batch: currentBatch, index: globalIdx, message: `Mapping error: ${err.message}` });
          if (syncedRecords.length < MAX_SYNCED_RECORDS_STORED) {
            syncedRecords.push({ sourceIndex: globalIdx, target_id: null, status: "error", errorMsg: `Mapping: ${err.message}` });
          }
        }
        batchLocalIdx++;
      }

      if (vatSamples.length < 3) {
        for (const vt of batchVatByMappedIdx) {
          if (vt && vt.length > 0 && vatSamples.length < 3) {
            for (const entry of vt) {
              if (vatSamples.length < 3) vatSamples.push(entry);
            }
          }
        }
      }

      let batchErrorCount = 0;
      let lastPushRecords: PushRecordResult[] = [];

      let batchAvgLatency = 0;
      let batchWallClockMs = 0;
      if (mappedBatch.length > 0) {
        try {
          const batchWallStart = Date.now();
          const pushResult = await pushToTarget(
            targetModule,
            config.targetDataSource || null,
            mappedBatch,
            currentBatch - 1,
            batchRecords,
            {
              matchFields: ((config as any).matchFields || []).filter((f: string) => f && f.trim()),
              matchOperator: ((config as any).matchOperator as "and" | "or") || "and",
              onMissing: ((config as any).onMissing as "create" | "skip" | "force") || "create",
              mappings,
              targetStock: (config as any).targetStock || undefined,
              hKodConfig: (config as any).hKodConfig?.enabled
                ? { ...(config as any).hKodConfig, nextNumber: hKodNextNumber ?? (config as any).hKodConfig.nextNumber }
                : null,
              onixFixedFields: (config as any).onixFixedFields?.length ? (config as any).onixFixedFields : null,
            }
          );
          if (pushResult.hKodNextNumber !== undefined) {
            hKodNextNumber = pushResult.hKodNextNumber;
          }
          batchWallClockMs = Date.now() - batchWallStart;
          totalCreated += pushResult.createdCount;
          totalUpdated += pushResult.updatedCount;
          totalFailed += pushResult.errorCount;
          totalSkippedByMatch += pushResult.skippedCount || 0;
          batchErrorCount = pushResult.errorCount;
          lastPushRecords = pushResult.records;
          if (pushResult.avgLatencyMs != null && pushResult.avgLatencyMs > 0) {
            const batchRecordCount = pushResult.createdCount + pushResult.updatedCount + pushResult.errorCount;
            allLatencyMs += pushResult.avgLatencyMs * batchRecordCount;
            allLatencyCount += batchRecordCount;
            batchAvgLatency = pushResult.avgLatencyMs;
            if (pushResult.minLatencyMs != null && pushResult.minLatencyMs < globalMinLatency) globalMinLatency = pushResult.minLatencyMs;
            if (pushResult.maxLatencyMs != null && pushResult.maxLatencyMs > globalMaxLatency) globalMaxLatency = pushResult.maxLatencyMs;
          }
          for (const e of pushResult.errors) {
            allErrors.push({ batch: currentBatch, ...e });
          }
          for (const r of pushResult.records) {
            if (syncedRecords.length < MAX_SYNCED_RECORDS_STORED) {
              const mappedIdx = r.sourceIndex - (currentBatch - 1) * BATCH_SIZE;
              const vatTransforms = mappedIdx >= 0 ? batchVatByMappedIdx[mappedIdx] : undefined;
              syncedRecords.push(vatTransforms ? { ...r, vatTransforms } : r);
            }
            if (r.status === "skipped" && r.nsNumber && allSkippedItems.length < 10000) {
              allSkippedItems.push({ nsNumber: r.nsNumber, reason: r.errorMsg || "Preskočené" });
            }
          }
          // Write record snapshots to sync_baselines
          if (pushResult.records.length > 0) {
            const snapEntries = pushResult.records
              .filter(r => r.recordKey && r.recordKey.trim() !== '')
              .map(r => {
                const bIdx = r.sourceIndex - (currentBatch - 1) * BATCH_SIZE;
                return {
                  recordKey: r.recordKey!,
                  fieldHash: (batchableBaselines[i + bIdx]?.fieldHash) || '',
                  sourceData: (bIdx >= 0 && bIdx < batchRecords.length) ? batchRecords[bIdx] : undefined,
                  targetData: (bIdx >= 0 && bIdx < mappedBatch.length) ? mappedBatch[bIdx] : undefined,
                  hCode: r.hCode,
                  onixNsNumber: r.onixNsNumber,
                  onixRecordId: r.onixRecordId,
                  syncStatus: r.status,
                  errorMessage: r.errorMsg,
                };
              });
            if (snapEntries.length > 0) {
              storage.upsertRecordSnapshots(config.id, runId, snapEntries).catch((_e: any) => {});
            }
          }
          // Save H kód decisions for audit log
          if (pushResult.hKodDecisions && pushResult.hKodDecisions.length > 0) {
            storage.insertHkodDecisions(runId, config.id, pushResult.hKodDecisions).catch((_e: any) => {});
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
        const earlyAvgLatency = allLatencyCount > 0 ? Math.round(allLatencyMs / allLatencyCount) : 0;
        const earlySpeedRating = earlyAvgLatency === 0 ? "unknown" : earlyAvgLatency < 200 ? "fast" : earlyAvgLatency < 1000 ? "normal" : earlyAvgLatency < 3000 ? "slow" : "very_slow";
        const earlyVatMapping = mappings.find(m => m.transform && m.transform.startsWith("price_excl_vat"));
        const earlyVatRate = earlyVatMapping ? (earlyVatMapping.transform!.split(":")[1] || "23") : null;
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
          avgLatencyMs: earlyAvgLatency,
          minLatencyMs: globalMinLatency === Infinity ? 0 : globalMinLatency,
          maxLatencyMs: globalMaxLatency,
          speedRating: earlySpeedRating,
          hasVatDivider: !!earlyVatMapping,
          vatDividerRate: earlyVatRate,
        };
        log(`EARLY STOP: ${consecutiveFailBatches} consecutive batches failed. Last error: ${lastError}`);
        await resilientDbUpdate(runId, {
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
          await storage.createSyncLog({
            moduleId: config.sourceModuleId,
            direction: "import",
            status: "error",
            recordsProcessed: totalCreated + totalUpdated,
            recordsFailed: totalFailed,
            errorMessage: `Sync stopped: ${consecutiveFailBatches} consecutive batches failed. Last error: ${lastError}`.slice(0, 500),
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

      // Include skipped in totalProcessed so progress, speed and ETA are correct
      const totalProcessed = totalCreated + totalUpdated + totalFailed + totalSkippedByMatch;
      const elapsed = Date.now() - startTime;
      const overallSpeedPerSec = elapsed > 0 ? Math.round((totalProcessed / elapsed) * 1000) : 0;

      const batchProcessed = batchRecords.length;
      if (batchWallClockMs > 0 && batchProcessed > 0) {
        const batchSpeed = (batchProcessed / batchWallClockMs) * 1000;
        batchSpeeds.push(batchSpeed);
        if (batchSpeeds.length > ETA_WINDOW) batchSpeeds.shift();
        batchSpeedHistory.push({ b: currentBatch, s: Math.round(batchSpeed) });
        if (batchSpeedHistory.length > 30) batchSpeedHistory.shift();
      }

      const windowSpeed = batchSpeeds.length > 0
        ? batchSpeeds.reduce((a, b) => a + b, 0) / batchSpeeds.length
        : overallSpeedPerSec;
      const speedPerSec = Math.round(windowSpeed > 0 ? windowSpeed : overallSpeedPerSec);
      const remaining = totalRecords - totalProcessed;
      const estimatedMs = speedPerSec > 0 ? (remaining / speedPerSec) * 1000 : 0;

      const lastBatchSample = batchRecords.slice(0, 5).map((r: any, idx: number) => {
        const mapped = mappedBatch[idx];
        const keys = Object.keys(r);
        const label = r.Name || r.name || r.Code || r.code || r.Nazov || r.nazov ||
                      r.Description || r.description || r.Title || r.title ||
                      (keys.length > 0 ? String(r[keys[0]]).slice(0, 60) : `record ${i + idx + 1}`);
        const result = lastPushRecords[idx] || null;
        // Use actual push result status; only fall back to "created" when result exists but has no status
        const status = result ? (result.status || "created") : "skipped";
        return {
          index: i + idx + 1,
          label: String(label).slice(0, 80),
          status,
          targetId: result?.target_id || null,
          fields: mapped ? Object.keys(mapped).length : keys.length,
        };
      });

      const batchCreatedCount = lastPushRecords.filter(r => r.status === "created").length;
      const batchUpdatedCount = lastPushRecords.filter(r => r.status === "updated").length;
      const batchSkippedCount = lastPushRecords.filter(r => r.status === "skipped").length;

      const currentAvgLatency = allLatencyCount > 0 ? Math.round(allLatencyMs / allLatencyCount) : 0;

      await resilientDbUpdate(runId, {
        recordsProcessed: totalCreated + totalUpdated,
        recordsFailed: totalFailed,
        recordsSkipped: totalSkippedByMatch,
        progress: totalRecords > 0 ? Math.min(99, Math.round((totalProcessed / totalRecords) * 100)) : 0,
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
          totalSkippedByMatch,
          batchErrors: allErrors.slice(-20),
          liveBatch: {
            batchNumber: currentBatch,
            recordsInBatch: batchRecords.length,
            sample: lastBatchSample,
            batchCreated: batchCreatedCount,
            batchUpdated: batchUpdatedCount,
            batchSkipped: batchSkippedCount,
            batchErrors: batchErrorCount,
            batchAvgLatency,
          },
          elapsedMs: elapsed,
          avgLatencyMs: currentAvgLatency,
          minLatencyMs: globalMinLatency === Infinity ? 0 : globalMinLatency,
          maxLatencyMs: globalMaxLatency,
          speedRating: currentAvgLatency === 0 ? "unknown" : currentAvgLatency < 200 ? "fast" : currentAvgLatency < 1000 ? "normal" : currentAvgLatency < 3000 ? "slow" : "very_slow",
          batchSpeedHistory: batchSpeedHistory.slice(),
          errorRate: (totalCreated + totalUpdated + totalFailed) > 0 ? Math.round((totalFailed / (totalCreated + totalUpdated + totalFailed)) * 1000) / 10 : 0,
          sourceFiltersApplied,
          hKodRange: hKodStartNumber !== undefined && hKodNextNumber !== undefined && hKodNextNumber > hKodStartNumber ? {
            prefix: (config as any).hKodConfig?.prefix || "H",
            padding: (config as any).hKodConfig?.padding || 6,
            first: hKodStartNumber,
            last: hKodNextNumber - 1,
            count: hKodNextNumber - hKodStartNumber,
          } : undefined,
        },
      }, `batch:${currentBatch}`);

      log(`Batch ${currentBatch}/${totalBatches}: created=${totalCreated} updated=${totalUpdated} skipped=${totalSkippedByMatch} fail=${totalFailed} speed=${speedPerSec}/s`);

      if (currentBatch % CHECKPOINT_EVERY_BATCHES === 0) {
        const checkpoint: CheckpointData = {
          globalOffset: i + BATCH_SIZE,
          totalCreated,
          totalUpdated,
          totalFailed,
          totalSkippedByMatch,
          errors: allErrors.slice(-100),
          savedAt: new Date().toISOString(),
        };
        storage.updateSyncRun(runId, { checkpointData: checkpoint } as any).catch(() => {});
        log(`Checkpoint saved at offset ${checkpoint.globalOffset}`);

        const batchBaselineSlice = batchableBaselines
          .slice(i, i + BATCH_SIZE)
          .filter((b): b is { recordKey: string; fieldHash: string } => b !== null);
        if (batchBaselineSlice.length > 0) {
          storage.upsertBaselines(config.id, batchBaselineSlice).catch((_e) => {});
        }

        if (
          (config as any).hKodConfig?.enabled &&
          hKodNextNumber !== undefined &&
          hKodNextNumber !== (config as any).hKodConfig.nextNumber
        ) {
          storage.updateSyncConfig(config.id, {
            hKodConfig: { ...(config as any).hKodConfig, nextNumber: hKodNextNumber },
          } as any).catch((_e) => {});
        }
      }
    }

    const processedOk = totalCreated + totalUpdated;
    const finalStatus = totalFailed === 0 ? "success" : (processedOk > 0 ? "partial" : "error");
    const duration = Date.now() - startTime;

    const sampleTargetIds = syncedRecords
      .filter(r => r.status === "created" && r.target_id != null)
      .slice(0, 10)
      .map(r => r.target_id);

    const mappingNames = mappings.map(m => `${m.sourceField} → ${m.targetField}`);

    const finalAvgLatency = allLatencyCount > 0 ? Math.round(allLatencyMs / allLatencyCount) : 0;
    const speedRating = finalAvgLatency === 0 ? "unknown" : finalAvgLatency < 200 ? "fast" : finalAvgLatency < 1000 ? "normal" : finalAvgLatency < 3000 ? "slow" : "very_slow";

    const vatMapping = mappings.find(m => m.transform && m.transform.startsWith("price_excl_vat"));
    const vatDividerRate = vatMapping ? (vatMapping.transform!.split(":")[1] || "23") : null;

    const errorCounts = new Map<string, number>();
    for (const e of allErrors) {
      const msg = e.message.slice(0, 150);
      errorCounts.set(msg, (errorCounts.get(msg) || 0) + 1);
    }
    const topErrors = Array.from(errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([message, count]) => ({ message, count }));

    const finalHKodRange = hKodStartNumber !== undefined && hKodNextNumber !== undefined && hKodNextNumber > hKodStartNumber ? {
      prefix: (config as any).hKodConfig?.prefix || "H",
      padding: (config as any).hKodConfig?.padding || 6,
      first: hKodStartNumber,
      last: hKodNextNumber - 1,
      count: hKodNextNumber - hKodStartNumber,
    } : undefined;

    const finalErrorRate = (totalCreated + totalUpdated + totalFailed) > 0
      ? Math.round((totalFailed / (totalCreated + totalUpdated + totalFailed)) * 1000) / 10
      : 0;

    const completionSummary = {
      totalCreated,
      totalUpdated,
      totalFailed,
      totalSkippedByMatch,
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
      avgLatencyMs: finalAvgLatency,
      minLatencyMs: globalMinLatency === Infinity ? 0 : globalMinLatency,
      maxLatencyMs: globalMaxLatency,
      speedRating,
      hasVatDivider: !!vatMapping,
      vatDividerRate,
      topErrors,
      hKodRange: finalHKodRange,
      vatSamples: vatSamples.slice(0, 3),
      sourceFiltersApplied,
      errorRate: finalErrorRate,
      batchSpeedHistory: batchSpeedHistory.slice(),
    };

    await resilientDbUpdate(runId, {
      status: finalStatus,
      recordsProcessed: processedOk,
      recordsFailed: totalFailed,
      recordsSkipped: totalSkippedByMatch,
      progress: 100,
      completedAt: new Date(),
      checkpointData: null,
      errorMessage: totalFailed > 0 ? `${totalFailed} records failed` : null,
      details: {
        phase: "complete",
        phaseHistory: { preflight: "done", backup: "done", fetch: "done", sync: "done" },
        duration,
        totalCreated,
        totalUpdated,
        totalFailed,
        totalSkippedByMatch,
        batchErrors: allErrors,
        skippedItems: allSkippedItems,
        syncedRecords,
        completionSummary,
      },
    }, "completion");

    log(`=== COMPLETE === vytvorené=${totalCreated} aktualizované=${totalUpdated} preskočené(nenájdené)=${totalSkippedByMatch} chyby=${totalFailed} delta_bez_zmeny=${totalSkipped} trvanie=${duration}ms`);

    if (baselineUpdates.length > 0) {
      try {
        await storage.upsertBaselines(config.id, baselineUpdates);
        log(`Saved ${baselineUpdates.length} baseline entries`);
      } catch (err: any) {
        log(`Failed to save baselines: ${err.message}`);
      }
    }

    if ((config as any).hKodConfig?.enabled && hKodNextNumber !== undefined && hKodNextNumber !== (config as any).hKodConfig.nextNumber) {
      try {
        await storage.updateSyncConfig(config.id, {
          hKodConfig: { ...(config as any).hKodConfig, nextNumber: hKodNextNumber },
        } as any);
        log(`H kód counter uložený: ${hKodNextNumber}`);
      } catch (err: any) {
        log(`H kód counter sa nepodarilo uložiť: ${err.message}`);
      }
    }

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
    try {
      await resilientDbUpdate(runId, {
        status: "error",
        errorMessage: err.message || "Unknown error",
        completedAt: new Date(),
        details: { phase: "error", phaseHistory: buildErrorPhaseHistory("sync") },
      }, "final-error");
    } catch (dbErr: any) {
      console.error(`[sync-engine] Run ${runId}: Failed to save error state:`, dbErr.message);
    }

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

export async function resumeSyncRun(runId: string): Promise<boolean> {
  const run = await storage.getSyncRun(runId);
  if (!run) return false;

  const checkpoint = (run as any).checkpointData as CheckpointData | null;
  if (!checkpoint) return false;

  const config = await storage.getSyncConfig(run.syncConfigId);
  if (!config) return false;

  const sourceModule = await storage.getModule(config.sourceModuleId);
  if (!sourceModule) return false;

  const targetModule = await storage.getModule(config.targetModuleId);
  if (!targetModule) return false;

  if (activeRuns.has(runId)) {
    console.log(`[sync-engine] Resume skipped — run ${runId} is already active`);
    return false;
  }

  const runState = { cancelled: false };
  activeRuns.set(runId, runState);

  await storage.updateSyncRun(runId, {
    status: "running" as any,
    errorMessage: null,
    completedAt: null,
    details: {
      phase: "resume",
      resuming: true,
      resumeOffset: checkpoint.globalOffset,
      resumedAt: new Date().toISOString(),
    },
  } as any);

  console.log(`[sync-engine] Resuming run ${runId.slice(0, 8)} from checkpoint offset ${checkpoint.globalOffset}`);

  executeAsync(runId, config, sourceModule, targetModule, runState, true, checkpoint).catch((err) => {
    console.error(`[sync-engine] Fatal error resuming run ${runId}:`, err);
    storage.updateSyncRun(runId, {
      status: "error" as any,
      errorMessage: err.message || "Fatal error during resume",
      completedAt: new Date(),
      checkpointData: checkpoint,
    } as any).catch(() => {});
    activeRuns.delete(runId);
  });

  return true;
}

export async function restoreFromBackup(backupId: string): Promise<{ success: boolean; message: string; recordCount?: number }> {
  const backup = await storage.getSyncBackup(backupId);
  if (!backup) return { success: false, message: "Backup not found" };
  if (!backup.googleDriveFileId) return { success: false, message: "No Google Drive file ID" };

  try {
    const snapshot = backup.configSnapshot as any;
    let allRecords: any[] = [];

    if (snapshot?.parts && Array.isArray(snapshot.parts) && snapshot.parts.length > 1) {
      const sortedParts = [...snapshot.parts].sort((a: any, b: any) => a.partNumber - b.partNumber);
      for (const part of sortedParts) {
        if (!part.fileId) continue;
        const partData = await downloadBackup(part.fileId);
        if (partData?.data && Array.isArray(partData.data)) {
          allRecords = allRecords.concat(partData.data);
        }
      }
      console.log(`[sync-engine] Restore from backup ${backupId}: ${allRecords.length} records from ${sortedParts.length} parts`);
    } else {
      const data = await downloadBackup(backup.googleDriveFileId);
      if (!data || !data.data) {
        return { success: false, message: "Backup file is empty or corrupted" };
      }
      allRecords = data.data;
      console.log(`[sync-engine] Restore from backup ${backupId}: ${allRecords.length} records downloaded`);
    }

    return {
      success: true,
      message: `Backup data downloaded: ${allRecords.length} records from ${backup.fileName}. Data ready for manual review.`,
      recordCount: allRecords.length,
    };
  } catch (err: any) {
    return { success: false, message: err.message || "Restore failed" };
  }
}
