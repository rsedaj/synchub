import { eq, desc, count, and, gte, sql, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  users, apiModules, syncLogs, auditLogs, syncConfigs, syncRuns, syncRunEvents, syncBackups, syncBaselines, onixBackups, hkodDecisions, configSnapshots,
  type User, type InsertUser,
  type ApiModule, type InsertApiModule,
  type SyncLog, type InsertSyncLog,
  type AuditLog, type InsertAuditLog,
  type SyncConfig, type InsertSyncConfig,
  type SyncRun, type InsertSyncRun,
  type SyncRunEvent, type InsertSyncRunEvent,
  type SyncBackup, type InsertSyncBackup,
  type OnixBackup, type InsertOnixBackup,
  type ConfigSnapshot, type InsertConfigSnapshot,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;

  getAllModules(): Promise<ApiModule[]>;
  getModule(id: string): Promise<ApiModule | undefined>;
  getModuleByCode(code: string): Promise<ApiModule | undefined>;
  createModule(mod: InsertApiModule): Promise<ApiModule>;
  updateModule(id: string, data: Partial<ApiModule>): Promise<ApiModule | undefined>;
  deleteModule(id: string): Promise<void>;

  getSyncLogs(limit?: number, moduleId?: string): Promise<SyncLog[]>;
  createSyncLog(log: InsertSyncLog): Promise<SyncLog>;
  updateSyncLog(id: string, data: Partial<SyncLog>): Promise<SyncLog | undefined>;
  getSyncStats(): Promise<{ total: number; success: number; error: number; running: number }>;

  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(limit?: number): Promise<AuditLog[]>;

  getDashboardStats(): Promise<{
    totalModules: number;
    connectedModules: number;
    todaySyncs: number;
    errorSyncs: number;
    recentSyncs: SyncLog[];
    moduleStatuses: ApiModule[];
  }>;

  getAllSyncConfigs(): Promise<SyncConfig[]>;
  getSyncConfig(id: string): Promise<SyncConfig | undefined>;
  createSyncConfig(data: InsertSyncConfig): Promise<SyncConfig>;
  updateSyncConfig(id: string, data: Partial<SyncConfig>): Promise<SyncConfig | undefined>;
  deleteSyncConfig(id: string): Promise<void>;
  getSyncConfigStats(): Promise<Record<string, { totalProcessed: number; totalFailed: number; runCount: number }>>;
  getSyncRuns(configId?: string, limit?: number): Promise<SyncRun[]>;
  getSyncRun(id: string): Promise<SyncRun | undefined>;
  createSyncRun(data: InsertSyncRun): Promise<SyncRun>;
  updateSyncRun(id: string, data: Partial<SyncRun>): Promise<SyncRun | undefined>;
  createSyncRunEvent(event: InsertSyncRunEvent): Promise<SyncRunEvent>;
  createSyncRunEvents(events: InsertSyncRunEvent[]): Promise<void>;
  getMaxSyncRunEventSeq(runId: string): Promise<number>;
  getSyncRunEvents(runId: string, opts?: { level?: string; limit?: number; offset?: number }): Promise<SyncRunEvent[]>;

  getAllSyncBackups(): Promise<SyncBackup[]>;
  getSyncBackup(id: string): Promise<SyncBackup | undefined>;
  getSyncBackupsByConfig(configId: string): Promise<SyncBackup[]>;
  getEnrichedSyncBackups(): Promise<any[]>;
  createSyncBackup(data: InsertSyncBackup): Promise<SyncBackup>;
  deleteSyncBackup(id: string): Promise<void>;
  deleteSyncBackupsByConfig(configId: string): Promise<void>;

  getBaselines(configId: string): Promise<Map<string, string>>;
  upsertBaselines(configId: string, entries: Array<{ recordKey: string; fieldHash: string }>): Promise<void>;
  deleteBaselines(configId: string): Promise<void>;
  clearHkodHistory(configId: string): Promise<number>;

  upsertRecordSnapshots(configId: string, runId: string, entries: Array<{
    recordKey: string;
    fieldHash?: string;
    sourceData?: Record<string, any>;
    targetData?: Record<string, any>;
    hCode?: string;
    onixNsNumber?: string;
    onixRecordId?: string;
    syncStatus: string;
    errorMessage?: string;
  }>): Promise<void>;
  getRecordSnapshots(opts: {
    configId: string;
    limit?: number;
    offset?: number;
    status?: string;
    search?: string;
  }): Promise<{ rows: any[]; total: number }>;
  getRecordSnapshotStats(): Promise<Array<{
    syncConfigId: string;
    configName: string;
    total: number;
    created: number;
    updated: number;
    errors: number;
    skipped: number;
    withHCode: number;
    lastSyncedAt: string | null;
  }>>;

  resetSyncHistory(): Promise<{ deletedRuns: number; deletedLogs: number; deletedBaselines: number }>;

  insertHkodDecisions(runId: string, configId: string | null, decisions: Array<{
    recordKey: string;
    onixId: number | null;
    onixNsNumber: string | null;
    decision: string;
    hCodeValue: string;
    reason: string;
  }>): Promise<void>;
  getHkodDecisions(runId: string): Promise<Array<{
    id: string;
    recordKey: string;
    onixId: number | null;
    onixNsNumber: string | null;
    decision: string;
    hCodeValue: string | null;
    reason: string | null;
    createdAt: Date;
  }>>;

  getHkodStats(): Promise<{
    totalAssigned: number;
    perConfig: Array<{ configId: string; assigned: number }>;
  }>;

  createOnixBackup(data: Partial<InsertOnixBackup>): Promise<OnixBackup>;
  updateOnixBackup(id: string, data: Partial<OnixBackup>): Promise<void>;
  getOnixBackups(limit?: number): Promise<OnixBackup[]>;
  getOnixBackup(id: string): Promise<OnixBackup | undefined>;

  createConfigSnapshot(data: InsertConfigSnapshot): Promise<ConfigSnapshot>;
  getConfigSnapshots(syncConfigId?: string): Promise<ConfigSnapshot[]>;
  deleteConfigSnapshot(id: string): Promise<void>;
  pruneConfigSnapshots(syncConfigId: string, maxCount: number): Promise<void>;

  getAnalyticsOverview(days: number): Promise<{
    perDay: Array<{
      day: string; runs: number; processed: number; failed: number;
      skipped: number; success: number; errors: number; partial: number;
      avgDurationSec: number | null;
    }>;
    allTime: {
      totalRuns: number; totalProcessed: number; totalFailed: number;
      successCount: number; avgDurationSec: number | null;
    };
    topConfigs: Array<{ configId: string; configName: string; totalRuns: number; totalProcessed: number }>;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getAllModules(): Promise<ApiModule[]> {
    return db.select().from(apiModules).orderBy(apiModules.sortOrder);
  }

  async getModule(id: string): Promise<ApiModule | undefined> {
    const [mod] = await db.select().from(apiModules).where(eq(apiModules.id, id));
    return mod;
  }

  async getModuleByCode(code: string): Promise<ApiModule | undefined> {
    const [mod] = await db.select().from(apiModules).where(eq(apiModules.code, code));
    return mod;
  }

  async createModule(mod: InsertApiModule): Promise<ApiModule> {
    const [created] = await db.insert(apiModules).values(mod).returning();
    return created;
  }

  async updateModule(id: string, data: Partial<ApiModule>): Promise<ApiModule | undefined> {
    const [updated] = await db.update(apiModules).set(data).where(eq(apiModules.id, id)).returning();
    return updated;
  }

  async deleteModule(id: string): Promise<void> {
    await db.delete(apiModules).where(eq(apiModules.id, id));
  }

  async getSyncLogs(limit = 50, moduleId?: string): Promise<SyncLog[]> {
    if (moduleId) {
      return db.select().from(syncLogs)
        .where(eq(syncLogs.moduleId, moduleId))
        .orderBy(desc(syncLogs.startedAt))
        .limit(limit);
    }
    return db.select().from(syncLogs).orderBy(desc(syncLogs.startedAt)).limit(limit);
  }

  async createSyncLog(log: InsertSyncLog): Promise<SyncLog> {
    const [created] = await db.insert(syncLogs).values(log).returning();
    return created;
  }

  async updateSyncLog(id: string, data: Partial<SyncLog>): Promise<SyncLog | undefined> {
    const [updated] = await db.update(syncLogs).set(data).where(eq(syncLogs.id, id)).returning();
    return updated;
  }

  async getSyncStats() {
    const allLogs = await db.select().from(syncLogs);
    return {
      total: allLogs.length,
      success: allLogs.filter(l => l.status === "success").length,
      error: allLogs.filter(l => l.status === "error").length,
      running: allLogs.filter(l => l.status === "running").length,
    };
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log).returning();
    return created;
  }

  async getAuditLogs(limit = 100): Promise<AuditLog[]> {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
  }

  async getDashboardStats() {
    const allModules = await this.getAllModules();
    const activeModules = allModules.filter(m => m.isActive !== false);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayLogs = await db.select().from(syncLogs)
      .where(gte(syncLogs.startedAt, today));

    const recentSyncs = await db.select().from(syncLogs)
      .orderBy(desc(syncLogs.startedAt))
      .limit(10);

    return {
      totalModules: activeModules.length,
      connectedModules: activeModules.filter(m => m.status === "connected").length,
      disabledModules: allModules.filter(m => m.isActive === false).length,
      todaySyncs: todayLogs.length,
      errorSyncs: todayLogs.filter(l => l.status === "error").length,
      recentSyncs,
      moduleStatuses: activeModules,
    };
  }

  async getAllSyncConfigs(): Promise<SyncConfig[]> {
    return db.select().from(syncConfigs).orderBy(desc(syncConfigs.createdAt));
  }

  async getSyncConfig(id: string): Promise<SyncConfig | undefined> {
    const [config] = await db.select().from(syncConfigs).where(eq(syncConfigs.id, id));
    return config;
  }

  async createSyncConfig(data: InsertSyncConfig): Promise<SyncConfig> {
    const [created] = await db.insert(syncConfigs).values(data).returning();
    return created;
  }

  async updateSyncConfig(id: string, data: Partial<SyncConfig>): Promise<SyncConfig | undefined> {
    const [updated] = await db.update(syncConfigs).set({ ...data, updatedAt: new Date() }).where(eq(syncConfigs.id, id)).returning();
    return updated;
  }

  async deleteSyncConfig(id: string): Promise<void> {
    await db.delete(syncBackups).where(eq(syncBackups.syncConfigId, id));
    await db.delete(syncRuns).where(eq(syncRuns.syncConfigId, id));
    await db.delete(syncConfigs).where(eq(syncConfigs.id, id));
  }

  async getSyncConfigStats(): Promise<Record<string, { totalProcessed: number; totalFailed: number; runCount: number }>> {
    const rows = await db
      .select({
        syncConfigId: syncRuns.syncConfigId,
        totalProcessed: sql<number>`COALESCE(SUM(${syncRuns.recordsProcessed}), 0)::int`,
        totalFailed: sql<number>`COALESCE(SUM(${syncRuns.recordsFailed}), 0)::int`,
        runCount: sql<number>`COUNT(*)::int`,
      })
      .from(syncRuns)
      .groupBy(syncRuns.syncConfigId);
    return Object.fromEntries(rows.map(r => [r.syncConfigId, { totalProcessed: r.totalProcessed, totalFailed: r.totalFailed, runCount: r.runCount }]));
  }

  async getSyncRuns(configId?: string, limit = 50): Promise<SyncRun[]> {
    if (configId) {
      return db.select().from(syncRuns)
        .where(eq(syncRuns.syncConfigId, configId))
        .orderBy(desc(syncRuns.startedAt))
        .limit(limit);
    }
    return db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(limit);
  }

  async createSyncRun(data: InsertSyncRun): Promise<SyncRun> {
    const [created] = await db.insert(syncRuns).values(data).returning();
    return created;
  }

  async getSyncRun(id: string): Promise<SyncRun | undefined> {
    const [run] = await db.select().from(syncRuns).where(eq(syncRuns.id, id));
    return run;
  }

  async updateSyncRun(id: string, data: Partial<SyncRun>): Promise<SyncRun | undefined> {
    const [updated] = await db.update(syncRuns).set(data).where(eq(syncRuns.id, id)).returning();
    return updated;
  }

  async createSyncRunEvent(event: InsertSyncRunEvent): Promise<SyncRunEvent> {
    const [created] = await db.insert(syncRunEvents).values(event).returning();
    return created;
  }

  async createSyncRunEvents(events: InsertSyncRunEvent[]): Promise<void> {
    if (events.length === 0) return;
    const CHUNK = 200;
    for (let i = 0; i < events.length; i += CHUNK) {
      await db.insert(syncRunEvents).values(events.slice(i, i + CHUNK));
    }
  }

  async getMaxSyncRunEventSeq(runId: string): Promise<number> {
    const [row] = await db
      .select({ maxSeq: sql<number>`COALESCE(MAX(${syncRunEvents.seq}), -1)` })
      .from(syncRunEvents)
      .where(eq(syncRunEvents.syncRunId, runId));
    return Number(row?.maxSeq ?? -1);
  }

  async getSyncRunEvents(runId: string, opts: { level?: string; limit?: number; offset?: number } = {}): Promise<SyncRunEvent[]> {
    const limit = Math.min(Math.max(opts.limit ?? 2000, 1), 5000);
    const offset = Math.max(opts.offset ?? 0, 0);
    const conds = [eq(syncRunEvents.syncRunId, runId)];
    if (opts.level) conds.push(eq(syncRunEvents.level, opts.level as any));
    return db.select().from(syncRunEvents)
      .where(and(...conds))
      .orderBy(syncRunEvents.seq)
      .limit(limit)
      .offset(offset);
  }

  async getAllSyncBackups(): Promise<SyncBackup[]> {
    return db.select().from(syncBackups).orderBy(desc(syncBackups.createdAt));
  }

  async getSyncBackup(id: string): Promise<SyncBackup | undefined> {
    const [backup] = await db.select().from(syncBackups).where(eq(syncBackups.id, id));
    return backup;
  }

  async getSyncBackupsByConfig(configId: string): Promise<SyncBackup[]> {
    return db.select().from(syncBackups)
      .where(eq(syncBackups.syncConfigId, configId))
      .orderBy(desc(syncBackups.createdAt));
  }

  async getEnrichedSyncBackups(): Promise<any[]> {
    const rows = await db.execute(sql`
      SELECT
        sb.id, sb.sync_config_id, sb.sync_run_id, sb.file_name, sb.file_size,
        sb.google_drive_file_id, sb.google_drive_url, sb.backup_record_count,
        sb.config_snapshot, sb.backup_type, sb.local_file_path,
        sb.description, sb.db_environment, sb.created_at,
        sc.name AS config_name,
        src.name AS source_module_name, src.code AS source_module_code,
        tgt.name AS target_module_name, tgt.code AS target_module_code, tgt.base_url AS target_module_base_url
      FROM sync_backups sb
      LEFT JOIN sync_configs sc ON sb.sync_config_id = sc.id
      LEFT JOIN api_modules src ON sc.source_module_id = src.id
      LEFT JOIN api_modules tgt ON sc.target_module_id = tgt.id
      ORDER BY sb.created_at DESC
    `);
    return (rows as any).rows ?? rows;
  }

  async createSyncBackup(data: InsertSyncBackup): Promise<SyncBackup> {
    const [created] = await db.insert(syncBackups).values(data).returning();
    return created;
  }

  async deleteSyncBackup(id: string): Promise<void> {
    await db.delete(syncBackups).where(eq(syncBackups.id, id));
  }

  async deleteSyncBackupsByConfig(configId: string): Promise<void> {
    await db.delete(syncBackups).where(eq(syncBackups.syncConfigId, configId));
  }

  async getBaselines(configId: string): Promise<Map<string, string>> {
    const rows = await db.select({
      recordKey: syncBaselines.recordKey,
      fieldHash: syncBaselines.fieldHash,
    }).from(syncBaselines).where(eq(syncBaselines.syncConfigId, configId));
    const map = new Map<string, string>();
    for (const r of rows) {
      map.set(r.recordKey, r.fieldHash);
    }
    return map;
  }

  async upsertBaselines(configId: string, entries: Array<{ recordKey: string; fieldHash: string }>): Promise<void> {
    const CHUNK = 500;
    const stripNul = (v: string) => v.replace(/\u0000/g, "");
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      const rows = chunk.map(e => sql`(${configId}, ${stripNul(e.recordKey)}, ${stripNul(e.fieldHash)}, NOW())`);
      await db.execute(sql`
        INSERT INTO sync_baselines (sync_config_id, record_key, field_hash, updated_at)
        VALUES ${sql.join(rows, sql.raw(","))}
        ON CONFLICT (sync_config_id, record_key)
        DO UPDATE SET field_hash = EXCLUDED.field_hash, updated_at = NOW()
      `);
    }
  }

  async deleteBaselines(configId: string): Promise<void> {
    await db.delete(syncBaselines).where(eq(syncBaselines.syncConfigId, configId));
    await db.delete(hkodDecisions).where(eq(hkodDecisions.syncConfigId, configId));
  }

  async clearHkodHistory(configId: string): Promise<number> {
    const result = await db.execute(sql`
      UPDATE sync_baselines
      SET h_code = NULL, onix_ns_number = NULL, onix_record_id = NULL
      WHERE sync_config_id = ${configId}
        AND h_code IS NOT NULL
    `);
    return (result as any).rowCount ?? 0;
  }

  async upsertRecordSnapshots(configId: string, runId: string, entries: Array<{
    recordKey: string;
    fieldHash?: string;
    sourceData?: Record<string, any>;
    targetData?: Record<string, any>;
    hCode?: string;
    onixNsNumber?: string;
    onixRecordId?: string;
    syncStatus: string;
    errorMessage?: string;
  }>): Promise<void> {
    const CHUNK = 50;
    // Postgres text/jsonb columns reject the NUL codepoint (U+0000) outright — even
    // as a \u0000 escape inside a jsonb literal ("unsupported Unicode escape
    // sequence"). Source feeds (XML/JSON from external suppliers) occasionally
    // contain stray NUL bytes, which previously made the whole INSERT fail
    // silently (see the .catch() at the sync-engine call site) and left h_code /
    // onix_ns_number / source_data / target_data permanently NULL for affected
    // configs even though the run itself reported success.
    const stripNul = (v: string) => v.replace(/\u0000/g, "");
    const cleanStr = (v: string | null | undefined) => v != null ? stripNul(String(v)) : null;
    // JSON.stringify renders an embedded NUL char (U+0000) as the literal 6-char
    // escape sequence "\u0000" — not an actual NUL byte — so it must be stripped
    // from the *serialized* text (case-insensitive: \u0000 / \U0000), not via stripNul.
    const cleanJson = (v: any) => v != null ? JSON.parse(JSON.stringify(v).replace(/\\u0000/gi, "")) : null;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      const rows = chunk.map(e => sql`(
        ${configId}, ${cleanStr(e.recordKey)}, ${cleanStr(e.fieldHash) ?? ''}, NOW(),
        ${cleanJson(e.sourceData)}, ${cleanJson(e.targetData)}, ${cleanStr(e.hCode)},
        ${cleanStr(e.onixNsNumber)}, ${cleanStr(e.onixRecordId)}, ${cleanStr(e.syncStatus)},
        ${cleanStr(e.errorMessage)}, ${cleanStr(runId)}, NOW(), NOW()
      )`);
      await db.execute(sql`
        INSERT INTO sync_baselines (sync_config_id, record_key, field_hash, updated_at, source_data, target_data, h_code, onix_ns_number, onix_record_id, sync_status, error_message, sync_run_id, first_synced_at, last_synced_at)
        VALUES ${sql.join(rows, sql.raw(","))}
        ON CONFLICT (sync_config_id, record_key) DO UPDATE SET
          field_hash = CASE WHEN EXCLUDED.field_hash != '' THEN EXCLUDED.field_hash ELSE sync_baselines.field_hash END,
          updated_at = NOW(),
          source_data = EXCLUDED.source_data,
          target_data = EXCLUDED.target_data,
          h_code = COALESCE(EXCLUDED.h_code, sync_baselines.h_code),
          onix_ns_number = COALESCE(EXCLUDED.onix_ns_number, sync_baselines.onix_ns_number),
          onix_record_id = COALESCE(EXCLUDED.onix_record_id, sync_baselines.onix_record_id),
          sync_status = EXCLUDED.sync_status,
          error_message = EXCLUDED.error_message,
          sync_run_id = EXCLUDED.sync_run_id,
          first_synced_at = COALESCE(sync_baselines.first_synced_at, NOW()),
          last_synced_at = NOW()
      `);
    }
  }

  async getRecordSnapshots(opts: {
    configId: string;
    limit?: number;
    offset?: number;
    status?: string;
    search?: string;
  }): Promise<{ rows: any[]; total: number }> {
    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = opts.offset ?? 0;
    const esc = (v: string) => v.replace(/'/g, "''");
    let where = `sb.sync_config_id = '${esc(opts.configId)}'`;
    if (opts.status && opts.status !== 'all') {
      where += ` AND sb.sync_status = '${esc(opts.status)}'`;
    }
    if (opts.search && opts.search.trim()) {
      const s = esc(opts.search.trim().toLowerCase());
      where += ` AND (LOWER(sb.record_key) LIKE '%${s}%' OR LOWER(COALESCE(sb.h_code,'')) LIKE '%${s}%' OR LOWER(COALESCE(sb.onix_ns_number,'')) LIKE '%${s}%')`;
    }
    const countResult = await db.execute(sql.raw(`SELECT COUNT(*)::int AS total FROM sync_baselines sb WHERE ${where}`));
    const total = Number((countResult as any).rows?.[0]?.total ?? 0);
    const rowsResult = await db.execute(sql.raw(`
      SELECT sb.id, sb.record_key, sb.h_code, sb.onix_ns_number, sb.onix_record_id,
             sb.sync_status, sb.error_message, sb.sync_run_id,
             sb.first_synced_at, sb.last_synced_at, sb.field_hash,
             sb.source_data, sb.target_data
      FROM sync_baselines sb
      WHERE ${where}
      ORDER BY sb.last_synced_at DESC NULLS LAST, sb.record_key ASC
      LIMIT ${limit} OFFSET ${offset}
    `));
    return { rows: (rowsResult as any).rows ?? [], total };
  }

  async getRecordSnapshotStats(): Promise<Array<{
    syncConfigId: string;
    configName: string;
    total: number;
    created: number;
    updated: number;
    errors: number;
    skipped: number;
    withHCode: number;
    lastSyncedAt: string | null;
  }>> {
    const result = await db.execute(sql.raw(`
      SELECT
        sb.sync_config_id AS "syncConfigId",
        COALESCE(sc.name, sb.sync_config_id) AS "configName",
        COUNT(*)::int AS total,
        COUNT(CASE WHEN sb.sync_status = 'created' THEN 1 END)::int AS created,
        COUNT(CASE WHEN sb.sync_status = 'updated' THEN 1 END)::int AS updated,
        COUNT(CASE WHEN sb.sync_status = 'error' THEN 1 END)::int AS errors,
        COUNT(CASE WHEN sb.sync_status = 'skipped' THEN 1 END)::int AS skipped,
        COUNT(CASE WHEN sb.h_code IS NOT NULL AND sb.h_code != '' THEN 1 END)::int AS "withHCode",
        MAX(sb.last_synced_at)::text AS "lastSyncedAt"
      FROM sync_baselines sb
      LEFT JOIN sync_configs sc ON sc.id = sb.sync_config_id
      WHERE sb.last_synced_at IS NOT NULL
      GROUP BY sb.sync_config_id, sc.name
      ORDER BY sc.name NULLS LAST
    `));
    return ((result as any).rows ?? []) as any[];
  }

  async resetSyncHistory(): Promise<{ deletedRuns: number; deletedLogs: number; deletedBaselines: number }> {
    const [runsCount] = await db.select({ count: count() }).from(syncRuns);
    const [logsCount] = await db.select({ count: count() }).from(syncLogs);
    const [baselinesCount] = await db.select({ count: count() }).from(syncBaselines);
    await db.delete(syncRunEvents);
    await db.delete(syncRuns);
    await db.delete(syncLogs);
    await db.delete(syncBaselines);
    return {
      deletedRuns: Number(runsCount?.count ?? 0),
      deletedLogs: Number(logsCount?.count ?? 0),
      deletedBaselines: Number(baselinesCount?.count ?? 0),
    };
  }

  async insertHkodDecisions(runId: string, configId: string | null, decisions: Array<{
    recordKey: string;
    onixId: number | null;
    onixNsNumber: string | null;
    decision: string;
    hCodeValue: string;
    reason: string;
  }>): Promise<void> {
    if (decisions.length === 0) return;
    const CHUNK = 200;
    for (let i = 0; i < decisions.length; i += CHUNK) {
      const chunk = decisions.slice(i, i + CHUNK);
      await db.insert(hkodDecisions).values(chunk.map(d => ({
        syncRunId: runId,
        syncConfigId: configId ?? undefined,
        recordKey: d.recordKey,
        onixId: d.onixId ?? undefined,
        onixNsNumber: d.onixNsNumber ?? undefined,
        decision: d.decision,
        hCodeValue: d.hCodeValue ?? undefined,
        reason: d.reason ?? undefined,
      } as any)));
    }
  }

  async getHkodDecisions(runId: string): Promise<Array<{
    id: string;
    recordKey: string;
    onixId: number | null;
    onixNsNumber: string | null;
    decision: string;
    hCodeValue: string | null;
    reason: string | null;
    createdAt: Date;
  }>> {
    const rows = await db.select().from(hkodDecisions)
      .where(eq(hkodDecisions.syncRunId, runId))
      .orderBy(hkodDecisions.createdAt);
    return rows.map(r => ({
      id: r.id,
      recordKey: r.recordKey,
      onixId: r.onixId ?? null,
      onixNsNumber: r.onixNsNumber ?? null,
      decision: r.decision,
      hCodeValue: r.hCodeValue ?? null,
      reason: r.reason ?? null,
      createdAt: r.createdAt,
    }));
  }

  async getHkodPreviousAssignments(configId: string): Promise<Map<string, string>> {
    const rows = await db
      .select({ recordKey: hkodDecisions.recordKey, hCodeValue: hkodDecisions.hCodeValue })
      .from(hkodDecisions)
      .where(
        and(
          eq(hkodDecisions.syncConfigId, configId),
          eq(hkodDecisions.decision, "assigned")
        )
      )
      .orderBy(hkodDecisions.createdAt);
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.recordKey && row.hCodeValue && !map.has(row.recordKey)) {
        map.set(row.recordKey, row.hCodeValue);
      }
    }
    return map;
  }

  async getHkodStats(): Promise<{
    totalAssigned: number;
    perConfig: Array<{ configId: string; assigned: number }>;
  }> {
    const rows = await db
      .select({
        configId: hkodDecisions.syncConfigId,
        cnt: count(),
      })
      .from(hkodDecisions)
      .where(eq(hkodDecisions.decision, "assigned"))
      .groupBy(hkodDecisions.syncConfigId);

    const perConfig = rows.map(r => ({
      configId: r.configId ?? "",
      assigned: Number(r.cnt),
    }));
    const totalAssigned = perConfig.reduce((s, r) => s + r.assigned, 0);
    return { totalAssigned, perConfig };
  }

  async createOnixBackup(data: Partial<InsertOnixBackup>): Promise<OnixBackup> {
    const [created] = await db.insert(onixBackups).values({
      status: data.status ?? "pending",
      endpoints: data.endpoints ?? [],
      triggeredBy: data.triggeredBy ?? null,
      details: data.details ?? {},
    } as any).returning();
    return created;
  }

  async updateOnixBackup(id: string, data: Partial<OnixBackup>): Promise<void> {
    await db.update(onixBackups).set(data as any).where(eq(onixBackups.id, id));
  }

  async getOnixBackups(limit = 50): Promise<OnixBackup[]> {
    return db.select().from(onixBackups).orderBy(desc(onixBackups.createdAt)).limit(limit);
  }

  async getOnixBackup(id: string): Promise<OnixBackup | undefined> {
    const [row] = await db.select().from(onixBackups).where(eq(onixBackups.id, id));
    return row;
  }

  async getAnalyticsOverview(days: number) {
    const perDayResult = await db.execute(sql.raw(`
      SELECT
        DATE_TRUNC('day', started_at)::date AS day,
        COUNT(*) AS total_runs,
        COALESCE(SUM(records_processed), 0) AS total_processed,
        COALESCE(SUM(records_failed), 0) AS total_failed,
        COALESCE(SUM(records_skipped), 0) AS total_skipped,
        COUNT(CASE WHEN status = 'success' THEN 1 END) AS success_count,
        COUNT(CASE WHEN status = 'error' THEN 1 END) AS error_count,
        COUNT(CASE WHEN status = 'partial' THEN 1 END) AS partial_count,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at)))::integer AS avg_duration_sec
      FROM sync_runs
      WHERE started_at >= NOW() - INTERVAL '${days} days'
        AND status NOT IN ('running', 'pending')
      GROUP BY DATE_TRUNC('day', started_at)::date
      ORDER BY day ASC
    `));

    const allTimeResult = await db.execute(sql`
      SELECT
        COUNT(*) AS total_runs,
        COALESCE(SUM(records_processed), 0) AS total_processed,
        COALESCE(SUM(records_failed), 0) AS total_failed,
        COUNT(CASE WHEN status = 'success' THEN 1 END) AS success_count,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at)))::integer AS avg_duration_sec
      FROM sync_runs
      WHERE status NOT IN ('running', 'pending')
    `);

    const topConfigsResult = await db.execute(sql`
      SELECT
        sr.sync_config_id AS config_id,
        COALESCE(sc.name, sr.sync_config_id) AS config_name,
        COUNT(*) AS total_runs,
        COALESCE(SUM(sr.records_processed), 0) AS total_processed
      FROM sync_runs sr
      LEFT JOIN sync_configs sc ON sc.id = sr.sync_config_id
      WHERE sr.status NOT IN ('running', 'pending')
      GROUP BY sr.sync_config_id, sc.name
      ORDER BY total_runs DESC
      LIMIT 8
    `);

    const perDayRows = ((perDayResult as any).rows ?? []) as any[];
    const allTimeRow = (((allTimeResult as any).rows ?? []) as any[])[0] ?? {};
    const topConfigsRows = ((topConfigsResult as any).rows ?? []) as any[];

    return {
      perDay: perDayRows.map((r: any) => ({
        day: String(r.day ?? "").slice(0, 10),
        runs: Number(r.total_runs ?? 0),
        processed: Number(r.total_processed ?? 0),
        failed: Number(r.total_failed ?? 0),
        skipped: Number(r.total_skipped ?? 0),
        success: Number(r.success_count ?? 0),
        errors: Number(r.error_count ?? 0),
        partial: Number(r.partial_count ?? 0),
        avgDurationSec: r.avg_duration_sec != null ? Number(r.avg_duration_sec) : null,
      })),
      allTime: {
        totalRuns: Number(allTimeRow.total_runs ?? 0),
        totalProcessed: Number(allTimeRow.total_processed ?? 0),
        totalFailed: Number(allTimeRow.total_failed ?? 0),
        successCount: Number(allTimeRow.success_count ?? 0),
        avgDurationSec: allTimeRow.avg_duration_sec != null ? Number(allTimeRow.avg_duration_sec) : null,
      },
      topConfigs: topConfigsRows.map((r: any) => ({
        configId: String(r.config_id ?? ""),
        configName: String(r.config_name ?? r.config_id ?? ""),
        totalRuns: Number(r.total_runs ?? 0),
        totalProcessed: Number(r.total_processed ?? 0),
      })),
    };
  }

  async createConfigSnapshot(data: InsertConfigSnapshot): Promise<ConfigSnapshot> {
    const [created] = await db.insert(configSnapshots).values(data).returning();
    await this.pruneConfigSnapshots(data.syncConfigId, 10);
    return created;
  }

  async getConfigSnapshots(syncConfigId?: string): Promise<ConfigSnapshot[]> {
    if (syncConfigId) {
      return db.select().from(configSnapshots)
        .where(eq(configSnapshots.syncConfigId, syncConfigId))
        .orderBy(desc(configSnapshots.createdAt));
    }
    return db.select().from(configSnapshots).orderBy(desc(configSnapshots.createdAt));
  }

  async deleteConfigSnapshot(id: string): Promise<void> {
    await db.delete(configSnapshots).where(eq(configSnapshots.id, id));
  }

  async pruneConfigSnapshots(syncConfigId: string, maxCount: number): Promise<void> {
    const all = await db.select({ id: configSnapshots.id })
      .from(configSnapshots)
      .where(eq(configSnapshots.syncConfigId, syncConfigId))
      .orderBy(desc(configSnapshots.createdAt));
    if (all.length > maxCount) {
      const toDelete = all.slice(maxCount).map(r => r.id);
      await db.delete(configSnapshots).where(inArray(configSnapshots.id, toDelete));
    }
  }

}

export const storage = new DatabaseStorage();
