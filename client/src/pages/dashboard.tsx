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
} from "lucide-react";
import type { ApiModule, SyncLog } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { useState, useCallback } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface DashboardData {
  totalModules: number;
  connectedModules: number;
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

function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
  testId,
}: {
  title: string;
  value: string | number;
  icon: any;
  subtitle?: string;
  testId: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-semibold mt-1 tracking-tight" data-testid={testId}>
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    connected: { label: "Connected", variant: "default" },
    disconnected: { label: "Disconnected", variant: "secondary" },
    error: { label: "Error", variant: "destructive" },
    configuring: { label: "Configuring", variant: "outline" },
  };
  const c = config[status] || config.disconnected;
  return <Badge variant={c.variant} data-testid={`badge-status-${status}`}>{c.label}</Badge>;
}

function SyncStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />;
    case "error":
      return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    case "pending":
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    default:
      return <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />;
  }
}

function TestResultIcon({ status }: { status: TestResult["status"] }) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />;
    case "error":
      return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
    case "testing":
      return <Loader2 className="h-4 w-4 animate-spin text-foreground" />;
    default:
      return <Minus className="h-4 w-4 text-muted-foreground/40" />;
  }
}

function TestAllPanel({ modules }: { modules: ApiModule[] }) {
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Test Connection — ALL</h2>
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
                Testing {currentIndex + 1}/{total}...
              </>
            ) : isDone ? (
              <>
                <Zap className="h-3.5 w-3.5" />
                Re-test All
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5" />
                Test All Modules
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Zap className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              Test connectivity of all {total} modules at once
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Each module will be tested sequentially with live progress
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">
                  {isRunning
                    ? `Testing ${sorted[currentIndex]?.name || ""}...`
                    : isDone
                      ? "Test complete"
                      : "Ready"
                  }
                </span>
                <div className="flex items-center gap-3">
                  {testedCount > 0 && (
                    <>
                      <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-3 w-3" />
                        {successCount}
                      </span>
                      <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                        <XCircle className="h-3 w-3" />
                        {errorCount}
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
                      ? `linear-gradient(90deg, hsl(142 76% 36%) ${(successCount / testedCount) * 100}%, hsl(0 84% 60%) ${(successCount / testedCount) * 100}%)`
                      : "hsl(142 76% 36%)",
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

            <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
              {results.map((result, idx) => (
                <div
                  key={result.id}
                  className={`flex items-center justify-between gap-3 py-2 px-3 rounded-md transition-all duration-300 ${
                    result.status === "testing"
                      ? "bg-muted/80 ring-1 ring-foreground/10"
                      : result.status === "success"
                        ? "bg-green-500/5"
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
                        <span className="text-xs text-muted-foreground font-mono w-5">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <span className={`text-sm font-medium truncate ${
                          result.status === "testing" ? "text-foreground" :
                          result.status === "pending" ? "text-muted-foreground" : ""
                        }`}>
                          {result.name}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {result.code}
                        </span>
                      </div>
                      {result.message && (result.status === "success" || result.status === "error") && (
                        <p className={`text-xs mt-0.5 truncate max-w-[300px] ${
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
                      <span className="text-xs text-muted-foreground tabular-nums font-mono">
                        {result.responseTime}ms
                      </span>
                    )}
                    {result.status === "success" && (
                      <Badge variant="default" className="text-[10px] h-5">OK</Badge>
                    )}
                    {result.status === "error" && (
                      <Badge variant="destructive" className="text-[10px] h-5">FAIL</Badge>
                    )}
                    {result.status === "testing" && (
                      <Badge variant="outline" className="text-[10px] h-5 animate-pulse">TESTING</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {isDone && (
              <div className={`flex items-center justify-center gap-2 py-3 px-4 rounded-md text-sm font-medium ${
                errorCount === 0
                  ? "bg-green-500/10 text-green-700 dark:text-green-400"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
              }`} data-testid="test-all-summary">
                {errorCount === 0 ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    All {total} modules connected successfully
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4" />
                    {successCount} connected, {errorCount} failed of {total} modules
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
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-dashboard-title">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          System overview and integration status
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Modules"
          value={data.totalModules}
          icon={Puzzle}
          testId="stat-total-modules"
        />
        <StatCard
          title="Connected"
          value={data.connectedModules}
          icon={Link2}
          subtitle={`${data.totalModules - data.connectedModules} disconnected`}
          testId="stat-connected-modules"
        />
        <StatCard
          title="Today's Syncs"
          value={data.todaySyncs}
          icon={ArrowLeftRight}
          testId="stat-today-syncs"
        />
        <StatCard
          title="Errors Today"
          value={data.errorSyncs}
          icon={AlertTriangle}
          subtitle={data.errorSyncs > 0 ? "Requires attention" : "All clear"}
          testId="stat-error-syncs"
        />
      </div>

      <TestAllPanel modules={data.moduleStatuses} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Puzzle className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium">Module Status</h2>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1">
              {data.moduleStatuses.map((mod) => (
                <div
                  key={mod.id}
                  className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-md hover-elevate"
                  data-testid={`row-module-${mod.code}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted flex-shrink-0">
                      {mod.status === "connected" ? (
                        <Link2 className="h-3.5 w-3.5 text-foreground" />
                      ) : mod.status === "configuring" ? (
                        <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <Puzzle className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{mod.sortOrder.toString().padStart(2, "0")}. {mod.name}</p>
                      <p className="text-xs text-muted-foreground">{mod.code}</p>
                    </div>
                  </div>
                  <StatusBadge status={mod.status} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium">Recent Sync Activity</h2>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {data.recentSyncs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ArrowLeftRight className="h-8 w-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No sync activity yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Activity will appear here once modules start syncing
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {data.recentSyncs.map((log) => {
                  const mod = data.moduleStatuses.find(m => m.id === log.moduleId);
                  return (
                    <div
                      key={log.id}
                      className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-md"
                      data-testid={`row-sync-${log.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <SyncStatusIcon status={log.status} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">
                              {mod?.name || "Unknown"}
                            </p>
                            <div className="flex items-center gap-1 text-muted-foreground">
                              {log.direction === "import" ? (
                                <ArrowDownToLine className="h-3 w-3" />
                              ) : (
                                <ArrowUpFromLine className="h-3 w-3" />
                              )}
                              <span className="text-xs capitalize">{log.direction}</span>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {log.recordsProcessed} records
                            {log.recordsFailed ? ` (${log.recordsFailed} failed)` : ""}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {log.startedAt
                          ? formatDistanceToNow(new Date(log.startedAt), { addSuffix: true })
                          : "\u2014"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
