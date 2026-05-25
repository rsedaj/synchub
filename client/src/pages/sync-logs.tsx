import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeftRight,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  Filter,
} from "lucide-react";
import type { ApiModule, SyncLog } from "@shared/schema";
import { formatDistanceToNow, format } from "date-fns";
import { useState } from "react";
import { useLanguage } from "@/components/language-provider";

function SyncStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />;
    case "error":
      return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    case "partial":
      return <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline" }> = {
    success: { variant: "default" },
    error: { variant: "destructive" },
    running: { variant: "outline" },
    pending: { variant: "secondary" },
    partial: { variant: "outline" },
  };
  const c = config[status] || config.pending;
  return <Badge variant={c.variant} className="capitalize">{status}</Badge>;
}

export default function SyncLogsPage() {
  const { t } = useLanguage();
  const [filterModule, setFilterModule] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: modules } = useQuery<ApiModule[]>({
    queryKey: ["/api/modules"],
  });

  const { data: logs, isLoading } = useQuery<SyncLog[]>({
    queryKey: ["/api/sync-logs"],
  });

  const filteredLogs = logs?.filter((log) => {
    if (filterModule !== "all" && log.moduleId !== filterModule) return false;
    if (filterStatus !== "all" && log.status !== filterStatus) return false;
    return true;
  });

  const getModuleName = (moduleId: string) => {
    return modules?.find(m => m.id === moduleId)?.name || "Unknown";
  };

  const getModuleCode = (moduleId: string) => {
    return modules?.find(m => m.id === moduleId)?.code || "\u2014";
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-7 w-36 mb-1" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-12 w-full rounded-lg" />
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-sync-logs-title">
          {t("syncLogs.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t("syncLogs.subtitle")}
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{t("syncLogs.filter")}</span>
        </div>
        <Select value={filterModule} onValueChange={setFilterModule}>
          <SelectTrigger className="flex-1 min-w-[8rem]" data-testid="select-filter-module">
            <SelectValue placeholder={t("syncLogs.allModules")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("syncLogs.allModules")}</SelectItem>
            {modules?.map((mod) => (
              <SelectItem key={mod.id} value={mod.id}>
                {mod.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="flex-1 min-w-[8rem]" data-testid="select-filter-status">
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
          {!filteredLogs || filteredLogs.length === 0 ? (
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
                  <SyncStatusIcon status={log.status} />

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
                    <StatusBadge status={log.status} />
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
    </div>
  );
}
