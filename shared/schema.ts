import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", ["admin", "operator", "viewer"]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  email: text("email"),
  role: userRoleEnum("role").notNull().default("operator"),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const moduleStatusEnum = pgEnum("module_status", ["connected", "disconnected", "error", "configuring"]);

export const apiModules = pgTable("api_modules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  baseUrl: text("base_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  status: moduleStatusEnum("status").notNull().default("disconnected"),
  isActive: boolean("is_active").notNull().default(true),
  config: jsonb("config").$type<Record<string, any>>().default({}),
  dataFields: jsonb("data_fields").$type<string[]>().default([]),
  docsUrl: text("docs_url"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const syncDirectionEnum = pgEnum("sync_direction", ["import", "export"]);
export const syncStatusEnum = pgEnum("sync_status", ["pending", "running", "success", "error", "partial"]);

export const syncLogs = pgTable("sync_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  moduleId: varchar("module_id").notNull().references(() => apiModules.id),
  direction: syncDirectionEnum("direction").notNull(),
  status: syncStatusEnum("status").notNull().default("pending"),
  recordsProcessed: integer("records_processed").default(0),
  recordsFailed: integer("records_failed").default(0),
  errorMessage: text("error_message"),
  details: jsonb("details").$type<Record<string, any>>(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  triggeredBy: varchar("triggered_by").references(() => users.id),
});

export const auditActionEnum = pgEnum("audit_action", ["login", "logout", "create", "update", "delete", "sync", "config_change", "sync_run", "sync_complete", "restore_backup", "delete_backup"]);

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  action: auditActionEnum("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  details: jsonb("details").$type<Record<string, any>>(),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const syncConfigs = pgTable("sync_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  targetModuleId: varchar("target_module_id").notNull().references(() => apiModules.id),
  sourceModuleId: varchar("source_module_id").notNull().references(() => apiModules.id),
  targetDataSource: text("target_data_source"),
  sourceDataSource: text("source_data_source"),
  sourceRecordLimit: integer("source_record_limit").default(120000),
  fieldMappings: jsonb("field_mappings").$type<Array<{ sourceField: string; targetField: string; transform?: string }>>().default([]),
  schedule: jsonb("schedule").$type<{ enabled: boolean; frequency: string; timeOfDay?: string; dayOfWeek?: string; backupBeforeSync?: boolean }>().default({ enabled: false, frequency: "daily", backupBeforeSync: true }),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const syncRuns = pgTable("sync_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  syncConfigId: varchar("sync_config_id").notNull().references(() => syncConfigs.id),
  status: syncStatusEnum("status").notNull().default("pending"),
  recordsProcessed: integer("records_processed").default(0),
  recordsFailed: integer("records_failed").default(0),
  recordsTotal: integer("records_total").default(0),
  progress: integer("progress").default(0),
  batchSize: integer("batch_size").default(100),
  currentBatch: integer("current_batch").default(0),
  totalBatches: integer("total_batches").default(0),
  speedPerSec: integer("speed_per_sec").default(0),
  estimatedEndAt: timestamp("estimated_end_at"),
  backupId: varchar("backup_id"),
  cancelled: boolean("cancelled").default(false),
  errorMessage: text("error_message"),
  details: jsonb("details").$type<Record<string, any>>(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  triggeredBy: varchar("triggered_by").references(() => users.id),
});

export const syncBackups = pgTable("sync_backups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  syncConfigId: varchar("sync_config_id").notNull().references(() => syncConfigs.id),
  syncRunId: varchar("sync_run_id"),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").default(0),
  googleDriveFileId: text("google_drive_file_id"),
  googleDriveUrl: text("google_drive_url"),
  backupRecordCount: integer("backup_record_count").default(0),
  configSnapshot: jsonb("config_snapshot").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const syncBaselines = pgTable("sync_baselines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  syncConfigId: varchar("sync_config_id").notNull().references(() => syncConfigs.id),
  recordKey: text("record_key").notNull(),
  fieldHash: text("field_hash").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("sync_baselines_config_key_unique").on(table.syncConfigId, table.recordKey),
]);

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  fullName: true,
  email: true,
  role: true,
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const insertApiModuleSchema = createInsertSchema(apiModules).pick({
  code: true,
  name: true,
  description: true,
  baseUrl: true,
  sortOrder: true,
  status: true,
  config: true,
  dataFields: true,
  docsUrl: true,
});

export const insertSyncLogSchema = createInsertSchema(syncLogs).pick({
  moduleId: true,
  direction: true,
  status: true,
  recordsProcessed: true,
  recordsFailed: true,
  errorMessage: true,
  details: true,
  triggeredBy: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).pick({
  userId: true,
  action: true,
  entity: true,
  entityId: true,
  details: true,
  ipAddress: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertApiModule = z.infer<typeof insertApiModuleSchema>;
export type ApiModule = typeof apiModules.$inferSelect;
export type InsertSyncLog = z.infer<typeof insertSyncLogSchema>;
export type SyncLog = typeof syncLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

export const insertSyncConfigSchema = createInsertSchema(syncConfigs).pick({
  name: true,
  targetModuleId: true,
  sourceModuleId: true,
  sourceDataSource: true,
  sourceRecordLimit: true,
  fieldMappings: true,
  schedule: true,
  isEnabled: true,
  createdBy: true,
});

export const insertSyncRunSchema = createInsertSchema(syncRuns).pick({
  syncConfigId: true,
  status: true,
  recordsProcessed: true,
  recordsFailed: true,
  recordsTotal: true,
  progress: true,
  errorMessage: true,
  details: true,
  triggeredBy: true,
});

export const insertSyncBackupSchema = createInsertSchema(syncBackups).pick({
  syncConfigId: true,
  syncRunId: true,
  fileName: true,
  fileSize: true,
  googleDriveFileId: true,
  googleDriveUrl: true,
  backupRecordCount: true,
  configSnapshot: true,
});

export type InsertSyncConfig = z.infer<typeof insertSyncConfigSchema>;
export type SyncConfig = typeof syncConfigs.$inferSelect;
export type InsertSyncRun = z.infer<typeof insertSyncRunSchema>;
export type SyncRun = typeof syncRuns.$inferSelect;
export type InsertSyncBackup = z.infer<typeof insertSyncBackupSchema>;
export type SyncBackup = typeof syncBackups.$inferSelect;
