import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Puzzle,
  Link2,
  Settings2,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import type { ApiModule } from "@shared/schema";
import { Link as WouterLink } from "wouter";
import { useLanguage } from "@/components/language-provider";

function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  const config: Record<string, { key: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    connected: { key: "status.connected", variant: "default" },
    disconnected: { key: "status.disconnected", variant: "secondary" },
    error: { key: "status.error", variant: "destructive" },
    configuring: { key: "status.configuring", variant: "outline" },
  };
  const c = config[status] || config.disconnected;
  return <Badge variant={c.variant}>{t(c.key)}</Badge>;
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    connected: "bg-green-500",
    disconnected: "bg-gray-400 dark:bg-gray-600",
    error: "bg-red-500",
    configuring: "bg-yellow-500",
  };
  return (
    <span className={`h-2 w-2 rounded-full ${colors[status] || colors.disconnected}`} />
  );
}

export default function ModulesPage() {
  const { t } = useLanguage();
  const { data: modules, isLoading } = useQuery<ApiModule[]>({
    queryKey: ["/api/modules"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-7 w-32 mb-1" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-modules-title">
          {t("modules.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t("modules.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {modules?.map((mod) => (
          <Card key={mod.id} className="group" data-testid={`card-module-${mod.code}`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted flex-shrink-0">
                    {mod.status === "connected" ? (
                      <Link2 className="h-4.5 w-4.5 text-foreground" />
                    ) : mod.status === "configuring" ? (
                      <Settings2 className="h-4.5 w-4.5 text-muted-foreground" />
                    ) : (
                      <Puzzle className="h-4.5 w-4.5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-medium">{mod.sortOrder.toString().padStart(2, "0")}. {mod.name}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <StatusDot status={mod.status} />
                      <span className="text-xs text-muted-foreground">{mod.code}</span>
                    </div>
                  </div>
                </div>
                <StatusBadge status={mod.status} />
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed mb-4 line-clamp-2">
                {mod.description}
              </p>

              {mod.baseUrl && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4 truncate">
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{mod.baseUrl}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-3 border-t">
                <span className="text-xs text-muted-foreground">
                  {mod.lastSyncAt
                    ? t("modules.lastSync", { date: new Date(mod.lastSyncAt).toLocaleDateString() })
                    : t("modules.neverSynced")}
                </span>
                <WouterLink href={`/modules/${mod.id}`}>
                  <Button variant="ghost" size="sm" data-testid={`button-view-${mod.code}`}>
                    {t("modules.details")}
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </WouterLink>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
