import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/components/language-provider";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Play,
  Square,
  RotateCcw,
  Trash2,
  Download,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  HardDrive,
  BarChart3,
  TrendingUp,
  Timer,
  AlertTriangle,
  ExternalLink,
  Loader2,
  RefreshCw,
  Shield,
  Database,
  Upload,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { SyncConfig, SyncRun } from "@shared/schema";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

function formatTimeAgo(date: string | Date): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "práve teraz";
  if (mins < 60) return `pred ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `pred ${hours}h`;
  const days = Math.floor(hours / 24);
  return `pred ${days}d`;
}

function ProgressRing({ progress, size = 120, strokeWidth = 8 }: { progress: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;
  const center = size / 2;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/20" />
      <circle
        cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        className="text-foreground transition-all duration-500"
      />
    </svg>
  );
}

const PHASE_CONFIG: Record<string, { labelKey: string; icon: any; step: number }> = {
  preflight: { labelKey: "syncDash.phasePreflight", icon: Shield, step: 1 },
  backup: { labelKey: "syncDash.phaseBackup", icon: HardDrive, step: 2 },
  fetch: { labelKey: "syncDash.phaseFetch", icon: Database, step: 3 },
  sync: { labelKey: "syncDash.phaseSync", icon: Upload, step: 4 },
  complete: { labelKey: "syncDash.phaseComplete", icon: CheckCircle2, step: 4 },
  error: { labelKey: "syncDash.phaseError", icon: XCircle, step: 0 },
  cancelled: { labelKey: "syncDash.phaseCancelled", icon: Square, step: 0 },
};

function PhaseIndicator({ phase, t }: { phase: string; t: (key: string) => string }) {
  const config = PHASE_CONFIG[phase];
  if (!config) return null;
  const Icon = config.icon;
  const isError = phase === "error" || phase === "cancelled";
  const isComplete = phase === "complete";
  const isBackup = phase === "backup";

  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium ${
        isError ? "bg-destructive/10 text-destructive" :
        isComplete ? "bg-green-500/10 text-green-700 dark:text-green-400" :
        isBackup ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" :
        "bg-muted"
      }`}
      data-testid={`phase-indicator-${phase}`}
    >
      {(phase === "backup" || phase === "fetch" || phase === "preflight" || phase === "sync") ? (
        <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
      ) : (
        <Icon className="h-4 w-4 flex-shrink-0" />
      )}
      <span>
        {t("syncDash.phaseLabel")} {config.step > 0 ? `${config.step}/4` : ""}: {t(config.labelKey)}
      </span>
      {isBackup && <span className="text-xs opacity-70">...</span>}
    </div>
  );
}

function StatusBadge({ status, t }: { status: string; t: (key: string) => string }) {
  const config: Record<string, { labelKey: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    success: { labelKey: "syncDash.statusSuccess", variant: "default" },
    error: { labelKey: "syncDash.statusError", variant: "destructive" },
    running: { labelKey: "syncDash.statusRunning", variant: "secondary" },
    pending: { labelKey: "syncDash.statusPending", variant: "outline" },
  };
  const c = config[status] || { labelKey: status, variant: "outline" as const };
  return <Badge variant={c.variant} data-testid={`badge-status-${status}`}>{t(c.labelKey)}</Badge>;
}

function DonutChart({ data, size = 160 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={size/2 - 20} fill="none" stroke="currentColor" strokeWidth="16" className="text-muted/20" />
        <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle" className="text-sm fill-muted-foreground">0</text>
      </svg>
    );
  }

  const radius = size / 2 - 20;
  const circumference = 2 * Math.PI * radius;
  let accumulatedOffset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
      {data.map((d, i) => {
        const pct = d.value / total;
        const dashLength = pct * circumference;
        const dashOffset = accumulatedOffset;
        accumulatedOffset += dashLength;
        return (
          <circle
            key={i} cx={size/2} cy={size/2} r={radius} fill="none" stroke={d.color} strokeWidth="16"
            strokeDasharray={`${dashLength} ${circumference - dashLength}`}
            strokeDashoffset={-dashOffset}
          />
        );
      })}
    </svg>
  );
}

function TimelineChart({ runs }: { runs: SyncRun[] }) {
  const days: Record<string, { success: number; error: number; total: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days[key] = { success: 0, error: 0, total: 0 };
  }

  for (const run of runs) {
    const key = new Date(run.startedAt).toISOString().slice(0, 10);
    if (days[key]) {
      days[key].total++;
      if (run.status === "success") days[key].success++;
      else if (run.status === "error") days[key].error++;
    }
  }

  const entries = Object.entries(days);
  const maxVal = Math.max(1, ...entries.map(([, v]) => v.total));

  return (
    <div className="flex items-end gap-1 h-24">
      {entries.map(([date, val]) => (
        <div key={date} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex flex-col items-center gap-0.5" style={{ height: "80px" }}>
            {val.error > 0 && (
              <div
                className="w-full bg-destructive/70 rounded-t-sm"
                style={{ height: `${(val.error / maxVal) * 70}px`, minHeight: val.error > 0 ? "4px" : "0px" }}
              />
            )}
            {val.success > 0 && (
              <div
                className="w-full bg-foreground rounded-t-sm"
                style={{ height: `${(val.success / maxVal) * 70}px`, minHeight: val.success > 0 ? "4px" : "0px" }}
              />
            )}
            {val.total === 0 && <div className="w-full bg-muted/30 rounded-sm" style={{ height: "4px", marginTop: "auto" }} />}
          </div>
          <span className="text-[9px] text-muted-foreground">{date.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

export default function SyncDashboardPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"overview" | "backups">("overview");
  const [trackingRunId, setTrackingRunId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ type: string; id: string; name?: string } | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const { data: configs = [] } = useQuery<(SyncConfig & { sourceModule?: any; targetModule?: any })[]>({
    queryKey: ["/api/sync-configs"],
  });

  const { data: runs = [], refetch: refetchRuns } = useQuery<SyncRun[]>({
    queryKey: ["/api/sync-runs"],
    refetchInterval: trackingRunId ? 2000 : 10000,
  });

  const { data: activeRuns = [] } = useQuery<SyncRun[]>({
    queryKey: ["/api/sync-runs", "active"],
    refetchInterval: trackingRunId ? 1000 : 5000,
  });

  const { data: backups = [], refetch: refetchBackups } = useQuery<any[]>({
    queryKey: ["/api/sync-backups"],
  });

  const { data: backupStats } = useQuery<any>({
    queryKey: ["/api/sync-backups", "stats"],
  });

  const trackedRun = trackingRunId ? runs.find(r => r.id === trackingRunId) || activeRuns.find(r => r.id === trackingRunId) : null;

  useEffect(() => {
    if (trackedRun && (trackedRun.status === "success" || trackedRun.status === "error")) {
      setTimeout(() => {
        setTrackingRunId(null);
        queryClient.invalidateQueries({ queryKey: ["/api/sync-backups"] });
      }, 3000);
    }
  }, [trackedRun?.status]);

  useEffect(() => {
    if (activeRuns.length > 0 && !trackingRunId) {
      setTrackingRunId(activeRuns[0].id);
    }
  }, [activeRuns.length]);

  const startSyncMutation = useMutation({
    mutationFn: async (configId: string) => {
      const res = await apiRequest("POST", `/api/sync-configs/${configId}/run`);
      return res.json();
    },
    onSuccess: (data) => {
      setTrackingRunId(data.runId);
      toast({ title: t("syncDash.syncStarted"), description: t("syncDash.syncStartedDesc") });
      queryClient.invalidateQueries({ queryKey: ["/api/sync-runs"] });
    },
    onError: (err: any) => {
      toast({ title: t("syncDash.error"), description: err.message, variant: "destructive" });
    },
  });

  const cancelSyncMutation = useMutation({
    mutationFn: async (runId: string) => {
      const res = await apiRequest("POST", `/api/sync-runs/${runId}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("syncDash.cancelled"), description: t("syncDash.cancelledDesc") });
      queryClient.invalidateQueries({ queryKey: ["/api/sync-runs"] });
    },
  });

  const restoreBackupMutation = useMutation({
    mutationFn: async (backupId: string) => {
      const res = await apiRequest("POST", `/api/sync-backups/${backupId}/restore`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.success ? t("syncDash.restored") : t("syncDash.error"),
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
  });

  const deleteBackupMutation = useMutation({
    mutationFn: async (backupId: string) => {
      await apiRequest("DELETE", `/api/sync-backups/${backupId}`);
    },
    onSuccess: () => {
      toast({ title: t("syncDash.backupDeleted") });
      queryClient.invalidateQueries({ queryKey: ["/api/sync-backups"] });
    },
  });

  const deleteAllBackupsMutation = useMutation({
    mutationFn: async (configId: string) => {
      await apiRequest("DELETE", `/api/sync-backups/config/${configId}`);
    },
    onSuccess: () => {
      toast({ title: t("syncDash.allBackupsDeleted") });
      queryClient.invalidateQueries({ queryKey: ["/api/sync-backups"] });
    },
  });

  const todayRuns = runs.filter(r => {
    const d = new Date(r.startedAt);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });
  const successRuns = runs.filter(r => r.status === "success");
  const errorRuns = runs.filter(r => r.status === "error");
  const totalRecordsSynced = runs.reduce((sum, r) => sum + (r.recordsProcessed || 0), 0);
  const avgDuration = successRuns.length > 0
    ? successRuns.filter(r => r.completedAt).reduce((sum, r) => sum + (new Date(r.completedAt!).getTime() - new Date(r.startedAt).getTime()), 0) / successRuns.filter(r => r.completedAt).length
    : 0;
  const successRate = runs.length > 0 ? Math.round((successRuns.length / runs.length) * 100) : 0;

  const configMap = Object.fromEntries(configs.map(c => [c.id, c]));

  const backupsByConfig: Record<string, any[]> = {};
  for (const b of backups) {
    if (!backupsByConfig[b.syncConfigId]) backupsByConfig[b.syncConfigId] = [];
    backupsByConfig[b.syncConfigId].push(b);
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-sync-dashboard-title">
            {t("syncDash.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("syncDash.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => setActiveTab(activeTab === "overview" ? "backups" : "overview")}
            data-testid="button-toggle-tab"
          >
            {activeTab === "overview" ? <HardDrive className="h-4 w-4 mr-1.5" /> : <BarChart3 className="h-4 w-4 mr-1.5" />}
            {activeTab === "overview" ? t("syncDash.backups") : t("syncDash.overview")}
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => { refetchRuns(); refetchBackups(); }}
            data-testid="button-refresh-dashboard"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {activeTab === "overview" ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Activity className="h-4 w-4" />
                  <span className="text-xs">{t("syncDash.todaySyncs")}</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-today-syncs">{todayRuns.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs">{t("syncDash.totalRecords")}</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-total-records">{totalRecordsSynced.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Timer className="h-4 w-4" />
                  <span className="text-xs">{t("syncDash.avgTime")}</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-avg-time">{avgDuration > 0 ? formatDuration(avgDuration) : "—"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs">{t("syncDash.successRate")}</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-success-rate">{successRate}%</p>
              </CardContent>
            </Card>
          </div>

          {trackedRun && (
            <Card className={`border-foreground/20 ${trackedRun.status === "error" ? "border-destructive/40" : ""}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {trackedRun.status === "running" || trackedRun.status === "pending" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : trackedRun.status === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  {t("syncDash.liveProgress")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="relative">
                    <ProgressRing progress={trackedRun.progress || 0} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-2xl font-bold">{trackedRun.progress || 0}%</span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-3 min-w-0">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground">{t("syncDash.config")}:</span>
                      <span className="font-medium">{configMap[trackedRun.syncConfigId]?.name || trackedRun.syncConfigId}</span>
                    </div>

                    {(trackedRun.details as any)?.phase && (
                      <PhaseIndicator phase={(trackedRun.details as any).phase} t={t} />
                    )}

                    {(trackedRun.status === "running" || trackedRun.status === "pending") && (trackedRun.details as any)?.phase === "sync" && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">{t("syncDash.records")}:</span>
                          <p className="font-medium" data-testid="text-progress-records">
                            {trackedRun.recordsProcessed || 0} z {trackedRun.recordsTotal || 0}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("syncDash.batch")}:</span>
                          <p className="font-medium" data-testid="text-progress-batch">
                            {t("syncDash.batchOf").replace("{current}", String(trackedRun.currentBatch || 0)).replace("{total}", String(trackedRun.totalBatches || 0))}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("syncDash.speed")}:</span>
                          <p className="font-medium" data-testid="text-progress-speed">
                            {trackedRun.speedPerSec || 0} {t("syncDash.recPerSec")}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("syncDash.eta")}:</span>
                          <p className="font-medium" data-testid="text-progress-eta">
                            {trackedRun.estimatedEndAt ? formatDuration(Math.max(0, new Date(trackedRun.estimatedEndAt).getTime() - Date.now())) : "—"}
                          </p>
                        </div>
                      </div>
                    )}

                    {(trackedRun.recordsFailed || 0) > 0 && (
                      <div className="flex items-center gap-1.5 text-destructive text-sm">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {trackedRun.recordsFailed} {t("syncDash.recordsFailed")}
                      </div>
                    )}

                    {trackedRun.status === "error" && trackedRun.errorMessage && (
                      <div className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm" data-testid="text-sync-error-message">
                        <div className="flex items-center gap-2 font-medium mb-1">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {t("syncDash.errorDetails")}
                        </div>
                        <p className="text-xs">{trackedRun.errorMessage}</p>
                      </div>
                    )}

                    {(trackedRun.status === "running" || trackedRun.status === "pending") && (
                      <Button
                        variant="destructive" size="sm"
                        onClick={() => cancelSyncMutation.mutate(trackedRun.id)}
                        disabled={cancelSyncMutation.isPending}
                        data-testid="button-cancel-sync"
                      >
                        <Square className="h-3.5 w-3.5 mr-1.5" />
                        {t("syncDash.cancel")}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("syncDash.quickSync")}</CardTitle>
              </CardHeader>
              <CardContent>
                {configs.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">{t("syncDash.noConfigs")}</p>
                ) : (
                  <div className="space-y-2">
                    {configs.map(config => {
                      const lastRun = runs.find(r => r.syncConfigId === config.id);
                      const isRunning = activeRuns.some(r => r.syncConfigId === config.id);
                      const schedule = config.schedule as any;
                      return (
                        <div key={config.id} className="flex items-center justify-between p-3 rounded-lg border" data-testid={`card-config-${config.id}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{config.name}</span>
                              {schedule?.backupBeforeSync !== false && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  <HardDrive className="h-3 w-3 mr-0.5" />
                                  {t("syncDash.backup")}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                              {config.sourceModule && <span>{config.sourceModule.name}</span>}
                              <span>→</span>
                              {config.targetModule && <span>{config.targetModule.name}</span>}
                              {lastRun && (
                                <>
                                  <span>·</span>
                                  <span>{formatTimeAgo(lastRun.startedAt)}</span>
                                  <StatusBadge status={lastRun.status} t={t} />
                                </>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => startSyncMutation.mutate(config.id)}
                            disabled={isRunning || startSyncMutation.isPending}
                            data-testid={`button-run-sync-${config.id}`}
                          >
                            {isRunning ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <Play className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            {isRunning ? t("syncDash.running") : t("syncDash.run")}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t("syncDash.breakdown")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center">
                    <div className="relative">
                      <DonutChart
                        data={[
                          { label: "Success", value: successRuns.length, color: "hsl(var(--foreground))" },
                          { label: "Error", value: errorRuns.length, color: "hsl(var(--destructive))" },
                          { label: "Other", value: Math.max(0, runs.length - successRuns.length - errorRuns.length), color: "hsl(var(--muted))" },
                        ]}
                        size={130}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-lg font-bold">{runs.length}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-center gap-4 mt-3 text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-foreground" />
                      <span>{t("syncDash.success")} ({successRuns.length})</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-destructive" />
                      <span>{t("syncDash.errorLabel")} ({errorRuns.length})</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t("syncDash.last7days")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <TimelineChart runs={runs} />
                </CardContent>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("syncDash.runHistory")}</CardTitle>
            </CardHeader>
            <CardContent>
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">{t("syncDash.noRuns")}</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {runs.slice(0, 20).map(run => {
                    const config = configMap[run.syncConfigId];
                    const duration = run.completedAt
                      ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
                      : Date.now() - new Date(run.startedAt).getTime();
                    const details = run.details as any;
                    const hasError = run.status === "error" && (run.errorMessage || details?.batchErrors?.length > 0);
                    const isExpanded = expandedRunId === run.id;
                    return (
                      <div key={run.id} className="rounded-lg border" data-testid={`row-run-${run.id}`}>
                        <div
                          className={`flex items-center justify-between p-3 text-sm ${hasError ? "cursor-pointer hover:bg-muted/50" : ""}`}
                          onClick={() => hasError && setExpandedRunId(isExpanded ? null : run.id)}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <StatusBadge status={run.status} t={t} />
                            <span className="font-medium truncate">{config?.name || run.syncConfigId}</span>
                            {details?.phase && (
                              <span className="text-xs text-muted-foreground">
                                ({t(`syncDash.phase${details.phase.charAt(0).toUpperCase() + details.phase.slice(1)}`) || details.phase})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>{run.recordsProcessed || 0} / {run.recordsTotal || 0}</span>
                            {(run.recordsFailed || 0) > 0 && (
                              <span className="text-destructive">{run.recordsFailed} {t("syncDash.failed")}</span>
                            )}
                            <span>{formatDuration(duration)}</span>
                            <span>{formatTimeAgo(run.startedAt)}</span>
                            {hasError && (
                              isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </div>
                        </div>
                        {isExpanded && hasError && (
                          <div className="px-3 pb-3 border-t">
                            <div className="mt-2 p-2.5 rounded bg-destructive/5 text-sm">
                              <p className="font-medium text-destructive text-xs mb-1">{t("syncDash.errorDetails")}:</p>
                              {run.errorMessage && (
                                <p className="text-xs text-destructive/80 mb-2">{run.errorMessage}</p>
                              )}
                              {details?.batchErrors && details.batchErrors.length > 0 && (
                                <div className="space-y-1 max-h-32 overflow-y-auto">
                                  {details.batchErrors.slice(0, 10).map((err: any, i: number) => (
                                    <div key={i} className="text-[11px] text-muted-foreground flex gap-2">
                                      <span className="text-destructive/60 flex-shrink-0">#{err.index || err.batch}</span>
                                      <span>{err.message}</span>
                                    </div>
                                  ))}
                                  {details.batchErrors.length > 10 && (
                                    <p className="text-[11px] text-muted-foreground">...+{details.batchErrors.length - 10}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("syncDash.perConfigStats")}</CardTitle>
            </CardHeader>
            <CardContent>
              {configs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">{t("syncDash.noConfigs")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-left">
                        <th className="pb-2 font-medium">{t("syncDash.configName")}</th>
                        <th className="pb-2 font-medium">{t("syncDash.lastRun")}</th>
                        <th className="pb-2 font-medium">{t("syncDash.statusLabel")}</th>
                        <th className="pb-2 font-medium text-right">{t("syncDash.totalSynced")}</th>
                        <th className="pb-2 font-medium text-right">{t("syncDash.backupsCount")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {configs.map(config => {
                        const configRuns = runs.filter(r => r.syncConfigId === config.id);
                        const lastRun = configRuns[0];
                        const totalSynced = configRuns.reduce((sum, r) => sum + (r.recordsProcessed || 0), 0);
                        const configBackups = backupsByConfig[config.id] || [];
                        return (
                          <tr key={config.id} className="border-b last:border-0" data-testid={`row-config-stats-${config.id}`}>
                            <td className="py-2 font-medium">{config.name}</td>
                            <td className="py-2 text-muted-foreground">{lastRun ? formatTimeAgo(lastRun.startedAt) : "—"}</td>
                            <td className="py-2">{lastRun ? <StatusBadge status={lastRun.status} t={t} /> : <span className="text-muted-foreground">—</span>}</td>
                            <td className="py-2 text-right">{totalSynced.toLocaleString()}</td>
                            <td className="py-2 text-right">
                              <span className={configBackups.length >= 10 ? "text-destructive" : ""}>
                                {configBackups.length} / 10
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <HardDrive className="h-4 w-4" />
                  <span className="text-xs">{t("syncDash.totalBackups")}</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-total-backups">{backups.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Download className="h-4 w-4" />
                  <span className="text-xs">{t("syncDash.totalSize")}</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-total-size">
                  {formatBytes(backups.reduce((sum: number, b: any) => sum + (b.fileSize || 0), 0))}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Zap className="h-4 w-4" />
                  <span className="text-xs">{t("syncDash.configsWithBackup")}</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-configs-with-backup">{Object.keys(backupsByConfig).length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="text-xs">{t("syncDash.maxPerConfig")}</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-max-per-config">10</p>
                <p className="text-[10px] text-muted-foreground">{t("syncDash.autoCleanup")}</p>
              </CardContent>
            </Card>
          </div>

          {Object.keys(backupsByConfig).length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <HardDrive className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">{t("syncDash.noBackups")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("syncDash.noBackupsDesc")}</p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(backupsByConfig).map(([configId, configBackups]) => {
              const config = configMap[configId];
              return (
                <Card key={configId}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        {config?.name || configId}
                        <Badge variant="outline" className="text-[10px]">
                          {configBackups.length} / 10 {t("syncDash.backupsLabel")}
                        </Badge>
                      </CardTitle>
                      <Button
                        variant="outline" size="sm"
                        className="text-destructive"
                        onClick={() => setConfirmDialog({ type: "deleteAll", id: configId, name: config?.name })}
                        data-testid={`button-delete-all-backups-${configId}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        {t("syncDash.deleteAll")}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {configBackups.map((backup: any) => (
                        <div key={backup.id} className="flex items-center justify-between p-3 rounded-lg border" data-testid={`row-backup-${backup.id}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <HardDrive className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-sm font-medium truncate">{backup.fileName}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 ml-5">
                              <span>{formatBytes(backup.fileSize || 0)}</span>
                              <span>·</span>
                              <span>{backup.backupRecordCount || 0} {t("syncDash.records")}</span>
                              <span>·</span>
                              <span>{formatTimeAgo(backup.createdAt)}</span>
                              {backup.googleDriveUrl && (
                                <>
                                  <span>·</span>
                                  <a
                                    href={backup.googleDriveUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 hover:text-foreground"
                                    data-testid={`link-drive-${backup.id}`}
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    Google Drive
                                  </a>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline" size="sm"
                              onClick={() => setConfirmDialog({ type: "restore", id: backup.id, name: backup.fileName })}
                              disabled={restoreBackupMutation.isPending}
                              data-testid={`button-restore-${backup.id}`}
                            >
                              <RotateCcw className="h-3.5 w-3.5 mr-1" />
                              {t("syncDash.restore")}
                            </Button>
                            <Button
                              variant="outline" size="sm"
                              className="text-destructive"
                              onClick={() => setConfirmDialog({ type: "delete", id: backup.id, name: backup.fileName })}
                              disabled={deleteBackupMutation.isPending}
                              data-testid={`button-delete-${backup.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </>
      )}

      <AlertDialog open={!!confirmDialog} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog?.type === "restore" ? t("syncDash.confirmRestore") :
               confirmDialog?.type === "delete" ? t("syncDash.confirmDelete") :
               t("syncDash.confirmDeleteAll")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog?.type === "restore"
                ? t("syncDash.confirmRestoreDesc").replace("{name}", confirmDialog?.name || "")
                : confirmDialog?.type === "deleteAll"
                ? t("syncDash.confirmDeleteAllDesc").replace("{name}", confirmDialog?.name || "")
                : t("syncDash.confirmDeleteDesc").replace("{name}", confirmDialog?.name || "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-confirm-cancel">{t("syncDash.cancelAction")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-action"
              onClick={() => {
                if (!confirmDialog) return;
                if (confirmDialog.type === "restore") restoreBackupMutation.mutate(confirmDialog.id);
                else if (confirmDialog.type === "delete") deleteBackupMutation.mutate(confirmDialog.id);
                else if (confirmDialog.type === "deleteAll") deleteAllBackupsMutation.mutate(confirmDialog.id);
                setConfirmDialog(null);
              }}
            >
              {confirmDialog?.type === "restore" ? t("syncDash.restore") : t("syncDash.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
