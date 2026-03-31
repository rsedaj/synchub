import { eq, desc, count, and, gte, sql } from "drizzle-orm";
import { db } from "./db";
import {
  users, apiModules, syncLogs, auditLogs, syncConfigs, syncRuns, syncBackups,
  type User, type InsertUser,
  type ApiModule, type InsertApiModule,
  type SyncLog, type InsertSyncLog,
  type AuditLog, type InsertAuditLog,
  type SyncConfig, type InsertSyncConfig,
  type SyncRun, type InsertSyncRun,
  type SyncBackup, type InsertSyncBackup,
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
  getSyncRuns(configId?: string, limit?: number): Promise<SyncRun[]>;
  getSyncRun(id: string): Promise<SyncRun | undefined>;
  createSyncRun(data: InsertSyncRun): Promise<SyncRun>;
  updateSyncRun(id: string, data: Partial<SyncRun>): Promise<SyncRun | undefined>;

  getAllSyncBackups(): Promise<SyncBackup[]>;
  getSyncBackup(id: string): Promise<SyncBackup | undefined>;
  getSyncBackupsByConfig(configId: string): Promise<SyncBackup[]>;
  createSyncBackup(data: InsertSyncBackup): Promise<SyncBackup>;
  deleteSyncBackup(id: string): Promise<void>;
  deleteSyncBackupsByConfig(configId: string): Promise<void>;
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayLogs = await db.select().from(syncLogs)
      .where(gte(syncLogs.startedAt, today));

    const recentSyncs = await db.select().from(syncLogs)
      .orderBy(desc(syncLogs.startedAt))
      .limit(10);

    return {
      totalModules: allModules.length,
      connectedModules: allModules.filter(m => m.status === "connected").length,
      todaySyncs: todayLogs.length,
      errorSyncs: todayLogs.filter(l => l.status === "error").length,
      recentSyncs,
      moduleStatuses: allModules,
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
}

export const storage = new DatabaseStorage();
