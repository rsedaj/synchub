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
  Gauge,
  Percent,
} from "lucide-react";
import type { ApiModule, SyncConfig, SyncLog, SyncRun } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import SyncAnalyticsTab from "./sync-analytics";
import OnixBackupSection from "./onix-backup-section";

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
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
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

type BackupOp = "manual" | "configToDrive" | "restore" | "restoreConfig";

const BACKUP_PHASES: Record<BackupOp, { key: string; atMs: number }[]> = {
  manual: [
    { key: "syncDash.progressPreparing", atMs: 0 },
    { key: "syncDash.progressFetchingData", atMs: 2000 },
    { key: "syncDash.progressUploadingCloud", atMs: 8000 },
    { key: "syncDash.progressRotating", atMs: 20000 },
    { key: "syncDash.progressFinishing", atMs: 25000 },
  ],
  configToDrive: [
    { key: "syncDash.progressPreparing", atMs: 0 },
    { key: "syncDash.progressUploadingCloud", atMs: 3000 },
    { key: "syncDash.progressFinishing", atMs: 15000 },
  ],
  restore: [
    { key: "syncDash.progressPreparing", atMs: 0 },
    { key: "syncDash.progressRestoringData", atMs: 2000 },
    { key: "syncDash.progressFinishing", atMs: 15000 },
  ],
  restoreConfig: [
    { key: "syncDash.progressPreparing", atMs: 0 },
    { key: "syncDash.progressRestoring", atMs: 2000 },
    { key: "syncDash.progressFinishing", atMs: 10000 },
  ],
};

function BackupProgressPanel({ isActive, error, opType, t }: { isActive: boolean; error: string | null; opType: BackupOp; t: (key: string) => string }) {
  const [elapsed, setElapsed] = useState(0);
  const [showError, setShowError] = useState(false);
  const startRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isActive) {
      startRef.current = Date.now();
      setElapsed(0);
      setShowError(false);
      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - startRef.current);
      }, 200);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isActive]);

  if (!isActive && !error) return null;

  const phases = BACKUP_PHASES[opType];
  let currentPhaseIdx = 0;
  for (let i = phases.length - 1; i >= 0; i--) {
    if (elapsed >= phases[i].atMs) { currentPhaseIdx = i; break; }
  }

  const fmtElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return `${m}:${rs.toString().padStart(2, "0")}`;
  };

  if (error) {
    return (
      <div className="mt-3 border border-destructive/30 rounded-lg p-3 bg-destructive/5" data-testid="backup-progress-error">
        <div className="flex items-center gap-2 text-destructive">
          <XCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-medium">{t("syncDash.progressFailed")}</span>
          <span className="text-xs text-muted-foreground ml-auto">{fmtElapsed(elapsed)}</span>
        </div>
        <button
          onClick={() => setShowError(!showError)}
          className="text-xs text-muted-foreground hover:text-foreground mt-1.5 underline cursor-pointer"
          data-testid="button-toggle-error-detail"
        >
          {showError ? t("syncDash.hideErrorDetail") : t("syncDash.showErrorDetail")}
        </button>
        {showError && (
          <pre className="mt-2 text-xs bg-destructive/10 rounded p-2 whitespace-pre-wrap break-all max-h-40 overflow-auto font-mono" data-testid="text-error-detail">
            {error}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 border rounded-lg p-3 bg-muted/30" data-testid="backup-progress-panel">
      <div className="flex items-center gap-2 mb-2">
        <Loader2 className="h-4 w-4 animate-spin text-foreground" />
        <span className="text-sm font-medium">{t(phases[currentPhaseIdx].key)}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {t("syncDash.progressElapsed")}: {fmtElapsed(elapsed)}
        </span>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
        <div className="h-full bg-foreground rounded-full animate-pulse" style={{ width: `${Math.min(5 + (currentPhaseIdx / phases.length) * 90, 95)}%`, transition: "width 1s ease" }} />
      </div>
      <div className="flex gap-1 mt-2">
        {phases.map((p, i) => (
          <div key={i} className={`text-[10px] flex items-center gap-0.5 ${i <= currentPhaseIdx ? "text-foreground" : "text-muted-foreground/40"}`}>
            {i < currentPhaseIdx ? <CheckCircle2 className="h-3 w-3" /> : i === currentPhaseIdx ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />}
            <span className="hidden sm:inline">{t(p.key).replace("...", "")}</span>
          </div>
        ))}
      </div>
    </div>
  );
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
    partial: { labelKey: "syncDash.statusPartial", variant: "secondary" },
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

function SpeedGauge({ avgLatencyMs, t }: { avgLatencyMs: number; t: (key: string) => string }) {
  const rating = avgLatencyMs === 0 ? "unknown" : avgLatencyMs < 200 ? "fast" : avgLatencyMs < 1000 ? "normal" : avgLatencyMs < 3000 ? "slow" : "very_slow";
  const ratingConfig: Record<string, { color: string; bg: string; border: string; label: string; width: string }> = {
    fast: { color: "text-green-600 dark:text-green-400", bg: "bg-green-500", border: "border-green-500/30", label: t("syncDash.speedFast"), width: "20%" },
    normal: { color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500", border: "border-blue-500/30", label: t("syncDash.speedNormal"), width: "45%" },
    slow: { color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-500", border: "border-yellow-500/30", label: t("syncDash.speedSlow"), width: "70%" },
    very_slow: { color: "text-red-600 dark:text-red-400", bg: "bg-red-500", border: "border-red-500/30", label: t("syncDash.speedVerySlow"), width: "95%" },
    unknown: { color: "text-muted-foreground", bg: "bg-muted", border: "border-muted", label: "—", width: "0%" },
  };
  const cfg = ratingConfig[rating];

  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border ${cfg.border} bg-background`} data-testid="speed-gauge">
      <Gauge className={`h-3.5 w-3.5 flex-shrink-0 ${cfg.color}`} />
      <div className="flex-1 min-w-0">
        <div className="w-full bg-muted/40 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${cfg.bg}`}
            style={{ width: cfg.width }}
          />
        </div>
      </div>
      <span className={`text-[11px] font-semibold whitespace-nowrap ${cfg.color}`}>
        {avgLatencyMs > 0 ? `${avgLatencyMs}ms` : "—"}
      </span>
      <Badge variant="outline" className={`text-[9px] h-4 px-1 ${cfg.color}`} data-testid="badge-speed-rating">
        {cfg.label}
      </Badge>
    </div>
  );
}

function SpeedRatingBadge({ rating, t }: { rating: string; t: (key: string) => string }) {
  const cfg: Record<string, { color: string; label: string }> = {
    fast: { color: "text-green-600 dark:text-green-400 border-green-500/30", label: t("syncDash.speedFast") },
    normal: { color: "text-blue-600 dark:text-blue-400 border-blue-500/30", label: t("syncDash.speedNormal") },
    slow: { color: "text-yellow-600 dark:text-yellow-400 border-yellow-500/30", label: t("syncDash.speedSlow") },
    very_slow: { color: "text-red-600 dark:text-red-400 border-red-500/30", label: t("syncDash.speedVerySlow") },
    unknown: { color: "text-muted-foreground", label: "—" },
  };
  const c = cfg[rating] || cfg.unknown;
  return <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${c.color}`} data-testid="badge-speed-rating-summary">{c.label}</Badge>;
}

function SparklineChart({ data, label }: { data: Array<{b: number; s: number}>; label?: string }) {
  if (!data || data.length < 2) return null;
  const maxS = Math.max(...data.map(d => d.s), 1);
  const W = 120, H = 28, barW = Math.max(2, Math.floor((W - data.length) / data.length));
  const gap = 1;
  const totalWidth = (barW + gap) * data.length - gap;
  const offsetX = (W - totalWidth) / 2;
  return (
    <div className="flex items-center gap-2" data-testid="sparkline-chart">
      <svg width={W} height={H} className="flex-shrink-0">
        {data.map((d, i) => {
          const h = Math.max(2, Math.round((d.s / maxS) * (H - 2)));
          const x = offsetX + i * (barW + gap);
          const y = H - h;
          const isLast = i === data.length - 1;
          return (
            <rect key={i} x={x} y={y} width={barW} height={h}
              className={isLast ? "fill-foreground" : "fill-foreground/30"}
              rx="0.5"
            />
          );
        })}
      </svg>
      {label && <span className="text-[10px] text-muted-foreground">{label}</span>}
    </div>
  );
}

function HkodPanel({ runId, t }: { runId: string; t: (key: string) => string }) {
  const [show, setShow] = useState(false);
  const [filter, setFilter] = useState<'all' | 'assigned' | 'preserved' | 'skipped'>('all');
  const { data, isLoading } = useQuery<Array<{
    id: string; recordKey: string; onixId: number | null; onixNsNumber: string | null;
    decision: string; hCodeValue: string | null; reason: string | null; createdAt: string;
  }>>({
    queryKey: ['/api/hkod-decisions', runId],
    queryFn: async () => {
      const resp = await fetch(`/api/hkod-decisions?runId=${runId}`, { credentials: 'include' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    },
    enabled: show,
    staleTime: 5 * 60 * 1000,
  });

  if (!show) {
    return (
      <button onClick={() => setShow(true)} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2" data-testid={`button-hkod-load-${runId}`}>
        {t('syncDash.hkodLoad')}
      </button>
    );
  }

  if (isLoading) {
    return <span className="text-xs text-muted-foreground animate-pulse">{t('syncDash.hkodLoading')}</span>;
  }

  const all = data ?? [];
  const assigned = all.filter(d => d.decision === 'assigned').length;
  const preserved = all.filter(d => d.decision === 'preserved').length;
  const skipped = all.filter(d => d.decision === 'skipped').length;
  const decisions = filter === 'all' ? all : all.filter(d => d.decision === filter);

  const decisionLabel = (dec: string) => {
    if (dec === 'assigned') return t('syncDash.hkodAssigned');
    if (dec === 'preserved') return t('syncDash.hkodPreserved');
    return t('syncDash.hkodSkipped');
  };
  const decisionClass = (dec: string) =>
    dec === 'assigned' ? 'text-green-500 dark:text-green-400'
    : dec === 'preserved' ? 'text-blue-500 dark:text-blue-400'
    : 'text-muted-foreground';

  const filterBtn = (val: typeof filter, label: string) => (
    <button
      onClick={() => setFilter(val)}
      data-testid={`button-hkod-filter-${val}-${runId}`}
      className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${filter === val ? 'border-foreground/40 bg-muted text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
    >{label}</button>
  );

  return (
    <div data-testid={`hkod-panel-${runId}`}>
      {/* Summary counts + filter */}
      <div className="mb-1.5 flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-muted-foreground font-medium">{t('syncDash.hkodDecisions')}:</span>
        <span className="text-[11px] text-muted-foreground">{t('syncDash.hkodTotal')} {all.length}</span>
        {assigned > 0 && <span className="text-[11px] text-green-500">+{assigned} {t('syncDash.hkodAssignedCount')}</span>}
        {preserved > 0 && <span className="text-[11px] text-blue-500">={preserved} {t('syncDash.hkodPreservedCount')}</span>}
        {skipped > 0 && <span className="text-[11px] text-muted-foreground">~{skipped} {t('syncDash.hkodSkippedCount')}</span>}
        <div className="ml-auto flex items-center gap-1">
          {filterBtn('all', t('syncDash.hkodFilterAll'))}
          {assigned > 0 && filterBtn('assigned', t('syncDash.hkodAssigned'))}
          {preserved > 0 && filterBtn('preserved', t('syncDash.hkodPreserved'))}
          {skipped > 0 && filterBtn('skipped', t('syncDash.hkodSkipped'))}
          <button onClick={() => setShow(false)} className="text-muted-foreground/60 hover:text-muted-foreground text-[10px] ml-1">▲</button>
        </div>
      </div>
      {decisions.length === 0 ? (
        <p className="text-muted-foreground text-[10px]">{t('syncDash.hkodNone')}</p>
      ) : (
        <div className="overflow-auto max-h-52 border border-muted/30 rounded">
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-muted/50">
              <tr className="text-muted-foreground">
                <th className="text-left px-2 py-1 font-medium">{t('syncDash.hkodColKey')}</th>
                <th className="text-left px-2 py-1 font-medium">{t('syncDash.hkodColOnixId')}</th>
                <th className="text-left px-2 py-1 font-medium">{t('syncDash.hkodColNsNum')}</th>
                <th className="text-left px-2 py-1 font-medium">{t('syncDash.hkodColDecision')}</th>
                <th className="text-left px-2 py-1 font-medium">{t('syncDash.hkodColCode')}</th>
                <th className="text-left px-2 py-1 font-medium">{t('syncDash.hkodColReason')}</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map((d) => (
                <tr key={d.id} className="border-t border-muted/20 hover:bg-muted/20" data-testid={`hkod-row-${d.id}`}>
                  <td className="px-2 py-0.5 font-mono max-w-[140px] truncate" title={d.recordKey}>{d.recordKey}</td>
                  <td className="px-2 py-0.5 text-muted-foreground">{d.onixId ?? '—'}</td>
                  <td className="px-2 py-0.5 text-muted-foreground font-mono">{d.onixNsNumber ?? '—'}</td>
                  <td className={`px-2 py-0.5 font-semibold ${decisionClass(d.decision)}`}>
                    {decisionLabel(d.decision)}
                  </td>
                  <td className="px-2 py-0.5 text-foreground font-mono">{d.hCodeValue ?? '—'}</td>
                  <td className="px-2 py-0.5 text-muted-foreground">{d.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ResultBreakdownBar({ created, updated, skipped, failed }: { created: number; updated: number; skipped: number; failed: number }) {
  const total = created + updated + skipped + failed;
  if (total === 0) return null;
  const pct = (n: number) => Math.max(n > 0 ? 2 : 0, Math.round((n / total) * 100));
  const segments = [
    { val: created, pct: pct(created), cls: "bg-green-500", label: "Vytvorené" },
    { val: updated, pct: pct(updated), cls: "bg-blue-500", label: "Aktualizované" },
    { val: skipped, pct: pct(skipped), cls: "bg-amber-400", label: "Preskočené" },
    { val: failed, pct: pct(failed), cls: "bg-red-500", label: "Chyby" },
  ].filter(s => s.val > 0);
  return (
    <div className="space-y-1" data-testid="result-breakdown-bar">
      <div className="flex w-full h-2 rounded-full overflow-hidden gap-px">
        {segments.map((s, i) => (
          <div key={i} className={`${s.cls} transition-all duration-500`} style={{ width: `${s.pct}%` }} title={`${s.label}: ${s.val.toLocaleString()}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {segments.map((s, i) => (
          <span key={i} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.cls}`} />
            {s.label}: <span className="font-medium text-foreground">{s.val.toLocaleString()}</span>
            <span className="text-[9px]">({s.pct}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function TopErrorsPanel({ errors, language }: { errors: Array<{message: string; count: number}>; language: string }) {
  const [open, setOpen] = useState(false);
  if (!errors || errors.length === 0) return null;
  const totalErrors = errors.reduce((s, e) => s + e.count, 0);
  return (
    <div className="border border-destructive/20 rounded-lg overflow-hidden" data-testid="top-errors-panel">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs bg-destructive/5 hover:bg-destructive/10 transition-colors"
        data-testid="button-toggle-top-errors"
      >
        <span className="flex items-center gap-1.5 font-medium text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          {language === "sk" ? "Analýza chýb" : "Error analysis"}
          <Badge variant="destructive" className="h-4 px-1.5 text-[9px]">{totalErrors}</Badge>
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="divide-y divide-border">
          {errors.map((e, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-1.5 text-xs">
              <span className="font-semibold text-destructive w-8 flex-shrink-0 text-right">{e.count}×</span>
              <span className="font-mono text-[11px] text-foreground/80 break-all leading-tight">{e.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HKodRangeDisplay({ range, language }: { range: {prefix: string; padding: number; first: number; last: number; count: number} | undefined; language: string }) {
  if (!range) return null;
  const fmt = (n: number) => `${range.prefix}${String(n).padStart(range.padding, "0")}`;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-muted/20 text-xs" data-testid="hkod-range-display">
      <Database className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <span className="text-muted-foreground">{language === "sk" ? "H-kódy pridelené:" : "H-codes assigned:"}</span>
      <span className="font-mono font-semibold">{fmt(range.first)}</span>
      <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
      <span className="font-mono font-semibold">{fmt(range.last)}</span>
      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-1">{range.count.toLocaleString()}×</Badge>
    </div>
  );
}

function VatSamplesPanel({ samples, vatRate, language }: { samples: Array<{field: string; original: number; converted: number; rate: string}>; vatRate: string | null; language: string }) {
  if (!samples || samples.length === 0) return null;
  return (
    <div className="px-3 py-2 rounded-lg border bg-muted/20 text-xs space-y-1.5" data-testid="vat-samples-panel">
      <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
        <Percent className="h-3.5 w-3.5" />
        <span>{language === "sk" ? "Ukážka DPH konverzie" : "VAT conversion preview"}</span>
        {vatRate && <Badge variant="outline" className="text-[10px] h-4 px-1.5">÷{parseFloat(vatRate) > 1 ? `${vatRate}%` : `1.${vatRate}`}</Badge>}
      </div>
      <div className="space-y-0.5">
        {samples.map((s, i) => (
          <div key={i} className="flex items-center gap-2 font-mono text-[11px]">
            <span className="text-muted-foreground w-24 truncate" title={s.field}>{s.field}:</span>
            <span className="text-foreground/70">{typeof s.original === "number" ? s.original.toFixed(4) : s.original}</span>
            <span className="text-muted-foreground">→</span>
            <span className="font-semibold text-foreground">{typeof s.converted === "number" ? s.converted.toFixed(2) : s.converted}</span>
            <span className="text-[10px] text-muted-foreground ml-auto">VAT {s.rate}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveElapsedTimer({ startedAt, isRunning }: { startedAt: string | Date; isRunning: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isRunning) {
      setElapsed(Date.now() - new Date(startedAt).getTime());
      return;
    }
    const interval = setInterval(() => {
      setElapsed(Date.now() - new Date(startedAt).getTime());
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, startedAt]);
  const secs = Math.floor(elapsed / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  const display = hrs > 0
    ? `${hrs}:${String(mins % 60).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`
    : `${String(mins).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <span className="font-mono text-sm font-semibold tabular-nums" data-testid="live-elapsed-timer">{display}</span>
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
      if (run.status === "success" || run.status === "partial") days[key].success++;
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

export default function SyncDashboardPage({ initialTab }: { initialTab?: "overview" | "backups" | "logs" | "analytics" }) {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"overview" | "backups" | "logs" | "analytics">(initialTab || "overview");
  const [timelineDays, setTimelineDays] = useState(7);
  const [trackingRunId, setTrackingRunId] = useState<string | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ type: string; id: string; name?: string } | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [expandedLogRunId, setExpandedLogRunId] = useState<string | null>(null);
  const [expandedBackupId, setExpandedBackupId] = useState<number | null>(null);
  const [recordsViewRunId, setRecordsViewRunId] = useState<string | null>(null);
  const [recordsFilter, setRecordsFilter] = useState<"all" | "created" | "updated" | "skipped" | "error">("all");
  const [recordsPage, setRecordsPage] = useState(0);
  const [filterModule, setFilterModule] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedConfigs, setSelectedConfigs] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [backupError, setBackupError] = useState<{ type: BackupOp; message: string; targetId?: string } | null>(null);
  const [activeBackupTarget, setActiveBackupTarget] = useState<{ type: BackupOp; targetId: string } | null>(null);
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

  const { data: retryScheduleData = [] } = useQuery<Array<{ configId: string; fireAt: string; failedRunId: string; remainingMs: number }>>({
    queryKey: ["/api/retry-schedule"],
    refetchInterval: 5000,
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

  const prevTrackedStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (trackedRun && (trackedRun.status === "success" || trackedRun.status === "error" || trackedRun.status === "partial")) {
      const prevStatus = prevTrackedStatusRef.current;
      if (prevStatus === "running" || prevStatus === "pending") {
        const details = trackedRun.details as any;
        const summary = details?.completionSummary;
        const configName = configMap[trackedRun.syncConfigId]?.name || "";

        let notifTitle = "";
        let notifBody = "";
        if (trackedRun.status === "success") {
          notifTitle = t("syncDash.syncCompleted");
          notifBody = t("syncDash.syncCompletedDesc")
            .replace("{created}", String(summary?.totalCreated || 0))
            .replace("{updated}", String(summary?.totalUpdated || 0))
            .replace("{failed}", String(summary?.totalFailed || 0));
        } else if (trackedRun.status === "partial") {
          notifTitle = t("syncDash.syncPartial");
          notifBody = t("syncDash.syncPartialDesc")
            .replace("{created}", String(summary?.totalCreated || 0))
            .replace("{failed}", String(summary?.totalFailed || 0));
        } else {
          notifTitle = t("syncDash.syncFailed");
          notifBody = t("syncDash.syncFailedDesc")
            .replace("{failed}", String(trackedRun.recordsFailed || 0));
        }

        toast({
          title: `${notifTitle} — ${configName}`,
          description: notifBody,
          duration: 30000,
          variant: trackedRun.status === "error" ? "destructive" : undefined,
        });

        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            new Notification(`SyncHub: ${notifTitle}`, { body: `${configName}\n${notifBody}`, icon: "/favicon.ico" });
          } catch {}
        }
      }

      setTimeout(() => {
        setTrackingRunId(null);
        queryClient.invalidateQueries({ queryKey: ["/api/sync-backups"] });
      }, 30000);
    }
    prevTrackedStatusRef.current = trackedRun?.status || null;
  }, [trackedRun?.status]);

  useEffect(() => {
    if (activeRuns.length > 0 && !trackingRunId) {
      setTrackingRunId(activeRuns[0].id);
    }
  }, [activeRuns.length]);

  const [fullSyncMode, setFullSyncMode] = useState(false);

  const startSyncMutation = useMutation({
    mutationFn: async ({ configId, fullSync }: { configId: string; fullSync: boolean }) => {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        try { await Notification.requestPermission(); } catch {}
      }
      const res = await apiRequest("POST", `/api/sync-configs/${configId}/run`, { fullSync });
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

  const resumeSyncMutation = useMutation({
    mutationFn: async (runId: string) => {
      const res = await apiRequest("POST", `/api/sync-runs/${runId}/resume`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Sync sa obnovuje", description: `Pokračuje od záznamu ${data.resumeOffset}` });
      queryClient.invalidateQueries({ queryKey: ["/api/sync-runs"] });
      setTrackingRunId(resumeSyncMutation.variables as string);
    },
    onError: () => {
      toast({ title: "Chyba", description: "Nepodarilo sa obnoviť sync", variant: "destructive" });
    },
  });

  const restoreBackupMutation = useMutation({
    mutationFn: async (backupId: string) => {
      setBackupError(null);
      setActiveBackupTarget({ type: "restore", targetId: backupId });
      const res = await apiRequest("POST", `/api/sync-backups/${backupId}/restore`);
      return res.json();
    },
    onSuccess: (data, backupId: string) => {
      setActiveBackupTarget(null);
      if (!data.success) {
        setBackupError({ type: "restore", message: data.message || "Restore failed", targetId: backupId });
      }
      toast({
        title: data.success ? t("syncDash.restored") : t("syncDash.error"),
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (err: any, backupId: string) => {
      setActiveBackupTarget(null);
      setBackupError({ type: "restore", message: err.message || "Restore failed", targetId: backupId });
      toast({ title: t("syncDash.error"), description: err.message, variant: "destructive" });
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
      setBackupError(null);
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
      let displayMessage = err.message || "Config backup failed";
      try {
        const jsonStart = displayMessage.indexOf("{");
        if (jsonStart !== -1) {
          const parsed = JSON.parse(displayMessage.slice(jsonStart));
          if (parsed.missingEnv === "GOOGLE_SERVICE_ACCOUNT_JSON") {
            displayMessage = parsed.detail || parsed.message;
          } else if (parsed.message) {
            displayMessage = parsed.message;
          }
        }
      } catch {}
      setBackupError({ type: "configToDrive", message: displayMessage });
      toast({ title: t("syncDash.configBackupFailed"), description: displayMessage, variant: "destructive" });
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
      setBackupError(null);
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
      setBackupError({ type: "restoreConfig", message: err.message || "Config restore failed" });
      toast({ title: t("syncDash.configRestoreFailed"), description: err.message, variant: "destructive" });
    },
  });

  const manualBackupMutation = useMutation({
    mutationFn: async (configId: string) => {
      setBackupError(null);
      setActiveBackupTarget({ type: "manual", targetId: configId });
      await apiRequest("POST", `/api/backups/manual/${configId}`);
    },
    onSuccess: () => {
      setActiveBackupTarget(null);
      toast({ title: t("syncDash.manualBackupSuccess") });
      queryClient.invalidateQueries({ queryKey: ["/api/sync-backups"] });
    },
    onError: (err: any, configId: string) => {
      setActiveBackupTarget(null);
      setBackupError({ type: "manual", message: err.message || "Backup failed", targetId: configId });
      toast({ title: err.message || "Backup failed", variant: "destructive" });
    },
  });

  const resetHistoryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sync-runs/reset-history");
      return res.json();
    },
    onSuccess: (data: any) => {
      setShowResetDialog(false);
      toast({
        title: language === "sk" ? "História vymazaná" : "History cleared",
        description: language === "sk"
          ? `Zmazaných ${data.deletedRuns} behov, ${data.deletedLogs} logov, ${data.deletedBaselines} bázových línií.`
          : `Deleted ${data.deletedRuns} runs, ${data.deletedLogs} logs, ${data.deletedBaselines} baselines.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/sync-runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sync-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (err: any) => {
      toast({ title: err.message || (language === "sk" ? "Reset zlyhal" : "Reset failed"), variant: "destructive" });
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
        const res = await apiRequest("POST", `/api/sync-configs/${configId}/run`, { fullSync: fullSyncMode });
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
  const successRuns = runs.filter(r => r.status === "success" || r.status === "partial");
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
              variant={activeTab === "analytics" ? "default" : "ghost"} size="sm"
              onClick={() => setActiveTab("analytics")}
              data-testid="button-tab-analytics"
              className="rounded-none border-x"
            >
              <TrendingUp className="h-4 w-4 mr-1.5" />
              {t("syncDash.analytics")}
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
            onClick={() => setShowResetDialog(true)}
            data-testid="button-reset-history"
            className="text-destructive border-destructive/40 hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            {language === "sk" ? "Reset histórie" : "Reset history"}
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
                <p className="text-[10px] text-muted-foreground mt-0.5">{t("syncDash.totalRecordsNote")}</p>
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
            <Card className={`border-foreground/20 ${trackedRun.status === "error" ? "border-destructive/40" : trackedRun.status === "partial" ? "border-yellow-500/40" : trackedRun.status === "success" ? "border-green-500/40" : ""}`}>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  {trackedRun.status === "running" || trackedRun.status === "pending" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : trackedRun.status === "success" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  ) : trackedRun.status === "partial" ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-destructive" />
                  )}
                  {(trackedRun.status === "success" || trackedRun.status === "partial" || trackedRun.status === "error")
                    ? t("syncDash.completionSummary")
                    : t("syncDash.liveProgress")}
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

                    {(trackedRun.details as any)?.resuming && (
                      <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300" data-testid="badge-resuming">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span className="font-medium">Obnovuje sa...</span>
                        {(trackedRun.details as any)?.resumeOffset > 0 && (
                          <span className="text-blue-500">pokračuje od záznamu {((trackedRun.details as any).resumeOffset).toLocaleString()}</span>
                        )}
                      </div>
                    )}

                    {(trackedRun.details as any)?.deltaMode !== undefined && (
                      <div className="flex items-center gap-2 text-xs" data-testid="delta-info">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${(trackedRun.details as any).deltaMode ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"}`}>
                          {(trackedRun.details as any).deltaMode ? "DELTA" : "FULL"}
                        </span>
                        {(trackedRun.details as any).totalFetched > 0 && (
                          <span className="text-muted-foreground">
                            {((trackedRun.details as any).totalFetched).toLocaleString()} zo zdroja →{" "}
                            <span className="text-foreground font-medium">
                              {((trackedRun.details as any).totalChanged ?? trackedRun.recordsTotal ?? 0).toLocaleString()} na ONIX
                            </span>
                            {((trackedRun.details as any).totalSkipped || 0) > 0 && (
                              <span className="text-green-600 dark:text-green-400"> · {((trackedRun.details as any).totalSkipped).toLocaleString()} bez zmeny</span>
                            )}
                          </span>
                        )}
                      </div>
                    )}

                    {(trackedRun.status === "running" || trackedRun.status === "pending") && (trackedRun.details as any)?.phase === "fetch" && (
                      <div className="space-y-2" data-testid="panel-fetch-progress">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>{language === "sk" ? "Načítavanie dát zo zdroja..." : "Fetching data from source..."}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-foreground/60 rounded-full animate-[indeterminate_1.5s_ease-in-out_infinite]" style={{ width: "40%", animation: "indeterminate 1.5s ease-in-out infinite" }} />
                        </div>
                      </div>
                    )}

                    {(trackedRun.status === "running" || trackedRun.status === "pending") && (trackedRun.details as any)?.phase === "sync" && (
                      <>
                        {/* Live counters row */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs py-1 px-2 rounded-md bg-muted/30 border">
                          <span className="text-green-600 dark:text-green-400 font-medium" data-testid="text-live-created">
                            +{((trackedRun.details as any).totalCreated || 0).toLocaleString()} {t("syncDash.created")}
                          </span>
                          <span className="text-blue-600 dark:text-blue-400 font-medium" data-testid="text-live-updated">
                            ↻{((trackedRun.details as any).totalUpdated || 0).toLocaleString()} {t("syncDash.updated")}
                          </span>
                          <span className="text-amber-600 dark:text-amber-400 font-medium" data-testid="text-live-skipped">
                            ⊘{((trackedRun as any).recordsSkipped || (trackedRun.details as any).totalSkippedByMatch || 0).toLocaleString()} {language === "sk" ? "preskočených" : "skipped"}
                          </span>
                          {(trackedRun.recordsFailed || 0) > 0 && (
                            <span className="text-destructive font-medium" data-testid="text-live-failed">
                              ✗{(trackedRun.recordsFailed || 0).toLocaleString()} {t("syncDash.errors")}
                            </span>
                          )}
                          <span className="text-muted-foreground ml-auto text-[10px]">
                            {(((trackedRun.details as any).totalCreated || 0) + ((trackedRun.details as any).totalUpdated || 0) + ((trackedRun as any).recordsSkipped || (trackedRun.details as any).totalSkippedByMatch || 0) + (trackedRun.recordsFailed || 0)).toLocaleString()} / {(trackedRun.recordsTotal || 0).toLocaleString()} {language === "sk" ? "spracovaných" : "processed"}
                          </span>
                        </div>

                        {/* Result breakdown bar */}
                        <ResultBreakdownBar
                          created={(trackedRun.details as any).totalCreated || 0}
                          updated={(trackedRun.details as any).totalUpdated || 0}
                          skipped={(trackedRun as any).recordsSkipped || (trackedRun.details as any).totalSkippedByMatch || 0}
                          failed={trackedRun.recordsFailed || 0}
                        />

                        {/* H-kód range (live) */}
                        <HKodRangeDisplay range={(trackedRun.details as any)?.hKodRange} language={language} />

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">{language === "sk" ? "Odoslaných do ONIX:" : "Pushed to target:"}</span>
                            <p className="font-medium" data-testid="text-progress-records">
                              {(trackedRun.recordsProcessed || 0).toLocaleString()} / {(trackedRun.recordsTotal || 0).toLocaleString()}
                            </p>
                            <p className="text-[10px] text-muted-foreground">{language === "sk" ? "záznamy na odoslanie" : "records to push"}</p>
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

                        {/* Throughput sparkline + latency panel */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                          {((trackedRun.details as any)?.batchSpeedHistory?.length >= 2) && (
                            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border bg-muted/20 flex-shrink-0">
                              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                              <SparklineChart data={(trackedRun.details as any).batchSpeedHistory} />
                              <span className="text-[10px] text-muted-foreground">{language === "sk" ? "rýchlosť/dávka" : "speed/batch"}</span>
                            </div>
                          )}
                          {((trackedRun.details as any)?.avgLatencyMs || 0) > 0 && (
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-muted-foreground text-xs">{t("syncDash.serverSpeed")}:</span>
                                {(trackedRun.details as any)?.speedRating && <SpeedRatingBadge rating={(trackedRun.details as any).speedRating} t={t} />}
                                <span className="text-[10px] text-muted-foreground ml-auto">
                                  min <span className="font-medium text-foreground">{(trackedRun.details as any).minLatencyMs || 0}ms</span>
                                  {" · "}avg <span className="font-medium text-foreground">{(trackedRun.details as any).avgLatencyMs}ms</span>
                                  {" · "}max <span className="font-medium text-foreground">{(trackedRun.details as any).maxLatencyMs || 0}ms</span>
                                </span>
                              </div>
                              <SpeedGauge avgLatencyMs={(trackedRun.details as any).avgLatencyMs} t={t} />
                            </div>
                          )}
                        </div>

                        {/* Live error rate */}
                        {((trackedRun.details as any)?.errorRate || 0) > 0 && (
                          <div className="flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-md border border-destructive/20 bg-destructive/5" data-testid="live-error-rate">
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                            <span className="text-muted-foreground">{language === "sk" ? "Miera chýb:" : "Error rate:"}</span>
                            <span className={`font-semibold ${(trackedRun.details as any).errorRate > 5 ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>
                              {(trackedRun.details as any).errorRate}%
                            </span>
                            <span className="text-[10px] text-muted-foreground ml-auto">
                              {(trackedRun.details as any).errorRate <= 1 ? (language === "sk" ? "nízka" : "low") :
                               (trackedRun.details as any).errorRate <= 5 ? (language === "sk" ? "stredná" : "medium") :
                               (language === "sk" ? "vysoká" : "high")}
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    {(trackedRun.status === "running" || trackedRun.status === "pending") && (trackedRun.details as any)?.liveBatch && (
                      <div className="mt-2 border rounded-lg bg-muted/20 p-3" data-testid="panel-live-batch">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Activity className="h-3.5 w-3.5 text-blue-500 animate-pulse flex-shrink-0" />
                          <span className="text-xs font-semibold">{t("syncDash.liveActivity")}</span>
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                            {t("syncDash.batchOf")
                              .replace("{current}", String((trackedRun.details as any).liveBatch.batchNumber))
                              .replace("{total}", String(trackedRun.totalBatches || 0))}
                          </Badge>
                          {/* Per-batch mini counters */}
                          {((trackedRun.details as any).liveBatch.batchCreated > 0 || (trackedRun.details as any).liveBatch.batchUpdated > 0 || (trackedRun.details as any).liveBatch.batchErrors > 0) && (
                            <div className="flex items-center gap-1.5 text-[10px]">
                              {(trackedRun.details as any).liveBatch.batchCreated > 0 && (
                                <span className="text-green-600 dark:text-green-400">+{(trackedRun.details as any).liveBatch.batchCreated}</span>
                              )}
                              {(trackedRun.details as any).liveBatch.batchUpdated > 0 && (
                                <span className="text-blue-600 dark:text-blue-400">↻{(trackedRun.details as any).liveBatch.batchUpdated}</span>
                              )}
                              {(trackedRun.details as any).liveBatch.batchErrors > 0 && (
                                <span className="text-destructive">✗{(trackedRun.details as any).liveBatch.batchErrors}</span>
                              )}
                              {(trackedRun.details as any).liveBatch.batchAvgLatency > 0 && (
                                <span className="text-muted-foreground">{(trackedRun.details as any).liveBatch.batchAvgLatency}ms</span>
                              )}
                            </div>
                          )}
                          <div className="ml-auto flex items-center gap-2">
                            <LiveElapsedTimer startedAt={trackedRun.startedAt} isRunning={true} />
                          </div>
                        </div>
                        <div className="space-y-0.5">
                          {((trackedRun.details as any).liveBatch.sample || []).slice(0, 5).map((item: any, idx: number) => {
                            const isOk = item.status === "created" || item.status === "updated";
                            const isSkipped = item.status === "skipped";
                            const isError = item.status === "error";
                            return (
                              <div key={idx} className={`flex items-center gap-2 text-xs py-0.5 px-1.5 rounded ${
                                isOk ? "bg-green-500/8 dark:bg-green-500/10" :
                                isError ? "bg-red-500/8 dark:bg-red-500/10" :
                                isSkipped ? "bg-amber-500/8 dark:bg-amber-500/10" : ""
                              }`}>
                                <span className="text-muted-foreground w-8 text-right flex-shrink-0 font-mono">#{item.index}</span>
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                  item.status === "created" ? "bg-green-500" :
                                  item.status === "updated" ? "bg-blue-500" :
                                  item.status === "skipped" ? "bg-amber-400" : "bg-red-500"
                                }`} />
                                <span className="truncate font-mono text-[11px]" title={item.label}>{item.label}</span>
                                {item.targetId && (
                                  <span className="text-muted-foreground flex-shrink-0 text-[10px]">→ {item.targetId}</span>
                                )}
                                <Badge
                                  variant={isError ? "destructive" : "outline"}
                                  className={`text-[9px] h-3.5 px-1 ml-auto flex-shrink-0 ${
                                    isOk ? "border-green-500/40 text-green-700 dark:text-green-400" :
                                    isSkipped ? "border-amber-400/40 text-amber-700 dark:text-amber-400" : ""
                                  }`}
                                >
                                  {item.status === "created" ? t("syncDash.created") :
                                   item.status === "updated" ? t("syncDash.updated") :
                                   item.status === "skipped" ? (language === "sk" ? "preskočený" : "skipped") :
                                   t("syncDash.error")}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      </div>
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

                    {trackedRun.status === "error" && (() => {
                      const retryEntry = retryScheduleData.find(e => e.configId === trackedRun.syncConfigId);
                      if (!retryEntry) return null;
                      const remMs = Math.max(0, retryEntry.remainingMs);
                      const remMin = Math.floor(remMs / 60000);
                      const remSec = Math.floor((remMs % 60000) / 1000);
                      return (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-300/50 dark:border-blue-700/50 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs" data-testid="badge-auto-retry-countdown">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" style={{ animationDuration: "3s" }} />
                          <span className="font-medium">
                            {language === "sk" ? "Automatická obnova za" : "Auto-retry in"}
                          </span>
                          <span className="font-mono font-semibold">
                            {remMs === 0
                              ? (language === "sk" ? "spúšťa sa..." : "launching...")
                              : remMin > 0
                                ? `${remMin}m ${remSec}s`
                                : `${remSec}s`}
                          </span>
                        </div>
                      );
                    })()}

                    {(trackedRun.status === "success" || trackedRun.status === "partial" || trackedRun.status === "error") && (trackedRun.details as any)?.completionSummary && (() => {
                      const cs = (trackedRun.details as any).completionSummary;
                      const isSuccess = trackedRun.status === "success";
                      const isPartial = trackedRun.status === "partial";
                      const borderColor = isSuccess ? "border-green-500/30" : isPartial ? "border-yellow-500/30" : "border-destructive/30";
                      const bgColor = isSuccess ? "bg-green-500/5" : isPartial ? "bg-yellow-500/5" : "bg-destructive/5";
                      return (
                        <div className={`mt-2 border rounded-lg p-3 space-y-3 ${borderColor} ${bgColor}`} data-testid="panel-completion-summary">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <BarChart3 className="h-4 w-4" />
                            {t("syncDash.completionSummary")}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                            <div>
                              <span className="text-muted-foreground">{t("syncDash.created")}:</span>
                              <p className="font-semibold text-green-600 dark:text-green-400" data-testid="text-summary-created">+{(cs.totalCreated || 0).toLocaleString()}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">{t("syncDash.updated")}:</span>
                              <p className="font-semibold text-blue-600 dark:text-blue-400" data-testid="text-summary-updated">↻{(cs.totalUpdated || 0).toLocaleString()}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">{language === "sk" ? "Preskočené:" : "Skipped:"}</span>
                              <p className={`font-semibold ${(cs.totalSkippedByMatch || 0) > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`} data-testid="text-summary-skipped">⊘{(cs.totalSkippedByMatch || 0).toLocaleString()}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">{t("syncDash.errors")}:</span>
                              <p className={`font-semibold ${(cs.totalFailed || 0) > 0 ? "text-destructive" : ""}`} data-testid="text-summary-failed">✗{(cs.totalFailed || 0).toLocaleString()}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">{t("syncDash.duration")}:</span>
                              <p className="font-semibold" data-testid="text-summary-duration">{cs.durationFormatted || "—"}</p>
                            </div>
                          </div>

                          {/* Visual breakdown bar */}
                          <ResultBreakdownBar
                            created={cs.totalCreated || 0}
                            updated={cs.totalUpdated || 0}
                            skipped={cs.totalSkippedByMatch || 0}
                            failed={cs.totalFailed || 0}
                          />

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            <div>
                              <span className="text-muted-foreground">{t("syncDash.sourceRecords")}:</span>
                              <p className="font-medium">{(cs.sourceRecordCount || 0).toLocaleString()}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">{t("syncDash.fieldCount")}:</span>
                              <p className="font-medium">{cs.fieldCount || 0}</p>
                            </div>
                            {(cs.sourceFiltersApplied || 0) > 0 && (
                              <div>
                                <span className="text-muted-foreground">{language === "sk" ? "Filtrované:" : "Filtered out:"}</span>
                                <p className="font-medium text-amber-600 dark:text-amber-400">−{(cs.sourceFiltersApplied || 0).toLocaleString()}</p>
                              </div>
                            )}
                            {(cs.errorRate || 0) > 0 && (
                              <div>
                                <span className="text-muted-foreground">{language === "sk" ? "Miera chýb:" : "Error rate:"}</span>
                                <p className={`font-medium ${cs.errorRate > 5 ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>{cs.errorRate}%</p>
                              </div>
                            )}
                          </div>

                          {/* Throughput sparkline in completion */}
                          {cs.batchSpeedHistory && cs.batchSpeedHistory.length >= 3 && (
                            <div className="flex items-center gap-3 px-2.5 py-1.5 rounded-md border bg-muted/20 text-xs">
                              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-muted-foreground">{language === "sk" ? "Priebeh rýchlosti:" : "Speed trend:"}</span>
                              <SparklineChart data={cs.batchSpeedHistory} />
                              <span className="text-[10px] text-muted-foreground ml-auto">
                                {language === "sk" ? "max" : "peak"}: <span className="font-medium text-foreground">{Math.max(...cs.batchSpeedHistory.map((d: any) => d.s))} rec/s</span>
                              </span>
                            </div>
                          )}

                          {/* H-kód range */}
                          <HKodRangeDisplay range={cs.hKodRange} language={language} />

                          {/* VAT samples */}
                          <VatSamplesPanel samples={cs.vatSamples} vatRate={cs.vatDividerRate} language={language} />

                          {cs.fieldMappings && cs.fieldMappings.length > 0 && (
                            <div className="text-xs">
                              <span className="text-muted-foreground font-medium">{t("syncDash.fieldMappingsUsed")}:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {cs.fieldMappings.map((fm: string, idx: number) => (
                                  <Badge key={idx} variant="secondary" className="text-[10px] h-5 px-1.5 font-mono">{fm}</Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {(cs.avgLatencyMs || 0) > 0 && (
                            <div className="text-xs border-t pt-2 border-foreground/10">
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground font-medium">{t("syncDash.serverSpeed")}:</span>
                                {cs.speedRating && <SpeedRatingBadge rating={cs.speedRating} t={t} />}
                              </div>
                              <div className="mt-1">
                                <SpeedGauge avgLatencyMs={cs.avgLatencyMs} t={t} />
                              </div>
                              <div className="grid grid-cols-3 gap-2 mt-1.5 text-[11px]">
                                <div>
                                  <span className="text-muted-foreground">{t("syncDash.latencyAvg")}:</span>
                                  <p className="font-medium">{cs.avgLatencyMs}ms</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">{t("syncDash.latencyMin")}:</span>
                                  <p className="font-medium">{cs.minLatencyMs || 0}ms</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">{t("syncDash.latencyMax")}:</span>
                                  <p className="font-medium">{cs.maxLatencyMs || 0}ms</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {cs.backupStats && (
                            <div className="text-xs border-t pt-2 border-foreground/10">
                              <span className="text-muted-foreground font-medium">{t("syncDash.backupInfo")}:</span>
                              <div className="grid grid-cols-2 gap-2 mt-1">
                                <div>
                                  <span className="text-muted-foreground">{t("syncDash.backupRecords")}:</span>
                                  <p className="font-medium">
                                    {cs.backupStats.uploadedRecordCount} {t("syncDash.records")}
                                    {(cs.backupStats.totalFiles || 0) > 1 && (
                                      <span className="text-muted-foreground ml-1">
                                        ({cs.backupStats.totalFiles} {t("syncDash.backupFiles")})
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">{t("syncDash.backupSize")}:</span>
                                  <p className="font-medium">{formatBytes(cs.backupStats.fileSize || 0)}</p>
                                </div>
                              </div>
                              {!cs.backupStats.truncated && (
                                <p className="text-[10px] text-green-600 dark:text-green-400 mt-1">
                                  <CheckCircle2 className="h-3 w-3 inline mr-1" />
                                  {t("syncDash.backupComplete")}
                                </p>
                              )}
                            </div>
                          )}

                          {cs.sampleTargetIds && cs.sampleTargetIds.length > 0 ? (
                            <div className="text-xs border-t pt-2 border-foreground/10">
                              <span className="text-muted-foreground font-medium">{t("syncDash.targetIds")}:</span>
                              <div className="flex flex-wrap gap-1 mt-1 max-h-20 overflow-y-auto">
                                {cs.sampleTargetIds.map((id: any, idx: number) => (
                                  <Badge key={idx} variant="outline" className="text-[10px] h-5 px-1.5 font-mono">{id}</Badge>
                                ))}
                              </div>
                            </div>
                          ) : cs.totalCreated > 0 && (
                            <div className="text-xs border-t pt-2 border-foreground/10">
                              <p className="text-muted-foreground italic">{t("syncDash.noTargetIds")}</p>
                            </div>
                          )}

                          {/* Top errors analysis */}
                          {cs.topErrors && cs.topErrors.length > 0 && (
                            <TopErrorsPanel errors={cs.topErrors} language={language} />
                          )}
                        </div>
                      );
                    })()}

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
                    {trackedRun.status === "error" && (trackedRun as any).checkpointData?.globalOffset > 0 && (
                      <Button
                        variant="outline" size="sm"
                        onClick={() => resumeSyncMutation.mutate(trackedRun.id)}
                        disabled={resumeSyncMutation.isPending}
                        data-testid="button-resume-sync"
                        className="border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      >
                        {resumeSyncMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Obnoviť od záznamu {((trackedRun as any).checkpointData.globalOffset).toLocaleString()}
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
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" data-testid="toggle-full-sync">
                      <input
                        type="checkbox"
                        checked={fullSyncMode}
                        onChange={(e) => setFullSyncMode(e.target.checked)}
                        className="rounded border-foreground/30 h-3.5 w-3.5"
                      />
                      <span className={fullSyncMode ? "text-orange-600 dark:text-orange-400 font-medium" : "text-muted-foreground"}>
                        Full sync
                      </span>
                    </label>
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
                              {((config.fieldMappings || []) as Array<{ sourceField: string; targetField: string; transform?: string }>).some(m => m.transform?.startsWith("price_excl_vat")) && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 text-amber-600 dark:text-amber-400 border-amber-500/30" data-testid={`badge-vat-${config.id}`}>
                                  <Percent className="h-3 w-3" />
                                  {t("syncDash.vatExcl")}
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
                              {config.targetModule?.code === "ONIX" && config.targetModule?.environment && (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] px-1.5 py-0 gap-0.5 ${
                                    config.targetModule.environment === "production"
                                      ? "border-red-500/40 text-red-600 dark:text-red-400 bg-red-500/5"
                                      : "border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/5"
                                  }`}
                                  title={
                                    config.targetModule.environment === "production"
                                      ? "Cieľ: ostrá (produkčná) ONIX databáza"
                                      : "Cieľ: testovacia ONIX databáza"
                                  }
                                  data-testid={`badge-onix-env-${config.id}`}
                                >
                                  <Database className="h-3 w-3" />
                                  {config.targetModule.environment === "production" ? "OSTRÁ DB" : "TEST DB"}
                                </Badge>
                              )}
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
                            onClick={() => startSyncMutation.mutate({ configId: config.id, fullSync: fullSyncMode })}
                            disabled={isRunning || startSyncMutation.isPending || batchRunning}
                            data-testid={`button-run-sync-${config.id}`}
                          >
                            {isRunning ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <Play className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            {isRunning ? t("syncDash.running") : fullSyncMode ? t("syncDash.runFull") : t("syncDash.run")}
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
                    const hasError = (run.status === "error" || run.status === "partial") && !!(run.errorMessage || (details?.batchErrors?.length ?? 0) > 0);
                    const isExpanded = expandedRunId === run.id;
                    const showRecords = recordsViewRunId === run.id;
                    const created = details?.totalCreated || 0;
                    const updated = details?.totalUpdated || 0;
                    const failed = details?.totalFailed || (run.recordsFailed || 0);
                    const skipped = details?.totalSkippedByMatch || details?.completionSummary?.totalSkippedByMatch || (run as any).recordsSkipped || 0;
                    const deltaSkipped = details?.totalSkipped || 0;
                    const isDeltaNoChanges = !!(details?.deltaMode && deltaSkipped > 0 && created === 0 && updated === 0 && skipped === 0 && failed === 0);
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
                            {(created > 0 || updated > 0 || skipped > 0 || failed > 0) ? (
                              <span className="flex items-center gap-1.5">
                                {created > 0 && <span className="text-green-600 dark:text-green-400">+{created.toLocaleString()} {t("syncDash.created")}</span>}
                                {updated > 0 && <span className="text-blue-600 dark:text-blue-400">↻{updated.toLocaleString()} {t("syncDash.updated")}</span>}
                                {skipped > 0 && <span className="text-amber-600 dark:text-amber-400">⊘{skipped.toLocaleString()} {language === "sk" ? "preskočených" : "skipped"}</span>}
                                {failed > 0 && <span className="text-destructive">✗{failed.toLocaleString()} {t("syncDash.errors")}</span>}
                              </span>
                            ) : isDeltaNoChanges ? (
                              <span className="flex items-center gap-1.5" title={language === "sk" ? "Delta sync — všetky záznamy sú aktuálne, nič sa nezmenilo od posledného behu" : "Delta sync — all records up to date, nothing changed since last run"}>
                                <span className="text-[10px] px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold">DELTA</span>
                                <span className="text-green-600 dark:text-green-400">{deltaSkipped.toLocaleString()} {language === "sk" ? "bez zmeny" : "unchanged"}</span>
                              </span>
                            ) : (
                              <span title="odoslaných do ONIX / na spracovanie">
                                {(run.recordsProcessed || 0).toLocaleString()} / {(run.recordsTotal || 0).toLocaleString()}
                              </span>
                            )}
                            <span>{formatDuration(duration)}</span>
                            <span>{formatTimeAgo(run.startedAt)}</span>
                            {hasDetails && (failed > 0 || skipped > 0) && (
                              <button
                                data-testid={`button-export-csv-${run.id}`}
                                title={language === "sk" ? "Exportovať chyby a preskočené do CSV" : "Export errors & skipped to CSV"}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const resp = await fetch(`/api/sync-runs/${run.id}/export-csv`, { credentials: "include" });
                                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                                    const blob = await resp.blob();
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    const startedAt = run.startedAt ? new Date(run.startedAt).toISOString().slice(0, 10) : "export";
                                    a.href = url;
                                    a.download = `sync-export-${startedAt}.csv`;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(url);
                                  } catch (err) {
                                    console.error("CSV export failed", err);
                                    alert(language === "sk" ? "Export sa nepodaril." : "Export failed.");
                                  }
                                }}
                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {hasDetails && (
                              isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-3 pb-3 border-t space-y-2">
                            {/* Delta/Full mode header — shown for all completed runs */}
                            {(details?.deltaMode !== undefined || (details?.totalFetched ?? 0) > 0) && (
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${details?.deltaMode ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"}`}>
                                  {details?.deltaMode ? "DELTA" : "FULL"}
                                </span>
                                {(details?.totalFetched ?? 0) > 0 && (
                                  <span className="text-muted-foreground">
                                    {(details.totalFetched).toLocaleString()} {language === "sk" ? "zo zdroja" : "from source"}
                                    {" → "}
                                    <span className="text-foreground font-medium">{(details?.totalChanged ?? 0).toLocaleString()} {language === "sk" ? "na spracovanie" : "to process"}</span>
                                    {deltaSkipped > 0 && (
                                      <span className="text-green-600 dark:text-green-400 ml-1.5">· {deltaSkipped.toLocaleString()} {language === "sk" ? "bez zmeny (delta)" : "unchanged (delta)"}</span>
                                    )}
                                    {skipped > 0 && (
                                      <span className="text-amber-600 dark:text-amber-400 ml-1.5">· {skipped.toLocaleString()} {language === "sk" ? "nenájdených v ONIX" : "not found in ONIX"}</span>
                                    )}
                                  </span>
                                )}
                                {isDeltaNoChanges && (
                                  <span className="text-green-600 dark:text-green-400 font-medium">
                                    — {language === "sk" ? "všetky záznamy sú aktuálne" : "all records up to date"}
                                  </span>
                                )}
                              </div>
                            )}
                            {isDeltaNoChanges && (
                              <div className="p-2 rounded bg-blue-500/5 border border-blue-500/20 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-1.5" data-testid="panel-delta-nochanges">
                                <span className="mt-0.5 font-bold">DELTA</span>
                                <span>
                                  {language === "sk"
                                    ? `Delta sync porovnal MD5 hashe ${deltaSkipped.toLocaleString()} záznamov a nezistil žiadnu zmenu od posledného behu — synchronizácia nebola potrebná. Ak chcete vynútiť sync bez ohľadu na delta, spustite "Plný sync".`
                                    : `Delta sync compared MD5 hashes of ${deltaSkipped.toLocaleString()} records and found no changes since the last run — synchronization was not needed. To force sync regardless of delta, run "Full sync".`}
                                </span>
                              </div>
                            )}
                            {(created > 0 || updated > 0 || skipped > 0 || failed > 0) && (
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-green-500/10 text-green-700 dark:text-green-400">
                                  <CheckCircle2 className="h-3 w-3" />
                                  <span data-testid="text-created-count">{created.toLocaleString()} {t("syncDash.created")}</span>
                                </div>
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/10 text-blue-700 dark:text-blue-400">
                                  <RotateCcw className="h-3 w-3" />
                                  <span data-testid="text-updated-count">{updated.toLocaleString()} {t("syncDash.updated")}</span>
                                </div>
                                {skipped > 0 && (
                                  <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400">
                                    <span>⊘</span>
                                    <span data-testid="text-skipped-count">{skipped.toLocaleString()} {language === "sk" ? "preskočených" : "skipped"}</span>
                                  </div>
                                )}
                                {failed > 0 && (
                                  <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-destructive/10 text-destructive">
                                    <XCircle className="h-3 w-3" />
                                    <span data-testid="text-failed-count">{failed.toLocaleString()} {t("syncDash.errors")}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {hasError && (
                              <div className="p-2.5 rounded bg-destructive/5 text-sm space-y-2">
                                <div className="flex items-center justify-between">
                                  <p className="font-medium text-destructive text-xs">{t("syncDash.errorDetails")} ({details?.batchErrors?.length ?? 0}):</p>
                                  <span className="text-[10px] text-muted-foreground italic">
                                    {language === "sk" ? "Stiahnuť úplný zoznam →" : "Download full list →"}{" "}
                                    <button
                                      className="underline text-primary"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          const resp = await fetch(`/api/sync-runs/${run.id}/export-csv`, { credentials: "include" });
                                          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                                          const blob = await resp.blob();
                                          const url = URL.createObjectURL(blob);
                                          const a = document.createElement("a");
                                          a.href = url;
                                          a.download = `sync-export-${run.startedAt ? new Date(run.startedAt).toISOString().slice(0, 10) : "export"}.csv`;
                                          document.body.appendChild(a);
                                          a.click();
                                          document.body.removeChild(a);
                                          URL.revokeObjectURL(url);
                                        } catch { alert(language === "sk" ? "Export sa nepodaril." : "Export failed."); }
                                      }}
                                    >CSV</button>
                                  </span>
                                </div>
                                {run.errorMessage && (
                                  <p className="text-xs text-destructive/80">{run.errorMessage}</p>
                                )}
                                {groupedErrors.length > 0 && (
                                  <div className="space-y-1 max-h-40 overflow-y-auto">
                                    {groupedErrors.map((eg, i) => {
                                      const nsMatch = eg.message.match(/NS_NUMBER:\s*([^\s.]+)/i);
                                      const hcode = nsMatch ? nsMatch[1] : null;
                                      return (
                                        <div key={i} className="text-[11px] text-muted-foreground flex justify-between gap-2">
                                          <span className="truncate">
                                            {hcode ? <span className="font-mono text-destructive/80 mr-1">{hcode}</span> : null}
                                            {eg.message.replace(/^ONIX rejected: /, "").replace(/NS_NUMBER: [^\s]+ /, "")}
                                          </span>
                                          <span className="text-destructive/60 flex-shrink-0">{eg.count > 1 ? `×${eg.count}` : ""}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}

                            {skipped > 0 && !(details?.skippedItems?.length > 0) && (
                              <div className="p-2 rounded bg-amber-500/5 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5" data-testid="panel-skipped-info">
                                <span className="mt-0.5">⊘</span>
                                <span>
                                  <span className="font-semibold">{skipped.toLocaleString()} {language === "sk" ? "preskočených" : "skipped"}:</span>{" "}
                                  {language === "sk"
                                    ? "záznamy preskočené pri synchronizácii (napr. duplicity v ONIX alebo záznamy bez zhody v cieľovom systéme) — individuálne H kódy neboli uložené v tomto behu."
                                    : "records skipped during sync (e.g. duplicates in target or unmatched records) — individual keys were not stored in this run."}
                                </span>
                              </div>
                            )}

                            {details?.completionSummary && (
                              <div className="mt-2 space-y-2" data-testid="panel-history-summary">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                  <div>
                                    <span className="text-muted-foreground">{t("syncDash.sourceRecords")}:</span>
                                    <p className="font-medium">{(details.completionSummary.sourceRecordCount || 0).toLocaleString()}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">{t("syncDash.fieldCount")}:</span>
                                    <p className="font-medium">{details.completionSummary.fieldCount}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">{t("syncDash.duration")}:</span>
                                    <p className="font-medium">{details.completionSummary.durationFormatted}</p>
                                  </div>
                                  {details.completionSummary.backupStats && (
                                    <div>
                                      <span className="text-muted-foreground">{t("syncDash.backupRecords")}:</span>
                                      <p className="font-medium">
                                        {details.completionSummary.backupStats.uploadedRecordCount} {t("syncDash.records")}
                                        {(details.completionSummary.backupStats.totalFiles || 0) > 1 && (
                                          <span className="text-muted-foreground ml-1">
                                            ({details.completionSummary.backupStats.totalFiles} {t("syncDash.backupFiles")})
                                          </span>
                                        )}
                                      </p>
                                    </div>
                                  )}
                                </div>
                                {(details.completionSummary.avgLatencyMs || 0) > 0 && (
                                  <div className="flex items-center gap-2">
                                    <SpeedGauge avgLatencyMs={details.completionSummary.avgLatencyMs} t={t} />
                                    {details.completionSummary.speedRating && <SpeedRatingBadge rating={details.completionSummary.speedRating} t={t} />}
                                  </div>
                                )}
                              </div>
                            )}

                            {details?.completionSummary?.fieldMappings?.length > 0 && (
                              <div className="flex flex-wrap gap-1 text-xs mt-1">
                                {details.completionSummary.fieldMappings.map((fm: string, idx: number) => (
                                  <Badge key={idx} variant="secondary" className="text-[10px] h-5 px-1.5 font-mono">{fm}</Badge>
                                ))}
                              </div>
                            )}

                            {(() => {
                              const storedVat = details?.completionSummary?.hasVatDivider;
                              const inferredVat = (storedVat === undefined || storedVat === null)
                                ? ((config?.fieldMappings || []) as Array<{ sourceField: string; targetField: string; transform?: string }>).some(m => m.transform?.startsWith("price_excl_vat"))
                                : false;
                              const showVatWarning = storedVat === true || inferredVat;
                              return showVatWarning ? (
                                <div className="flex items-center gap-1.5 mt-1.5 px-2 py-1 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 w-fit" data-testid={`vat-divider-warning-${run.id}`}>
                                  <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                                  <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">{t("syncDash.vatDividerActive")}</span>
                                  {details?.completionSummary?.vatDividerRate && (
                                    <span className="text-[10px] text-amber-600/80 dark:text-amber-500">
                                      ({t("syncDash.vatDividerRate")}: {details.completionSummary.vatDividerRate}%)
                                    </span>
                                  )}
                                  {inferredVat && (
                                    <span className="text-[10px] text-muted-foreground italic">{t("syncDash.vatInferred")}</span>
                                  )}
                                </div>
                              ) : null;
                            })()}

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
                                    <div className="flex items-center gap-1 p-2 bg-muted/30 border-b flex-wrap">
                                      {(["all", "created", "updated", "skipped", "error"] as const).map(f => {
                                        const count = f === "all"
                                          ? (details.syncedRecords as any[]).length
                                          : (details.syncedRecords as any[]).filter((r: any) => r.status === f).length;
                                        if (f !== "all" && count === 0) return null;
                                        return (
                                          <Button
                                            key={f}
                                            variant={recordsFilter === f ? "default" : "ghost"}
                                            size="sm" className="h-6 text-[11px] px-2"
                                            onClick={(e) => { e.stopPropagation(); setRecordsFilter(f as any); setRecordsPage(0); }}
                                            data-testid={`button-filter-${f}`}
                                          >
                                            {f === "all" ? `${t("syncDash.showAll")} (${count})`
                                              : f === "created" ? `${t("syncDash.showCreated")} (${count})`
                                              : f === "updated" ? `${t("syncDash.updated")} (${count})`
                                              : f === "skipped" ? `${language === "sk" ? "Preskočené" : "Skipped"} (${count})`
                                              : `${t("syncDash.showErrors")} (${count})`}
                                          </Button>
                                        );
                                      })}
                                    </div>
                                    {(() => {
                                      const filtered = (details.syncedRecords as any[]).filter(r =>
                                        recordsFilter === "all" ? true : r.status === recordsFilter
                                      );
                                      const pageSize = 20;
                                      const totalPages = Math.ceil(filtered.length / pageSize);
                                      const pageRecords = filtered.slice(recordsPage * pageSize, (recordsPage + 1) * pageSize);
                                      const recordsHaveVat = (details.syncedRecords as any[]).some((r: any) => r.vatTransforms?.length > 0);
                                      const hasVat = recordsHaveVat || details?.completionSummary?.hasVatDivider === true;
                                      const isHistoricalVat = hasVat && !recordsHaveVat;
                                      return (
                                        <>
                                          <table className="w-full text-xs">
                                            <thead>
                                              <tr className="border-b text-muted-foreground bg-muted/20">
                                                <th className="p-1.5 text-left w-12">{t("syncDash.recordIndex")}</th>
                                                <th className="p-1.5 text-left">{t("syncDash.target_id")}</th>
                                                <th className="p-1.5 text-left">{t("syncDash.recordStatus")}</th>
                                                {hasVat && (
                                                  <th className="p-1.5 text-left">
                                                    {t("syncDash.vatPriceCol")}
                                                    {isHistoricalVat && (
                                                      <span className="ml-1 text-[10px] text-muted-foreground font-normal italic" data-testid="vat-col-no-data-note">
                                                        ({t("syncDash.vatPriceNoData")})
                                                      </span>
                                                    )}
                                                  </th>
                                                )}
                                                <th className="p-1.5 text-left">Info</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {pageRecords.map((rec: any, i: number) => (
                                                <tr key={i} className="border-b last:border-0 hover:bg-muted/20" data-testid={`row-record-${rec.sourceIndex}`}>
                                                  <td className="p-1.5 text-muted-foreground">{rec.sourceIndex + 1}</td>
                                                  <td className="p-1.5">
                                                    {rec.target_id ? (
                                                      <span className="font-mono">{rec.target_id}</span>
                                                    ) : (
                                                      <span className="text-muted-foreground">—</span>
                                                    )}
                                                  </td>
                                                  <td className="p-1.5">
                                                    <Badge
                                                      variant={rec.status === "created" ? "default" : rec.status === "updated" ? "secondary" : rec.status === "skipped" ? "outline" : "destructive"}
                                                      className={`text-[10px] px-1.5 ${rec.status === "skipped" ? "border-amber-400/60 text-amber-700 dark:text-amber-400" : ""}`}
                                                    >
                                                      {rec.status === "created" ? t("syncDash.statusCreated")
                                                        : rec.status === "updated" ? t("syncDash.statusUpdated")
                                                        : rec.status === "skipped" ? (language === "sk" ? "preskočený" : "skipped")
                                                        : t("syncDash.statusFailed")}
                                                    </Badge>
                                                  </td>
                                                  {hasVat && (
                                                    <td className="p-1.5" data-testid={`cell-vat-${rec.sourceIndex}`}>
                                                      {rec.vatTransforms?.length > 0 ? (
                                                        <div className="flex flex-col gap-0.5">
                                                          {rec.vatTransforms.map((vt: any, vi: number) => (
                                                            <span key={vi} className="font-mono text-[10px] whitespace-nowrap">
                                                              <span className="text-muted-foreground">{vt.field}: </span>
                                                              <span>{vt.originalPrice}</span>
                                                              <span className="text-muted-foreground mx-1">→</span>
                                                              <span className="font-semibold">{vt.convertedPrice}</span>
                                                              <span className="text-muted-foreground ml-1">({t("syncDash.vatPriceRate")} {vt.vatRate}%)</span>
                                                            </span>
                                                          ))}
                                                        </div>
                                                      ) : (
                                                        <span className="text-muted-foreground">—</span>
                                                      )}
                                                    </td>
                                                  )}
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
          {/* Filter bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{language === "sk" ? "Filter:" : "Filter:"}</span>
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-44" data-testid="select-log-filter-status">
                <SelectValue placeholder={language === "sk" ? "Všetky stavy" : "All statuses"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === "sk" ? "Všetky stavy" : "All statuses"}</SelectItem>
                <SelectItem value="success">{language === "sk" ? "Úspešné" : "Success"}</SelectItem>
                <SelectItem value="error">{language === "sk" ? "Chyba" : "Error"}</SelectItem>
                <SelectItem value="partial">{language === "sk" ? "Čiastočné" : "Partial"}</SelectItem>
                <SelectItem value="running">{language === "sk" ? "Beží" : "Running"}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              {(() => {
                const logRuns = [...runs]
                  .filter(r => filterStatus === "all" || r.status === filterStatus)
                  .sort((a, b) => new Date(b.startedAt ?? 0).getTime() - new Date(a.startedAt ?? 0).getTime());

                if (logRuns.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">{language === "sk" ? "Žiadne behy." : "No runs yet."}</p>
                      <p className="text-xs text-muted-foreground mt-1">{language === "sk" ? "Logy sa zobrazia po spustení synchronizácie." : "Logs will appear after running a sync."}</p>
                    </div>
                  );
                }

                return (
                  <div className="divide-y font-mono text-xs">
                    {logRuns.map((run) => {
                      const det = (run as any).details as Record<string, any> | null;
                      const phaseHistory: Record<string, string> = det?.phaseHistory ?? {};
                      const batchErrors: Array<{ batch?: number; index?: number; message: string }> = det?.batchErrors ?? [];
                      const skippedItems: Array<{ nsNumber: string; reason: string }> = det?.skippedItems ?? [];
                      const completionSummary: string | undefined = det?.completionSummary;
                      const isExpLog = expandedLogRunId === run.id;
                      const duration = run.startedAt && run.completedAt
                        ? Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
                        : null;
                      const created = det?.totalCreated ?? 0;
                      const updated = det?.totalUpdated ?? 0;
                      const failed = run.recordsFailed ?? 0;
                      const skipped = det?.totalSkippedByMatch ?? 0;
                      const configName = (run as any).configName ?? run.syncConfigId?.slice(0, 8) ?? "—";

                      const PHASES = [
                        { key: "preflight", label: "PREFLIGHT" },
                        { key: "backup",    label: "BACKUP" },
                        { key: "fetch",     label: "FETCH" },
                        { key: "sync",      label: "SYNC" },
                      ];

                      const statusColor = (s: string) => {
                        if (s === "done" || s === "success") return "text-green-500 dark:text-green-400";
                        if (s === "running") return "text-blue-500 dark:text-blue-400 animate-pulse";
                        if (s === "error") return "text-red-500 dark:text-red-400";
                        return "text-muted-foreground";
                      };
                      const phaseIcon = (s: string) => {
                        if (s === "done") return "✓";
                        if (s === "running") return "▶";
                        if (s === "error") return "✗";
                        return "·";
                      };

                      const runStatus = run.status;
                      const runStatusIcon = runStatus === "success" ? "✓" : runStatus === "error" ? "✗" : runStatus === "partial" ? "!" : runStatus === "running" ? "▶" : "·";
                      const runStatusColor = runStatus === "success" ? "text-green-500 dark:text-green-400" : runStatus === "error" ? "text-red-500 dark:text-red-400" : runStatus === "partial" ? "text-amber-500 dark:text-amber-400" : runStatus === "running" ? "text-blue-500 dark:text-blue-400" : "text-muted-foreground";

                      return (
                        <div key={run.id} data-testid={`log-run-${run.id}`}>
                          {/* Header row */}
                          <button
                            className="w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors flex items-start gap-3"
                            onClick={() => setExpandedLogRunId(isExpLog ? null : run.id)}
                            data-testid={`button-log-expand-${run.id}`}
                          >
                            <span className={`mt-0.5 w-4 shrink-0 text-center font-bold ${runStatusColor}`}>{runStatusIcon}</span>
                            <span className="flex-1 min-w-0">
                              <span className="text-muted-foreground">[{run.startedAt ? new Date(run.startedAt).toISOString().replace("T", " ").slice(0, 19) : "—"}]</span>
                              {" "}<span className="font-semibold text-foreground">{configName}</span>
                              {" "}<span className={runStatusColor}>{runStatus.toUpperCase()}</span>
                              {duration != null && <span className="text-muted-foreground ml-2">({duration}s)</span>}
                              <span className="ml-3 gap-2 inline-flex flex-wrap">
                                {created > 0 && <span className="text-green-600 dark:text-green-400">+{created.toLocaleString()} nové</span>}
                                {updated > 0 && <span className="text-blue-600 dark:text-blue-400">↻{updated.toLocaleString()} upd</span>}
                                {skipped > 0 && <span className="text-amber-500 dark:text-amber-400">⊘{skipped.toLocaleString()} skip</span>}
                                {failed > 0 && <span className="text-red-500 dark:text-red-400">✗{failed.toLocaleString()} err</span>}
                              </span>
                            </span>
                            <span className="text-muted-foreground shrink-0">{isExpLog ? "▲" : "▼"}</span>
                          </button>

                          {/* Expanded detail */}
                          {isExpLog && (
                            <div className="bg-muted/30 border-t px-6 py-3 space-y-3">

                              {/* Phase pipeline */}
                              {Object.keys(phaseHistory).length > 0 && (
                                <div>
                                  <p className="text-muted-foreground mb-1">{language === "sk" ? "# Fázy:" : "# Phases:"}</p>
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {PHASES.map((ph, i) => {
                                      const s = phaseHistory[ph.key] ?? "pending";
                                      return (
                                        <span key={ph.key} className="flex items-center gap-1">
                                          <span className={`${statusColor(s)} font-semibold`}>{phaseIcon(s)} {ph.label}</span>
                                          {i < PHASES.length - 1 && <span className="text-muted-foreground mx-1">→</span>}
                                        </span>
                                      );
                                    })}
                                    {run.status === "success" || run.status === "partial" ? (
                                      <span className="flex items-center gap-1">
                                        <span className="text-muted-foreground mx-1">→</span>
                                        <span className="text-green-500 dark:text-green-400 font-semibold">✓ DONE</span>
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              )}

                              {/* Completion summary */}
                              {completionSummary && (
                                <div>
                                  <p className="text-muted-foreground mb-1">{language === "sk" ? "# Výsledok:" : "# Result:"}</p>
                                  <p className="text-foreground whitespace-pre-wrap">{completionSummary}</p>
                                </div>
                              )}

                              {/* Error message */}
                              {run.errorMessage && (
                                <div>
                                  <p className="text-muted-foreground mb-1"># ERROR:</p>
                                  <p className="text-red-500 dark:text-red-400 whitespace-pre-wrap">{run.errorMessage}</p>
                                </div>
                              )}

                              {/* Batch errors */}
                              {batchErrors.length > 0 && (
                                <div>
                                  <p className="text-muted-foreground mb-1"># {language === "sk" ? "Chyby záznamu" : "Record errors"} ({batchErrors.length.toLocaleString()}{batchErrors.length > 100 ? `, ${language === "sk" ? "zobrazených prvých 100" : "showing first 100"}` : ""}):</p>
                                  <div className="space-y-0.5 max-h-60 overflow-y-auto">
                                    {batchErrors.slice(0, 100).map((e, i) => {
                                      const nsMatch = e.message.match(/NS_NUMBER:\s*([^\s,]+)/i);
                                      const ns = nsMatch ? nsMatch[1] : null;
                                      return (
                                        <p key={i} className="text-red-400 dark:text-red-300 leading-relaxed">
                                          {ns ? <span className="text-amber-400 dark:text-amber-300">[{ns}]</span> : null}
                                          {" "}{e.message}
                                        </p>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Skipped items */}
                              {skippedItems.length > 0 && (
                                <div>
                                  <p className="text-muted-foreground mb-1"># {language === "sk" ? "Preskočené záznamy" : "Skipped records"} ({skippedItems.length.toLocaleString()}{skippedItems.length > 50 ? `, ${language === "sk" ? "zobrazených prvých 50" : "showing first 50"}` : ""}):</p>
                                  <div className="space-y-0.5 max-h-40 overflow-y-auto">
                                    {skippedItems.slice(0, 50).map((s, i) => (
                                      <p key={i} className="text-amber-500 dark:text-amber-400">
                                        <span className="text-amber-400 dark:text-amber-300">[{s.nsNumber}]</span> {s.reason}
                                      </p>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* H kód decisions log */}
                              <div>
                                <HkodPanel runId={run.id} t={t} />
                              </div>

                              {/* CSV download */}
                              {(failed > 0 || skipped > 0) && (
                                <div className="pt-1">
                                  <button
                                    data-testid={`button-log-csv-${run.id}`}
                                    className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                                    onClick={async () => {
                                      try {
                                        const resp = await fetch(`/api/sync-runs/${run.id}/export-csv`, { credentials: "include" });
                                        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                                        const blob = await resp.blob();
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement("a");
                                        const startedAt = run.startedAt ? new Date(run.startedAt).toISOString().slice(0, 10) : "export";
                                        a.href = url;
                                        a.download = `sync-export-${startedAt}.csv`;
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                        URL.revokeObjectURL(url);
                                      } catch {
                                        alert(language === "sk" ? "Export sa nepodaril." : "Export failed.");
                                      }
                                    }}
                                  >
                                    <Download className="h-3 w-3" />
                                    {language === "sk" ? "Stiahnuť úplný export (CSV)" : "Download full export (CSV)"}
                                    {" "}({(failed + skipped).toLocaleString()} {language === "sk" ? "záznamov" : "records"})
                                  </button>
                                </div>
                              )}

                              {/* Run ID for reference */}
                              <p className="text-muted-foreground/50 pt-1">run_id: {run.id}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </>
      ) : activeTab === "analytics" ? (
        <SyncAnalyticsTab language={language} />
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
              <BackupProgressPanel isActive={configToDriveMutation.isPending} error={backupError?.type === "configToDrive" ? backupError.message : null} opType="configToDrive" t={t} />
              <BackupProgressPanel isActive={restoreConfigDriveMutation.isPending} error={backupError?.type === "restoreConfig" ? backupError.message : null} opType="restoreConfig" t={t} />
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground mb-3 flex items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5" />
                <span>Google Drive: SyncHub_Backups / Config /</span>
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

          <OnixBackupSection t={t} language={language} />

          <Separator />

          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Database className="h-4 w-4" />
            {t("syncDash.dataBackupsTitle")}
          </h3>

          <div className="text-xs text-muted-foreground flex items-center gap-2 -mt-2">
            <FolderOpen className="h-3.5 w-3.5" />
            <span>Google Drive: SyncHub_Backups / Data / {new Date().toISOString().slice(0, 10)} / [Modul] /</span>
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
                    <BackupProgressPanel isActive={activeBackupTarget?.type === "manual" && activeBackupTarget.targetId === configId} error={backupError?.type === "manual" && backupError.targetId === configId ? backupError.message : null} opType="manual" t={t} />
                    <BackupProgressPanel isActive={activeBackupTarget?.type === "restore" && configBackups.some((b: any) => b.id === activeBackupTarget.targetId)} error={backupError?.type === "restore" && configBackups.some((b: any) => b.id === backupError.targetId) ? backupError.message : null} opType="restore" t={t} />
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {configBackups.map((backup: any) => (
                        <div key={backup.id} className="space-y-2">
                        <div className="flex items-center justify-between p-3 rounded-lg border" data-testid={`row-backup-${backup.id}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <HardDrive className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-sm font-medium truncate">{backup.fileName}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 ml-5 flex-wrap">
                              <span>{formatBytes(backup.fileSize || 0)}</span>
                              <span>·</span>
                              <span>
                                {backup.backupRecordCount || 0} {t("syncDash.records")}
                                  {(backup.configSnapshot as any)?.totalFiles > 1 && (
                                  <button
                                    className="ml-1 underline hover:text-foreground cursor-pointer"
                                    onClick={() => setExpandedBackupId(expandedBackupId === backup.id ? null : backup.id)}
                                    data-testid={`button-expand-parts-${backup.id}`}
                                  >
                                    ({(backup.configSnapshot as any).totalFiles} {t("syncDash.backupFiles")})
                                  </button>
                                )}
                              </span>
                              {!(backup.configSnapshot as any)?.truncated && (backup.backupRecordCount || 0) > 0 && (
                                <>
                                  <span>·</span>
                                  <span className="text-green-600 dark:text-green-400 flex items-center gap-0.5">
                                    <CheckCircle2 className="h-3 w-3" />
                                    {t("syncDash.backupComplete")}
                                  </span>
                                </>
                              )}
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
                              {(backup as any).localFilePath && (
                                <>
                                  <span>·</span>
                                  <button
                                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                                    title={(backup as any).localFilePath}
                                    onClick={async () => {
                                      try {
                                        const res = await fetch(`/api/sync-backups/${backup.id}/download`, { credentials: "include" });
                                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                        const blob = await res.blob();
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement("a");
                                        a.href = url;
                                        a.download = ((backup as any).localFilePath as string).split("/").pop() || "backup.json";
                                        a.click();
                                        URL.revokeObjectURL(url);
                                      } catch (_err) {}
                                    }}
                                    data-testid={`button-download-local-${backup.id}`}
                                  >
                                    <HardDrive className="h-3 w-3" />
                                    {t("syncDash.localFile")}
                                  </button>
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
                        {expandedBackupId === backup.id && (backup.configSnapshot as any)?.parts && (
                          <div className="ml-5 pl-4 border-l-2 border-muted space-y-1.5" data-testid={`parts-list-${backup.id}`}>
                            {((backup.configSnapshot as any).parts as Array<{ fileName: string; fileSize: number; recordCount: number; webViewLink?: string; partNumber: number }>).map((part, idx) => (
                              <div key={idx} className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="font-mono">#{part.partNumber}</span>
                                <span className="truncate max-w-[200px]">{part.fileName}</span>
                                <span>{formatBytes(part.fileSize || 0)}</span>
                                <span>{part.recordCount} {t("syncDash.records")}</span>
                                {part.webViewLink && (
                                  <a
                                    href={part.webViewLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-0.5 hover:text-foreground"
                                    data-testid={`link-part-${backup.id}-${idx}`}
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
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

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              {language === "sk" ? "Vymazať históriu synchronizácií?" : "Clear sync history?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                {language === "sk"
                  ? "Táto akcia vymaže všetky behy synchronizácií, logy a bázové línie (delta tracking). Zálohy zostanú zachované."
                  : "This will permanently delete all sync runs, logs and baselines (delta tracking). Backups will be preserved."}
              </span>
              <span className="block font-medium text-destructive">
                {language === "sk" ? "Akcia je nevratná." : "This action cannot be undone."}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-reset-cancel">
              {language === "sk" ? "Zrušiť" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-reset-confirm"
              onClick={(e) => { e.preventDefault(); resetHistoryMutation.mutate(); }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              disabled={resetHistoryMutation.isPending}
            >
              {resetHistoryMutation.isPending
                ? (language === "sk" ? "Mazanie..." : "Clearing...")
                : (language === "sk" ? "Vymazať históriu" : "Clear history")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
