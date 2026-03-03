import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb, pgEnum } from "drizzle-orm/pg-core";
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
  status: moduleStatusEnum("status").notNull().default("disconnected"),
  config: jsonb("config").$type<Record<string, any>>().default({}),
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

export const auditActionEnum = pgEnum("audit_action", ["login", "logout", "create", "update", "delete", "sync", "config_change"]);

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
  status: true,
  config: true,
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
