import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  HardDrive, Download, Trash2, ExternalLink, RefreshCw, Search, X,
  ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Cloud, Server,
  ArrowRight, FileArchive, Calendar, Database, BookmarkCheck, Save, RotateCcw,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { sk } from "date-fns/locale";

interface ConfigSnapshot {
  id: string;
  syncConfigId: string;
  configName: string;
  snapshotJson: Record<string, any>;
  googleDriveFileId: string | null;
  googleDriveUrl: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface EnrichedBackup {
  id: string;
  sync_config_id: string;
  sync_run_id: string | null;
  file_name: string;
  file_size: number | null;
  google_drive_file_id: string | null;
  google_drive_url: string | null;
  backup_record_count: number | null;
  config_snapshot: Record<string, any> | null;
  backup_type: string | null;
  local_file_path: string | null;
  description: string | null;
  db_environment: string | null;
  created_at: string;
  config_name: string | null;
  source_module_name: string | null;
  source_module_code: string | null;
  target_module_name: string | null;
  target_module_code: string | null;
  target_module_base_url: string | null;
}

interface ConfigGroup {
  configId: string;
  configName: string;
  sourceModuleName: string | null;
  targetModuleName: string | null;
  environment: string;
  backups: EnrichedBackup[];
  totalSize: number;
}

function detectEnv(backup: EnrichedBackup): string {
  if (backup.db_environment && backup.db_environment !== "unknown") return backup.db_environment;
  const url = backup.target_module_base_url || "";
  if (url.includes("hauerland_spol_s_ro")) return "production";
  if (url.includes("testovacia_hauerland")) return "test";
  return "unknown";
}

function EnvBadge({ env, t }: { env: string; t: (k: string) => string }) {
  if (env === "production") {
    return (
      <Badge variant="outline" className="text-[10px] border-foreground/50 font-medium gap-1" data-testid="badge-env-production">
        <span className="w-1.5 h-1.5 rounded-full bg-foreground inline-block" />
        {t("backups.envProduction")}
      </Badge>
    );
  }
  if (env === "test") {
    return (
      <Badge variant="outline" className="text-[10px] text-muted-foreground gap-1" data-testid="badge-env-test">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground inline-block" />
        {t("backups.envTest")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground/60" data-testid="badge-env-unknown">
      {t("backups.envUnknown")}
    </Badge>
  );
}

function BackupTypeBadge({ type, t }: { type: string | null; t: (k: string) => string }) {
  if (type === "both") return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <Server className="h-3 w-3" /><Cloud className="h-3 w-3" />
      {t("backups.typeBoth")}
    </span>
  );
  if (type === "gdrive") return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <Cloud className="h-3 w-3" />
      {t("backups.typeGDrive")}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <Server className="h-3 w-3" />
      {t("backups.typeLocal")}
    </span>
  );
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return format(new Date(d), "dd.MM.yyyy HH:mm"); } catch { return d; }
}

function fmtAgo(d: string | null) {
  if (!d) return "";
  try { return formatDistanceToNow(new Date(d), { addSuffix: true, locale: sk }); } catch { return ""; }
}

interface DiffEntry {
  label: string;
  from: string;
  to: string;
}

function formatDiffValue(val: unknown): string {
  if (val === null || val === undefined) return "–";
  if (typeof val === "boolean") return val ? "✓" : "✗";
  if (typeof val === "number") return String(val);
  if (typeof val === "string") return val.length > 32 ? `${val.slice(0, 30)}…` : val || "–";
  return String(val);
}

function computeSnapshotDiff(
  snap: Record<string, any>,
  curr: Record<string, any>,
  t: (k: string) => string,
): DiffEntry[] {
  const diffs: DiffEntry[] = [];
  // Only compare fields that mapSyncConfigForBackup() stores AND restoreSyncConfigsFromBackup() applies:
  // name, sourceModuleId, targetModuleId, fieldMappings, schedule, isEnabled, autoRetry, retryDelayMin
  const simple: Array<[string, string]> = [
    ["name", "backups.diffFieldName"],
    ["isEnabled", "backups.diffFieldEnabled"],
    ["autoRetry", "backups.diffFieldAutoRetry"],
    ["retryDelayMin", "backups.diffFieldRetryDelay"],
  ];
  for (const [key, labelKey] of simple) {
    if (JSON.stringify(snap[key]) !== JSON.stringify(curr[key])) {
      diffs.push({ label: t(labelKey), from: formatDiffValue(curr[key]), to: formatDiffValue(snap[key]) });
    }
  }
  const snapCount = Array.isArray(snap.fieldMappings) ? snap.fieldMappings.length : 0;
  const currCount = Array.isArray(curr.fieldMappings) ? curr.fieldMappings.length : 0;
  if (snapCount !== currCount) {
    diffs.push({ label: t("backups.diffFieldMappings"), from: String(currCount), to: String(snapCount) });
  }
  const snapSched = (snap.schedule || {}) as Record<string, any>;
  const currSched = (curr.schedule || {}) as Record<string, any>;
  const schedFields: Array<[string, string]> = [
    ["enabled", "backups.diffFieldSchedEnabled"],
    ["frequency", "backups.diffFieldSchedFreq"],
    ["backupBeforeSync", "backups.diffFieldSchedBackup"],
  ];
  for (const [sk, labelKey] of schedFields) {
    if (JSON.stringify(snapSched[sk]) !== JSON.stringify(currSched[sk])) {
      diffs.push({ label: t(labelKey), from: formatDiffValue(currSched[sk]), to: formatDiffValue(snapSched[sk]) });
    }
  }
  return diffs;
}

function StatCard({ label, value, sub, icon: Icon }: { label: string; value: string | number; sub?: string; icon: React.ElementType }) {
  return (
    <div className="border rounded-md p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function BackupManagementPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [envFilter, setEnvFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [expandedConfigs, setExpandedConfigs] = useState<Set<string>>(new Set());
  const [expandedParts, setExpandedParts] = useState<Set<string>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<{
    type: "delete" | "deleteAll" | "restoreSnapshot";
    id: string;
    name: string;
    date?: string;
    snapshot?: ConfigSnapshot;
  } | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data: backups = [], isLoading, refetch } = useQuery<EnrichedBackup[]>({
    queryKey: ["/api/sync-backups/enriched"],
  });

  const { data: snapshots = [], refetch: refetchSnapshots } = useQuery<ConfigSnapshot[]>({
    queryKey: ["/api/config-snapshots"],
  });

  const { data: syncConfigs = [] } = useQuery<Array<Record<string, any>>>({
    queryKey: ["/api/sync-configs"],
  });

  const snapshotAllMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/config-snapshots/all"),
    onSuccess: () => {
      toast({ title: "Zálohy konfigurácií vytvorené" });
      queryClient.invalidateQueries({ queryKey: ["/api/config-snapshots"] });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteSnapshotMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/config-snapshots/${id}`),
    onSuccess: () => {
      toast({ title: "Záloha konfigu odstránená" });
      queryClient.invalidateQueries({ queryKey: ["/api/config-snapshots"] });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const restoreSnapshotMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/config-snapshots/${id}/restore`);
      return res.json() as Promise<{ ok: boolean; results: { syncConfigs: number; skipped: string[]; errors: string[] } }>;
    },
    onSuccess: (data) => {
      const skipped: string[] = data?.results?.skipped ?? [];
      if (skipped.length > 0) {
        toast({
          title: t("backups.restoredWithSkipped"),
          description: t("backups.restoreSkippedDesc")
            .replace("{count}", String(skipped.length))
            .replace("{items}", skipped.join("; ")),
          variant: "destructive",
        });
      } else {
        toast({ title: t("backups.restored") });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/config-snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sync-configs"] });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteBackupMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/sync-backups/${id}`),
    onSuccess: () => {
      toast({ title: t("backups.deleted") });
      queryClient.invalidateQueries({ queryKey: ["/api/sync-backups/enriched"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sync-backups"] });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteAllMutation = useMutation({
    mutationFn: async (configId: string) => apiRequest("DELETE", `/api/sync-backups/config/${configId}`),
    onSuccess: () => {
      toast({ title: t("backups.deletedAll") });
      queryClient.invalidateQueries({ queryKey: ["/api/sync-backups/enriched"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sync-backups"] });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  async function handleDownload(backup: EnrichedBackup) {
    setDownloading(backup.id);
    try {
      const res = await fetch(`/api/sync-backups/${backup.id}/download`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (backup.local_file_path || backup.file_name || "backup.json").split("/").pop()!;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  }

  function toggleConfig(id: string) {
    setExpandedConfigs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleParts(id: string) {
    setExpandedParts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Group + filter + sort
  const groups: ConfigGroup[] = useMemo(() => {
    const map = new Map<string, ConfigGroup>();
    for (const b of backups) {
      const cid = b.sync_config_id;
      const env = detectEnv(b);
      if (!map.has(cid)) {
        map.set(cid, {
          configId: cid,
          configName: b.config_name || cid,
          sourceModuleName: b.source_module_name,
          targetModuleName: b.target_module_name,
          environment: env,
          backups: [],
          totalSize: 0,
        });
      }
      const g = map.get(cid)!;
      // Update env to most recent non-unknown value
      if (env !== "unknown") g.environment = env;
      g.backups.push(b);
      g.totalSize += b.file_size || 0;
    }
    return Array.from(map.values());
  }, [backups]);

  const filtered = useMemo(() => {
    let gs = groups;
    if (envFilter !== "all") gs = gs.filter(g => g.environment === envFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      gs = gs.filter(g =>
        g.configName.toLowerCase().includes(q) ||
        (g.sourceModuleName || "").toLowerCase().includes(q) ||
        (g.targetModuleName || "").toLowerCase().includes(q)
      );
    }
    return gs.map(g => {
      let bs = [...g.backups];
      if (sortBy === "newest") bs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      else if (sortBy === "oldest") bs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      else if (sortBy === "largest") bs.sort((a, b) => (b.file_size || 0) - (a.file_size || 0));
      return { ...g, backups: bs };
    });
  }, [groups, envFilter, search, sortBy]);

  const totalSize = backups.reduce((s, b) => s + (b.file_size || 0), 0);
  const productionCount = groups.filter(g => g.environment === "production").length;
  const testCount = groups.filter(g => g.environment === "test").length;

  // Auto-expand all groups on first load
  useMemo(() => {
    if (backups.length > 0 && expandedConfigs.size === 0) {
      setExpandedConfigs(new Set(groups.map(g => g.configId)));
    }
  }, [backups.length]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-screen-xl mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1.5">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(n => <Skeleton key={n} className="h-20 rounded-md" />)}
        </div>
        <Skeleton className="h-9 w-full rounded-lg" />
        <div className="space-y-4">
          {[1, 2, 3].map(n => <Skeleton key={n} className="h-32 rounded-md" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2" data-testid="text-page-title">
            <HardDrive className="h-6 w-6" />
            {t("backups.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("backups.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => snapshotAllMutation.mutate()}
            disabled={snapshotAllMutation.isPending}
            data-testid="btn-snapshot-all"
            className="gap-1.5"
          >
            {snapshotAllMutation.isPending
              ? <RefreshCw className="h-4 w-4 animate-spin" />
              : <Save className="h-4 w-4" />}
            <span className="hidden sm:inline">Zálohovať všetky</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => { refetch(); refetchSnapshots(); }} data-testid="btn-refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t("backups.totalBackups")} value={backups.length} icon={FileArchive} />
        <StatCard label={t("backups.totalSize")} value={formatBytes(totalSize)} icon={Database} />
        <StatCard label={t("backups.productionCount")} value={productionCount} sub={t("backups.envProduction")} icon={Server} />
        <StatCard label={t("backups.testCount")} value={testCount} sub={t("backups.envTest")} icon={HardDrive} />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            data-testid="input-search"
            placeholder={t("backups.searchPlaceholder")}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
          {search && (
            <button className="absolute right-2.5 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <Select value={envFilter} onValueChange={setEnvFilter}>
          <SelectTrigger className="h-8 flex-1 min-w-[8rem] text-xs" data-testid="select-env-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("backups.filterAll")}</SelectItem>
            <SelectItem value="production">{t("backups.envProduction")}</SelectItem>
            <SelectItem value="test">{t("backups.envTest")}</SelectItem>
            <SelectItem value="unknown">{t("backups.envUnknown")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="h-8 flex-1 min-w-[8rem] text-xs" data-testid="select-sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{t("backups.sortNewest")}</SelectItem>
            <SelectItem value="oldest">{t("backups.sortOldest")}</SelectItem>
            <SelectItem value="largest">{t("backups.sortLargest")}</SelectItem>
          </SelectContent>
        </Select>
        {(envFilter !== "all" || search) && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setEnvFilter("all"); setSearch(""); }}>
            <X className="h-3 w-3 mr-1" />
            {t("backups.clearFilters")}
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} {t("backups.integrations")} · {filtered.reduce((s, g) => s + g.backups.length, 0)} {t("backups.records")}
        </span>
      </div>

      {/* Groups */}
      {filtered.length === 0 ? (
        <div className="border rounded-md p-12 text-center" data-testid="text-no-backups">
          <HardDrive className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium">{t("backups.noBackups")}</p>
          <p className="text-xs text-muted-foreground mt-1">{t("backups.noBackupsDesc")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(group => {
            const isOpen = expandedConfigs.has(group.configId);
            const newestBackup = group.backups[0];
            return (
              <div key={group.configId} className="border rounded-md overflow-hidden" data-testid={`group-${group.configId}`}>
                {/* Config header */}
                <div
                  className="flex items-center gap-3 p-4 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors select-none"
                  onClick={() => toggleConfig(group.configId)}
                  data-testid={`group-header-${group.configId}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm" data-testid={`text-config-name-${group.configId}`}>
                        {group.configName}
                      </span>
                      <EnvBadge env={group.environment} t={t} />
                      <Badge variant="outline" className="text-[10px]">
                        {group.backups.length} {t("backups.records")}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                      {group.sourceModuleName && group.targetModuleName && (
                        <span className="flex items-center gap-1">
                          <span>{group.sourceModuleName}</span>
                          <ArrowRight className="h-3 w-3" />
                          <span>{group.targetModuleName}</span>
                        </span>
                      )}
                      <span>·</span>
                      <span>{t("backups.totalSize")}: <strong>{formatBytes(group.totalSize)}</strong></span>
                      {newestBackup && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {t("backups.lastBackup")}: <strong>{fmtDate(newestBackup.created_at)}</strong>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <Button
                      variant="outline" size="sm" className="h-7 text-xs text-destructive"
                      onClick={() => setConfirmDialog({ type: "deleteAll", id: group.configId, name: group.configName })}
                      disabled={deleteAllMutation.isPending}
                      data-testid={`btn-delete-all-${group.configId}`}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      {t("backups.deleteAll")}
                    </Button>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>

                {/* Backup list */}
                {isOpen && (
                  <div className="divide-y">
                    {group.backups.map((backup, idx) => {
                      const snap = backup.config_snapshot as any;
                      const isComplete = !snap?.truncated && (backup.backup_record_count || 0) > 0;
                      const hasParts = (snap?.totalFiles || 0) > 1;
                      const partsOpen = expandedParts.has(backup.id);
                      const env = detectEnv(backup);

                      return (
                        <div key={backup.id} data-testid={`row-backup-${backup.id}`}>
                          <div className="flex items-start gap-3 p-4 hover:bg-muted/10 transition-colors">
                            {/* Date column */}
                            <div className="flex flex-col items-center justify-center w-14 text-center flex-shrink-0 border rounded-md p-2 bg-muted/10">
                              <span className="text-xs font-bold leading-tight">
                                {backup.created_at ? format(new Date(backup.created_at), "dd.MM") : "—"}
                              </span>
                              <span className="text-[10px] text-muted-foreground leading-tight">
                                {backup.created_at ? format(new Date(backup.created_at), "yyyy") : ""}
                              </span>
                              <span className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                                {backup.created_at ? format(new Date(backup.created_at), "HH:mm") : ""}
                              </span>
                            </div>

                            {/* Main content */}
                            <div className="flex-1 min-w-0">
                              {/* Description / filename */}
                              <p className="text-sm font-medium truncate" data-testid={`text-desc-${idx}`}>
                                {backup.description || backup.file_name}
                              </p>

                              {/* Metadata row */}
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {/* Environment inline for the backup row (if differs from group) */}
                                {env !== group.environment && <EnvBadge env={env} t={t} />}

                                {/* Record count */}
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Database className="h-3 w-3" />
                                  <span data-testid={`text-records-${idx}`}>
                                    {(backup.backup_record_count || 0).toLocaleString("sk")} {t("backups.records")}
                                    {hasParts && (
                                      <button
                                        className="ml-1 underline hover:text-foreground"
                                        onClick={() => toggleParts(backup.id)}
                                        data-testid={`btn-parts-${backup.id}`}
                                      >
                                        ({snap.totalFiles} {t("backups.files")})
                                      </button>
                                    )}
                                  </span>
                                </span>

                                <span className="text-muted-foreground/40 text-xs">·</span>

                                {/* File size */}
                                <span className="text-xs text-muted-foreground" data-testid={`text-size-${idx}`}>
                                  {formatBytes(backup.file_size)}
                                </span>

                                <span className="text-muted-foreground/40 text-xs">·</span>

                                {/* Backup type */}
                                <BackupTypeBadge type={backup.backup_type} t={t} />

                                {/* Complete badge */}
                                {isComplete && (
                                  <>
                                    <span className="text-muted-foreground/40 text-xs">·</span>
                                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                                      <CheckCircle2 className="h-3 w-3" />
                                      {t("backups.complete")}
                                    </span>
                                  </>
                                )}
                                {snap?.truncated && (
                                  <>
                                    <span className="text-muted-foreground/40 text-xs">·</span>
                                    <span className="flex items-center gap-0.5 text-xs text-yellow-600 dark:text-yellow-400">
                                      <AlertTriangle className="h-3 w-3" />
                                      {t("backups.truncated")}
                                    </span>
                                  </>
                                )}

                                {/* Time ago */}
                                <span className="text-muted-foreground/40 text-xs">·</span>
                                <span className="text-xs text-muted-foreground">{fmtAgo(backup.created_at)}</span>
                              </div>

                              {/* File name (second line, subtle) */}
                              {backup.description && (
                                <p className="text-[10px] text-muted-foreground/60 mt-0.5 font-mono truncate" data-testid={`text-filename-${idx}`}>
                                  {backup.file_name}
                                </p>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {backup.google_drive_url && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" asChild data-testid={`btn-gdrive-${backup.id}`}>
                                  <a href={backup.google_drive_url} target="_blank" rel="noopener noreferrer" title="Google Drive">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                </Button>
                              )}
                              {backup.local_file_path && (
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7"
                                  disabled={downloading === backup.id}
                                  onClick={() => handleDownload(backup)}
                                  title={t("backups.downloadLocal")}
                                  data-testid={`btn-download-${backup.id}`}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => setConfirmDialog({ type: "delete", id: backup.id, name: backup.description || backup.file_name })}
                                disabled={deleteBackupMutation.isPending}
                                title={t("backups.delete")}
                                data-testid={`btn-delete-${backup.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          {/* Parts list */}
                          {partsOpen && hasParts && snap?.parts && (
                            <div className="mx-4 mb-3 pl-4 border-l-2 border-muted space-y-1" data-testid={`parts-${backup.id}`}>
                              {(snap.parts as Array<any>).map((part: any, pi: number) => (
                                <div key={pi} className="flex items-center gap-3 text-xs text-muted-foreground py-1">
                                  <span className="font-mono text-[10px]">#{part.partNumber}</span>
                                  <span className="font-mono truncate max-w-[220px]">{part.fileName}</span>
                                  <span>{formatBytes(part.fileSize)}</span>
                                  <span>{(part.recordCount || 0).toLocaleString("sk")} {t("backups.records")}</span>
                                  {part.webViewLink && (
                                    <a href={part.webViewLink} target="_blank" rel="noopener noreferrer"
                                      className="flex items-center gap-0.5 hover:text-foreground">
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Config Snapshots Section */}
      {snapshots.length > 0 && (() => {
        const grouped = snapshots.reduce((acc, s) => {
          if (!acc[s.syncConfigId]) acc[s.syncConfigId] = { configName: s.configName, items: [] };
          acc[s.syncConfigId].items.push(s);
          return acc;
        }, {} as Record<string, { configName: string; items: ConfigSnapshot[] }>);
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <BookmarkCheck className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Zálohy konfigurácií</h2>
              <span className="text-xs text-muted-foreground">· max 10 na konfiguráciu · DB + Google Drive</span>
            </div>
            {Object.entries(grouped).map(([configId, group]) => (
              <div key={configId} className="border rounded-md overflow-hidden" data-testid={`snapshot-group-${configId}`}>
                <div className="flex items-center gap-3 px-4 py-3 bg-muted/20 border-b">
                  <BookmarkCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-medium text-sm">{group.configName}</span>
                  <Badge variant="outline" className="text-[10px] ml-auto">{group.items.length} / 10</Badge>
                </div>
                <div className="divide-y">
                  {group.items.map(snap => (
                    <div key={snap.id} className="flex items-center gap-3 px-4 py-2.5 text-xs" data-testid={`snapshot-row-${snap.id}`}>
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground w-32 shrink-0">{fmtDate(snap.createdAt)}</span>
                      <span className="text-muted-foreground">{fmtAgo(snap.createdAt)}</span>
                      <div className="ml-auto flex items-center gap-2">
                        {snap.googleDriveUrl ? (
                          <a
                            href={snap.googleDriveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                            data-testid={`link-snapshot-drive-${snap.id}`}
                          >
                            <Cloud className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Drive</span>
                          </a>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground/40">
                            <Cloud className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">–</span>
                          </span>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[11px] gap-1"
                          onClick={() => setConfirmDialog({ type: "restoreSnapshot", id: snap.id, name: snap.configName, date: fmtDate(snap.createdAt), snapshot: snap })}
                          disabled={restoreSnapshotMutation.isPending}
                          data-testid={`btn-restore-snapshot-${snap.id}`}
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span className="hidden sm:inline">{t("backups.restore")}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteSnapshotMutation.mutate(snap.id)}
                          disabled={deleteSnapshotMutation.isPending}
                          data-testid={`btn-delete-snapshot-${snap.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Confirm dialog */}
      <AlertDialog open={!!confirmDialog} onOpenChange={o => { if (!o) setConfirmDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {confirmDialog?.type === "restoreSnapshot"
                ? <RotateCcw className="h-4 w-4" />
                : <Trash2 className="h-4 w-4 text-destructive" />}
              {confirmDialog?.type === "restoreSnapshot"
                ? t("backups.confirmRestoreTitle")
                : confirmDialog?.type === "deleteAll"
                  ? t("backups.confirmDeleteAllTitle")
                  : t("backups.confirmDeleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog?.type === "restoreSnapshot"
                ? t("backups.confirmRestoreDesc")
                    .replace("{date}", confirmDialog?.date || "")
                    .replace("{name}", confirmDialog?.name || "")
                : confirmDialog?.type === "deleteAll"
                  ? t("backups.confirmDeleteAllDesc").replace("{name}", confirmDialog?.name || "")
                  : t("backups.confirmDeleteDesc").replace("{name}", confirmDialog?.name || "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmDialog?.type === "restoreSnapshot" && (() => {
            const currentConfig = syncConfigs.find((c: Record<string, any>) => c.id === confirmDialog.snapshot?.syncConfigId);
            const diffs = currentConfig && confirmDialog.snapshot
              ? computeSnapshotDiff(confirmDialog.snapshot.snapshotJson, currentConfig, t)
              : [];
            return (
              <div className="mt-1 border rounded-md text-xs overflow-hidden" data-testid="restore-diff-panel">
                <div className="px-3 py-2 bg-muted/30 font-medium text-muted-foreground flex items-center gap-1.5 border-b">
                  <ArrowRight className="h-3 w-3" />
                  {t("backups.diffTitle")}
                </div>
                {!currentConfig ? (
                  <div className="px-3 py-2.5 text-muted-foreground" data-testid="restore-diff-config-missing">
                    {t("backups.diffConfigDeleted")}
                  </div>
                ) : diffs.length === 0 ? (
                  <div className="px-3 py-2.5 text-muted-foreground flex items-center gap-1.5" data-testid="restore-diff-no-changes">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    {t("backups.diffNoChanges")}
                  </div>
                ) : (
                  <div className="divide-y max-h-48 overflow-y-auto" data-testid="restore-diff-list">
                    {diffs.map(d => (
                      <div key={d.label} className="flex items-center gap-2 px-3 py-1.5" data-testid={`restore-diff-row-${d.label}`}>
                        <span className="text-muted-foreground w-36 shrink-0 truncate">{d.label}</span>
                        <span className="line-through text-muted-foreground/60 truncate max-w-[90px]">{d.from}</span>
                        <ArrowRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                        <span className="font-medium truncate max-w-[90px]">{d.to}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="btn-confirm-cancel">{t("backups.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="btn-confirm-action"
              className={confirmDialog?.type === "restoreSnapshot" ? "" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}
              onClick={e => {
                e.preventDefault();
                const d = confirmDialog;
                setConfirmDialog(null);
                if (!d) return;
                if (d.type === "restoreSnapshot") restoreSnapshotMutation.mutate(d.id);
                else if (d.type === "delete") deleteBackupMutation.mutate(d.id);
                else deleteAllMutation.mutate(d.id);
              }}
            >
              {confirmDialog?.type === "restoreSnapshot" ? t("backups.confirmRestoreAction") : t("backups.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
