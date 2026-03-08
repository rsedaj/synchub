import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, requireAuth, requireRole } from "./auth";
import { seedData } from "./seed";
import { testModuleConnection, fetchModuleData } from "./data-fetcher";
import { executeSyncRun, cancelSyncRun, getActiveRuns, restoreFromBackup } from "./sync-engine";
import { deleteBackupFile, getStorageStats, uploadConfigBackup, listConfigBackups, downloadBackup } from "./google-drive";
import passport from "passport";
import bcrypt from "bcryptjs";
import { insertUserSchema, insertApiModuleSchema, insertSyncLogSchema, insertSyncConfigSchema, loginSchema } from "@shared/schema";
import { z } from "zod";

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
});

const updateSyncConfigSchema = z.object({
  name: z.string().min(1).optional(),
  targetModuleId: z.string().min(1).optional(),
  sourceModuleId: z.string().min(1).optional(),
  targetDataSource: z.string().nullable().optional(),
  sourceDataSource: z.string().nullable().optional(),
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
      const mod = await storage.updateModule(req.params.id, parsed.data);
      if (!mod) return res.status(404).json({ message: "Module not found" });
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "config_change",
        entity: "module",
        entityId: mod.id,
        details: { code: mod.code, changes: parsed.data },
        ipAddress: req.ip || null,
      });
      return res.json(mod);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to update module" });
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
      const data: any = { ...parsed.data };
      if (data.password) {
        data.password = await bcrypt.hash(data.password, 12);
      }
      const user = await storage.updateUser(req.params.id, data);
      if (!user) return res.status(404).json({ message: "User not found" });
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "update",
        entity: "user",
        entityId: user.id,
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
      await storage.deleteUser(req.params.id);
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "delete",
        entity: "user",
        entityId: req.params.id,
        ipAddress: req.ip || null,
      });
      return res.json({ message: "User deleted" });
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to delete user" });
    }
  });

  app.get("/api/audit-logs", requireRole("admin"), async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await storage.getAuditLogs(limit);
      return res.json(logs);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to load audit logs" });
    }
  });

  app.get("/api/sync-configs", requireAuth, async (req, res) => {
    try {
      const configs = await storage.getAllSyncConfigs();
      const modules = await storage.getAllModules();
      const moduleMap = Object.fromEntries(modules.map(m => [m.id, { code: m.code, name: m.name, status: m.status }]));
      const enriched = configs.map(c => ({
        ...c,
        targetModule: moduleMap[c.targetModuleId] || null,
        sourceModule: moduleMap[c.sourceModuleId] || null,
      }));
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
        details: { name: config.name },
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
      const config = await storage.updateSyncConfig(req.params.id, parsed.data);
      if (!config) return res.status(404).json({ message: "Sync config not found" });
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "update",
        entity: "sync_config",
        entityId: config.id,
        details: { name: config.name },
        ipAddress: req.ip || null,
      });
      return res.json(config);
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to update sync config" });
    }
  });

  app.delete("/api/sync-configs/:id", requireRole("admin", "operator"), async (req, res) => {
    try {
      await storage.deleteSyncConfig(req.params.id);
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "delete",
        entity: "sync_config",
        entityId: req.params.id,
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
      if (!result.success) {
        return res.json({ fields: mod.dataFields || [], sample: [], error: result.error });
      }
      return res.json({ fields: result.fields, sample: result.preview.slice(0, 3) });
    } catch (err: any) {
      return res.json({ fields: [], sample: [], error: err.message });
    }
  });

  app.post("/api/sync-configs/:id/run", requireRole("admin", "operator"), async (req, res) => {
    try {
      const config = await storage.getSyncConfig(req.params.id);
      if (!config) return res.status(404).json({ message: "Sync config not found" });
      const runId = await executeSyncRun(req.params.id, req.user!.id);
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
      const runs = [];
      for (const id of activeIds) {
        const run = await storage.getSyncRun(id);
        if (run) runs.push(run);
      }
      return res.json(runs);
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

  app.post("/api/sync-runs/:id/cancel", requireRole("admin", "operator"), async (req, res) => {
    try {
      const success = cancelSyncRun(req.params.id);
      if (!success) return res.status(404).json({ message: "No active run found" });
      return res.json({ message: "Cancellation requested" });
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to cancel sync" });
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
          console.error(`[backups] Failed to delete Google Drive file:`, err.message);
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
        const targetResult = await testModuleConnection(targetModule);
        if (targetResult.success && targetResult.preview) {
          backupData = targetResult.preview;
        }
      } catch {}

      const { uploadBackup: doUpload, rotateBackups: doRotate } = await import("./google-drive");
      const driveResult = await doUpload(config.id, config.name, backupData, "manual", targetModule.name);

      const backup = await storage.createSyncBackup({
        syncConfigId: config.id,
        syncRunId: null,
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

      const deletedIds = await doRotate(config.id, 10);
      if (deletedIds.length > 0) {
        const allBackups = await storage.getSyncBackupsByConfig(config.id);
        for (const b of allBackups) {
          if (b.googleDriveFileId && deletedIds.includes(b.googleDriveFileId)) {
            await storage.deleteSyncBackup(b.id);
          }
        }
      }

      await storage.createSyncLog({
        moduleId: targetModule.id,
        action: "manual_backup",
        entity: "sync_backup",
        status: "success",
        details: { backupId: backup.id, recordCount: backupData.length, fileName: driveResult.fileName },
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

      const configData = {
        version: "1.0",
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
        totalConfigs: configs.length,
        totalModules: modules.length,
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

  app.delete("/api/sync-backups/config/:configId", requireRole("admin", "operator"), async (req, res) => {
    try {
      const backups = await storage.getSyncBackupsByConfig(req.params.configId);
      for (const b of backups) {
        if (b.googleDriveFileId) {
          try { await deleteBackupFile(b.googleDriveFileId); } catch {}
        }
      }
      await storage.deleteSyncBackupsByConfig(req.params.configId);
      return res.json({ message: `Deleted ${backups.length} backups` });
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to delete backups" });
    }
  });

  return httpServer;
}
