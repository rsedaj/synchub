import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Shield,
  LogIn,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  ArrowLeftRight,
  Settings2,
} from "lucide-react";
import type { AuditLog } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

function ActionIcon({ action }: { action: string }) {
  const icons: Record<string, any> = {
    login: LogIn,
    logout: LogOut,
    create: Plus,
    update: Pencil,
    delete: Trash2,
    sync: ArrowLeftRight,
    config_change: Settings2,
  };
  const Icon = icons[action] || Shield;
  return <Icon className="h-4 w-4 text-muted-foreground" />;
}

export default function AuditLogPage() {
  const { data: logs, isLoading } = useQuery<AuditLog[]>({
    queryKey: ["/api/audit-logs"],
  });

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
    <div className="p-6 space-y-6 max-w-[1000px]">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-audit-title">
          Audit Log
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Track all user actions and system events
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {!logs || logs.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Shield className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No audit entries</p>
            </div>
          ) : (
            <div className="divide-y">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-4 px-5 py-3"
                  data-testid={`row-audit-${log.id}`}
                >
                  <ActionIcon action={log.action} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="capitalize text-xs">
                        {log.action.replace("_", " ")}
                      </Badge>
                      {log.entity && (
                        <span className="text-xs text-muted-foreground">
                          {log.entity}
                          {log.entityId ? ` #${log.entityId.slice(0, 8)}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {log.createdAt
                      ? formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
