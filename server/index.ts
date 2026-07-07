import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";
import { APP_VERSION } from "@shared/version";

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

// ---------------------------------------------------------------------------
// GET /api/diagnostics — zaregistrovaný PRED registerRoutes a Vite middleware
// aby Vite catch-all neprehral Bearer-token autentifikáciu.
// ---------------------------------------------------------------------------
app.get("/api/diagnostics", async (req, res) => {
  const key = process.env.DIAGNOSTICS_KEY;
  if (!key) {
    return res.status(503).json({ error: "Diagnostics not configured (DIAGNOSTICS_KEY missing)" });
  }
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== key) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const [modules, recentRuns, auditLogs, syncLogs] = await Promise.all([
      storage.getAllModules(),
      storage.getSyncRuns(undefined, 20),
      storage.getAuditLogs(30),
      storage.getSyncLogs(20),
    ]);

    // Pre posledných 5 runov načítaj aj podrobné events
    const topRuns = recentRuns.slice(0, 5);
    const runEventsMap: Record<string, any[]> = {};
    await Promise.all(
      topRuns.map(async (run) => {
        const events = await storage.getSyncRunEvents(run.id, { limit: 200 });
        runEventsMap[run.id] = events.map(e => ({
          seq: e.seq,
          level: e.level,
          phase: e.phase,
          message: e.message,
          details: e.details,
          createdAt: e.createdAt,
        }));
      })
    );

    // Config štatistiky
    const configStats = await storage.getSyncConfigStats().catch(() => ({}));

    return res.json({
      meta: {
        generatedAt: new Date().toISOString(),
        version: APP_VERSION,
        uptimeSeconds: Math.floor(process.uptime()),
        nodeEnv: process.env.NODE_ENV || "unknown",
      },
      modules: modules.map(m => ({
        id: m.id,
        code: m.code,
        name: m.name,
        type: m.type,
        enabled: m.enabled,
        url: m.url,
      })),
      recentRuns: recentRuns.map(r => ({
        id: r.id,
        configId: r.syncConfigId,
        status: r.status,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        recordsTotal: r.recordsTotal,
        recordsProcessed: r.recordsProcessed,
        recordsFailed: r.recordsFailed,
        recordsSkipped: r.recordsSkipped,
        progress: r.progress,
        errorMessage: r.errorMessage,
        triggeredBy: r.triggeredBy,
      })),
      runEvents: runEventsMap,
      auditLogs: auditLogs.map(a => ({
        id: a.id,
        action: a.action,
        entity: a.entity,
        entityId: a.entityId,
        userId: a.userId,
        details: a.details,
        ipAddress: a.ipAddress,
        createdAt: a.createdAt,
      })),
      syncLogs: syncLogs.map(l => ({
        id: l.id,
        moduleId: l.moduleId,
        direction: l.direction,
        status: l.status,
        recordsProcessed: l.recordsProcessed,
        recordsFailed: l.recordsFailed,
        errorMessage: l.errorMessage,
        startedAt: l.startedAt,
        completedAt: l.completedAt,
      })),
      configStats,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
