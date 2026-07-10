import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";
import { getActiveRuns } from "./sync-engine";
import { db } from "./db";
import { sql } from "drizzle-orm";
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
// GET /api/diagnostics — zabezpečený diagnostický endpoint pre vzdialený
// monitoring. Zaregistrovaný PRED registerRoutes + Vite middleware, aby
// Vite catch-all neprehral Bearer-token autentifikáciu.
//
// Query params:
//   ?onixCode=<kód>   → priamy read-only lookup jednej karty priamo v ONIX (StockCode)
//   ?runId=<uuid>     → úplný detail jedného behu (všetky events + hkod decisions)
//   ?configId=<uuid>  → deep-dive pre jeden config (posledných 10 runov + events + baselines)
//   (nič)             → kompletný overview celej aplikácie
// ---------------------------------------------------------------------------
app.get("/api/diagnostics", async (req, res) => {
  const key = process.env.DIAGNOSTICS_KEY;
  if (!key) return res.status(503).json({ error: "DIAGNOSTICS_KEY not set" });
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== key) return res.status(401).json({ error: "Unauthorized" });

  const { runId, configId, onixCode } = req.query as Record<string, string | undefined>;

  // ── MODE 0: ?onixCode=xxx ── priamy read-only lookup jednej karty v ONIX ──
  // Slúži na diagnostiku "prečo matchFields/Ns_Number lookup zlyhal" bez
  // nutnosti prihlásiť sa do ONIX UI. Používa StockCode query param (podľa
  // Swaggeru jediný podporovaný filter na GET /stockitems okrem tables/
  // SupplierCode/$select), ktorý zodpovedá poľu Ns_Number.
  if (onixCode) {
    try {
      const modules = await storage.getAllModules();
      const onixModule = modules.find((m: any) => m.code === "ONIX");
      if (!onixModule) return res.status(404).json({ error: "ONIX module not found" });

      const { getOnixCreds } = await import("./onix-creds");
      const creds = getOnixCreds((onixModule as any).config);
      if (!creds.token) {
        return res.status(400).json({
          error: `No ONIX API token configured for environment=${creds.environment}`,
        });
      }

      const baseUrl = ((onixModule as any).baseUrl || "https://onix-api.hauerland.sk/onix_api")
        .replace(/\/onix_api$/i, "/ONIX_API");
      const url = `${baseUrl}/api/v1/stockitems?tables=CustomColumns&StockCode=${encodeURIComponent(onixCode)}`;
      const hdrs: Record<string, string> = {
        "Authorization": `Bearer ${creds.token}`,
        "Accept": "application/json",
        "User-Agent": "SyncHub-Diagnostics/1.0",
      };
      if (creds.databasePath) hdrs["DatabasePath"] = creds.databasePath;

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30000);
      let onixRes: Response;
      try {
        onixRes = await fetch(url, { headers: hdrs, signal: ctrl.signal });
      } finally {
        clearTimeout(t);
      }

      if (!onixRes.ok) {
        const text = await onixRes.text().catch(() => "");
        return res.status(502).json({
          _mode: "onix-lookup",
          query: onixCode,
          environment: creds.environment,
          url,
          error: `ONIX HTTP ${onixRes.status}: ${text.slice(0, 500)}`,
        });
      }

      const data = await onixRes.json();
      const arr: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.value)
          ? data.value
          : Array.isArray(data?.items)
            ? data.items
            : data
              ? [data]
              : [];

      return res.json({
        _mode: "onix-lookup",
        query: onixCode,
        environment: creds.environment,
        databasePath: creds.databasePath || null,
        url,
        found: arr.length > 0,
        count: arr.length,
        records: arr.map((item: any) => ({
          IdRecord: item.IdRecord ?? item.Id ?? null,
          Ns_Number: item.Ns_Number ?? null,
          Name: item.Name ?? null,
          CustomColumns: item.CustomColumns ?? null,
        })),
      });
    } catch (err: any) {
      return res.status(500).json({ error: `ONIX lookup failed: ${err.message}` });
    }
  }

  // Helper: formátuj run record
  const fmtRun = (r: any) => ({
    id: r.id,
    configId: r.syncConfigId,
    status: r.status,
    triggeredBy: r.triggeredBy,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    durationMs: r.startedAt && r.completedAt
      ? new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime()
      : null,
    recordsTotal: r.recordsTotal,
    recordsProcessed: r.recordsProcessed,
    recordsFailed: r.recordsFailed,
    recordsSkipped: r.recordsSkipped,
    progress: r.progress,
    speedPerSec: (r as any).speedPerSec ?? null,
    errorMessage: r.errorMessage,
    checkpointOffset: (r as any).checkpointData?.globalOffset ?? null,
    details: r.details,
  });

  // Helper: formátuj event
  const fmtEvent = (e: any) => ({
    seq: e.seq,
    level: e.level,
    phase: e.phase,
    message: e.message,
    details: e.details,
    createdAt: e.createdAt,
  });

  // Helper: baselines sumár per config (raw SQL)
  const fetchBaselinesSummary = async (filterConfigId?: string) => {
    const whereClause = filterConfigId
      ? sql`WHERE sb.sync_config_id = ${filterConfigId}`
      : sql`WHERE 1=1`;
    const rows = await db.execute(sql`
      SELECT
        sb.sync_config_id                                            AS "configId",
        sc.name                                                      AS "configName",
        COUNT(*)::int                                                AS "total",
        COUNT(sb.h_code)::int                                        AS "withHCode",
        (COUNT(*) - COUNT(sb.h_code))::int                          AS "withoutHCode",
        COUNT(CASE WHEN sb.sync_status = 'error'   THEN 1 END)::int AS "statusError",
        COUNT(CASE WHEN sb.sync_status = 'created' THEN 1 END)::int AS "statusCreated",
        COUNT(CASE WHEN sb.sync_status = 'updated' THEN 1 END)::int AS "statusUpdated",
        COUNT(CASE WHEN sb.sync_status = 'skipped' THEN 1 END)::int AS "statusSkipped",
        MIN(sb.first_synced_at)::text                               AS "firstSynced",
        MAX(sb.last_synced_at)::text                                AS "lastSynced"
      FROM sync_baselines sb
      LEFT JOIN sync_configs sc ON sc.id = sb.sync_config_id
      ${whereClause}
      GROUP BY sb.sync_config_id, sc.name
      ORDER BY COUNT(*) DESC
    `);
    return (rows as any).rows ?? rows;
  };

  try {
    // ── MODE 1: ?runId=xxx ── plný detail jedného behu ──────────────────────
    if (runId) {
      const [run, events, hkodDecisions, configs] = await Promise.all([
        storage.getSyncRun(runId),
        storage.getSyncRunEvents(runId, { limit: 5000 }),
        storage.getHkodDecisions(runId),
        storage.getAllSyncConfigs(),
      ]);
      if (!run) return res.status(404).json({ error: "Run not found" });

      const config = configs.find(c => c.id === run.syncConfigId);
      const [modules] = await Promise.all([storage.getAllModules()]);
      const srcMod = modules.find(m => m.id === (config as any)?.sourceModuleId);
      const tgtMod = modules.find(m => m.id === (config as any)?.targetModuleId);

      // Zhrnutie eventov po fázach
      const phaseBreakdown: Record<string, { info: number; warn: number; error: number }> = {};
      for (const e of events) {
        if (!phaseBreakdown[e.phase ?? "?"]) phaseBreakdown[e.phase ?? "?"] = { info: 0, warn: 0, error: 0 };
        phaseBreakdown[e.phase ?? "?"][e.level as "info" | "warn" | "error"] =
          (phaseBreakdown[e.phase ?? "?"][e.level as "info" | "warn" | "error"] ?? 0) + 1;
      }

      // Chybové eventy zvlášť
      const errorEvents = events.filter(e => e.level === "error" || e.level === "warn");

      // H kód štatistiky pre tento run
      const hkodSummary = {
        total: hkodDecisions.length,
        assigned: hkodDecisions.filter(d => d.decision === "assigned").length,
        preserved: hkodDecisions.filter(d => d.decision === "preserved").length,
        skipped: hkodDecisions.filter(d => d.decision === "skipped").length,
        errors: hkodDecisions.filter(d => d.decision === "error").length,
      };

      return res.json({
        _mode: "run-detail",
        meta: { generatedAt: new Date().toISOString(), version: APP_VERSION, uptimeSeconds: Math.floor(process.uptime()) },
        run: fmtRun(run),
        config: config ? {
          id: config.id,
          name: config.name,
          sourceModule: srcMod ? `${srcMod.code} (${srcMod.name})` : config.sourceModuleId,
          targetModule: tgtMod ? `${tgtMod.code} (${tgtMod.name})` : config.targetModuleId,
          sourceDataSource: (config as any).sourceDataSource,
          targetDataSource: (config as any).targetDataSource,
          matchFields: (config as any).matchFields,
          matchOperator: (config as any).matchOperator,
          matchNormalization: (config as any).matchNormalization,
          onMissing: (config as any).onMissing,
          hKodConfig: (config as any).hKodConfig,
          onixFixedFields: (config as any).onixFixedFields,
          fieldMappings: (config as any).fieldMappings,
          sourceRecordLimit: (config as any).sourceRecordLimit,
          targetStock: (config as any).targetStock,
        } : null,
        eventsSummary: {
          total: events.length,
          byLevel: {
            info: events.filter(e => e.level === "info").length,
            warn: events.filter(e => e.level === "warn").length,
            error: events.filter(e => e.level === "error").length,
          },
          byPhase: phaseBreakdown,
        },
        allEvents: events.map(fmtEvent),
        errorAndWarnEvents: errorEvents.map(fmtEvent),
        hkodSummary,
        hkodDecisions: hkodDecisions.map(d => ({
          recordKey: d.recordKey,
          decision: d.decision,
          hCodeValue: d.hCodeValue,
          reason: d.reason,
          onixId: d.onixId,
          onixNsNumber: d.onixNsNumber,
          createdAt: d.createdAt,
        })),
      });
    }

    // ── MODE 2: ?configId=xxx ── deep-dive pre config ────────────────────────
    if (configId) {
      const [config, configs, modules, runs, baselinesSummary, hkodStats] = await Promise.all([
        storage.getSyncConfig(configId),
        storage.getAllSyncConfigs(),
        storage.getAllModules(),
        storage.getSyncRuns(configId, 10),
        fetchBaselinesSummary(configId),
        storage.getHkodStats(),
      ]);
      if (!config) return res.status(404).json({ error: "Config not found" });

      const srcMod = modules.find(m => m.id === (config as any).sourceModuleId);
      const tgtMod = modules.find(m => m.id === (config as any).targetModuleId);

      // Events + hkod decisions pre posledné 3 runy
      const top3 = runs.slice(0, 3);
      const runEventsMap: Record<string, any[]> = {};
      const runHkodMap: Record<string, any[]> = {};
      await Promise.all(top3.map(async run => {
        const [events, decisions] = await Promise.all([
          storage.getSyncRunEvents(run.id, { limit: 5000 }),
          storage.getHkodDecisions(run.id),
        ]);
        runEventsMap[run.id] = events.map(fmtEvent);
        runHkodMap[run.id] = decisions.map(d => ({
          recordKey: d.recordKey,
          decision: d.decision,
          hCodeValue: d.hCodeValue,
          reason: d.reason,
          onixId: d.onixId,
          onixNsNumber: d.onixNsNumber,
          createdAt: d.createdAt,
        }));
      }));

      const configHkodStats = hkodStats.perConfig.find(p => p.configId === configId);

      return res.json({
        _mode: "config-detail",
        meta: { generatedAt: new Date().toISOString(), version: APP_VERSION, uptimeSeconds: Math.floor(process.uptime()) },
        config: {
          id: config.id,
          name: config.name,
          enabled: (config as any).enabled ?? true,
          sourceModule: srcMod ? { id: srcMod.id, code: srcMod.code, name: srcMod.name, url: srcMod.url } : null,
          targetModule: tgtMod ? { id: tgtMod.id, code: tgtMod.code, name: tgtMod.name, url: tgtMod.url } : null,
          sourceDataSource: (config as any).sourceDataSource,
          targetDataSource: (config as any).targetDataSource,
          matchFields: (config as any).matchFields,
          matchOperator: (config as any).matchOperator,
          matchNormalization: (config as any).matchNormalization,
          onMissing: (config as any).onMissing,
          hKodConfig: (config as any).hKodConfig,
          onixFixedFields: (config as any).onixFixedFields,
          fieldMappings: (config as any).fieldMappings,
          sourceFilters: (config as any).sourceFilters,
          sourceRecordLimit: (config as any).sourceRecordLimit,
          targetStock: (config as any).targetStock,
          schedule: (config as any).schedule,
          autoRetry: (config as any).autoRetry,
          notes: (config as any).notes,
        },
        baselinesSummary: baselinesSummary[0] ?? null,
        hkodStats: {
          totalAssignedEver: configHkodStats?.assigned ?? 0,
          note: "Počet H kódov priradených za CELÚ históriu tohto configu (kumulatívne)",
        },
        runs: runs.map(fmtRun),
        runEvents: runEventsMap,
        runHkodDecisions: runHkodMap,
      });
    }

    // ── MODE 3: overview — kompletný prehľad ────────────────────────────────
    const [
      modules,
      allConfigs,
      recentRuns,
      auditLogs,
      syncLogs,
      configStats,
      hkodStats,
      baselinesSummary,
    ] = await Promise.all([
      storage.getAllModules(),
      storage.getAllSyncConfigs(),
      storage.getSyncRuns(undefined, 30),
      storage.getAuditLogs(50),
      storage.getSyncLogs(30),
      storage.getSyncConfigStats().catch(() => ({})),
      storage.getHkodStats().catch(() => ({ totalAssigned: 0, perConfig: [] })),
      fetchBaselinesSummary(),
    ]);

    // Aktívne behy
    const activeRunIds = getActiveRuns();
    const activeRunDetails = recentRuns.filter(r => activeRunIds.includes(r.id));

    // Events pre posledných 10 runov (max 2000 eventov každý)
    const top10Runs = recentRuns.slice(0, 10);
    const runEventsMap: Record<string, any[]> = {};
    await Promise.all(top10Runs.map(async run => {
      const events = await storage.getSyncRunEvents(run.id, { limit: 2000 });
      runEventsMap[run.id] = events.map(fmtEvent);
    }));

    // H kód decisions pre posledných 5 runov
    const top5Runs = recentRuns.slice(0, 5);
    const runHkodMap: Record<string, any[]> = {};
    await Promise.all(top5Runs.map(async run => {
      const decisions = await storage.getHkodDecisions(run.id);
      if (decisions.length > 0) {
        runHkodMap[run.id] = decisions.map(d => ({
          recordKey: d.recordKey,
          decision: d.decision,
          hCodeValue: d.hCodeValue,
          reason: d.reason,
          onixId: d.onixId,
          onixNsNumber: d.onixNsNumber,
          createdAt: d.createdAt,
        }));
      }
    }));

    // Konfigurácia enriched (s názvami modulov)
    const configsEnriched = allConfigs.map(c => {
      const src = modules.find(m => m.id === (c as any).sourceModuleId);
      const tgt = modules.find(m => m.id === (c as any).targetModuleId);
      const stats = (configStats as any)[c.id] ?? {};
      const hkod = hkodStats.perConfig.find(p => p.configId === c.id);
      const bsl = baselinesSummary.find((b: any) => b.configId === c.id);
      const lastRun = recentRuns.find(r => r.syncConfigId === c.id);
      return {
        id: c.id,
        name: c.name,
        enabled: (c as any).enabled ?? true,
        sourceModule: src ? `${src.code} — ${src.name}` : (c as any).sourceModuleId,
        targetModule: tgt ? `${tgt.code} — ${tgt.name}` : (c as any).targetModuleId,
        sourceDataSource: (c as any).sourceDataSource,
        targetDataSource: (c as any).targetDataSource,
        matchFields: (c as any).matchFields,
        matchOperator: (c as any).matchOperator,
        matchNormalization: (c as any).matchNormalization,
        onMissing: (c as any).onMissing,
        hKodConfig: (c as any).hKodConfig,
        onixFixedFields: (c as any).onixFixedFields,
        fieldMappings: (c as any).fieldMappings,
        sourceRecordLimit: (c as any).sourceRecordLimit,
        schedule: (c as any).schedule,
        autoRetry: (c as any).autoRetry,
        stats: { runCount: stats.runCount ?? 0, totalProcessed: stats.totalProcessed ?? 0, totalFailed: stats.totalFailed ?? 0 },
        hkodAssignedTotal: hkod?.assigned ?? 0,
        baselines: bsl ?? null,
        lastRun: lastRun ? { id: lastRun.id, status: lastRun.status, startedAt: lastRun.startedAt, completedAt: lastRun.completedAt,
          recordsProcessed: lastRun.recordsProcessed, recordsFailed: lastRun.recordsFailed, errorMessage: lastRun.errorMessage } : null,
      };
    });

    // Chybové správy z posledných runov
    const recentErrors = recentRuns
      .filter(r => r.status === "error" || (r.recordsFailed ?? 0) > 0)
      .slice(0, 10)
      .map(r => ({ runId: r.id, configId: r.syncConfigId, status: r.status,
        recordsFailed: r.recordsFailed, errorMessage: r.errorMessage,
        startedAt: r.startedAt, completedAt: r.completedAt }));

    return res.json({
      _mode: "overview",
      _hint: "Použi ?runId=<uuid> pre plný detail behu alebo ?configId=<uuid> pre detail konfigurácie",
      meta: {
        generatedAt: new Date().toISOString(),
        version: APP_VERSION,
        uptimeSeconds: Math.floor(process.uptime()),
        nodeEnv: process.env.NODE_ENV || "unknown",
        activeRunIds,
        activeRunCount: activeRunIds.length,
      },
      modules: modules.map(m => ({
        id: m.id, code: m.code, name: m.name, type: m.type, enabled: m.enabled, url: m.url,
      })),
      configs: configsEnriched,
      activeRuns: activeRunDetails.map(fmtRun),
      recentRuns: recentRuns.map(fmtRun),
      recentErrors,
      runEvents: runEventsMap,
      runHkodDecisions: runHkodMap,
      hkodGlobalStats: hkodStats,
      baselinesSummary,
      auditLogs: auditLogs.map(a => ({
        id: a.id, action: a.action, entity: a.entity, entityId: a.entityId,
        userId: a.userId, details: a.details, ipAddress: a.ipAddress, createdAt: a.createdAt,
      })),
      syncLogs: syncLogs.map(l => ({
        id: l.id, moduleId: l.moduleId, direction: l.direction, status: l.status,
        recordsProcessed: l.recordsProcessed, recordsFailed: l.recordsFailed,
        errorMessage: l.errorMessage, startedAt: l.startedAt, completedAt: l.completedAt,
      })),
    });
  } catch (err: any) {
    console.error("[diagnostics] Internal error:", err);
    return res.status(500).json({ error: "Internal diagnostics error" });
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
