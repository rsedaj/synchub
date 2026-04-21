import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import path from "path";
import { storage } from "./storage";
import { setupAuth, requireAuth, requireRole } from "./auth";
import { seedData, runMigrations } from "./seed";
import { testModuleConnection, fetchModuleData, flattenObject, collectAllFields, ONIX_KNOWN_TARGET_FIELDS } from "./data-fetcher";
import { executeSyncRun, cancelSyncRun, getActiveRuns, restoreFromBackup, resumeSyncRun } from "./sync-engine";
import { deleteBackupFile, getStorageStats, uploadConfigBackup, listConfigBackups, downloadBackup, cleanupOldFolders } from "./google-drive";
import passport from "passport";
import bcrypt from "bcryptjs";
import { insertUserSchema, insertApiModuleSchema, insertSyncLogSchema, insertSyncConfigSchema, loginSchema } from "@shared/schema";
import { z } from "zod";

const SENSITIVE_PATTERNS = ["password", "apikey", "api_key", "secret", "token", "accesskey", "clientsecret", "authorization", "bearer", "credential"];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_PATTERNS.some(p => lower.includes(p));
}

function redactSensitive(key: string, value: any): any {
  if (value === undefined || value === null) return value;
  if (isSensitiveKey(key)) return "***";
  if (typeof value === "string" && value.length > 20 && /[a-f0-9]{20,}/i.test(value)) return "***";
  if (typeof value === "object" && !Array.isArray(value)) {
    const redacted: Record<string, any> = {};
    for (const k of Object.keys(value)) {
      redacted[k] = redactSensitive(k, value[k]);
    }
    return redacted;
  }
  return value;
}

const updateModuleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  baseUrl: z.string().optional(),
  status: z.enum(["connected", "disconnected", "error", "configuring"]).optional(),
  config: z.record(z.any()).optional(),
});

const createSyncConfigSchema = z.object({
  name: z.string().min(1),
  targetModuleId: z.string().min(1),
  sourceModuleId: z.string().min(1),
  targetDataSource: z.string().nullable().optional(),
  sourceDataSource: z.string().nullable().optional(),
  sourceRecordLimit: z.number().int().min(0).optional().default(120000),
  fieldMappings: z.array(z.object({
    sourceField: z.string().min(1),
    targetField: z.string().min(1),
    transform: z.string().optional(),
  })).min(1),
  schedule: z.object({
    enabled: z.boolean(),
    frequency: z.string(),
    timeOfDay: z.string().optional(),
    dayOfWeek: z.string().optional(),
    backupBeforeSync: z.boolean().optional(),
  }).optional(),
  isEnabled: z.boolean().optional(),
  matchFields: z.array(z.string()).optional(),
  matchOperator: z.enum(["and", "or"]).optional(),
  onMissing: z.enum(["create", "skip"]).optional(),
  targetStock: z.string().nullable().optional(),
  sourceFilters: z.array(z.object({
    field: z.string(),
    operator: z.string(),
    value: z.string(),
  })).nullable().optional(),
});

const updateSyncConfigSchema = z.object({
  name: z.string().min(1).optional(),
  targetModuleId: z.string().min(1).optional(),
  sourceModuleId: z.string().min(1).optional(),
  targetDataSource: z.string().nullable().optional(),
  sourceDataSource: z.string().nullable().optional(),
  sourceRecordLimit: z.number().int().min(0).optional(),
  fieldMappings: z.array(z.object({
    sourceField: z.string().min(1),
    targetField: z.string().min(1),
    transform: z.string().optional(),
  })).optional(),
  schedule: z.object({
    enabled: z.boolean(),
    frequency: z.string(),
    timeOfDay: z.string().optional(),
    dayOfWeek: z.string().optional(),
    backupBeforeSync: z.boolean().optional(),
  }).optional(),
  isEnabled: z.boolean().optional(),
  matchFields: z.array(z.string()).optional(),
  matchOperator: z.enum(["and", "or"]).optional(),
  onMissing: z.enum(["create", "skip"]).optional(),
  targetStock: z.string().nullable().optional(),
  sourceFilters: z.array(z.object({
    field: z.string(),
    operator: z.string(),
    value: z.string(),
  })).nullable().optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  role: z.enum(["admin", "operator", "viewer"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(4).optional(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);
  await seedData();
  await runMigrations();

  try {
    const zombieRuns = await storage.getSyncRuns(undefined, 100);
    const zombies = zombieRuns.filter(r => r.status === "running" || r.status === "pending");
    let autoResumed = 0;
    let killed = 0;
    for (const z of zombies) {
      const checkpoint = (z as any).checkpointData;
      if (checkpoint) {
        console.log(`[startup] Auto-resuming run ${z.id.slice(0, 8)} from checkpoint offset ${checkpoint.globalOffset}`);
        setTimeout(() => {
          resumeSyncRun(z.id).catch(err =>
            console.error(`[startup] Failed to auto-resume run ${z.id}:`, err.message)
          );
        }, 5000);
        autoResumed++;
      } else {
        await storage.updateSyncRun(z.id, {
          status: "error",
          errorMessage: "Server restarted — sync process lost",
          completedAt: new Date(),
        });
        console.log(`[startup] Killed zombie sync run (no checkpoint): ${z.id.slice(0, 8)}`);
        killed++;
      }
    }
    if (zombies.length > 0) {
      console.log(`[startup] Startup cleanup: ${autoResumed} auto-resumed, ${killed} killed`);
    }
  } catch (err: any) {
    console.error("[startup] Failed to clean zombie runs:", err.message);
  }

  app.use("/attached_assets", express.static(path.resolve(process.cwd(), "attached_assets")));

  app.get("/api/my-ip", async (_req, res) => {
    try {
      const resp = await fetch("https://api.ipify.org?format=json");
      const data = await resp.json() as { ip: string };
      res.json({ ip: data.ip });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");
    next();
  });

  app.post("/api/auth/login", (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid credentials" });
    }
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Invalid credentials" });
      req.logIn(user, async (err) => {
        if (err) return next(err);
        try {
          await storage.createAuditLog({
            userId: user.id,
            action: "login",
            entity: "auth",
            ipAddress: req.ip || null,
          });
        } catch (_) {}
        const { password, ...safeUser } = user;
        return res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    try {
      if (req.user) {
        await storage.createAuditLog({
          userId: req.user.id,
          action: "logout",
          entity: "auth",
          ipAddress: req.ip || null,
        });
      }
    } catch (_) {}
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      return res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const { password, ...safeUser } = req.user!;
    return res.json(safeUser);
  });

  app.get("/api/dashboard", requireAuth, async (_req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      return res.json(stats);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to load dashboard data" });
    }
  });

  app.get("/api/modules", requireAuth, async (_req, res) => {
    try {
      const modules = await storage.getAllModules();
      return res.json(modules);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to load modules" });
    }
  });

  app.post("/api/modules/test-all", requireAuth, async (_req, res) => {
    try {
      const modules = await storage.getAllModules();
      const sorted = modules.sort((a, b) => a.sortOrder - b.sortOrder);
      const results: Array<{ id: string; code: string; name: string; success: boolean; message: string; responseTime: number }> = [];

      for (const mod of sorted) {
        try {
          const result = await testModuleConnection(mod);
          if (result.success && mod.status !== "connected") {
            await storage.updateModule(mod.id, { status: "connected" });
          } else if (!result.success && mod.status === "connected") {
            await storage.updateModule(mod.id, { status: "error" });
          }
          results.push({
            id: mod.id,
            code: mod.code,
            name: mod.name,
            success: result.success,
            message: result.message,
            responseTime: result.responseTime,
          });
        } catch (err: any) {
          results.push({
            id: mod.id,
            code: mod.code,
            name: mod.name,
            success: false,
            message: err.message || "Connection test failed",
            responseTime: 0,
          });
        }
      }

      return res.json({
        total: results.length,
        connected: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
      });
    } catch (err: any) {
      return res.status(500).json({ message: "Test all failed" });
    }
  });

  app.get("/api/modules/:id", requireAuth, async (req, res) => {
    try {
      const mod = await storage.getModule(req.params.id);
      if (!mod) return res.status(404).json({ message: "Module not found" });
      return res.json(mod);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to load module" });
    }
  });

  app.patch("/api/modules/:id", requireRole("admin", "operator"), async (req, res) => {
    const parsed = updateModuleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid module data" });
    }
    try {
      const before = await storage.getModule(req.params.id);
      if (!before) return res.status(404).json({ message: "Module not found" });
      const changedFields: string[] = [];
      const beforeValues: Record<string, any> = {};
      const afterValues: Record<string, any> = {};
      for (const key of Object.keys(parsed.data) as Array<keyof typeof parsed.data>) {
        const oldVal = (before as any)[key];
        const newVal = parsed.data[key];
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changedFields.push(key);
          if (key === "config") {
            const oldConfig = (oldVal || {}) as Record<string, any>;
            const newConfig = (newVal || {}) as Record<string, any>;
            const allKeys = new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)]);
            beforeValues[key] = {};
            afterValues[key] = {};
            for (const ck of allKeys) {
              if (JSON.stringify(oldConfig[ck]) !== JSON.stringify(newConfig[ck])) {
                (beforeValues[key] as any)[ck] = redactSensitive(ck, oldConfig[ck]);
                (afterValues[key] as any)[ck] = redactSensitive(ck, newConfig[ck]);
              }
            }
          } else {
            beforeValues[key] = oldVal;
            afterValues[key] = newVal;
          }
        }
      }
      const mod = await storage.updateModule(req.params.id, parsed.data);
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "config_change",
        entity: "module",
        entityId: mod!.id,
        details: { code: before.code, name: before.name, changedFields, before: beforeValues, after: afterValues },
        ipAddress: req.ip || null,
      });
      return res.json(mod);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to update module" });
    }
  });

  app.patch("/api/modules/:id/toggle-active", requireRole("admin", "operator"), async (req, res) => {
    try {
      const mod = await storage.getModule(req.params.id);
      if (!mod) return res.status(404).json({ message: "Module not found" });
      const newActive = !mod.isActive;
      const updated = await storage.updateModule(mod.id, { isActive: newActive });
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "config_change",
        entity: "module",
        entityId: mod.id,
        details: { code: mod.code, name: mod.name, changedFields: ["isActive"], before: { isActive: mod.isActive }, after: { isActive: newActive } },
        ipAddress: req.ip || null,
      });
      return res.json(updated);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to toggle module active state" });
    }
  });

  app.post("/api/modules/:id/test-connection", requireAuth, async (req, res) => {
    try {
      const mod = await storage.getModule(req.params.id);
      if (!mod) return res.status(404).json({ message: "Module not found" });
      const result = await testModuleConnection(mod);
      if (result.success && mod.status !== "connected") {
        await storage.updateModule(mod.id, { status: "connected" });
      } else if (!result.success && mod.status === "connected") {
        await storage.updateModule(mod.id, { status: "error" });
      }
      try {
        await storage.createAuditLog({
          userId: req.user!.id,
          action: "update",
          entity: "module_test",
          entityId: mod.id,
          details: { code: mod.code, name: mod.name, success: result.success, message: result.message, statusCode: result.statusCode, responseTime: result.responseTime },
          ipAddress: req.ip || null,
        });
      } catch {}
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ message: "Connection test failed" });
    }
  });

  app.get("/api/modules/:id/data-preview", requireAuth, async (req, res) => {
    try {
      const mod = await storage.getModule(req.params.id);
      if (!mod) return res.status(404).json({ message: "Module not found" });
      const limit = parseInt(req.query.limit as string) || 50;
      const source = (req.query.source as string) || undefined;
      console.log(`[data-preview] ${mod.code} limit=${limit} (raw=${req.query.limit}) source=${source || "auto"} url=${req.originalUrl}`);
      const result = await fetchModuleData(mod, limit, source);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to fetch data preview" });
    }
  });

  app.get("/api/modules/:id/filter-count", requireAuth, async (req, res) => {
    try {
      const mod = await storage.getModule(req.params.id);
      if (!mod) return res.status(404).json({ message: "Module not found" });
      const source = (req.query.source as string) || undefined;
      const limit = parseInt(req.query.limit as string) || 5000;
      let filters: Array<{ field: string; operator: string; value: string }> = [];
      try { filters = JSON.parse((req.query.filters as string) || "[]"); } catch {}
      const activeFilters = filters.filter(f => f?.field && f?.value != null && String(f.value).trim() !== "");
      const result = await fetchModuleData(mod, limit, source);
      if (!result.success) return res.json({ total: 0, matched: 0, error: result.error });
      const total = result.preview.length;
      const matched = activeFilters.length === 0
        ? total
        : result.preview.filter((rec: any) =>
            activeFilters.every(f => {
              const v = String(rec[f.field] ?? "").trim();
              const fv = String(f.value).trim();
              switch (f.operator) {
                case "starts_with":  return v.toLowerCase().startsWith(fv.toLowerCase());
                case "ends_with":    return v.toLowerCase().endsWith(fv.toLowerCase());
                case "contains":     return v.toLowerCase().includes(fv.toLowerCase());
                case "not_contains": return !v.toLowerCase().includes(fv.toLowerCase());
                case "equals":       return v === fv;
                case "not_equals":   return v !== fv;
                default:             return true;
              }
            })
          ).length;
      return res.json({ total, matched, capped: total >= limit });
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to count filtered records" });
    }
  });

  app.get("/api/sync-logs", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const moduleId = req.query.moduleId as string | undefined;
      const logs = await storage.getSyncLogs(limit, moduleId);
      return res.json(logs);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to load sync logs" });
    }
  });

  app.post("/api/sync-logs", requireRole("admin", "operator"), async (req, res) => {
    const parsed = insertSyncLogSchema.safeParse({
      ...req.body,
      triggeredBy: req.user!.id,
    });
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid sync log data" });
    }
    try {
      const log = await storage.createSyncLog(parsed.data);
      return res.json(log);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to create sync log" });
    }
  });

  app.get("/api/sync-stats", requireAuth, async (_req, res) => {
    try {
      const stats = await storage.getSyncStats();
      return res.json(stats);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to load sync stats" });
    }
  });

  app.get("/api/users", requireRole("admin"), async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const safeUsers = allUsers.map(({ password, ...u }) => u);
      return res.json(safeUsers);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to load users" });
    }
  });

  app.post("/api/users", requireRole("admin"), async (req, res) => {
    const parsed = insertUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid user data" });
    try {
      const existing = await storage.getUserByUsername(parsed.data.username);
      if (existing) return res.status(409).json({ message: "Username already exists" });
      const hashed = await bcrypt.hash(parsed.data.password, 12);
      const user = await storage.createUser({ ...parsed.data, password: hashed });
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "create",
        entity: "user",
        entityId: user.id,
        details: { username: user.username, fullName: user.fullName, role: user.role, email: user.email },
        ipAddress: req.ip || null,
      });
      const { password, ...safeUser } = user;
      return res.json(safeUser);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.patch("/api/users/:id", requireRole("admin"), async (req, res) => {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid user data" });
    try {
      const beforeUser = await storage.getUser(req.params.id);
      const data: any = { ...parsed.data };
      const passwordChanged = !!data.password;
      if (data.password) {
        data.password = await bcrypt.hash(data.password, 12);
      }
      const user = await storage.updateUser(req.params.id, data);
      if (!user) return res.status(404).json({ message: "User not found" });
      const changedFields: string[] = [];
      const beforeValues: Record<string, any> = {};
      const afterValues: Record<string, any> = {};
      if (beforeUser) {
        for (const key of ["username", "fullName", "email", "role", "isActive"] as const) {
          if (parsed.data[key] !== undefined && (beforeUser as any)[key] !== (user as any)[key]) {
            changedFields.push(key);
            beforeValues[key] = (beforeUser as any)[key];
            afterValues[key] = (user as any)[key];
          }
        }
      }
      if (passwordChanged) changedFields.push("password");
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "update",
        entity: "user",
        entityId: user.id,
        details: { username: user.username, changedFields, before: beforeValues, after: afterValues, passwordChanged },
        ipAddress: req.ip || null,
      });
      const { password, ...safeUser } = user;
      return res.json(safeUser);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", requireRole("admin"), async (req, res) => {
    try {
      const deletedUser = await storage.getUser(req.params.id);
      await storage.deleteUser(req.params.id);
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "delete",
        entity: "user",
        entityId: req.params.id,
        details: deletedUser ? { username: deletedUser.username, fullName: deletedUser.fullName, role: deletedUser.role } : {},
        ipAddress: req.ip || null,
      });
      return res.json({ message: "User deleted" });
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to delete user" });
    }
  });

  app.get("/api/audit-logs", requireRole("admin"), async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 200;
      const logs = await storage.getAuditLogs(limit);
      const action = req.query.action as string | undefined;
      const entity = req.query.entity as string | undefined;
      const userId = req.query.userId as string | undefined;
      let filtered = logs;
      if (action) filtered = filtered.filter(l => l.action === action);
      if (entity) filtered = filtered.filter(l => l.entity === entity);
      if (userId) filtered = filtered.filter(l => l.userId === userId);
      return res.json(filtered);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to load audit logs" });
    }
  });

  app.get("/api/sync-configs", requireAuth, async (req, res) => {
    try {
      const [configs, modules, statsMap] = await Promise.all([
        storage.getAllSyncConfigs(),
        storage.getAllModules(),
        storage.getSyncConfigStats().catch(() => ({} as Record<string, { totalProcessed: number; totalFailed: number; runCount: number }>)),
      ]);
      const moduleMap = Object.fromEntries(modules.map(m => [m.id, { code: m.code, name: m.name, status: m.status }]));
      const enriched = configs.map(c => {
        const stats = statsMap[c.id] || { totalProcessed: 0, totalFailed: 0, runCount: 0 };
        const successRate = stats.runCount === 0
          ? 100
          : stats.totalProcessed === 0
            ? (stats.totalFailed > 0 ? 0 : 100)
            : Math.round(((stats.totalProcessed - stats.totalFailed) / stats.totalProcessed) * 100);
        return {
          ...c,
          targetModule: moduleMap[c.targetModuleId] || null,
          sourceModule: moduleMap[c.sourceModuleId] || null,
          successRate,
          totalProcessed: stats.totalProcessed,
          totalFailed: stats.totalFailed,
          runCount: stats.runCount,
        };
      });
      return res.json(enriched);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to load sync configs" });
    }
  });

  app.get("/api/sync-configs/:id", requireAuth, async (req, res) => {
    try {
      const config = await storage.getSyncConfig(req.params.id);
      if (!config) return res.status(404).json({ message: "Sync config not found" });
      const modules = await storage.getAllModules();
      const moduleMap = Object.fromEntries(modules.map(m => [m.id, { code: m.code, name: m.name, status: m.status }]));
      return res.json({
        ...config,
        targetModule: moduleMap[config.targetModuleId] || null,
        sourceModule: moduleMap[config.sourceModuleId] || null,
      });
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to load sync config" });
    }
  });

  app.post("/api/sync-configs", requireRole("admin", "operator"), async (req, res) => {
    try {
      const parsed = createSyncConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten().fieldErrors });
      }
      const data = {
        ...parsed.data,
        createdBy: req.user!.id,
      };
      const config = await storage.createSyncConfig(data);
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "create",
        entity: "sync_config",
        entityId: config.id,
        details: { name: config.name, sourceModuleId: config.sourceModuleId, targetModuleId: config.targetModuleId, direction: config.direction },
        ipAddress: req.ip || null,
      });
      return res.status(201).json(config);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to create sync config" });
    }
  });

  app.patch("/api/sync-configs/:id", requireRole("admin", "operator"), async (req, res) => {
    try {
      const parsed = updateSyncConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten().fieldErrors });
      }
      const beforeConfig = await storage.getSyncConfig(req.params.id);
      const config = await storage.updateSyncConfig(req.params.id, parsed.data);
      if (!config) return res.status(404).json({ message: "Sync config not found" });
      const changedFields: string[] = [];
      const beforeValues: Record<string, any> = {};
      const afterValues: Record<string, any> = {};
      if (beforeConfig) {
        for (const key of Object.keys(parsed.data)) {
          const oldVal = (beforeConfig as any)[key];
          const newVal = (config as any)[key];
          if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            changedFields.push(key);
            beforeValues[key] = oldVal;
            afterValues[key] = newVal;
          }
        }
      }
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "update",
        entity: "sync_config",
        entityId: config.id,
        details: { name: config.name, changedFields, before: beforeValues, after: afterValues },
        ipAddress: req.ip || null,
      });
      return res.json(config);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to update sync config" });
    }
  });

  app.delete("/api/sync-configs/:id", requireRole("admin", "operator"), async (req, res) => {
    try {
      const deletedConfig = await storage.getSyncConfig(req.params.id);
      await storage.deleteSyncConfig(req.params.id);
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "delete",
        entity: "sync_config",
        entityId: req.params.id,
        details: deletedConfig ? { name: deletedConfig.name, sourceModuleId: deletedConfig.sourceModuleId, targetModuleId: deletedConfig.targetModuleId } : {},
        ipAddress: req.ip || null,
      });
      return res.json({ message: "Sync config deleted" });
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to delete sync config" });
    }
  });

  app.get("/api/sync-configs/:id/runs", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const runs = await storage.getSyncRuns(req.params.id, limit);
      return res.json(runs);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to load sync runs" });
    }
  });

  app.get("/api/modules/:id/source-fields", requireAuth, async (req, res) => {
    try {
      const mod = await storage.getModule(req.params.id);
      if (!mod) return res.status(404).json({ message: "Module not found" });
      const source = (req.query.source as string) || undefined;
      const result = await fetchModuleData(mod, 20, source);

      let fields: string[];
      let sample: any[];
      let error: string | undefined;

      if (!result.success) {
        fields = (mod.dataFields as string[]) || [];
        sample = [];
        error = result.error;
      } else {
        fields = result.fields;
        sample = result.preview.slice(0, 3);
      }

      if (mod.code === "ONIX") {
        const merged = Array.from(new Set([...fields, ...ONIX_KNOWN_TARGET_FIELDS]));
        merged.sort((a, b) => {
          const aKnown = ONIX_KNOWN_TARGET_FIELDS.includes(a);
          const bKnown = ONIX_KNOWN_TARGET_FIELDS.includes(b);
          if (aKnown && !bKnown) return -1;
          if (!aKnown && bKnown) return 1;
          return a.localeCompare(b);
        });
        fields = merged;
      }

      return res.json({ fields, sample, ...(error ? { error } : {}) });
    } catch (err: any) {
      return res.json({ fields: [], sample: [], error: err.message });
    }
  });

  app.post("/api/sync-configs/:id/run", requireRole("admin", "operator"), async (req, res) => {
    try {
      const config = await storage.getSyncConfig(req.params.id);
      if (!config) return res.status(404).json({ message: "Sync config not found" });
      const fullSync = req.body?.fullSync === true;
      const runId = await executeSyncRun(req.params.id, req.user!.id, fullSync);
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "sync_run",
        entity: "sync_config",
        entityId: config.id,
        details: { name: config.name, runId },
        ipAddress: req.ip || null,
      });
      return res.json({ runId, message: "Sync started" });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to start sync" });
    }
  });

  app.get("/api/sync-runs", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const configId = req.query.configId as string | undefined;
      const runs = await storage.getSyncRuns(configId, limit);
      return res.json(runs);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to load sync runs" });
    }
  });

  app.get("/api/sync-runs/active", requireAuth, async (_req, res) => {
    try {
      const activeIds = getActiveRuns();
      const runsMap = new Map<string, any>();
      for (const id of activeIds) {
        const run = await storage.getSyncRun(id);
        if (run) runsMap.set(run.id, run);
      }
      const allRuns = await storage.getSyncRuns(undefined, 20);
      for (const run of allRuns) {
        if ((run.status === "running" || run.status === "pending") && !runsMap.has(run.id)) {
          runsMap.set(run.id, run);
        }
      }
      const runs = Array.from(runsMap.values());
      const enriched = await Promise.all(runs.map(async (run) => {
        let triggeredByName: string | null = null;
        if (run.triggeredBy) {
          const user = await storage.getUser(run.triggeredBy);
          triggeredByName = user?.fullName || user?.username || null;
        }
        let configName: string | null = null;
        if (run.syncConfigId) {
          const cfg = await storage.getSyncConfig(run.syncConfigId);
          configName = cfg?.name || null;
        }
        return { ...run, triggeredByName, configName };
      }));
      return res.json(enriched);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to load active runs" });
    }
  });

  app.get("/api/sync-runs/:id", requireAuth, async (req, res) => {
    try {
      const run = await storage.getSyncRun(req.params.id);
      if (!run) return res.status(404).json({ message: "Sync run not found" });
      return res.json(run);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to load sync run" });
    }
  });

  app.get("/api/sync-runs/:id/progress", requireAuth, async (req, res) => {
    try {
      const run = await storage.getSyncRun(req.params.id);
      if (!run) return res.status(404).json({ message: "Sync run not found" });
      return res.json({
        id: run.id,
        status: run.status,
        progress: run.progress,
        recordsProcessed: run.recordsProcessed,
        recordsFailed: run.recordsFailed,
        recordsTotal: run.recordsTotal,
        currentBatch: run.currentBatch,
        totalBatches: run.totalBatches,
        batchSize: run.batchSize,
        speedPerSec: run.speedPerSec,
        estimatedEndAt: run.estimatedEndAt,
      });
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to load progress" });
    }
  });

  app.post("/api/sync-runs/reset-history", requireRole("admin"), async (req, res) => {
    try {
      const result = await storage.resetSyncHistory();
      await storage.createAuditLog({
        userId: (req.user as any)?.id || "system",
        action: "sync_complete",
        entity: "sync_runs",
        entityId: "all",
        details: { action: "reset_history", ...result },
      });
      return res.json({ message: "Sync history reset", ...result });
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to reset sync history" });
    }
  });

  app.post("/api/sync-runs/:id/cancel", requireRole("admin", "operator"), async (req, res) => {
    try {
      const success = cancelSyncRun(req.params.id);
      if (success) {
        return res.json({ message: "Cancellation requested" });
      }
      const run = await storage.getSyncRun(req.params.id);
      if (run && (run.status === "running" || run.status === "pending")) {
        await storage.updateSyncRun(req.params.id, {
          status: "error",
          errorMessage: "Force stopped (process not active)",
          completedAt: new Date(),
        });
        return res.json({ message: "Zombie run force-stopped" });
      }
      return res.status(404).json({ message: "No active run found" });
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to cancel sync" });
    }
  });

  app.post("/api/sync-runs/:id/resume", requireRole("admin", "operator"), async (req, res) => {
    try {
      const run = await storage.getSyncRun(req.params.id);
      if (!run) return res.status(404).json({ message: "Run not found" });
      if (run.status === "running") return res.status(400).json({ message: "Run is already active" });
      const checkpoint = (run as any).checkpointData;
      if (!checkpoint || !checkpoint.globalOffset) {
        return res.status(400).json({ message: "No checkpoint available for this run" });
      }
      const ok = await resumeSyncRun(req.params.id);
      if (!ok) return res.status(500).json({ message: "Failed to resume run" });
      return res.json({ message: "Resume started", resumeOffset: checkpoint.globalOffset });
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to resume sync" });
    }
  });

  app.get("/api/sync-backups", requireAuth, async (_req, res) => {
    try {
      const backups = await storage.getAllSyncBackups();
      return res.json(backups);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to load backups" });
    }
  });

  app.get("/api/sync-backups/stats", requireAuth, async (_req, res) => {
    try {
      const backups = await storage.getAllSyncBackups();
      const totalSize = backups.reduce((sum, b) => sum + (b.fileSize || 0), 0);
      const configGroups: Record<string, { count: number; size: number }> = {};
      for (const b of backups) {
        if (!configGroups[b.syncConfigId]) configGroups[b.syncConfigId] = { count: 0, size: 0 };
        configGroups[b.syncConfigId].count++;
        configGroups[b.syncConfigId].size += b.fileSize || 0;
      }
      let driveStats = { totalFiles: 0, totalSize: 0, perConfig: {} as any };
      try {
        driveStats = await getStorageStats();
      } catch {}
      return res.json({
        totalBackups: backups.length,
        totalSize,
        perConfig: configGroups,
        driveStats,
        maxPerConfig: 10,
      });
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to load backup stats" });
    }
  });

  app.get("/api/sync-backups/config/:configId", requireAuth, async (req, res) => {
    try {
      const backups = await storage.getSyncBackupsByConfig(req.params.configId);
      return res.json(backups);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to load backups" });
    }
  });

  app.post("/api/sync-backups/:id/restore", requireRole("admin", "operator"), async (req, res) => {
    try {
      const result = await restoreFromBackup(req.params.id);
      if (result.success) {
        await storage.createAuditLog({
          userId: req.user!.id,
          action: "restore_backup",
          entity: "sync_backup",
          entityId: req.params.id,
          details: { recordCount: result.recordCount },
          ipAddress: req.ip || null,
        });
      }
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message || "Restore failed" });
    }
  });

  app.delete("/api/sync-backups/:id", requireRole("admin", "operator"), async (req, res) => {
    try {
      const backup = await storage.getSyncBackup(req.params.id);
      if (!backup) return res.status(404).json({ message: "Backup not found" });
      if (backup.googleDriveFileId) {
        try {
          await deleteBackupFile(backup.googleDriveFileId);
        } catch (err: any) {
          console.error(`[backups] Failed to delete Google Drive primary file:`, err.message);
        }
      }
      const snapshot = backup.configSnapshot as any;
      if (snapshot?.parts && Array.isArray(snapshot.parts)) {
        for (const part of snapshot.parts) {
          if (part.fileId && part.fileId !== backup.googleDriveFileId) {
            try {
              await deleteBackupFile(part.fileId);
            } catch (err: any) {
              console.error(`[backups] Failed to delete part file ${part.fileId}:`, err.message);
            }
          }
        }
      }
      await storage.deleteSyncBackup(req.params.id);
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "delete_backup",
        entity: "sync_backup",
        entityId: req.params.id,
        ipAddress: req.ip || null,
      });
      return res.json({ message: "Backup deleted" });
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to delete backup" });
    }
  });

  app.post("/api/backups/config-export", requireRole("admin"), async (_req, res) => {
    try {
      const configs = await storage.getAllSyncConfigs();
      const modules = await storage.getAllModules();
      const exportData = {
        exportedAt: new Date().toISOString(),
        version: "1.0",
        syncConfigs: configs,
        modules: modules.map(m => ({
          id: m.id,
          code: m.code,
          name: m.name,
          description: m.description,
          baseUrl: m.baseUrl,
          status: m.status,
          config: m.config,
          dataFields: m.dataFields,
          docsUrl: m.docsUrl,
          sortOrder: m.sortOrder,
        })),
      };
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="synchub-config-export-${new Date().toISOString().slice(0, 10)}.json"`);
      return res.json(exportData);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to export config" });
    }
  });

  app.post("/api/backups/config-import", requireRole("admin"), async (req, res) => {
    try {
      const { modules, syncConfigs } = req.body;
      let updatedModules = 0;
      let updatedConfigs = 0;

      if (modules && Array.isArray(modules)) {
        const existingModules = await storage.getAllModules();
        for (const imp of modules) {
          const existing = existingModules.find(m => m.code === imp.code);
          if (existing) {
            await storage.updateModule(existing.id, {
              baseUrl: imp.baseUrl,
              status: imp.status,
              config: imp.config,
            });
            updatedModules++;
          }
        }
      }

      return res.json({ message: `Imported ${updatedModules} modules, ${updatedConfigs} configs` });
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to import config" });
    }
  });

  app.post("/api/backups/manual/:configId", requireRole("admin", "operator"), async (req, res) => {
    try {
      const config = await storage.getSyncConfig(req.params.configId);
      if (!config) return res.status(404).json({ message: "Config not found" });

      const modules = await storage.getAllModules();
      const targetModule = modules.find(m => m.id === config.targetModuleId);
      if (!targetModule) return res.status(400).json({ message: "Target module not found" });

      let backupData: any[] = [];
      try {
        const targetResult = await fetchModuleData(targetModule, 0, (config as any).targetDataSource || undefined);
        if (targetResult.success && targetResult.preview) {
          backupData = targetResult.preview;
        } else if (!targetResult.success) {
          console.warn(`[backup] Target data fetch failed: ${targetResult.error || "unknown"}`);
        }
      } catch (fetchErr: any) {
        console.warn(`[backup] Target data fetch exception: ${fetchErr.message}`);
      }

      const { uploadBackup: doUpload, deleteBackupFile: doDeleteFile } = await import("./google-drive");
      const mappings = Array.isArray(config.fieldMappings) ? config.fieldMappings : [];
      const driveResult = await doUpload(config.id, config.name, backupData, "manual", targetModule.name, mappings);

      const backup = await storage.createSyncBackup({
        syncConfigId: config.id,
        syncRunId: null,
        fileName: driveResult.primaryFileName,
        fileSize: driveResult.combinedFileSize,
        googleDriveFileId: driveResult.primaryFileId,
        googleDriveUrl: driveResult.primaryWebViewLink,
        backupRecordCount: driveResult.totalRecords,
        configSnapshot: {
          name: config.name,
          sourceModuleId: config.sourceModuleId,
          targetModuleId: config.targetModuleId,
          fieldMappings: config.fieldMappings,
          totalTargetRecords: backupData.length,
          truncated: false,
          totalFiles: driveResult.totalFiles,
          parts: driveResult.parts.map(p => ({
            fileId: p.fileId,
            fileName: p.fileName,
            fileSize: p.fileSize,
            webViewLink: p.webViewLink,
            recordCount: p.recordCount,
            partNumber: p.partNumber,
          })),
        },
      });

      const allBackups = await storage.getSyncBackupsByConfig(config.id);
      if (allBackups.length > 10) {
        const toDelete = allBackups.slice(10);
        for (const old of toDelete) {
          const snap = old.configSnapshot as any;
          if (snap?.parts && Array.isArray(snap.parts)) {
            for (const part of snap.parts) {
              if (part.fileId) {
                try { await doDeleteFile(part.fileId); } catch {}
              }
            }
          } else if (old.googleDriveFileId) {
            try { await doDeleteFile(old.googleDriveFileId); } catch {}
          }
          await storage.deleteSyncBackup(old.id);
        }
      }

      await storage.createSyncLog({
        moduleId: targetModule.id,
        action: "manual_backup",
        entity: "sync_backup",
        status: "success",
        details: { backupId: backup.id, recordCount: driveResult.totalRecords, fileName: driveResult.primaryFileName, totalFiles: driveResult.totalFiles },
      });

      return res.json({ success: true, backup });
    } catch (err: any) {
      return res.status(500).json({ message: `Manual backup failed: ${err.message}` });
    }
  });

  app.post("/api/backups/config-to-drive", requireRole("admin"), async (req, res) => {
    try {
      const configs = await storage.getAllSyncConfigs();
      const modules = await storage.getAllModules();
      const allUsers = await storage.getAllUsers();

      const configData = {
        version: "2.0",
        appVersion: (await import("@shared/version")).APP_VERSION,
        syncConfigs: configs.map(c => ({
          id: c.id,
          name: c.name,
          sourceModuleId: c.sourceModuleId,
          targetModuleId: c.targetModuleId,
          fieldMappings: c.fieldMappings,
          schedule: c.schedule,
          isActive: c.isActive,
          syncMode: c.syncMode,
          batchSize: c.batchSize,
          retryAttempts: c.retryAttempts,
          backupBeforeSync: c.backupBeforeSync,
        })),
        modules: modules.map(m => ({
          id: m.id,
          code: m.code,
          name: m.name,
          description: m.description,
          baseUrl: m.baseUrl,
          status: m.status,
          config: m.config,
          dataFields: m.dataFields,
          docsUrl: m.docsUrl,
          sortOrder: m.sortOrder,
        })),
        users: allUsers.map(u => ({
          id: u.id,
          username: u.username,
          fullName: u.fullName,
          email: u.email,
          role: u.role,
          isActive: u.isActive,
        })),
        totalConfigs: configs.length,
        totalModules: modules.length,
        totalUsers: allUsers.length,
      };

      const driveResult = await uploadConfigBackup(configData);

      await storage.createAuditLog({
        userId: (req.user as any)?.id || "system",
        action: "create",
        entity: "config_backup_drive",
        details: {
          fileName: driveResult.fileName,
          fileSize: driveResult.fileSize,
          totalConfigs: configs.length,
          totalModules: modules.length,
          totalUsers: allUsers.length,
        },
      });

      return res.json({
        success: true,
        fileName: driveResult.fileName,
        fileSize: driveResult.fileSize,
        webViewLink: driveResult.webViewLink,
        stats: {
          configs: configs.length,
          modules: modules.length,
          users: allUsers.length,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ message: `Config backup to Drive failed: ${err.message}` });
    }
  });

  app.get("/api/backups/config-drive-list", requireRole("admin"), async (_req, res) => {
    try {
      const files = await listConfigBackups();
      return res.json(files);
    } catch (err: any) {
      return res.status(500).json({ message: `Failed to list config backups: ${err.message}` });
    }
  });

  app.get("/api/backups/config-drive-download/:fileId", requireRole("admin"), async (req, res) => {
    try {
      const data = await downloadBackup(req.params.fileId);
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json({ message: `Failed to download config backup: ${err.message}` });
    }
  });

  app.delete("/api/backups/config-drive/:fileId", requireRole("admin"), async (req, res) => {
    try {
      await deleteBackupFile(req.params.fileId);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ message: `Failed to delete config backup: ${err.message}` });
    }
  });

  app.post("/api/backups/config-restore-from-drive/:fileId", requireRole("admin"), async (req, res) => {
    try {
      const data = await downloadBackup(req.params.fileId);
      if (!data || (!data.modules && !data.syncConfigs && !data.users)) {
        return res.status(400).json({ message: "Invalid backup file format" });
      }

      if (!data.version || !data.type && !data.modules) {
        return res.status(400).json({ message: "Invalid backup format: missing version or data" });
      }

      const results = { modules: 0, syncConfigs: 0, users: 0, skipped: [] as string[], errors: [] as string[] };

      const moduleIdMap: Record<string, string> = {};

      if (data.modules && Array.isArray(data.modules)) {
        const existingModules = await storage.getAllModules();
        for (const imp of data.modules) {
          try {
            const existing = existingModules.find(m => m.code === imp.code);
            if (existing) {
              moduleIdMap[imp.id] = existing.id;
              await storage.updateModule(existing.id, {
                name: imp.name,
                description: imp.description,
                baseUrl: imp.baseUrl,
                status: imp.status,
                config: imp.config,
                dataFields: imp.dataFields,
                docsUrl: imp.docsUrl,
                sortOrder: imp.sortOrder,
              });
              results.modules++;
            } else {
              results.skipped.push(`Module ${imp.code}: not found in current system`);
            }
          } catch (e: any) {
            results.errors.push(`Module ${imp.code}: ${e.message}`);
          }
        }
      }

      if (data.syncConfigs && Array.isArray(data.syncConfigs)) {
        const existingConfigs = await storage.getAllSyncConfigs();
        for (const imp of data.syncConfigs) {
          try {
            const remappedSourceId = moduleIdMap[imp.sourceModuleId] || imp.sourceModuleId;
            const remappedTargetId = moduleIdMap[imp.targetModuleId] || imp.targetModuleId;

            const existing = existingConfigs.find(c => c.id === imp.id || c.name === imp.name);
            if (existing) {
              await storage.updateSyncConfig(existing.id, {
                name: imp.name,
                sourceModuleId: remappedSourceId,
                targetModuleId: remappedTargetId,
                fieldMappings: imp.fieldMappings,
                schedule: imp.schedule,
                isActive: imp.isActive,
                syncMode: imp.syncMode,
                batchSize: imp.batchSize,
                retryAttempts: imp.retryAttempts,
                backupBeforeSync: imp.backupBeforeSync,
              });
              results.syncConfigs++;
            } else {
              const currentModules = await storage.getAllModules();
              const sourceExists = currentModules.find(m => m.id === remappedSourceId);
              const targetExists = currentModules.find(m => m.id === remappedTargetId);
              if (sourceExists && targetExists) {
                await storage.createSyncConfig({
                  name: imp.name,
                  sourceModuleId: remappedSourceId,
                  targetModuleId: remappedTargetId,
                  fieldMappings: imp.fieldMappings,
                  schedule: imp.schedule,
                  isActive: imp.isActive ?? true,
                  syncMode: imp.syncMode || "full",
                  batchSize: imp.batchSize || 50,
                  retryAttempts: imp.retryAttempts || 3,
                  backupBeforeSync: imp.backupBeforeSync ?? true,
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

      if (data.users && Array.isArray(data.users)) {
        const existingUsers = await storage.getAllUsers();
        for (const imp of data.users) {
          try {
            const existing = existingUsers.find(u => u.username === imp.username);
            if (existing) {
              await storage.updateUser(existing.id, {
                fullName: imp.fullName,
                email: imp.email,
                role: imp.role,
                isActive: imp.isActive,
              });
              results.users++;
            } else {
              results.skipped.push(`User "${imp.username}": not found, skipped (create users manually)`);
            }
          } catch (e: any) {
            results.errors.push(`User ${imp.username}: ${e.message}`);
          }
        }
      }

      await storage.createAuditLog({
        userId: (req.user as any)?.id || "system",
        action: "update",
        entity: "config_restore_from_drive",
        details: {
          fileId: req.params.fileId,
          backupVersion: data.version,
          backupAppVersion: data.appVersion,
          restored: results,
        },
      });

      return res.json({
        success: true,
        message: `Obnovené: ${results.modules} modulov, ${results.syncConfigs} sync konfigurácií, ${results.users} používateľov`,
        results,
      });
    } catch (err: any) {
      return res.status(500).json({ message: `Config restore failed: ${err.message}` });
    }
  });

  app.post("/api/backups/cleanup-stale", requireRole("admin"), async (_req, res) => {
    try {
      const allBackups = await storage.getAllSyncBackups();
      let deleted = 0;
      for (const b of allBackups) {
        await storage.deleteSyncBackup(b.id);
        deleted++;
      }
      return res.json({ success: true, deleted });
    } catch (err: any) {
      return res.status(500).json({ message: `Cleanup failed: ${err.message}` });
    }
  });

  app.delete("/api/sync-backups/config/:configId", requireRole("admin", "operator"), async (req, res) => {
    try {
      const backups = await storage.getSyncBackupsByConfig(req.params.configId);
      for (const b of backups) {
        if (b.googleDriveFileId) {
          try { await deleteBackupFile(b.googleDriveFileId); } catch {}
        }
        const snap = b.configSnapshot as any;
        if (snap?.parts && Array.isArray(snap.parts)) {
          for (const part of snap.parts) {
            if (part.fileId && part.fileId !== b.googleDriveFileId) {
              try { await deleteBackupFile(part.fileId); } catch {}
            }
          }
        }
      }
      await storage.deleteSyncBackupsByConfig(req.params.configId);
      return res.json({ message: `Deleted ${backups.length} backups` });
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to delete backups" });
    }
  });

  app.post("/api/shop-view/custom-feed", requireAuth, async (req, res) => {
    try {
      const { url, limit = 500 } = req.body;
      if (!url || typeof url !== "string") {
        return res.status(400).json({ message: "Feed URL is required" });
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          return res.status(400).json({ message: "Only HTTP/HTTPS URLs are supported" });
        }
      } catch {
        return res.status(400).json({ message: "Invalid URL format" });
      }

      const hostname = parsedUrl.hostname.toLowerCase();
      const blockedPatterns = [
        /^localhost$/i,
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2\d|3[01])\./,
        /^192\.168\./,
        /^0\./,
        /^169\.254\./,
        /^::1$/,
        /^fc/,
        /^fd/,
        /^fe80/,
        /metadata\.google/,
        /\.internal$/,
        /\.local$/,
      ];
      if (blockedPatterns.some(p => p.test(hostname))) {
        return res.status(400).json({ message: "URL points to a restricted network address" });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const fetchRes = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "SyncHub/1.0 ShopView" },
      });
      clearTimeout(timeout);

      if (!fetchRes.ok) {
        return res.status(400).json({
          message: `Feed returned HTTP ${fetchRes.status}: ${fetchRes.statusText}`,
        });
      }

      const contentLength = fetchRes.headers.get("content-length");
      const MAX_SIZE = 50 * 1024 * 1024;
      if (contentLength && parseInt(contentLength, 10) > MAX_SIZE) {
        return res.status(400).json({ message: "Feed response too large (max 50MB)" });
      }

      const contentType = fetchRes.headers.get("content-type") || "";
      const text = await fetchRes.text();

      let records: Record<string, any>[] = [];

      if (contentType.includes("json") || text.trim().startsWith("[") || text.trim().startsWith("{")) {
        try {
          const json = JSON.parse(text);
          if (Array.isArray(json)) {
            records = json;
          } else if (json.data && Array.isArray(json.data)) {
            records = json.data;
          } else if (json.products && Array.isArray(json.products)) {
            records = json.products;
          } else if (json.items && Array.isArray(json.items)) {
            records = json.items;
          } else {
            const rootKey = Object.keys(json)[0];
            if (rootKey && Array.isArray(json[rootKey])) {
              records = json[rootKey];
            }
          }
        } catch {
          return res.status(400).json({ message: "Failed to parse JSON response" });
        }
      } else {
        try {
          const { parseStringPromise } = await import("xml2js");
          const stripPrefix = (name: string) => name.replace(/^.*:/, "");
          const parsed = await parseStringPromise(text, {
            explicitArray: false,
            trim: true,
            tagNameProcessors: [stripPrefix],
          });

          const findArray = (obj: any, depth = 0): any[] => {
            if (depth > 4 || !obj) return [];
            if (Array.isArray(obj) && obj.length > 0) return obj;
            if (typeof obj === "object") {
              for (const key of Object.keys(obj)) {
                const result = findArray(obj[key], depth + 1);
                if (result.length > 0) return result;
              }
            }
            return [];
          };

          records = findArray(parsed);
        } catch {
          return res.status(400).json({ message: "Failed to parse XML response" });
        }
      }

      if (records.length === 0) {
        return res.status(400).json({ message: "No records found in feed" });
      }

      const preview = records.slice(0, Number(limit)).map((r: any) => flattenObject(r));
      const fields = collectAllFields(preview);

      return res.json({
        success: true,
        source: parsedUrl.hostname,
        recordCount: records.length,
        fields,
        preview,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err.name === "AbortError") {
        return res.status(408).json({ message: "Feed request timed out (30s)" });
      }
      return res.status(500).json({ message: `Failed to fetch feed: ${err.message}` });
    }
  });

  app.post("/api/backups/cleanup-old", requireRole("admin"), async (_req, res) => {
    try {
      const result = await cleanupOldFolders();
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ message: `Cleanup failed: ${err.message}` });
    }
  });

  return httpServer;
}
