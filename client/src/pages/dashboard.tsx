import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Puzzle,
  Link2,
  ArrowLeftRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Settings2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Zap,
  Minus,
  Activity,
  Radio,
  Shield,
  Wifi,
  Server,
  Globe,
  User,
  Play,
} from "lucide-react";
import type { ApiModule, SyncLog } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { useState, useCallback, useEffect } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/components/language-provider";

interface DashboardData {
  totalModules: number;
  connectedModules: number;
  disabledModules: number;
  todaySyncs: number;
  errorSyncs: number;
  recentSyncs: SyncLog[];
  moduleStatuses: ApiModule[];
}

interface TestResult {
  id: string;
  code: string;
  name: string;
  status: "pending" | "testing" | "success" | "error";
  message?: string;
  responseTime?: number;
}

function LiveClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = String(time.getHours()).padStart(2, "0");
  const minutes = String(time.getMinutes()).padStart(2, "0");
  const seconds = String(time.getSeconds()).padStart(2, "0");

  return (
    <span className="font-mono text-sm tabular-nums tracking-wider" data-testid="text-live-clock">
      {hours}
      <span className="animate-pulse text-emerald-500 dark:text-emerald-400">:</span>
      {minutes}
      <span className="animate-pulse text-emerald-500 dark:text-emerald-400">:</span>
      {seconds}
    </span>
  );
}

function PulsingDot({ color = "emerald" }: { color?: "emerald" | "red" | "amber" }) {
  const colorClasses = {
    emerald: "bg-emerald-500",
    red: "bg-red-500",
    amber: "bg-amber-500",
  };
  const glowClasses = {
    emerald: "bg-emerald-500/40",
    red: "bg-red-500/40",
    amber: "bg-amber-500/40",
  };

  return (
    <span className="relative flex h-2 w-2">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${glowClasses[color]}`} />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${colorClasses[color]}`} />
    </span>
  );
}

function CommandCenterHeader({ data }: { data: DashboardData }) {
  const { t } = useLanguage();
  const systemOk = data.errorSyncs === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500/10 dark:bg-emerald-500/15">
            <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight font-mono uppercase" data-testid="text-dashboard-title">
              {t("dashboard.commandCenter")}
            </h1>
            <p className="text-[11px] text-muted-foreground font-mono tracking-wide">
              {t("dashboard.subtitle")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 border border-border">
            <PulsingDot color={systemOk ? "emerald" : "red"} />
            <span className="text-xs font-mono tracking-wide text-muted-foreground" data-testid="text-system-status">
              {systemOk ? t("dashboard.systemOnline") : t("dashboard.systemAlert")}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 border border-border">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <LiveClock />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
  testId,
  accentColor = "default",
}: {
  title: string;
  value: string | number;
  icon: any;
  subtitle?: string;
  testId: string;
  accentColor?: "default" | "emerald" | "red" | "amber";
}) {
  const iconBgClasses = {
    default: "bg-muted",
    emerald: "bg-emerald-500/10 dark:bg-emerald-500/15",
    red: "bg-red-500/10 dark:bg-red-500/15",
    amber: "bg-amber-500/10 dark:bg-amber-500/15",
  };
  const iconColorClasses = {
    default: "text-muted-foreground",
    emerald: "text-emerald-600 dark:text-emerald-400",
    red: "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
  };
  const dotColor = accentColor === "emerald" ? "emerald" : accentColor === "red" ? "red" : accentColor === "amber" ? "amber" : "emerald";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">{title}</p>
              <PulsingDot color={dotColor} />
            </div>
            <p className="text-2xl font-bold mt-1 font-mono tabular-nums tracking-tight" data-testid={testId}>
              {value}
            </p>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{subtitle}</p>
            )}
          </div>
          <div className={`flex h-8 w-8 items-center justify-center rounded-md ${iconBgClasses[accentColor]}`}>
            <Icon className={`h-3.5 w-3.5 ${iconColorClasses[accentColor]}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NetworkTopology({ modules }: { modules: ApiModule[] }) {
  const { t } = useLanguage();
  const connected = modules.filter(m => m.status === "connected").length;
  const total = modules.length;

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-medium font-mono uppercase tracking-wider">{t("dashboard.networkMap")}</h2>
          </div>
          <Badge variant="outline" className="font-mono text-[10px]">
            {connected}/{total} {t("dashboard.nodesActive")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-4">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {modules.map((mod) => {
            const isConnected = mod.status === "connected";
            const isError = mod.status === "error";
            return (
              <div
                key={mod.id}
                className="flex flex-col items-center gap-1.5 p-2 rounded-md border border-border"
                data-testid={`node-${mod.code}`}
              >
                <div className={`relative flex h-8 w-8 items-center justify-center rounded-full ${
                  isConnected
                    ? "bg-emerald-500/10 dark:bg-emerald-500/15"
                    : isError
                      ? "bg-red-500/10 dark:bg-red-500/15"
                      : "bg-muted"
                }`}>
                  {isConnected ? (
                    <Wifi className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : isError ? (
                    <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                  ) : (
                    <Server className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="absolute -top-0.5 -right-0.5">
                    <PulsingDot color={isConnected ? "emerald" : isError ? "red" : "amber"} />
                  </span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground text-center truncate w-full">
                  {mod.code}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-6 mt-3 pt-3 border-t border-border">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-[10px] text-muted-foreground font-mono">{t("dashboard.signalOnline")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span className="text-[10px] text-muted-foreground font-mono">{t("dashboard.signalError")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-[10px] text-muted-foreground font-mono">{t("dashboard.signalOffline")}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  const config: Record<string, { key: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    connected: { key: "status.connected", variant: "default" },
    disconnected: { key: "status.disconnected", variant: "secondary" },
    error: { key: "status.error", variant: "destructive" },
    configuring: { key: "status.configuring", variant: "outline" },
  };
  const c = config[status] || config.disconnected;
  return <Badge variant={c.variant} data-testid={`badge-status-${status}`}>{t(c.key)}</Badge>;
}

function SyncStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
    case "error":
      return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    case "pending":
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    default:
      return <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
  }
}

function TestResultIcon({ status }: { status: TestResult["status"] }) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
    case "error":
      return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
    case "testing":
      return <Loader2 className="h-4 w-4 animate-spin text-foreground" />;
    default:
      return <Minus className="h-4 w-4 text-muted-foreground/40" />;
  }
}

function ModuleStatusPanel({ modules }: { modules: ApiModule[] }) {
  const { t } = useLanguage();

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-medium font-mono uppercase tracking-wider">{t("dashboard.moduleStatus")}</h2>
          </div>
          <Badge variant="outline" className="font-mono text-[10px]">
            {modules.filter(m => m.status === "connected").length} / {modules.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-0.5">
          {modules.map((mod, idx) => {
            const isConnected = mod.status === "connected";
            const isError = mod.status === "error";
            return (
              <div
                key={mod.id}
                className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-md hover-elevate"
                data-testid={`row-module-${mod.code}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`relative flex h-8 w-8 items-center justify-center rounded-md flex-shrink-0 ${
                    isConnected
                      ? "bg-emerald-500/10 dark:bg-emerald-500/15"
                      : isError
                        ? "bg-red-500/10 dark:bg-red-500/15"
                        : "bg-muted"
                  }`}>
                    {isConnected ? (
                      <Link2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : mod.status === "configuring" ? (
                      <Settings2 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <Puzzle className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                        {String(mod.sortOrder).padStart(2, "0")}
                      </span>
                      <p className="text-sm font-medium truncate">{mod.name}</p>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{mod.code}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <PulsingDot color={isConnected ? "emerald" : isError ? "red" : "amber"} />
                  <StatusBadge status={mod.status} />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function RecentSyncsPanel({ syncs, modules }: { syncs: SyncLog[]; modules: ApiModule[] }) {
  const { t } = useLanguage();

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radio className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-medium font-mono uppercase tracking-wider">{t("dashboard.recentSync")}</h2>
          </div>
          {syncs.length > 0 && (
            <Badge variant="outline" className="font-mono text-[10px]">
              {syncs.length} {t("dashboard.signals")}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {syncs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Radio className="h-8 w-8 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground font-mono">{t("dashboard.noSyncActivity")}</p>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              {t("dashboard.syncWillAppear")}
            </p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />
            <div className="space-y-0.5">
              {syncs.map((log) => {
                const mod = modules.find(m => m.id === log.moduleId);
                const isSuccess = log.status === "success";
                const isError = log.status === "error";
                return (
                  <div
                    key={log.id}
                    className="flex items-center gap-3 py-2.5 px-3 rounded-md relative"
                    data-testid={`row-sync-${log.id}`}
                  >
                    <div className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full flex-shrink-0 ${
                      isSuccess
                        ? "bg-emerald-500/10 dark:bg-emerald-500/15"
                        : isError
                          ? "bg-red-500/10 dark:bg-red-500/15"
                          : "bg-muted"
                    }`}>
                      <SyncStatusIcon status={log.status} />
                    </div>
                    <div className="flex items-center justify-between gap-3 flex-1 min-w-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">
                            {mod?.name || "Unknown"}
                          </p>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            {log.direction === "import" ? (
                              <ArrowDownToLine className="h-3 w-3" />
                            ) : (
                              <ArrowUpFromLine className="h-3 w-3" />
                            )}
                            <span className="text-[10px] uppercase font-mono">{log.direction}</span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">
                          {log.recordsProcessed} {t("dashboard.records")}
                          {log.recordsFailed ? ` (${log.recordsFailed} ${t("dashboard.failed")})` : ""}
                        </p>
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap font-mono tabular-nums">
                        {log.startedAt
                          ? formatDistanceToNow(new Date(log.startedAt), { addSuffix: true })
                          : "\u2014"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ActiveSyncRun {
  id: string;
  syncConfigId: string;
  status: string;
  progress: number;
  recordsProcessed: number;
  recordsTotal: number;
  startedAt: string;
  triggeredByName: string | null;
  configName: string | null;
}

function ActiveSyncsPanel() {
  const { t } = useLanguage();
  const { data: runs = [] } = useQuery<ActiveSyncRun[]>({
    queryKey: ["/api/sync-runs/active"],
    refetchInterval: 5000,
  });

  const activeRuns = runs.filter(r => r.status === "running" || r.status === "pending");

  const getElapsed = (startedAt: string) => {
    const start = new Date(startedAt);
    const diffMs = Date.now() - start.getTime();
    const secs = Math.floor(diffMs / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    return `${mins}m ${remainSecs}s`;
  };

  if (activeRuns.length === 0) return null;

  return (
    <Card className="border-emerald-500/30 dark:border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/5">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Play className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-medium font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              {t("dashboard.activeSyncs")}
            </h2>
            <PulsingDot color="emerald" />
          </div>
          <Badge variant="outline" className="font-mono text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
            {activeRuns.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        <div className="space-y-2">
          {activeRuns.map((run) => {
            const pct = run.recordsTotal > 0 ? Math.min(100, Math.round((run.recordsProcessed / run.recordsTotal) * 100)) : (run.progress ?? 0);
            return (
              <div key={run.id} className="flex flex-col gap-1.5 p-3 rounded-md bg-background/60 border border-emerald-500/20" data-testid={`active-run-${run.id}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <span className="text-sm font-medium truncate" data-testid={`text-run-config-${run.id}`}>
                      {run.configName || run.syncConfigId}
                    </span>
                    <Badge
                      variant={run.status === "running" ? "default" : "secondary"}
                      className="text-[10px] font-mono h-4 px-1.5"
                    >
                      {run.status === "running" ? t("dashboard.runningNow") : t("dashboard.pendingNow")}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono flex-shrink-0">
                    {run.triggeredByName && (
                      <span className="flex items-center gap-1" data-testid={`text-run-user-${run.id}`}>
                        <User className="h-3 w-3" />
                        {run.triggeredByName}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {getElapsed(run.startedAt)}
                    </span>
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                    <span>{run.recordsProcessed.toLocaleString()} / {run.recordsTotal > 0 ? run.recordsTotal.toLocaleString() : "?"}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
                      style={{ width: `${pct}%` }}
                      data-testid={`progress-run-${run.id}`}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function TestAllPanel({ modules }: { modules: ApiModule[] }) {
  const { t } = useLanguage();
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const sorted = [...modules].sort((a, b) => a.sortOrder - b.sortOrder);
  const total = sorted.length;
  const successCount = results.filter(r => r.status === "success").length;
  const errorCount = results.filter(r => r.status === "error").length;
  const testedCount = results.filter(r => r.status === "success" || r.status === "error").length;
  const progressPercent = total > 0 ? (testedCount / total) * 100 : 0;

  const runTestAll = useCallback(async () => {
    setIsRunning(true);
    setIsDone(false);
    setCurrentIndex(0);

    const initial: TestResult[] = sorted.map(m => ({
      id: m.id,
      code: m.code,
      name: m.name,
      status: "pending" as const,
    }));
    setResults(initial);

    for (let i = 0; i < sorted.length; i++) {
      const mod = sorted[i];
      setCurrentIndex(i);

      setResults(prev => prev.map((r, idx) =>
        idx === i ? { ...r, status: "testing" as const } : r
      ));

      try {
        const res = await apiRequest("POST", `/api/modules/${mod.id}/test-connection`);
        const data = await res.json();
        setResults(prev => prev.map((r, idx) =>
          idx === i ? {
            ...r,
            status: data.success ? "success" as const : "error" as const,
            message: data.message,
            responseTime: data.responseTime,
          } : r
        ));
      } catch (err: any) {
        setResults(prev => prev.map((r, idx) =>
          idx === i ? {
            ...r,
            status: "error" as const,
            message: err.message || "Connection failed",
            responseTime: 0,
          } : r
        ));
      }
    }

    setIsRunning(false);
    setIsDone(true);
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/modules"] });
  }, [sorted]);

  return (
    <Card data-testid="card-test-all">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-medium font-mono uppercase tracking-wider">{t("dashboard.testAll")}</h2>
          </div>
          <Button
            size="sm"
            onClick={runTestAll}
            disabled={isRunning}
            data-testid="button-test-all"
            className="gap-2"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("dashboard.testing")} {currentIndex + 1}/{total}...
              </>
            ) : isDone ? (
              <>
                <Zap className="h-3.5 w-3.5" />
                {t("dashboard.retestAll")}
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5" />
                {t("dashboard.testAllModules")}
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Zap className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground font-mono">
              {t("dashboard.testAllDesc", { count: total })}
            </p>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              {t("dashboard.testAllProgress")}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-mono tracking-wide">
                  {isRunning
                    ? `${t("dashboard.testing")} ${sorted[currentIndex]?.name || ""}...`
                    : isDone
                      ? t("dashboard.testComplete")
                      : t("dashboard.ready")
                  }
                </span>
                <div className="flex items-center gap-3">
                  {testedCount > 0 && (
                    <>
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        <span className="font-mono">{successCount}</span>
                      </span>
                      <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                        <XCircle className="h-3 w-3" />
                        <span className="font-mono">{errorCount}</span>
                      </span>
                    </>
                  )}
                  <span className="tabular-nums font-mono">
                    {testedCount}/{total}
                  </span>
                </div>
              </div>

              <div className="relative h-2.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${progressPercent}%`,
                    background: errorCount > 0 && !isRunning
                      ? `linear-gradient(90deg, hsl(152 82% 39%) ${(successCount / testedCount) * 100}%, hsl(0 84% 60%) ${(successCount / testedCount) * 100}%)`
                      : "hsl(152 82% 39%)",
                  }}
                  data-testid="progress-bar-fill"
                />
                {isRunning && (
                  <div
                    className="absolute inset-y-0 rounded-full bg-foreground/20 animate-pulse"
                    style={{
                      left: `${progressPercent}%`,
                      width: `${100 / total}%`,
                    }}
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-1 max-h-[400px] overflow-y-auto">
              {results.map((result, idx) => (
                <div
                  key={result.id}
                  className={`flex items-center justify-between gap-3 py-2 px-3 rounded-md transition-all duration-300 ${
                    result.status === "testing"
                      ? "bg-muted/80 ring-1 ring-foreground/10"
                      : result.status === "success"
                        ? "bg-emerald-500/5"
                        : result.status === "error"
                          ? "bg-red-500/5"
                          : ""
                  }`}
                  data-testid={`test-result-${result.code}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <TestResultIcon status={result.status} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground font-mono tabular-nums w-5">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <span className={`text-sm font-medium truncate ${
                          result.status === "testing" ? "text-foreground" :
                          result.status === "pending" ? "text-muted-foreground" : ""
                        }`}>
                          {result.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {result.code}
                        </span>
                      </div>
                      {result.message && (result.status === "success" || result.status === "error") && (
                        <p className={`text-xs mt-0.5 truncate max-w-[300px] font-mono ${
                          result.status === "error"
                            ? "text-red-600 dark:text-red-400"
                            : "text-muted-foreground"
                        }`}>
                          {result.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {result.responseTime !== undefined && result.responseTime > 0 && (
                      <span className="text-[10px] text-muted-foreground tabular-nums font-mono">
                        {result.responseTime}ms
                      </span>
                    )}
                    {result.status === "success" && (
                      <Badge variant="default" className="text-[10px] h-5 font-mono">OK</Badge>
                    )}
                    {result.status === "error" && (
                      <Badge variant="destructive" className="text-[10px] h-5 font-mono">FAIL</Badge>
                    )}
                    {result.status === "testing" && (
                      <Badge variant="outline" className="text-[10px] h-5 animate-pulse font-mono">SCAN</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {isDone && (
              <div className={`flex items-center justify-center gap-2 py-3 px-4 rounded-md text-sm font-medium font-mono ${
                errorCount === 0
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
              }`} data-testid="test-all-summary">
                {errorCount === 0 ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    {t("dashboard.allConnected", { count: total })}
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4" />
                    {t("dashboard.someConnected", { success: successCount, error: errorCount, total })}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { t } = useLanguage();
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-7 w-48 mb-1" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 rounded-lg" />
          <Skeleton className="h-80 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px]">
      <CommandCenterHeader data={data} />

      <ActiveSyncsPanel />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title={t("dashboard.totalModules")}
          value={data.totalModules}
          icon={Puzzle}
          subtitle={data.disabledModules > 0 ? `${data.disabledModules} ${t("dashboard.disabled")}` : undefined}
          testId="stat-total-modules"
          accentColor="emerald"
        />
        <StatCard
          title={t("dashboard.connected")}
          value={data.connectedModules}
          icon={Link2}
          subtitle={`${data.totalModules - data.connectedModules} ${t("dashboard.disconnected")}`}
          testId="stat-connected-modules"
          accentColor="emerald"
        />
        <StatCard
          title={t("dashboard.todaySyncs")}
          value={data.todaySyncs}
          icon={ArrowLeftRight}
          testId="stat-today-syncs"
          accentColor="default"
        />
        <StatCard
          title={t("dashboard.errorsToday")}
          value={data.errorSyncs}
          icon={AlertTriangle}
          subtitle={data.errorSyncs > 0 ? t("dashboard.requiresAttention") : t("dashboard.allClear")}
          testId="stat-error-syncs"
          accentColor={data.errorSyncs > 0 ? "red" : "emerald"}
        />
      </div>

      <NetworkTopology modules={data.moduleStatuses} />

      <TestAllPanel modules={data.moduleStatuses} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ModuleStatusPanel modules={data.moduleStatuses} />
        <RecentSyncsPanel syncs={data.recentSyncs} modules={data.moduleStatuses} />
      </div>
    </div>
  );
}
