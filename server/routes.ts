import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, requireAuth, requireRole } from "./auth";
import { seedData } from "./seed";
import { testModuleConnection, fetchModuleData } from "./data-fetcher";
import passport from "passport";
import bcrypt from "bcryptjs";
import { insertUserSchema, insertApiModuleSchema, insertSyncLogSchema, loginSchema } from "@shared/schema";
import { z } from "zod";

const updateModuleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  baseUrl: z.string().optional(),
  status: z.enum(["connected", "disconnected", "error", "configuring"]).optional(),
  config: z.record(z.any()).optional(),
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
      const limit = parseInt(req.query.limit as string) || 20;
      const source = (req.query.source as string) || undefined;
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

  return httpServer;
}
