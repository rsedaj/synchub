import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Shield,
  LogIn,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  ArrowLeftRight,
  Settings2,
  Play,
  CheckCircle2,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Plug,
  AlertCircle,
} from "lucide-react";
import type { AuditLog } from "@shared/schema";
import { formatDistanceToNow, format } from "date-fns";
import { useLanguage } from "@/components/language-provider";

function ActionIcon({ action }: { action: string }) {
  const icons: Record<string, any> = {
    login: LogIn,
    logout: LogOut,
    create: Plus,
    update: Pencil,
    delete: Trash2,
    sync: ArrowLeftRight,
    config_change: Settings2,
    sync_run: Play,
    sync_complete: CheckCircle2,
    restore_backup: RotateCcw,
    delete_backup: Trash2,
  };
  const Icon = icons[action] || Shield;
  return <Icon className="h-4 w-4 text-muted-foreground" />;
}

function EntityIcon({ entity }: { entity: string | null }) {
  if (entity === "module_test") return <Plug className="h-3.5 w-3.5 text-muted-foreground" />;
  return null;
}

function ActionBadgeColor(action: string): string {
  switch (action) {
    case "login": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "logout": return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    case "create": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "update":
    case "config_change": return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    case "delete":
    case "delete_backup": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    case "sync_run": return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200";
    case "sync_complete": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
    case "restore_backup": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    default: return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
  }
}

function BeforeAfterTable({ before, after, t }: { before: Record<string, any>; after: Record<string, any>; t: (k: string) => string }) {
  const allKeys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
  if (allKeys.length === 0) return null;

  return (
    <div className="mt-2 border rounded-md overflow-hidden" data-testid="table-before-after">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50">
            <th className="text-left px-3 py-1.5 font-medium">{t("auditLog.changedFields")}</th>
            <th className="text-left px-3 py-1.5 font-medium">{t("auditLog.before")}</th>
            <th className="text-left px-3 py-1.5 font-medium">{t("auditLog.after")}</th>
          </tr>
        </thead>
        <tbody>
          {allKeys.map((key) => (
            <tr key={key} className="border-t">
              <td className="px-3 py-1.5 font-mono text-muted-foreground">{key}</td>
              <td className="px-3 py-1.5 text-red-600 dark:text-red-400 max-w-[250px] break-all">
                {formatValue(before?.[key])}
              </td>
              <td className="px-3 py-1.5 text-green-600 dark:text-green-400 max-w-[250px] break-all">
                {formatValue(after?.[key])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatValue(val: any): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "object") return JSON.stringify(val, null, 1);
  return String(val);
}

function SyncCompleteDetails({ details, t }: { details: Record<string, any>; t: (k: string) => string }) {
  const isSuccess = details.status === "success";
  return (
    <div className="mt-2 space-y-2" data-testid="sync-complete-details">
      <div className="flex items-center gap-2 flex-wrap">
        {isSuccess ? (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {t("auditLog.sync.success")}
          </Badge>
        ) : (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 text-xs">
            <AlertCircle className="h-3 w-3 mr-1" />
            {t("auditLog.sync.error")}
          </Badge>
        )}
        {details.durationFormatted && (
          <span className="text-xs text-muted-foreground">{t("auditLog.sync.duration")}: {details.durationFormatted}</span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {details.recordsProcessed !== undefined && (
          <div className="bg-muted/50 rounded px-2.5 py-1.5">
            <div className="text-[10px] text-muted-foreground uppercase">{t("auditLog.sync.processed")}</div>
            <div className="text-sm font-medium">{details.recordsProcessed}</div>
          </div>
        )}
        {details.totalCreated !== undefined && (
          <div className="bg-muted/50 rounded px-2.5 py-1.5">
            <div className="text-[10px] text-muted-foreground uppercase">{t("auditLog.sync.created")}</div>
            <div className="text-sm font-medium">{details.totalCreated}</div>
          </div>
        )}
        {details.totalUpdated !== undefined && (
          <div className="bg-muted/50 rounded px-2.5 py-1.5">
            <div className="text-[10px] text-muted-foreground uppercase">{t("auditLog.sync.updated")}</div>
            <div className="text-sm font-medium">{details.totalUpdated}</div>
          </div>
        )}
        {details.recordsFailed !== undefined && details.recordsFailed > 0 && (
          <div className="bg-red-50 dark:bg-red-950 rounded px-2.5 py-1.5">
            <div className="text-[10px] text-red-600 dark:text-red-400 uppercase">{t("auditLog.sync.failed")}</div>
            <div className="text-sm font-medium text-red-700 dark:text-red-300">{details.recordsFailed}</div>
          </div>
        )}
      </div>
      {details.error && (
        <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 rounded px-2.5 py-1.5 font-mono">{details.error}</div>
      )}
      {details.configName && (
        <div className="text-xs text-muted-foreground">
          {details.sourceModule} → {details.targetModule} ({details.configName})
        </div>
      )}
    </div>
  );
}

function DetailsPanel({ log, t }: { log: AuditLog; t: (k: string) => string }) {
  const details = log.details as Record<string, any> | null;
  if (!details || Object.keys(details).length === 0) {
    return <div className="text-xs text-muted-foreground italic px-5 py-2">{t("auditLog.noEntries")}</div>;
  }

  if (log.action === "sync_complete") {
    return <SyncCompleteDetails details={details} t={t} />;
  }

  if (details.before || details.after) {
    return (
      <div>
        {details.code && <div className="text-xs text-muted-foreground mb-1">{details.name || details.code}</div>}
        {details.changedFields && details.changedFields.length > 0 && (
          <div className="flex gap-1 flex-wrap mb-1">
            {details.changedFields.map((f: string) => (
              <Badge key={f} variant="outline" className="text-[10px] font-mono">{f}</Badge>
            ))}
          </div>
        )}
        {details.passwordChanged && (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-[10px] mb-1">{t("auditLog.passwordChanged")}</Badge>
        )}
        <BeforeAfterTable before={details.before} after={details.after} t={t} />
      </div>
    );
  }

  if (log.entity === "module_test") {
    return (
      <div className="flex items-center gap-2">
        <Badge className={details.success
          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs"
          : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 text-xs"
        }>
          {details.success ? t("auditLog.sync.success") : t("auditLog.sync.error")}
        </Badge>
        <span className="text-xs text-muted-foreground">{details.name} ({details.code})</span>
        {details.message && <span className="text-xs text-muted-foreground">{details.message}</span>}
        {details.responseTime && <span className="text-xs text-muted-foreground">{details.responseTime}ms</span>}
      </div>
    );
  }

  const simpleKeys = Object.keys(details).filter(k => !["before", "after", "changedFields", "passwordChanged"].includes(k));
  if (simpleKeys.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
      {simpleKeys.map((key) => (
        <div key={key} className="flex gap-1.5 text-xs">
          <span className="text-muted-foreground font-mono">{key}:</span>
          <span className="break-all">{formatValue(details[key])}</span>
        </div>
      ))}
    </div>
  );
}

export default function AuditLogPage() {
  const { t } = useLanguage();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");

  const { data: logs, isLoading } = useQuery<AuditLog[]>({
    queryKey: ["/api/audit-logs"],
  });

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredLogs = (logs || []).filter((log) => {
    if (actionFilter !== "all" && log.action !== actionFilter) return false;
    if (entityFilter !== "all" && log.entity !== entityFilter) return false;
    return true;
  });

  const uniqueActions = [...new Set((logs || []).map(l => l.action))].sort();
  const uniqueEntities = [...new Set((logs || []).map(l => l.entity).filter(Boolean))].sort();

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-7 w-36 mb-1" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="space-y-2">
          {[...Array(10)].map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1100px]">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-audit-title">
          {t("auditLog.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t("auditLog.subtitle")}
        </p>
      </div>

      <div className="flex gap-3 flex-wrap" data-testid="audit-filters">
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-action-filter">
            <SelectValue placeholder={t("auditLog.filterAction")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("auditLog.filterAll")}</SelectItem>
            {uniqueActions.map((a) => (
              <SelectItem key={a} value={a}>
                {t(`auditLog.action.${a}`) !== `auditLog.action.${a}` ? t(`auditLog.action.${a}`) : a.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-entity-filter">
            <SelectValue placeholder={t("auditLog.filterEntity")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("auditLog.filterAll")}</SelectItem>
            {uniqueEntities.map((e) => (
              <SelectItem key={e!} value={e!}>
                {t(`auditLog.entity.${e}`) !== `auditLog.entity.${e}` ? t(`auditLog.entity.${e}`) : e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(actionFilter !== "all" || entityFilter !== "all") && (
          <span className="text-xs text-muted-foreground self-center">
            {filteredLogs.length} / {(logs || []).length}
          </span>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Shield className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">{t("auditLog.noEntries")}</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredLogs.map((log) => {
                const isExpanded = expandedIds.has(log.id);
                const hasDetails = log.details && Object.keys(log.details as Record<string, any>).length > 0;
                return (
                  <div
                    key={log.id}
                    data-testid={`row-audit-${log.id}`}
                  >
                    <div
                      className={`flex items-center gap-4 px-5 py-3 ${hasDetails ? "cursor-pointer hover:bg-muted/30 transition-colors" : ""}`}
                      onClick={() => hasDetails && toggleExpand(log.id)}
                      data-testid={`row-audit-toggle-${log.id}`}
                    >
                      <div className="flex items-center gap-1.5">
                        {hasDetails && (
                          isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        {!hasDetails && <div className="w-3.5" />}
                        <ActionIcon action={log.action} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`capitalize text-[10px] border-0 ${ActionBadgeColor(log.action)}`}>
                            {t(`auditLog.action.${log.action}`) !== `auditLog.action.${log.action}`
                              ? t(`auditLog.action.${log.action}`)
                              : log.action.replace("_", " ")}
                          </Badge>
                          {log.entity && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <EntityIcon entity={log.entity} />
                              {t(`auditLog.entity.${log.entity}`) !== `auditLog.entity.${log.entity}`
                                ? t(`auditLog.entity.${log.entity}`)
                                : log.entity}
                              {log.entityId ? ` #${log.entityId.slice(0, 8)}` : ""}
                            </span>
                          )}
                          {(log.details as any)?.username && (
                            <span className="text-xs font-medium">{(log.details as any).username}</span>
                          )}
                          {(log.details as any)?.configName && log.action !== "sync_complete" && (
                            <span className="text-xs font-medium">{(log.details as any).configName}</span>
                          )}
                          {(log.details as any)?.name && !(log.details as any)?.username && !(log.details as any)?.configName && (
                            <span className="text-xs font-medium">{(log.details as any).name}</span>
                          )}
                          {(log.details as any)?.code && !(log.details as any)?.name && (
                            <span className="text-xs font-mono text-muted-foreground">{(log.details as any).code}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap" title={log.createdAt ? format(new Date(log.createdAt), "dd.MM.yyyy HH:mm:ss") : ""}>
                        {log.createdAt
                          ? formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })
                          : "\u2014"}
                      </span>
                    </div>
                    {isExpanded && hasDetails && (
                      <div className="px-5 pb-3 pt-0 pl-[60px]" data-testid={`details-audit-${log.id}`}>
                        <DetailsPanel log={log} t={t} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
