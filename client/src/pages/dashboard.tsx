import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "lucide-react";
import type { ApiModule, SyncLog } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

interface DashboardData {
  totalModules: number;
  connectedModules: number;
  todaySyncs: number;
  errorSyncs: number;
  recentSyncs: SyncLog[];
  moduleStatuses: ApiModule[];
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
                      <p className="text-sm font-medium truncate">{mod.name}</p>
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
                          : "—"}
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
