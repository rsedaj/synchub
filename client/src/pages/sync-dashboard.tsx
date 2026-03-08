import { useState, useEffect, useRef, useCallback } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
  ArrowLeftRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Filter,
  FileText,
  Cloud,
  FolderOpen,
  Settings,
} from "lucide-react";
import type { ApiModule, SyncConfig, SyncLog, SyncRun } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

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

function ProgressRing({ progress, size = 120, strokeWidth = 8, isActive = false, recordsTotal = 0, speedPerSec = 0 }: { progress: number; size?: number; strokeWidth?: number; isActive?: boolean; recordsTotal?: number; speedPerSec?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;
  const center = size / 2;
  const sweepRadius = radius - strokeWidth - 2;
  const sweepCirc = 2 * Math.PI * sweepRadius;
  const sweepLength = sweepCirc * 0.06;

  const [sweepAngle, setSweepAngle] = useState(0);
  const lastProgressRef = useRef(progress);
  const startTimeRef = useRef(Date.now());
  const rafRef = useRef<number>(0);

  const msPerPercent = useCallback(() => {
    if (speedPerSec > 0 && recordsTotal > 0) {
      const recordsPerPercent = recordsTotal / 100;
      return (recordsPerPercent / speedPerSec) * 1000;
    }
    return 5000;
  }, [speedPerSec, recordsTotal]);

  useEffect(() => {
    if (progress !== lastProgressRef.current) {
      lastProgressRef.current = progress;
      startTimeRef.current = Date.now();
      setSweepAngle(0);
    }
  }, [progress]);

  useEffect(() => {
    if (!isActive || progress <= 0 || progress >= 100) {
      setSweepAngle(0);
      return;
    }

    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const duration = msPerPercent();
      const fraction = Math.min(elapsed / duration, 0.99);
      setSweepAngle(fraction * 360);
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isActive, progress, msPerPercent]);

  const showSweep = isActive && progress > 0 && progress < 100;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/20" />
      <circle
        cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        className="text-foreground transition-all duration-500"
      />
      {showSweep && (
        <circle
          cx={center} cy={center} r={sweepRadius} fill="none" stroke="currentColor" strokeWidth={2}
          strokeDasharray={`${sweepLength} ${sweepCirc - sweepLength}`}
          strokeLinecap="round"
          className="text-foreground/40"
          style={{ transform: `rotate(${sweepAngle}deg)`, transformOrigin: `${center}px ${center}px` }}
        />
      )}
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

const PHASE_STEPS = ["preflight", "backup", "fetch", "sync"] as const;

function PhaseIndicator({ phase, phaseHistory, t }: { phase: string; phaseHistory?: Record<string, string>; t: (key: string) => string }) {
  const isError = phase === "error" || phase === "cancelled";
  const isComplete = phase === "complete";

  const getStepStatus = (step: string): "done" | "running" | "pending" | "error" => {
    if (isError) {
      if (phaseHistory && phaseHistory[step]) {
        return phaseHistory[step] as any;
      }
      return "error";
    }
    if (isComplete) return "done";
    if (phaseHistory && phaseHistory[step]) return phaseHistory[step] as any;
    const currentIdx = PHASE_STEPS.indexOf(phase as any);
    const stepIdx = PHASE_STEPS.indexOf(step as any);
    if (stepIdx < 0 || currentIdx < 0) return "pending";
    if (stepIdx < currentIdx) return "done";
    if (stepIdx === currentIdx) return "running";
    return "pending";
  };

  return (
    <div className="flex items-center gap-1 w-full" data-testid="phase-indicator-steps">
      {PHASE_STEPS.map((step, idx) => {
        const status = getStepStatus(step);
        const config = PHASE_CONFIG[step];
        if (!config) return null;
        const Icon = config.icon;

        return (
          <div key={step} className="flex items-center flex-1 min-w-0">
            <div
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium w-full ${
                status === "done" ? "bg-green-500/10 text-green-700 dark:text-green-400" :
                status === "running" ? "bg-foreground/10 text-foreground" :
                status === "error" ? "bg-destructive/10 text-destructive" :
                "bg-muted/50 text-muted-foreground"
              }`}
              data-testid={`phase-step-${step}`}
            >
              {status === "done" ? (
                <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-green-600 dark:text-green-400" />
              ) : status === "running" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
              ) : status === "error" ? (
                <XCircle className="h-3.5 w-3.5 flex-shrink-0" />
              ) : (
                <Icon className="h-3.5 w-3.5 flex-shrink-0 opacity-40" />
              )}
              <span className="truncate">{t(config.labelKey)}</span>
              {status === "done" && <span className="text-[10px] opacity-70 ml-auto flex-shrink-0">{t("syncDash.phaseOk")}</span>}
            </div>
            {idx < PHASE_STEPS.length - 1 && (
              <div className={`w-3 h-px flex-shrink-0 mx-0.5 ${status === "done" ? "bg-green-500/40" : "bg-muted"}`} />
            )}
          </div>
        );
      })}
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

function TimelineChart({ runs, dayCount }: { runs: SyncRun[]; dayCount: number }) {
  const days: Record<string, { success: number; error: number; total: number }> = {};
  for (let i = dayCount - 1; i >= 0; i--) {
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
  const showEveryNth = dayCount > 14 ? 3 : dayCount > 7 ? 2 : 1;

  return (
    <div className="flex items-end gap-px h-24">
      {entries.map(([date, val], idx) => (
        <div key={date} className="flex-1 flex flex-col items-center gap-0.5">
          <div className="w-full flex flex-col items-center gap-0.5" style={{ height: "76px" }}>
            {val.error > 0 && (
              <div
                className="w-full bg-destructive/70 rounded-t-sm"
                style={{ height: `${(val.error / maxVal) * 68}px`, minHeight: "3px" }}
              />
            )}
            {val.success > 0 && (
              <div
                className="w-full bg-foreground rounded-t-sm"
                style={{ height: `${(val.success / maxVal) * 68}px`, minHeight: "3px" }}
              />
            )}
            {val.total === 0 && <div className="w-full bg-muted/30 rounded-sm" style={{ height: "3px", marginTop: "auto" }} />}
          </div>
          {idx % showEveryNth === 0 && (
            <span className="text-[8px] text-muted-foreground leading-none">{date.slice(5)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function SyncDashboardPage({ initialTab }: { initialTab?: "overview" | "backups" | "logs" }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"overview" | "backups" | "logs">(initialTab || "overview");
  const [timelineDays, setTimelineDays] = useState(7);
  const [trackingRunId, setTrackingRunId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ type: string; id: string; name?: string } | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [recordsViewRunId, setRecordsViewRunId] = useState<string | null>(null);
  const [recordsFilter, setRecordsFilter] = useState<"all" | "created" | "updated" | "error">("all");
  const [recordsPage, setRecordsPage] = useState(0);
  const [filterModule, setFilterModule] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedConfigs, setSelectedConfigs] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchQueue, setBatchQueue] = useState<string[]>([]);
  const [batchCompleted, setBatchCompleted] = useState<string[]>([]);

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

  const { data: modules = [] } = useQuery<ApiModule[]>({
    queryKey: ["/api/modules"],
  });

  const { data: syncLogs = [] } = useQuery<SyncLog[]>({
    queryKey: ["/api/sync-logs"],
  });

  const filteredLogs = syncLogs.filter((log) => {
    if (filterModule !== "all" && log.moduleId !== filterModule) return false;
    if (filterStatus !== "all" && log.status !== filterStatus) return false;
    return true;
  });

  const getModuleName = (moduleId: string) => {
    return modules.find(m => m.id === moduleId)?.name || "Unknown";
  };

  const getModuleCode = (moduleId: string) => {
    return modules.find(m => m.id === moduleId)?.code || "\u2014";
  };

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

  const { data: configDriveBackups = [], refetch: refetchConfigDriveBackups, isLoading: isLoadingConfigDrive } = useQuery<any[]>({
    queryKey: ["/api/backups/config-drive-list"],
  });

  const configToDriveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/backups/config-to-drive");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: t("syncDash.configBackupSuccess"),
        description: `${data.fileName} (${data.stats.configs} ${t("syncDash.configs")}, ${data.stats.modules} ${t("syncDash.modules")}, ${data.stats.users} ${t("syncDash.users")})`,
      });
      refetchConfigDriveBackups();
    },
    onError: (err: any) => {
      toast({ title: t("syncDash.configBackupFailed"), description: err.message, variant: "destructive" });
    },
  });

  const deleteConfigDriveBackupMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await apiRequest("DELETE", `/api/backups/config-drive/${fileId}`);
    },
    onSuccess: () => {
      toast({ title: t("syncDash.configBackupDeleted") });
      refetchConfigDriveBackups();
    },
  });

  const restoreConfigDriveMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const res = await apiRequest("POST", `/api/backups/config-restore-from-drive/${fileId}`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: t("syncDash.configRestoreSuccess"),
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/modules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sync-configs"] });
    },
    onError: (err: any) => {
      toast({ title: t("syncDash.configRestoreFailed"), description: err.message, variant: "destructive" });
    },
  });

  const manualBackupMutation = useMutation({
    mutationFn: async (configId: string) => {
      await apiRequest("POST", `/api/backups/manual/${configId}`);
    },
    onSuccess: () => {
      toast({ title: t("syncDash.manualBackupSuccess") });
      queryClient.invalidateQueries({ queryKey: ["/api/sync-backups"] });
    },
    onError: (err: any) => {
      toast({ title: err.message || "Backup failed", variant: "destructive" });
    },
  });

  const handleConfigExport = async () => {
    try {
      const res = await apiRequest("POST", "/api/backups/config-export");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `synchub-config-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: t("syncDash.exportSuccess") });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const handleConfigImport = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await apiRequest("POST", "/api/backups/config-import", data);
      toast({ title: t("syncDash.importSuccess") });
      queryClient.invalidateQueries({ queryKey: ["/api/modules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sync-configs"] });
    } catch {
      toast({ title: "Import failed", variant: "destructive" });
    }
  };

  const toggleConfig = (id: string) => {
    setSelectedConfigs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedConfigs.size === configs.length) {
      setSelectedConfigs(new Set());
    } else {
      setSelectedConfigs(new Set(configs.map(c => c.id)));
    }
  };

  const anyRunning = activeRuns.length > 0 || batchRunning;

  const runBatchSync = async () => {
    const queue = configs.filter(c => selectedConfigs.has(c.id)).map(c => c.id);
    if (queue.length === 0) return;
    setBatchRunning(true);
    setBatchQueue(queue);
    setBatchCompleted([]);

    for (const configId of queue) {
      try {
        const res = await apiRequest("POST", `/api/sync-configs/${configId}/run`);
        const data = await res.json();
        setTrackingRunId(data.runId);
        queryClient.invalidateQueries({ queryKey: ["/api/sync-runs"] });

        await new Promise<void>((resolve) => {
          const check = setInterval(async () => {
            const runsRes = await fetch("/api/sync-runs");
            const allRuns: SyncRun[] = await runsRes.json();
            const thisRun = allRuns.find(r => r.id === data.runId);
            if (thisRun && (thisRun.status === "success" || thisRun.status === "error" || thisRun.status === "partial")) {
              clearInterval(check);
              queryClient.invalidateQueries({ queryKey: ["/api/sync-runs"] });
              resolve();
            }
          }, 2000);
        });
      } catch (err: any) {
        toast({ title: t("syncDash.error"), description: err.message, variant: "destructive" });
      }
      setBatchCompleted(prev => [...prev, configId]);
    }

    setBatchRunning(false);
    setBatchQueue([]);
    setBatchCompleted([]);
    setSelectedConfigs(new Set());
    toast({ title: t("syncDash.batchComplete"), description: t("syncDash.batchCompleteDesc") });
    queryClient.invalidateQueries({ queryKey: ["/api/sync-runs"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sync-backups"] });
  };

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
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight" data-testid="text-sync-dashboard-title">
            {t("syncDash.title")}
          </h1>
          <p className="text-xs text-muted-foreground">{t("syncDash.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border">
            <Button
              variant={activeTab === "overview" ? "default" : "ghost"} size="sm"
              onClick={() => setActiveTab("overview")}
              data-testid="button-tab-overview"
              className="rounded-r-none"
            >
              <BarChart3 className="h-4 w-4 mr-1.5" />
              {t("syncDash.overview")}
            </Button>
            <Button
              variant={activeTab === "logs" ? "default" : "ghost"} size="sm"
              onClick={() => setActiveTab("logs")}
              data-testid="button-tab-logs"
              className="rounded-none border-x"
            >
              <FileText className="h-4 w-4 mr-1.5" />
              {t("syncDash.logs")}
            </Button>
            <Button
              variant={activeTab === "backups" ? "default" : "ghost"} size="sm"
              onClick={() => setActiveTab("backups")}
              data-testid="button-tab-backups"
              className="rounded-l-none"
            >
              <HardDrive className="h-4 w-4 mr-1.5" />
              {t("syncDash.backups")}
            </Button>
          </div>
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
                <p className="text-xl font-semibold" data-testid="text-today-syncs">{todayRuns.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs">{t("syncDash.totalRecords")}</span>
                </div>
                <p className="text-xl font-semibold" data-testid="text-total-records">{totalRecordsSynced.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Timer className="h-4 w-4" />
                  <span className="text-xs">{t("syncDash.avgTime")}</span>
                </div>
                <p className="text-xl font-semibold" data-testid="text-avg-time">{avgDuration > 0 ? formatDuration(avgDuration) : "—"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs">{t("syncDash.successRate")}</span>
                </div>
                <p className="text-xl font-semibold" data-testid="text-success-rate">{successRate}%</p>
              </CardContent>
            </Card>
          </div>

          {trackedRun && (
            <Card className={`border-foreground/20 ${trackedRun.status === "error" ? "border-destructive/40" : ""}`}>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  {trackedRun.status === "running" || trackedRun.status === "pending" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : trackedRun.status === "success" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-destructive" />
                  )}
                  {t("syncDash.liveProgress")}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="flex flex-col md:flex-row items-center gap-4">
                  <div className="relative">
                    <ProgressRing progress={trackedRun.progress || 0} isActive={trackedRun.status === "running" || trackedRun.status === "pending"} recordsTotal={trackedRun.recordsTotal || 0} speedPerSec={trackedRun.speedPerSec || 0} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-semibold">{trackedRun.progress || 0}%</span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-3 min-w-0">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground">{t("syncDash.config")}:</span>
                      <span className="font-medium">{configMap[trackedRun.syncConfigId]?.name || trackedRun.syncConfigId}</span>
                    </div>

                    {(trackedRun.details as any)?.phase && (
                      <PhaseIndicator phase={(trackedRun.details as any).phase} phaseHistory={(trackedRun.details as any)?.phaseHistory} t={t} />
                    )}

                    {(trackedRun.status === "running" || trackedRun.status === "pending") && (trackedRun.details as any)?.phase === "sync" && (
                      <>
                        <div className="flex items-center gap-3 text-xs">
                          {((trackedRun.details as any)?.totalCreated || 0) > 0 && (
                            <span className="text-green-600 dark:text-green-400 font-medium" data-testid="text-live-created">
                              +{(trackedRun.details as any).totalCreated} {t("syncDash.created")}
                            </span>
                          )}
                          {((trackedRun.details as any)?.totalUpdated || 0) > 0 && (
                            <span className="text-blue-600 dark:text-blue-400 font-medium" data-testid="text-live-updated">
                              ↻{(trackedRun.details as any).totalUpdated} {t("syncDash.updated")}
                            </span>
                          )}
                          {(trackedRun.recordsFailed || 0) > 0 && (
                            <span className="text-destructive font-medium" data-testid="text-live-failed">
                              ✗{trackedRun.recordsFailed} {t("syncDash.errors")}
                            </span>
                          )}
                        </div>
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
                      </>
                    )}

                    {(trackedRun.status !== "running" && trackedRun.status !== "pending") && (trackedRun.recordsFailed || 0) > 0 && (
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2 pt-3 px-4 flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-sm font-medium">{t("syncDash.quickSync")}</CardTitle>
                {configs.length > 0 && (
                  <div className="flex items-center gap-2">
                    {selectedConfigs.size > 0 && (
                      <span className="text-xs text-muted-foreground" data-testid="text-selected-count">
                        {t("syncDash.selected").replace("{count}", String(selectedConfigs.size))}
                      </span>
                    )}
                    <Button
                      size="sm"
                      onClick={runBatchSync}
                      disabled={selectedConfigs.size === 0 || anyRunning}
                      data-testid="button-run-selected"
                    >
                      {batchRunning ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {batchRunning
                        ? t("syncDash.batchRunning").replace("{done}", String(batchCompleted.length)).replace("{total}", String(batchQueue.length))
                        : t("syncDash.runSelected").replace("{count}", String(selectedConfigs.size))}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {configs.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">{t("syncDash.noConfigs")}</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 px-3 py-1.5">
                      <Checkbox
                        checked={configs.length > 0 && selectedConfigs.size === configs.length}
                        onCheckedChange={toggleAll}
                        data-testid="checkbox-select-all"
                      />
                      <span className="text-xs text-muted-foreground">{t("syncDash.selectAll")}</span>
                    </div>
                    {configs.map(config => {
                      const lastRun = runs.find(r => r.syncConfigId === config.id);
                      const isRunning = activeRuns.some(r => r.syncConfigId === config.id);
                      const isInBatch = batchQueue.includes(config.id);
                      const isBatchDone = batchCompleted.includes(config.id);
                      const schedule = config.schedule as any;
                      const isSelected = selectedConfigs.has(config.id);
                      return (
                        <div
                          key={config.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${isSelected ? "bg-muted/40 border-foreground/20" : ""}`}
                          data-testid={`card-config-${config.id}`}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleConfig(config.id)}
                            disabled={batchRunning}
                            data-testid={`checkbox-config-${config.id}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate">{config.name}</span>
                              {schedule?.backupBeforeSync !== false && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  <HardDrive className="h-3 w-3 mr-0.5" />
                                  {t("syncDash.backup")}
                                </Badge>
                              )}
                              {isInBatch && !isBatchDone && !isRunning && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  <Clock className="h-3 w-3 mr-0.5" />
                                  {t("syncDash.queued")}
                                </Badge>
                              )}
                              {isBatchDone && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-600 dark:text-green-400 border-green-500/30">
                                  <CheckCircle2 className="h-3 w-3 mr-0.5" />
                                  {t("syncDash.done")}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
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
                            disabled={isRunning || startSyncMutation.isPending || batchRunning}
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
                <CardHeader className="pb-1 pt-3 px-4">
                  <CardTitle className="text-sm font-medium">{t("syncDash.breakdown")}</CardTitle>
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
                        <span className="text-base font-semibold">{runs.length}</span>
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
                <CardHeader className="pb-1 pt-3 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{t("syncDash.last7days")}</CardTitle>
                    <div className="flex gap-0.5">
                      {[1, 3, 7, 14, 28].map(d => (
                        <button
                          key={d}
                          data-testid={`button-timeline-${d}d`}
                          onClick={() => setTimelineDays(d)}
                          className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${timelineDays === d ? "bg-foreground text-background font-medium" : "text-muted-foreground hover:bg-muted"}`}
                        >
                          {d}D
                        </button>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <TimelineChart runs={runs} dayCount={timelineDays} />
                </CardContent>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-medium">{t("syncDash.runHistory")}</CardTitle>
            </CardHeader>
            <CardContent>
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">{t("syncDash.noRuns")}</p>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {runs.slice(0, 20).map(run => {
                    const config = configMap[run.syncConfigId];
                    const duration = run.completedAt
                      ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
                      : Date.now() - new Date(run.startedAt).getTime();
                    const details = run.details as any;
                    const hasDetails = run.status !== "running" && run.status !== "pending";
                    const hasError = run.status === "error" && (run.errorMessage || details?.batchErrors?.length > 0);
                    const isExpanded = expandedRunId === run.id;
                    const showRecords = recordsViewRunId === run.id;
                    const created = details?.totalCreated || 0;
                    const updated = details?.totalUpdated || 0;
                    const failed = details?.totalFailed || (run.recordsFailed || 0);
                    const hasSyncedRecords = details?.syncedRecords?.length > 0;

                    const groupedErrors: { message: string; count: number }[] = [];
                    if (details?.batchErrors) {
                      const errMap: Record<string, number> = {};
                      for (const e of details.batchErrors) {
                        errMap[e.message] = (errMap[e.message] || 0) + 1;
                      }
                      for (const [message, count] of Object.entries(errMap)) {
                        groupedErrors.push({ message, count });
                      }
                      groupedErrors.sort((a, b) => b.count - a.count);
                    }

                    return (
                      <div key={run.id} className="rounded-lg border" data-testid={`row-run-${run.id}`}>
                        <div
                          className={`flex items-center justify-between p-3 text-sm ${hasDetails ? "cursor-pointer hover:bg-muted/50" : ""}`}
                          onClick={() => {
                            if (!hasDetails) return;
                            if (isExpanded) {
                              setExpandedRunId(null);
                              setRecordsViewRunId(null);
                            } else {
                              setExpandedRunId(run.id);
                            }
                          }}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <StatusBadge status={run.status} t={t} />
                            <span className="font-medium truncate">{config?.name || run.syncConfigId}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                            {(created > 0 || updated > 0 || failed > 0) ? (
                              <span className="flex items-center gap-1.5">
                                {created > 0 && <span className="text-green-600 dark:text-green-400">+{created} {t("syncDash.created")}</span>}
                                {updated > 0 && <span className="text-blue-600 dark:text-blue-400">↻{updated} {t("syncDash.updated")}</span>}
                                {failed > 0 && <span className="text-destructive">✗{failed} {t("syncDash.errors")}</span>}
                              </span>
                            ) : (
                              <span>{run.recordsProcessed || 0} / {run.recordsTotal || 0}</span>
                            )}
                            <span>{formatDuration(duration)}</span>
                            <span>{formatTimeAgo(run.startedAt)}</span>
                            {hasDetails && (
                              isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-3 pb-3 border-t space-y-2">
                            {(created > 0 || updated > 0 || failed > 0) && (
                              <div className="mt-2 flex items-center gap-3 text-xs">
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-green-500/10 text-green-700 dark:text-green-400">
                                  <CheckCircle2 className="h-3 w-3" />
                                  <span data-testid="text-created-count">{created} {t("syncDash.created")}</span>
                                </div>
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/10 text-blue-700 dark:text-blue-400">
                                  <RotateCcw className="h-3 w-3" />
                                  <span data-testid="text-updated-count">{updated} {t("syncDash.updated")}</span>
                                </div>
                                {failed > 0 && (
                                  <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-destructive/10 text-destructive">
                                    <XCircle className="h-3 w-3" />
                                    <span data-testid="text-failed-count">{failed} {t("syncDash.errors")}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {hasError && (
                              <div className="p-2.5 rounded bg-destructive/5 text-sm">
                                <p className="font-medium text-destructive text-xs mb-1">{t("syncDash.errorDetails")}:</p>
                                {run.errorMessage && (
                                  <p className="text-xs text-destructive/80 mb-2">{run.errorMessage}</p>
                                )}
                                {groupedErrors.length > 0 && (
                                  <div className="space-y-1">
                                    {groupedErrors.slice(0, 5).map((eg, i) => (
                                      <div key={i} className="text-[11px] text-muted-foreground flex justify-between gap-2">
                                        <span className="truncate">{eg.message}</span>
                                        <span className="text-destructive/60 flex-shrink-0">(×{eg.count})</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {hasSyncedRecords && (
                              <div>
                                <Button
                                  variant="outline" size="sm" className="text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRecordsViewRunId(showRecords ? null : run.id);
                                    setRecordsFilter("all");
                                    setRecordsPage(0);
                                  }}
                                  data-testid={`button-view-records-${run.id}`}
                                >
                                  <Database className="h-3 w-3 mr-1" />
                                  {t("syncDash.viewRecords")} ({details.syncedRecords.length})
                                </Button>

                                {showRecords && (
                                  <div className="mt-2 border rounded-lg overflow-hidden" data-testid="synced-records-table">
                                    <div className="flex items-center gap-1 p-2 bg-muted/30 border-b">
                                      {(["all", "created", "updated", "error"] as const).map(f => (
                                        <Button
                                          key={f}
                                          variant={recordsFilter === f ? "default" : "ghost"}
                                          size="sm" className="h-6 text-[11px] px-2"
                                          onClick={(e) => { e.stopPropagation(); setRecordsFilter(f); setRecordsPage(0); }}
                                          data-testid={`button-filter-${f}`}
                                        >
                                          {f === "all" ? t("syncDash.showAll")
                                            : f === "created" ? t("syncDash.showCreated")
                                            : f === "updated" ? t("syncDash.updated")
                                            : t("syncDash.showErrors")}
                                        </Button>
                                      ))}
                                    </div>
                                    {(() => {
                                      const filtered = (details.syncedRecords as any[]).filter(r =>
                                        recordsFilter === "all" ? true : r.status === recordsFilter
                                      );
                                      const pageSize = 20;
                                      const totalPages = Math.ceil(filtered.length / pageSize);
                                      const pageRecords = filtered.slice(recordsPage * pageSize, (recordsPage + 1) * pageSize);
                                      return (
                                        <>
                                          <table className="w-full text-xs">
                                            <thead>
                                              <tr className="border-b text-muted-foreground bg-muted/20">
                                                <th className="p-1.5 text-left w-12">{t("syncDash.recordIndex")}</th>
                                                <th className="p-1.5 text-left">{t("syncDash.pipedrive_id")}</th>
                                                <th className="p-1.5 text-left">{t("syncDash.recordStatus")}</th>
                                                <th className="p-1.5 text-left">Info</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {pageRecords.map((rec: any, i: number) => (
                                                <tr key={i} className="border-b last:border-0 hover:bg-muted/20" data-testid={`row-record-${rec.sourceIndex}`}>
                                                  <td className="p-1.5 text-muted-foreground">{rec.sourceIndex + 1}</td>
                                                  <td className="p-1.5">
                                                    {rec.pipedrive_id ? (
                                                      <a
                                                        href={`https://app.pipedrive.com`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-foreground hover:underline font-mono"
                                                        onClick={(e) => e.stopPropagation()}
                                                      >
                                                        {rec.pipedrive_id}
                                                      </a>
                                                    ) : (
                                                      <span className="text-muted-foreground">—</span>
                                                    )}
                                                  </td>
                                                  <td className="p-1.5">
                                                    <Badge
                                                      variant={rec.status === "created" ? "default" : rec.status === "updated" ? "secondary" : "destructive"}
                                                      className="text-[10px] px-1.5"
                                                    >
                                                      {rec.status === "created" ? t("syncDash.statusCreated")
                                                        : rec.status === "updated" ? t("syncDash.statusUpdated")
                                                        : t("syncDash.statusFailed")}
                                                    </Badge>
                                                  </td>
                                                  <td className="p-1.5 text-muted-foreground truncate max-w-[200px]">
                                                    {rec.errorMsg || ""}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                          {totalPages > 1 && (
                                            <div className="flex items-center justify-between p-2 border-t bg-muted/20">
                                              <span className="text-[11px] text-muted-foreground">
                                                {filtered.length} {t("syncDash.records")}
                                              </span>
                                              <div className="flex items-center gap-1">
                                                <Button
                                                  variant="ghost" size="sm" className="h-6 px-2 text-[11px]"
                                                  disabled={recordsPage === 0}
                                                  onClick={(e) => { e.stopPropagation(); setRecordsPage(p => p - 1); }}
                                                >
                                                  ←
                                                </Button>
                                                <span className="text-[11px] text-muted-foreground">
                                                  {recordsPage + 1} / {totalPages}
                                                </span>
                                                <Button
                                                  variant="ghost" size="sm" className="h-6 px-2 text-[11px]"
                                                  disabled={recordsPage >= totalPages - 1}
                                                  onClick={(e) => { e.stopPropagation(); setRecordsPage(p => p + 1); }}
                                                >
                                                  →
                                                </Button>
                                              </div>
                                            </div>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </div>
                                )}
                              </div>
                            )}
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
      ) : activeTab === "logs" ? (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t("syncLogs.filter")}</span>
            </div>
            <Select value={filterModule} onValueChange={setFilterModule}>
              <SelectTrigger className="w-48" data-testid="select-filter-module">
                <SelectValue placeholder={t("syncLogs.allModules")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("syncLogs.allModules")}</SelectItem>
                {modules.map((mod) => (
                  <SelectItem key={mod.id} value={mod.id}>
                    {mod.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40" data-testid="select-filter-status">
                <SelectValue placeholder={t("syncLogs.allStatuses")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("syncLogs.allStatuses")}</SelectItem>
                <SelectItem value="success">{t("syncLogs.success")}</SelectItem>
                <SelectItem value="error">{t("syncLogs.error")}</SelectItem>
                <SelectItem value="running">{t("syncLogs.running")}</SelectItem>
                <SelectItem value="pending">{t("syncLogs.pending")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              {filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ArrowLeftRight className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">{t("syncLogs.noLogs")}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {filterModule !== "all" || filterStatus !== "all"
                      ? t("syncLogs.adjustFilters")
                      : t("syncLogs.logsWillAppear")}
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center gap-4 px-5 py-3.5"
                      data-testid={`row-log-${log.id}`}
                    >
                      {log.status === "success" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                      ) : log.status === "error" ? (
                        <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                      ) : log.status === "running" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : log.status === "partial" ? (
                        <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      )}

                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">
                              {getModuleName(log.moduleId)}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {getModuleCode(log.moduleId)}
                            </Badge>
                            <div className="flex items-center gap-1 text-muted-foreground">
                              {log.direction === "import" ? (
                                <ArrowDownToLine className="h-3 w-3" />
                              ) : (
                                <ArrowUpFromLine className="h-3 w-3" />
                              )}
                              <span className="text-xs capitalize">{log.direction}</span>
                            </div>
                          </div>
                          {log.errorMessage && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1 line-clamp-1">
                              {log.errorMessage}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-sm tabular-nums">
                            {log.recordsProcessed?.toLocaleString()} {t("syncLogs.records")}
                          </p>
                          {(log.recordsFailed ?? 0) > 0 && (
                            <p className="text-xs text-red-600 dark:text-red-400">
                              {log.recordsFailed} {t("syncLogs.failed")}
                            </p>
                          )}
                        </div>
                        <Badge
                          variant={
                            log.status === "success" ? "default" :
                            log.status === "error" ? "destructive" :
                            log.status === "running" ? "outline" :
                            "secondary"
                          }
                          className="capitalize"
                          data-testid={`badge-log-status-${log.id}`}
                        >
                          {log.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground w-24 text-right">
                          {log.startedAt
                            ? formatDistanceToNow(new Date(log.startedAt), { addSuffix: true })
                            : "\u2014"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                onClick={handleConfigExport}
                data-testid="button-export-config"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                {t("syncDash.exportConfig")}
              </Button>
              <label>
                <Button
                  variant="outline" size="sm" asChild
                  data-testid="button-import-config"
                >
                  <span>
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {t("syncDash.importConfig")}
                  </span>
                </Button>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleConfigImport(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Cloud className="h-4 w-4" />
                  {t("syncDash.configDriveBackup")}
                </CardTitle>
                <Button
                  variant="default" size="sm"
                  onClick={() => configToDriveMutation.mutate()}
                  disabled={configToDriveMutation.isPending}
                  data-testid="button-config-to-drive"
                >
                  {configToDriveMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Cloud className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {configToDriveMutation.isPending ? t("syncDash.backupRunning") : t("syncDash.backupConfigToDrive")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t("syncDash.configDriveBackupDesc")}</p>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground mb-3 flex items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5" />
                <span>SEDAJ Cloud: SyncHub_Backups / Config /</span>
              </div>
              {isLoadingConfigDrive ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : configDriveBackups.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">{t("syncDash.noConfigBackups")}</p>
              ) : (
                <div className="space-y-2">
                  {configDriveBackups.map((file: any) => (
                    <div key={file.id} className="flex items-center justify-between p-3 rounded-lg border" data-testid={`row-config-drive-backup-${file.id}`}>
                      <div className="flex items-center gap-3">
                        <Settings className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {file.createdTime ? formatDistanceToNow(new Date(file.createdTime), { addSuffix: true }) : "—"}
                            {file.size ? ` · ${formatBytes(parseInt(file.size))}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline" size="sm"
                          onClick={() => setConfirmDialog({ type: "restoreConfigDrive", id: file.id, name: file.name })}
                          disabled={restoreConfigDriveMutation.isPending}
                          data-testid={`button-restore-config-drive-${file.id}`}
                        >
                          {restoreConfigDriveMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          {t("syncDash.restore")}
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          onClick={async () => {
                            try {
                              const res = await apiRequest("GET", `/api/backups/config-drive-download/${file.id}`);
                              const data = await res.json();
                              const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = file.name;
                              a.click();
                              URL.revokeObjectURL(url);
                            } catch (err: any) {
                              toast({ title: t("syncDash.error"), description: err.message, variant: "destructive" });
                            }
                          }}
                          data-testid={`button-download-config-drive-${file.id}`}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => setConfirmDialog({ type: "deleteConfigDrive", id: file.id, name: file.name })}
                          data-testid={`button-delete-config-drive-${file.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Separator />

          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Database className="h-4 w-4" />
            {t("syncDash.dataBackupsTitle")}
          </h3>

          <div className="text-xs text-muted-foreground flex items-center gap-2 -mt-2">
            <FolderOpen className="h-3.5 w-3.5" />
            <span>SEDAJ Cloud: SyncHub_Backups / Data / {new Date().toISOString().slice(0, 10)} / [Modul] /</span>
          </div>

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
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline" size="sm"
                          onClick={() => manualBackupMutation.mutate(configId)}
                          disabled={manualBackupMutation.isPending}
                          data-testid={`button-manual-backup-${configId}`}
                        >
                          {manualBackupMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <HardDrive className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          {manualBackupMutation.isPending ? t("syncDash.backupRunning") : t("syncDash.manualBackup")}
                        </Button>
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
                                    SEDAJ Cloud
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

      <AlertDialog open={!!confirmDialog} onOpenChange={(open) => { if (!open) setConfirmDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog?.type === "restore" ? t("syncDash.confirmRestore") :
               confirmDialog?.type === "restoreConfigDrive" ? t("syncDash.confirmRestoreConfig") :
               confirmDialog?.type === "delete" || confirmDialog?.type === "deleteConfigDrive" ? t("syncDash.confirmDelete") :
               t("syncDash.confirmDeleteAll")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog?.type === "restore"
                ? t("syncDash.confirmRestoreDesc").replace("{name}", confirmDialog?.name || "")
                : confirmDialog?.type === "restoreConfigDrive"
                ? t("syncDash.confirmRestoreConfigDesc").replace("{name}", confirmDialog?.name || "")
                : confirmDialog?.type === "deleteAll"
                ? t("syncDash.confirmDeleteAllDesc").replace("{name}", confirmDialog?.name || "")
                : t("syncDash.confirmDeleteDesc").replace("{name}", confirmDialog?.name || "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-confirm-cancel">{t("syncDash.cancelAction")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-action"
              onClick={(e) => {
                e.preventDefault();
                if (!confirmDialog) return;
                const dialog = confirmDialog;
                setConfirmDialog(null);
                if (dialog.type === "restore") restoreBackupMutation.mutate(dialog.id);
                else if (dialog.type === "delete") deleteBackupMutation.mutate(dialog.id);
                else if (dialog.type === "deleteAll") deleteAllBackupsMutation.mutate(dialog.id);
                else if (dialog.type === "deleteConfigDrive") deleteConfigDriveBackupMutation.mutate(dialog.id);
                else if (dialog.type === "restoreConfigDrive") restoreConfigDriveMutation.mutate(dialog.id);
              }}
            >
              {(confirmDialog?.type === "restore" || confirmDialog?.type === "restoreConfigDrive") ? t("syncDash.restore") : t("syncDash.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
